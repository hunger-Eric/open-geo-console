import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = { rows: [] as Array<Record<string, unknown>> };
  return {
    state,
    ensureDatabase: vi.fn(),
    sql: vi.fn(async () => state.rows),
    parseV1: vi.fn((value: unknown) => value),
    parseV2: vi.fn((value: unknown) => value),
    parseV3: vi.fn((value: unknown) => value),
    parseV4: vi.fn((value: unknown) => value)
  };
});

vi.mock("./index", () => ({ ensureDatabase: mocks.ensureDatabase, getSqlClient: () => mocks.sql }));
vi.mock("@open-geo-console/ai-report-engine", () => ({
  parseCombinedGeoReportV1: mocks.parseV1,
  parseCombinedGeoReportV2: mocks.parseV2,
  parseCombinedGeoReportV3: mocks.parseV3,
  parseCombinedGeoReportV4: mocks.parseV4
}));

import { getActiveCombinedGeoReport } from "./combined-reports";

// @requirement GEO-V4-CONTRACT-01
// @requirement GEO-V4-PDF-01
// @requirement GEO-V4-LEGACY-01
describe("active combined report loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.rows = [];
  });

  it("loads a V4 active artifact only with an HTML hash and null PDF fields", async () => {
    mocks.state.rows = [row()];

    await expect(getActiveCombinedGeoReport("report-1", "combined_geo_report_v4")).resolves.toMatchObject({
      artifactContract: "combined_geo_report_v4",
      artifactRevisionId: "revision-v4",
      revision: 4,
      htmlSha256: "h".repeat(64),
      pdfSha256: null,
      pdfStorageKey: null,
      report: { artifactContract: "combined_geo_report_v4", reportId: "report-1" }
    });
    expect(mocks.parseV4).toHaveBeenCalledOnce();
  });

  it("loads the active V4 artifact through the shared unscoped report-page lookup", async () => {
    mocks.state.rows = [row()];

    await expect(getActiveCombinedGeoReport("report-1")).resolves.toMatchObject({
      artifactContract: "combined_geo_report_v4",
      artifactRevisionId: "revision-v4"
    });
  });

  it.each([
    { name: "missing HTML", overrides: { html_sha256: null } },
    { name: "PDF hash present", overrides: { pdf_sha256: "p".repeat(64) } },
    { name: "PDF key present", overrides: { pdf_storage_key: "private/report.pdf" } }
  ])("rejects V4 readiness with $name", async ({ overrides }) => {
    mocks.state.rows = [row(overrides)];
    await expect(getActiveCombinedGeoReport("report-1", "combined_geo_report_v4")).resolves.toBeNull();
  });

  it.each([
    { contract: "combined_geo_report_v1" as const, revision: 1, parser: mocks.parseV1 },
    { contract: "combined_geo_report_v2" as const, revision: 2, parser: mocks.parseV2 },
    { contract: "combined_geo_report_v3" as const, revision: 3, parser: mocks.parseV3 }
  ])("preserves the $contract HTML plus private-PDF readiness contract", async ({ contract, revision, parser }) => {
    const payload = legacyPayload(contract, revision);
    mocks.state.rows = [row({
      artifact_contract: contract,
      artifact_revision_id: `revision-v${revision}`,
      revision,
      pdf_storage_key: "private/report.pdf",
      pdf_sha256: "p".repeat(64),
      payload
    })];

    const active = await getActiveCombinedGeoReport("report-1");
    expect(active).toMatchObject({
      artifactContract: contract,
      pdfStorageKey: "private/report.pdf",
      pdfSha256: "p".repeat(64),
      report: payload
    });
    expect(parser).toHaveBeenCalledOnce();

    mocks.state.rows = [row({ artifact_contract: contract, payload, pdf_storage_key: null, pdf_sha256: null })];
    await expect(getActiveCombinedGeoReport("report-1")).resolves.toBeNull();
  });

  it.each([
    { name: "expected contract", contract: "combined_geo_report_v4" as const, overrides: { artifact_contract: "combined_geo_report_v3" } },
    { name: "payload contract", contract: "combined_geo_report_v4" as const, overrides: { payload: { ...v4Payload(), artifactContract: "combined_geo_report_v3" } } },
    { name: "report id", contract: "combined_geo_report_v4" as const, overrides: { payload: { ...v4Payload(), reportId: "other-report" } } },
    { name: "artifact revision id", contract: "combined_geo_report_v4" as const, overrides: { payload: { ...v4Payload(), artifactRevisionId: "other-revision" } } },
    { name: "legacy revision", contract: "combined_geo_report_v3" as const, overrides: { artifact_contract: "combined_geo_report_v3", artifact_revision_id: "revision-v3", revision: 4, pdf_storage_key: "private/report.pdf", pdf_sha256: "p".repeat(64), payload: legacyPayload() } },
    { name: "locale", contract: "combined_geo_report_v4" as const, overrides: { report_locale: "zh" } }
  ])("fails closed on a $name mismatch", async ({ contract, overrides }) => {
    mocks.state.rows = [row(overrides)];
    await expect(getActiveCombinedGeoReport("report-1", contract)).resolves.toBeNull();
  });
});

function row(overrides: Record<string, unknown> = {}) {
  return {
    artifact_revision_id: "revision-v4",
    revision: 4,
    pdf_storage_key: null,
    html_sha256: "h".repeat(64),
    pdf_sha256: null,
    artifact_contract: "combined_geo_report_v4",
    report_locale: "en",
    payload: v4Payload(),
    ...overrides
  };
}

function v4Payload() {
  return {
    version: 4,
    artifactContract: "combined_geo_report_v4",
    reportId: "report-1",
    artifactRevisionId: "revision-v4",
    locale: "en-US"
  };
}

function legacyPayload(
  artifactContract: "combined_geo_report_v1" | "combined_geo_report_v2" | "combined_geo_report_v3" = "combined_geo_report_v3",
  artifactRevision = 3
) {
  return {
    version: artifactRevision,
    artifactContract,
    reportId: "report-1",
    artifactRevisionId: `revision-v${artifactRevision}`,
    artifactRevision,
    locale: "en-US"
  };
}
