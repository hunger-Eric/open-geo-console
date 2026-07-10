import { describe, expect, it } from "vitest";
import { parseJobNotification } from "./job-notification";

describe("job notification privacy contract", () => {
  it("accepts only the versioned opaque hint", () => {
    expect(parseJobNotification({ version: 1, dispatchId: "dispatch_123", tier: "deep" })).toEqual({
      version: 1,
      dispatchId: "dispatch_123",
      tier: "deep"
    });
  });

  it("rejects extra customer or report fields", () => {
    expect(parseJobNotification({
      version: 1,
      dispatchId: "dispatch_123",
      tier: "deep",
      reportId: "private-report"
    })).toBeNull();
    expect(parseJobNotification({ version: 1, dispatchId: "contains spaces", tier: "free" })).toBeNull();
  });
});
