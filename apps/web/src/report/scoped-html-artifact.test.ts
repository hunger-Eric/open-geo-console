import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}), { virtual: true });

const mocks = vi.hoisted(() => ({
  tokenGrantsReportAccess: vi.fn(),
  loadPrivateReportArtifact: vi.fn()
}));

vi.mock("@/server/report-access", () => ({ tokenGrantsReportAccess: mocks.tokenGrantsReportAccess }));
vi.mock("./artifact-model", () => ({ loadPrivateReportArtifact: mocks.loadPrivateReportArtifact }));

import { loadAuthorizedScopedHtmlArtifact } from "./scoped-html-artifact";

describe("loadAuthorizedScopedHtmlArtifact", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects the wrong scope before reading artifact data", async () => {
    mocks.tokenGrantsReportAccess.mockResolvedValue(false);
    await expect(loadAuthorizedScopedHtmlArtifact({
      token: "legacy-token",
      reportId: "report-1",
      artifactScope: "recommendation_forensics_v1"
    })).resolves.toBeNull();
    expect(mocks.loadPrivateReportArtifact).not.toHaveBeenCalled();
  });

  it.each([
    "legacy_website_audit_v1",
    "recommendation_forensics_v1"
  ] as const)("loads only the authorized %s artifact", async (artifactScope) => {
    mocks.tokenGrantsReportAccess.mockResolvedValue(true);
    mocks.loadPrivateReportArtifact.mockResolvedValue({ productContract: artifactScope });
    await expect(loadAuthorizedScopedHtmlArtifact({
      token: "scoped-token",
      reportId: "report-1",
      artifactScope
    })).resolves.toEqual({ productContract: artifactScope });
    expect(mocks.tokenGrantsReportAccess).toHaveBeenCalledWith("scoped-token", "report-1", artifactScope);
    expect(mocks.loadPrivateReportArtifact).toHaveBeenCalledWith("report-1", artifactScope);
  });
});
