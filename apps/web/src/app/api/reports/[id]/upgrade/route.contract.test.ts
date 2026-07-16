import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAiReport: vi.fn(),
  reserveCredit: vi.fn(),
  refundCredit: vi.fn(),
  attachReservationToJob: vi.fn(),
  validateAccessKey: vi.fn(),
  enqueueScanJob: vi.fn(),
  issueReportAccessToken: vi.fn(),
  getGeoReport: vi.fn(),
  persistLegacyReportLocale: vi.fn()
}));

vi.mock("@/db/ai-reports", () => ({ getAiReport: mocks.getAiReport }));
vi.mock("@/db/credits", () => ({
  reserveCredit: mocks.reserveCredit,
  refundCredit: mocks.refundCredit,
  attachReservationToJob: mocks.attachReservationToJob,
  validateAccessKey: mocks.validateAccessKey
}));
vi.mock("@/db/jobs", () => ({ enqueueScanJob: mocks.enqueueScanJob }));
vi.mock("@/db/report-tokens", () => ({ issueReportAccessToken: mocks.issueReportAccessToken }));
vi.mock("@/db/reports", () => ({
  getGeoReport: mocks.getGeoReport,
  persistLegacyReportLocale: mocks.persistLegacyReportLocale
}));

import { POST } from "./route";

describe("upgrade API locale contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getGeoReport.mockResolvedValue({ reportLocale: null });
    mocks.getAiReport.mockResolvedValue(null);
    mocks.reserveCredit.mockResolvedValue({ id: "reservation-1", job_id: null, status: "reserved" });
    mocks.persistLegacyReportLocale.mockResolvedValue("zh");
    mocks.enqueueScanJob.mockResolvedValue({ id: "job-1" });
    mocks.issueReportAccessToken.mockResolvedValue({ rawToken: "report-token" });
  });

  it("binds a legacy locale after credit authorization and uses it for the deep job", async () => {
    const response = await POST(
      new Request("https://example.test/api/reports/report-1/upgrade", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": "upgrade-1" },
        body: JSON.stringify({ accessKey: "ogc_live_key", locale: "zh" })
      }),
      { params: Promise.resolve({ id: "report-1" }) }
    );

    expect(response.status).toBe(202);
    expect(mocks.reserveCredit).toHaveBeenCalledBefore(mocks.persistLegacyReportLocale);
    expect(mocks.persistLegacyReportLocale).toHaveBeenCalledWith("report-1", "zh");
    expect(mocks.enqueueScanJob).toHaveBeenCalledWith({
      reportId: "report-1",
      tier: "deep",
      locale: "zh",
      creditReservationId: "reservation-1"
    });
  });
});
