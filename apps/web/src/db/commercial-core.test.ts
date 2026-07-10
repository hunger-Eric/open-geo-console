import { describe, expect, it } from "vitest";
import { isBillableCoverage, isTerminalStage, terminalCreditStatus } from "./jobs";
import { DATABASE_MIGRATIONS } from "./migrations";
import { generateOpaqueSecret, hmacSecret, verifyHmacSecret } from "./secrets";

describe("commercial persistence pure contracts", () => {
  it("generates opaque values and verifies their HMAC without storing the raw value", () => {
    const generated = generateOpaqueSecret("ogc_live");
    const secret = "a sufficiently long server-side secret value";
    const digest = hmacSecret(generated.raw, secret);

    expect(generated.raw).toMatch(/^ogc_live_/);
    expect(generated.displayPrefix.length).toBeLessThan(generated.raw.length);
    expect(digest).not.toContain(generated.raw);
    expect(verifyHmacSecret(generated.raw, digest, secret)).toBe(true);
    expect(verifyHmacSecret(`${generated.raw}x`, digest, secret)).toBe(false);
  });

  it("settles only evidence-valid scans with homepage success and at least 70 percent coverage", () => {
    expect(isBillableCoverage({ plannedPages: 10, successfulPages: 7, homepageSucceeded: true, evidenceValidated: true })).toBe(true);
    expect(isBillableCoverage({ plannedPages: 10, successfulPages: 6, homepageSucceeded: true, evidenceValidated: true })).toBe(false);
    expect(isBillableCoverage({ plannedPages: 10, successfulPages: 10, homepageSucceeded: false, evidenceValidated: true })).toBe(false);
    expect(isBillableCoverage({ plannedPages: 10, successfulPages: 10, homepageSucceeded: true, evidenceValidated: false })).toBe(false);
  });

  it("recognizes only the durable terminal job stages", () => {
    expect(isTerminalStage("completed")).toBe(true);
    expect(isTerminalStage("completed_limited")).toBe(true);
    expect(isTerminalStage("failed")).toBe(true);
    expect(isTerminalStage("analyzing")).toBe(false);
  });

  it("maps every terminal deliverable to a final, non-reserved credit state", () => {
    expect(terminalCreditStatus("completed")).toBe("settled");
    expect(terminalCreditStatus("completed_limited")).toBe("refunded");
    expect(terminalCreditStatus("failed")).toBe("refunded");
  });

  it("migrates legacy partial rows according to AI report existence and refunds them", () => {
    const migration = DATABASE_MIGRATIONS.join("\n");
    expect(migration).toContain("WHERE jobs.stage = 'partial'");
    expect(migration).toContain("THEN 'completed_limited'");
    expect(migration).toContain("ELSE 'failed'");
    expect(migration).toContain("SET status = 'refunded'");
    expect(migration).toContain("CHECK (stage IN ('queued','discovering','planning','fetching','analyzing','synthesizing','completed','completed_limited','failed'))");
  });

  it("installs locale, correction, reason, and checkpoint persistence migrations", () => {
    const migration = DATABASE_MIGRATIONS.join("\n");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS report_locale text");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS locale_correction_used_at timestamptz");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS reason text NOT NULL DEFAULT 'standard'");
    expect(migration).toContain("CHECK (reason IN ('standard','system_recovery','locale_correction'))");
  });
});
