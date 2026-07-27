import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createGeoReportShell } from "./reports";
import { memorySaveScanJob } from "./memory";
import { getSourceForensicReportForJob, getSourceForensicReportForReport, saveSourceForensicReport } from "./source-forensic-reports";
import { createTestSourceForensicReport } from "../public-source-forensics/testing";

describe("source-forensic V2 report repository", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    process.env.OPEN_GEO_DB_PATH = `memory-source-report-${randomUUID()}`;
  });

  it("saves and reads only an immutable report bound to the exact V2 job", async () => {
    const reportId = randomUUID(), jobId = randomUUID();
    const owner = await createGeoReportShell({ id: reportId, url: "https://customer-logistics.example/", siteKey: "customer-logistics.example",
      reportLocale: "zh", admissionIdempotencyHmac: randomUUID() });
    const job = memorySaveScanJob(memoryJob(jobId, owner.id));
    const report = createTestSourceForensicReport({ reportId: owner.id, jobId: job.id });
    await expect(saveSourceForensicReport(report)).resolves.toEqual(report);
    await expect(getSourceForensicReportForJob(job.id)).resolves.toEqual(report);
    await expect(getSourceForensicReportForReport(owner.id)).resolves.toEqual(report);
    await expect(saveSourceForensicReport({ ...report, limitations: [...report.limitations, "changed"] })).rejects.toThrow(/immutability/i);
  });

  it("rejects a V2 payload bound to a legacy job", async () => {
    const reportId = randomUUID(), jobId = randomUUID();
    const owner = await createGeoReportShell({ id: reportId, url: "https://customer-logistics.example/", siteKey: "customer-logistics.example",
      reportLocale: "zh", admissionIdempotencyHmac: randomUUID() });
    const job = memorySaveScanJob({ ...memoryJob(jobId, owner.id), productContract: "legacy_website_audit_v1", fulfillmentMethodology: null, recommendationReportVersion: null });
    await expect(saveSourceForensicReport(createTestSourceForensicReport({ reportId: owner.id, jobId: job.id }))).rejects.toThrow(/exact V2/i);
  });
});

function memoryJob(id: string, reportId: string) {
  const now = new Date("2030-01-01T00:00:00.000Z");
  return { id, reportId, tier: "deep" as const, productContract: "recommendation_forensics_v1" as const,
    fulfillmentMethodology: "public_search_source_forensics_v1" as const, recommendationReportVersion: 2 as const,
    locale: "zh" as const, reason: "standard" as const, stage: "queued" as const, progress: 0, checkpoint: {}, plannedPages: 0,
    successfulPages: 0, failedPages: 0, attempts: 0, maxAttempts: 3, leaseOwner: null, leaseExpiresAt: null,
    errorCode: null, publicError: null, creditReservationId: null, createdAt: now, updatedAt: now };
}
