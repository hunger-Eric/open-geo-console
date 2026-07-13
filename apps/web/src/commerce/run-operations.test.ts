import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reconcile: vi.fn(),
  sla: vi.fn(),
  refunds: vi.fn(),
  email: vi.fn()
}));

vi.mock("./operations", () => ({
  reconcileTerminalPaidJobs: mocks.reconcile,
  enforceCommercialSla: mocks.sla,
  processPendingCommercialRefunds: mocks.refunds,
  processQueuedCommercialEmails: mocks.email
}));

import { runCommercialOperations } from "./run-operations";

afterEach(() => {
  vi.clearAllMocks();
});

describe("runCommercialOperations", () => {
  it("runs the full sequence in its commercial safety order", async () => {
    const calls: string[] = [];
    mocks.reconcile.mockImplementation(async () => { calls.push("reconcile"); return 2; });
    mocks.sla.mockImplementation(async () => { calls.push("sla"); return { warnings: 1, expired: 0 }; });
    mocks.refunds.mockImplementation(async () => { calls.push("refunds"); return { claimed: 1, succeeded: 1, retried: 0, failed: 0 }; });
    mocks.email.mockImplementation(async () => { calls.push("email"); return { claimed: 2, succeeded: 2, retried: 0, failed: 0 }; });

    await expect(runCommercialOperations("all")).resolves.toEqual({
      reconciledJobs: 2,
      sla: { warnings: 1, expired: 0 },
      refunds: { claimed: 1, succeeded: 1, retried: 0, failed: 0 },
      email: { claimed: 2, succeeded: 2, retried: 0, failed: 0 }
    });
    expect(calls).toEqual(["reconcile", "sla", "refunds", "email"]);
  });

  it("runs only the explicitly requested CLI operation", async () => {
    mocks.refunds.mockResolvedValue({ claimed: 0, succeeded: 0, retried: 0, failed: 0 });
    await expect(runCommercialOperations("refunds")).resolves.toEqual({
      refunds: { claimed: 0, succeeded: 0, retried: 0, failed: 0 }
    });
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(mocks.sla).not.toHaveBeenCalled();
    expect(mocks.email).not.toHaveBeenCalled();
  });

  it("rejects an invalid operation before invoking a provider path", async () => {
    await expect(runCommercialOperations("invalid" as never)).rejects.toThrow("Unknown commercial operation.");
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(mocks.sla).not.toHaveBeenCalled();
    expect(mocks.refunds).not.toHaveBeenCalled();
    expect(mocks.email).not.toHaveBeenCalled();
  });
});
