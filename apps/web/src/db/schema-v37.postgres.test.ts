import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DATABASE_SCHEMA_VERSION } from "./index";
import { V37_DATABASE_MIGRATIONS, V38_DATABASE_MIGRATIONS, databaseMigrationsAfter } from "./migrations";
import { REPORT_V4_PROHIBITED_OPERATION_MANIFEST_ENTRIES } from "@/report-v4/prohibited-operation-manifest";

// @requirement GEO-V4-ACCEPT-01
describe("schema V37 DB-authoritative prohibited-operation guards", () => {
  it("registers one replay-safe forward migration after V36", () => {
    expect(DATABASE_SCHEMA_VERSION).toBe(38);
    expect(databaseMigrationsAfter(36)).toEqual([...V37_DATABASE_MIGRATIONS, ...V38_DATABASE_MIGRATIONS]);
    expect(databaseMigrationsAfter(37)).toEqual([...V38_DATABASE_MIGRATIONS]);
    const source = V37_DATABASE_MIGRATIONS.join("\n");
    expect(source).toContain("report_v4_prohibited_operation_guard_runs");
    expect(source).toContain("report_v4_prohibited_operation_guard_counters");
    expect(source).toContain("counter_count<>15");
    expect(source).toContain("attempt_count<>0");
    expect(source).toContain("correction','full_report_rerun','legacy_mutation");
    expect(source).toContain("ogc_report_v4_acceptance_require_staging");
    for (const { operation, guardSite } of REPORT_V4_PROHIBITED_OPERATION_MANIFEST_ENTRIES) {
      expect(source).toContain(`WHEN '${guardSite}' THEN candidate_operation='${operation}'`);
    }
    expect(source.indexOf("DROP TRIGGER IF EXISTS report_v4_prohibited_operation_guard_runs_guard"))
      .toBeLessThan(source.indexOf("CREATE TRIGGER report_v4_prohibited_operation_guard_runs_guard"));
    expect(source.indexOf("DROP TRIGGER IF EXISTS report_v4_prohibited_operation_guard_counters_guard"))
      .toBeLessThan(source.indexOf("CREATE TRIGGER report_v4_prohibited_operation_guard_counters_guard"));
    const schema = readFileSync(new URL("./schema.ts", import.meta.url), "utf8");
    expect(schema).toContain('pgTable("report_v4_prohibited_operation_guard_runs"');
    expect(schema).toContain('pgTable("report_v4_prohibited_operation_guard_counters"');
  });
});
