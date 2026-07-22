import { describe, expect, it } from "vitest";
import { parseStagingCommercialOperationCommand } from "./staging-commercial-operations";

const orderId = "4286cb73-6349-467a-8aaf-9b196624da92";

describe("targeted Staging commercial operation command", () => {
  it("accepts an exact order only for provider-backed refund and email operations", () => {
    expect(parseStagingCommercialOperationCommand(["refunds", "--order-id", orderId])).toEqual({ operation: "refunds", orderId });
    expect(parseStagingCommercialOperationCommand(["email", "--order-id", orderId])).toEqual({ operation: "email", orderId });
  });

  it("rejects malformed identities, extra arguments, and global operations", () => {
    expect(() => parseStagingCommercialOperationCommand(["refunds", "--order-id", "not-an-order"])).toThrow(/valid/i);
    expect(() => parseStagingCommercialOperationCommand(["all", "--order-id", orderId])).toThrow(/only/i);
    expect(() => parseStagingCommercialOperationCommand(["reconcile", "--order-id", orderId])).toThrow(/only/i);
    expect(() => parseStagingCommercialOperationCommand(["email", "--order-id", orderId, "extra"])).toThrow(/one exact/i);
  });

  it("preserves the existing unfiltered command shape", () => {
    expect(parseStagingCommercialOperationCommand([])).toEqual({ operation: "all" });
    expect(parseStagingCommercialOperationCommand(["refunds"])).toEqual({ operation: "refunds" });
  });
});
