import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DATABASE_SCHEMA_VERSION } from "./index";
import { V36_DATABASE_MIGRATIONS, V37_DATABASE_MIGRATIONS, databaseMigrationsAfter } from "./migrations";

// @requirement GEO-V4-ACCEPT-01
describe("schema V36 protected-acceptance site-read manifest", () => {
  it("registers one forward-only hash-only manifest migration after V35", () => {
    expect(DATABASE_SCHEMA_VERSION).toBe(37);
    expect(databaseMigrationsAfter(35)).toEqual([...V36_DATABASE_MIGRATIONS, ...V37_DATABASE_MIGRATIONS]);
    const source = V36_DATABASE_MIGRATIONS.join("\n");
    expect(source).toContain("report_v4_acceptance_site_read_manifest");
    expect(source).toContain("NULLS NOT DISTINCT");
    expect(source).toContain("enh_physical_uidx");
    expect(source).toContain("ogc:report-v4:acceptance-site-read-manifest:identity:v1");
    expect(source).toContain("ogc:report-v4:acceptance-site-read-manifest:pair:v1");
    expect(source).toContain("owner_question_id");
    expect(source).toContain("network_performed=true");
    expect(source).toContain("ogc_report_v4_acceptance_require_staging");
    expect(source.indexOf("DROP TRIGGER IF EXISTS report_v4_acceptance_site_read_manifest_guard"))
      .toBeLessThan(source.indexOf("CREATE TRIGGER report_v4_acceptance_site_read_manifest_guard"));
    expect(source).not.toMatch(/\b(raw_url|canonical_url|html|error|http_status|secret|token)\b/iu);

    const schemaSource = readFileSync(new URL("./schema.ts", import.meta.url), "utf8");
    expect(schemaSource).toContain('pgTable("report_v4_acceptance_site_read_manifest"');
    expect(schemaSource).not.toContain('text("raw_url")');
  });
});
