import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDatabase, ensureDatabase, getSqlClient } from "./index";
import { getSourceForensicReportForJob, saveSourceForensicReport } from "./source-forensic-reports";
import { createTestSourceForensicReport } from "../public-source-forensics/testing";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const describePostgres = adminUrl ? describe : describe.skip;

describePostgres("source-forensic V2 PostgreSQL authority", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const databaseName = `ogc_source_report_${suffix}`;
  const reportId = `report-${suffix}`, jobId = `job-${suffix}`;
  const admin = postgres(adminUrl!, { max: 1, prepare: false });
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeAll(async () => {
    await admin.unsafe(`CREATE DATABASE ${quote(databaseName)}`);
    const databaseUrl = withDatabase(adminUrl!, databaseName);
    const bootstrap = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      await bootstrap`CREATE TABLE deployment_environment (singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton=true), profile text NOT NULL CHECK(profile IN ('staging','production')), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`;
      await bootstrap`INSERT INTO deployment_environment(singleton,profile) VALUES(true,'staging')`;
    } finally { await bootstrap.end({ timeout: 5 }); }
    process.env.DATABASE_URL = databaseUrl;
    await ensureDatabase();
    const sql = getSqlClient();
    await sql`INSERT INTO scan_reports (id,url,site_key,report_locale,technical_status) VALUES (${reportId},'https://customer-logistics.example/','customer-logistics.example','zh','completed')`;
    await sql`INSERT INTO scan_jobs (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,locale,stage) VALUES (${jobId},${reportId},'deep','recommendation_forensics_v1','public_search_source_forensics_v1',2,'zh','queued')`;
  }, 120_000);

  afterAll(async () => {
    await closeDatabase();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = originalDatabaseUrl;
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  }, 120_000);

  it("persists an immutable V2 payload and verifies hashes on read", async () => {
    const report = createTestSourceForensicReport({ reportId, jobId });
    await expect(saveSourceForensicReport(report)).resolves.toEqual(report);
    await expect(getSourceForensicReportForJob(jobId)).resolves.toEqual(report);
    await expect(saveSourceForensicReport({ ...report, limitations: [...report.limitations, "drift"] })).rejects.toThrow(/immutability/i);
    await getSqlClient()`UPDATE report_source_forensics SET content_hash='tampered' WHERE job_id=${jobId}`;
    await expect(getSourceForensicReportForJob(jobId)).rejects.toThrow(/immutability/i);
  });
});

function withDatabase(url: string, database: string): string { const parsed=new URL(url); parsed.pathname=`/${database}`; return parsed.toString(); }
function quote(identifier: string): string { return `"${identifier.replaceAll('"','""')}"`; }
