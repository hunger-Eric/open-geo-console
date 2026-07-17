import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DATABASE_SCHEMA_VERSION } from "./index";
import { V35_DATABASE_MIGRATIONS, V36_DATABASE_MIGRATIONS, databaseMigrationsAfter } from "./migrations";

// @requirement GEO-V4-ACCEPT-01
describe("schema V35 protected-Staging acceptance ledger", () => {
  it("registers one forward-only append-only ledger migration after V34", () => {
    expect(DATABASE_SCHEMA_VERSION).toBe(36);
    expect(databaseMigrationsAfter(34)).toEqual([...V35_DATABASE_MIGRATIONS, ...V36_DATABASE_MIGRATIONS]);
    const source = V35_DATABASE_MIGRATIONS.join("\n");
    expect(source).toContain("report_v4_acceptance_sessions");
    expect(source).toContain("report_v4_acceptance_scenarios");
    expect(source).toContain("report_v4_acceptance_events");
    expect(source).toMatch(/FOR UPDATE/iu);
    expect(source).toMatch(/append-only|immutable/iu);
    expect(source).toContain("deployment_environment");
    expect(source).toContain("protected_staging");
    expect(source).toContain("prev_hash");
    expect(source).toContain("event_hash");
    expect(source).toContain("web_git_sha=worker_git_sha");
    expect(source).toContain("details_canonical");
    expect(source).toContain("occurred_at_canonical");
    expect(source).toContain("YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"");
    expect(source).toContain("occurred_at_canonical ~ '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{6}Z$'");
    expect(source).toContain("OLD.fault_source_id IS NULL AND NEW.fault_source_id IS NOT NULL");
    expect(source).toContain("requires its bound independent fault source before terminalization");
    expect(source).toContain("The diagnosis-failure Report V4 acceptance scenario requires its exact enhancement artifact.");
    const schemaSource = readFileSync(new URL("./schema.ts", import.meta.url), "utf8");
    expect(schemaSource).toContain("~ '^\\\\d{4}-\\\\d{2}-\\\\d{2}T\\\\d{2}:\\\\d{2}:\\\\d{2}\\\\.\\\\d{6}Z$'");
  });
});
