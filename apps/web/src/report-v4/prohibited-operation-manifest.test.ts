import { describe, expect, it } from "vitest";
import {
  REPORT_V4_PROHIBITED_OPERATION_MANIFEST_DOMAIN,
  REPORT_V4_PROHIBITED_OPERATION_MANIFEST_ENTRIES,
  REPORT_V4_PROHIBITED_OPERATION_MANIFEST_HASH,
  REPORT_V4_PROHIBITED_OPERATION_MANIFEST_VERSION,
  assertKnownReportV4ProhibitedOperationGuardSite,
  defineReportV4ProhibitedOperationManifest,
  lookupReportV4ProhibitedOperationManifestEntry
} from "./prohibited-operation-manifest";

describe("Report V4 prohibited-operation manifest", () => {
  it("REQ-V4-PDF keeps the fixed domain, version, canonical order, and golden SHA256", () => {
    expect(REPORT_V4_PROHIBITED_OPERATION_MANIFEST_DOMAIN).toBe("open-geo-console/report-v4/prohibited-operation-manifest");
    expect(REPORT_V4_PROHIBITED_OPERATION_MANIFEST_VERSION).toBe("report-v4-prohibited-operation-manifest-v1");
    expect(REPORT_V4_PROHIBITED_OPERATION_MANIFEST_ENTRIES.map(({ operation, guardSite, symbol }) =>
      `${operation}/${guardSite}/${symbol}`)).toEqual([
      "pdf/pdf_export_url/exportReportPdf",
      "pdf/pdf_export_html/exportCanonicalArtifactHtmlPdf",
      "pdf/pdf_readiness_chromium/materializeReadyArtifact",
      "pdf/pdf_readiness_storage/materializeReadyArtifact",
      "full_report_rerun/full_report_rerun/processScanJob",
      "provider_claim/provider_claim/extractClaims",
      "qualification/qualification/createProductionProviderDiscoveryContext.dependencies.qualify",
      "four_snapshot/four_snapshot/runProviderDiscoveryPipeline",
      "replacement_fulfillment/replacement_terminalize/terminalizeCombinedReplacement",
      "legacy_mutation/legacy_mutation/saveGeoReport"
    ]);
    expect(REPORT_V4_PROHIBITED_OPERATION_MANIFEST_HASH).toBe("c05eaacb4e1746187a5ca37295b3329357c90b27d464fb5e6c87aea4164c390d");
  });

  it("rejects duplicate operation plus guard-site entries", () => {
    const first = REPORT_V4_PROHIBITED_OPERATION_MANIFEST_ENTRIES[0]!;
    expect(() => defineReportV4ProhibitedOperationManifest([first, first])).toThrow(/duplicated/u);
  });

  it("rejects extra fields and unknown operations or sites", () => {
    const first = REPORT_V4_PROHIBITED_OPERATION_MANIFEST_ENTRIES[0]!;
    expect(() => defineReportV4ProhibitedOperationManifest([{ ...first, payload: "not allowed" }])).toThrow(/unknown or missing field/u);
    expect(() => assertKnownReportV4ProhibitedOperationGuardSite({ guardSite: "unknown" })).toThrow(/not registered/u);
    expect(() => assertKnownReportV4ProhibitedOperationGuardSite({ guardSite: "pdf_export_url", extra: true })).toThrow(/unknown or missing/u);
    expect(() => lookupReportV4ProhibitedOperationManifestEntry("not_registered")).toThrow(/not registered/u);
  });

  it("rejects a cross-paired operation even when both discriminants are individually known", () => {
    const replacement = REPORT_V4_PROHIBITED_OPERATION_MANIFEST_ENTRIES.find(({ guardSite }) => guardSite === "replacement_terminalize")!;
    expect(() => defineReportV4ProhibitedOperationManifest([{ ...replacement, operation: "pdf" }]))
      .toThrow(/crosses the authoritative/u);
  });

  it("returns the frozen exact entry for a registered site", () => {
    const entry = lookupReportV4ProhibitedOperationManifestEntry("pdf_export_html");
    expect(entry.symbol).toBe("exportCanonicalArtifactHtmlPdf");
    expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(REPORT_V4_PROHIBITED_OPERATION_MANIFEST_ENTRIES)).toBe(true);
  });
});
