import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requestHasReportAccess: vi.fn(),
  createLocaleCorrectionJob: vi.fn()
}));

vi.mock("@/server/report-access", () => ({ requestHasReportAccess: mocks.requestHasReportAccess }));
vi.mock("@/db/reports", () => {
  class LocaleCorrectionError extends Error {
    constructor(public readonly code: string, message: string) {
      super(message);
    }
  }
  return { createLocaleCorrectionJob: mocks.createLocaleCorrectionJob, LocaleCorrectionError };
});

import { LocaleCorrectionError } from "@/db/reports";
import { POST } from "./route";

const request = new Request("https://example.test/api/reports/report-1/locale-correction", { method: "POST" });
const context = { params: Promise.resolve({ id: "report-1" }) };

describe("one-time report locale correction API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires the report access cookie", async () => {
    mocks.requestHasReportAccess.mockResolvedValue(false);
    const response = await POST(request, context);
    expect(response.status).toBe(403);
    expect(mocks.createLocaleCorrectionJob).not.toHaveBeenCalled();
  });

  it("returns the credit-free correction job created by the atomic persistence helper", async () => {
    mocks.requestHasReportAccess.mockResolvedValue(true);
    mocks.createLocaleCorrectionJob.mockResolvedValue({ jobId: "job-1", locale: "zh" });
    const response = await POST(request, context);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ jobId: "job-1", locale: "zh" });
    expect(mocks.createLocaleCorrectionJob).toHaveBeenCalledWith("report-1");
  });

  it("reports a consumed one-time correction as a conflict", async () => {
    mocks.requestHasReportAccess.mockResolvedValue(true);
    mocks.createLocaleCorrectionJob.mockRejectedValue(
      new LocaleCorrectionError("correction_already_used", "The one-time report language correction was already used.")
    );
    const response = await POST(request, context);
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("correction_already_used");
  });
});
