import { describe, expect, it } from "vitest";
import { isBillableCoverage, isTerminalStage } from "./jobs";
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
    expect(isTerminalStage("partial")).toBe(true);
    expect(isTerminalStage("failed")).toBe(true);
    expect(isTerminalStage("analyzing")).toBe(false);
  });
});
