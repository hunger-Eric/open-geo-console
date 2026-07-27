import { describe, expect, it, vi } from "vitest";
import * as runtime from "./prohibited-operation-guard-runtime";
import {
  ReportV4ProhibitedOperationBlockedError,
  runReportV4GuardedOperation,
  withReportV4ProhibitedOperationGuard,
  type ReportV4ProhibitedOperationGuardCapability
} from "./prohibited-operation-guard-runtime";

describe("Report V4 prohibited-operation guard runtime", () => {
  it("calls the delegate unchanged when no DB-authorized capability is active", async () => {
    const abort = new DOMException("stopped", "AbortError");
    await expect(runReportV4GuardedOperation({ guardSite: "pdf_export_url", delegate: async () => "ok" })).resolves.toBe("ok");
    await expect(runReportV4GuardedOperation({ guardSite: "pdf_export_url", delegate: async () => { throw abort; } })).rejects.toBe(abort);
  });

  it("exports no capability authorizer or recorder/completer injection seam", () => {
    expect(Object.keys(runtime)).not.toContain("authorizeReportV4ProhibitedOperationGuardCapability");
    expect(Object.keys(runtime)).toEqual(expect.arrayContaining([
      "ReportV4ProhibitedOperationBlockedError",
      "ReportV4ProhibitedOperationGuardContextConflictError",
      "runReportV4GuardedOperation",
      "withReportV4ProhibitedOperationGuard"
    ]));
  });

  it("rejects forged objects and former raw authority shapes before work", async () => {
    const work = vi.fn();
    const forged = { kind: "report_v4_prohibited_operation_guard_capability" } as ReportV4ProhibitedOperationGuardCapability;
    const forgedWithCallbacks = {
      kind: "report_v4_prohibited_operation_guard_capability",
      recorder: { incrementAttempt: vi.fn(), appendProhibitedEvent: vi.fn() },
      complete: vi.fn()
    } as unknown as ReportV4ProhibitedOperationGuardCapability;
    await expect(withReportV4ProhibitedOperationGuard(forged, work)).rejects.toThrow(/DB-authorized/u);
    await expect(withReportV4ProhibitedOperationGuard(forgedWithCallbacks, work)).rejects.toThrow(/DB-authorized/u);
    expect(work).not.toHaveBeenCalled();
  });

  it("keeps blocked errors limited to the canonical operation and guard site", () => {
    const error = new ReportV4ProhibitedOperationBlockedError("legacy_mutation", "legacy_mutation");
    expect(Object.keys(JSON.parse(JSON.stringify(error))).sort()).toEqual(["code", "guardSite", "operation"]);
    expect(JSON.stringify(error)).not.toMatch(/https?:|password|secret|token/iu);
  });
});
