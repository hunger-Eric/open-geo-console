import { beforeEach, describe, expect, it, vi } from "vitest";

const { requestHasReportAccess, getEvidenceAsset, getObject } = vi.hoisted(() => ({
  requestHasReportAccess: vi.fn(),
  getEvidenceAsset: vi.fn(),
  getObject: vi.fn()
}));

vi.mock("@/server/report-access", () => ({ requestHasReportAccess }));
vi.mock("@/db/evidence-assets", () => ({ getEvidenceAsset }));
vi.mock("@/evidence/storage", () => ({
  createEvidenceStorage: () => ({ get: getObject })
}));

import { GET } from "./route";

const context = { params: Promise.resolve({ id: "report-1", assetId: "asset-1" }) };

describe("private report evidence route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestHasReportAccess.mockResolvedValue(false);
  });

  it("does not reveal asset existence without report access", async () => {
    const response = await GET(new Request("https://example.com/api/reports/report-1/evidence/asset-1"), context);

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(getEvidenceAsset).not.toHaveBeenCalled();
    expect(getObject).not.toHaveBeenCalled();
  });

  it("streams only an exact ready asset through the private proxy", async () => {
    requestHasReportAccess.mockResolvedValue(true);
    getEvidenceAsset.mockResolvedValue({ status: "ready", storageKey: "reports/report-1/evidence/asset-1.jpg" });
    getObject.mockResolvedValue({ body: new Uint8Array([1, 2, 3]), contentType: "image/jpeg" });

    const response = await GET(new Request("https://example.com/api/reports/report-1/evidence/asset-1"), context);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3]);
    expect(getEvidenceAsset).toHaveBeenCalledWith("report-1", "asset-1");
  });

  it("does not read storage for unavailable metadata", async () => {
    requestHasReportAccess.mockResolvedValue(true);
    getEvidenceAsset.mockResolvedValue({ status: "unavailable", storageKey: null });

    const response = await GET(new Request("https://example.com/api/reports/report-1/evidence/asset-1"), context);

    expect(response.status).toBe(404);
    expect(getObject).not.toHaveBeenCalled();
  });
});
