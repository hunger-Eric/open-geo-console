import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getGeoReport: vi.fn(),
  getBotEvidence: vi.fn(),
  getVisibleReportBundle: vi.fn(),
  getPreAdmissionJob: vi.fn(),
  readDirectVersion: vi.fn(),
  readReviewVersion: vi.fn(),
  parseReady: vi.fn(),
  fromCheckpoint: vi.fn()
}));

vi.mock("@/components/report-view", () => ({
  ReportView: () => <div>persisted-free-report</div>
}));
vi.mock("@/components/pending-report-view", () => ({
  PendingReportView: () => <div>pending-report</div>
}));
vi.mock("@/components/stored-report-fallback", () => ({ StoredReportFallback: () => <div>stored-fallback</div> }));
vi.mock("@/components/commercial-checkout", () => ({ CommercialCheckout: () => <div>checkout</div> }));
vi.mock("@/components/combined-geo-report-v4-teaser", () => ({ CombinedGeoReportV4Teaser: () => <div>ready-teaser</div> }));
vi.mock("@/components/payment-return-banner", () => ({ PaymentReturnBanner: () => <div>payment-banner</div> }));
vi.mock("@/db/reports", () => ({ getGeoReport: mocks.getGeoReport }));
vi.mock("@/db/bot-evidence", () => ({ getBotEvidence: mocks.getBotEvidence }));
vi.mock("@/db/combined-reports", () => ({ getAnyActiveCombinedGeoReport: vi.fn() }));
vi.mock("@/db/report-v4-admission-jobs", () => ({ getReportV4PreAdmissionJob: mocks.getPreAdmissionJob }));
vi.mock("@/server/visible-ai-report", () => ({ getVisibleReportBundle: mocks.getVisibleReportBundle }));
vi.mock("@/server/report-access", () => ({
  reportAccessCookieName: vi.fn(),
  tokenGrantsReportAccess: vi.fn()
}));
vi.mock("@/db/report-semantic-review-activation", () => ({
  readFreeDirectSemanticsVersion: mocks.readDirectVersion,
  readSemanticReviewContractVersion: mocks.readReviewVersion
}));
vi.mock("@/worker/report-v4-free-teaser", () => ({
  freeTeaserCheckpointFromJobCheckpoint: mocks.fromCheckpoint,
  parseReadyFreeTeaserCheckpoint: mocks.parseReady
}));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: vi.fn() })) }));

import ReportPage from "./page";

describe("localized free report fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getGeoReport.mockResolvedValue({
      id: "report-1",
      url: "https://example.com/",
      payload: { score: 80 },
      reportLocale: "zh",
      activeArtifactRevisionId: null,
      createdAt: new Date("2026-08-08T00:00:00.000Z")
    });
    mocks.getBotEvidence.mockResolvedValue(null);
    mocks.getVisibleReportBundle.mockResolvedValue({
      tier: "free",
      aiReport: { summary: "Persisted model report" },
      technicalReport: { score: 80, findings: [] },
      canAccessHtmlArtifact: false
    });
    mocks.getPreAdmissionJob.mockResolvedValue({ checkpoint: { freeDirectSemanticsVersion: "free-v4-direct-semantics-v1" } });
    mocks.fromCheckpoint.mockReturnValue({ stage: "questions_ready" });
    mocks.parseReady.mockImplementation(() => { throw new Error("not ready"); });
    mocks.readReviewVersion.mockReturnValue(null);
  });

  it("shows persisted technical and Free AI content after a marked teaser terminal failure", async () => {
    mocks.readDirectVersion.mockReturnValue("free-v4-direct-semantics-v1");

    const page = await ReportPage({ params: Promise.resolve({ id: "report-1", locale: "zh" }) });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("persisted-free-report");
    expect(html).not.toContain("pending-report");
    expect(html).not.toContain("checkout");
  });

  it("preserves the legacy pending seam when no semantic carrier is present", async () => {
    mocks.readDirectVersion.mockReturnValue(null);

    const page = await ReportPage({ params: Promise.resolve({ id: "report-1", locale: "zh" }) });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("pending-report");
    expect(html).not.toContain("persisted-free-report");
  });
});
