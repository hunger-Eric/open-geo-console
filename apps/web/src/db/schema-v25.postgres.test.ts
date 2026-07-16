import { describe, expect, it } from "vitest";
import { DATABASE_SCHEMA_VERSION } from "./index";
import { V25_DATABASE_MIGRATIONS } from "./migrations";

describe("schema v25 public-source acquisition ledger", () => {
  it("adds immutable attempts and monotonic question checkpoints", () => {
    expect(DATABASE_SCHEMA_VERSION).toBe(32);
    const sql = V25_DATABASE_MIGRATIONS.join("\n");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public_source_retrieval_attempts");
    expect(sql).toContain("public_source_retrieval_attempts_immutability_trigger");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS question_acquisition_checkpoints");
    expect(sql).toContain("collection_failed");
    expect(sql).toContain("candidate_pool_hash");
    expect(sql).toContain("browser_budget_used");
  });
});
