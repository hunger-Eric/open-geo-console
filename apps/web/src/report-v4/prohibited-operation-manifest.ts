import { createHash } from "node:crypto";

export const REPORT_V4_PROHIBITED_OPERATION_MANIFEST_DOMAIN =
  "open-geo-console/report-v4/prohibited-operation-manifest" as const;
export const REPORT_V4_PROHIBITED_OPERATION_MANIFEST_VERSION =
  "report-v4-prohibited-operation-manifest-v1" as const;

export const REPORT_V4_PROHIBITED_OPERATIONS = [
  "pdf",
  "provider_claim",
  "qualification",
  "four_snapshot",
  "replacement_fulfillment",
  "correction",
  "full_report_rerun",
  "legacy_mutation"
] as const;

export type ReportV4ProhibitedOperation = typeof REPORT_V4_PROHIBITED_OPERATIONS[number];

export const REPORT_V4_PROHIBITED_OPERATION_GUARD_SITES = [
  "pdf_export_url",
  "pdf_export_html",
  "pdf_readiness_chromium",
  "pdf_readiness_storage",
  "full_report_rerun",
  "provider_claim",
  "qualification",
  "four_snapshot",
  "replacement_prepare",
  "replacement_resume",
  "replacement_terminalize",
  "correction_prepare",
  "correction_confirm",
  "correction_terminalize",
  "legacy_mutation"
] as const;

export type ReportV4ProhibitedOperationGuardSite =
  typeof REPORT_V4_PROHIBITED_OPERATION_GUARD_SITES[number];

export const REPORT_V4_PROHIBITED_OPERATION_BY_GUARD_SITE = Object.freeze({
  pdf_export_url: "pdf",
  pdf_export_html: "pdf",
  pdf_readiness_chromium: "pdf",
  pdf_readiness_storage: "pdf",
  full_report_rerun: "full_report_rerun",
  provider_claim: "provider_claim",
  qualification: "qualification",
  four_snapshot: "four_snapshot",
  replacement_prepare: "replacement_fulfillment",
  replacement_resume: "replacement_fulfillment",
  replacement_terminalize: "replacement_fulfillment",
  correction_prepare: "correction",
  correction_confirm: "correction",
  correction_terminalize: "correction",
  legacy_mutation: "legacy_mutation"
} as const satisfies Record<ReportV4ProhibitedOperationGuardSite, ReportV4ProhibitedOperation>);

export type ReportV4ProhibitedOperationManifestEntry = {
  readonly [Site in ReportV4ProhibitedOperationGuardSite]: {
    readonly operation: typeof REPORT_V4_PROHIBITED_OPERATION_BY_GUARD_SITE[Site];
    readonly guardSite: Site;
    readonly module: string;
    readonly symbol: string;
  }
}[ReportV4ProhibitedOperationGuardSite];

const manifestEntries = [
  { operation: "pdf", guardSite: "pdf_export_url", module: "apps/web/src/report/pdf-export.ts", symbol: "exportReportPdf" },
  { operation: "pdf", guardSite: "pdf_export_html", module: "apps/web/src/report/pdf-export.ts", symbol: "exportCanonicalArtifactHtmlPdf" },
  { operation: "pdf", guardSite: "pdf_readiness_chromium", module: "apps/web/src/report/combined-artifact-readiness.tsx", symbol: "materializeReadyArtifact" },
  { operation: "pdf", guardSite: "pdf_readiness_storage", module: "apps/web/src/report/combined-artifact-readiness.tsx", symbol: "materializeReadyArtifact" },
  { operation: "full_report_rerun", guardSite: "full_report_rerun", module: "apps/web/src/worker/processor.ts", symbol: "processScanJob" },
  { operation: "provider_claim", guardSite: "provider_claim", module: "apps/web/src/worker/provider-discovery-production.ts", symbol: "extractClaims" },
  { operation: "qualification", guardSite: "qualification", module: "apps/web/src/worker/provider-discovery-production.ts", symbol: "createProductionProviderDiscoveryContext.dependencies.qualify" },
  { operation: "four_snapshot", guardSite: "four_snapshot", module: "apps/web/src/worker/provider-discovery-pipeline.ts", symbol: "runProviderDiscoveryPipeline" },
  { operation: "replacement_fulfillment", guardSite: "replacement_prepare", module: "apps/web/src/db/report-replacement-fulfillments.ts", symbol: "prepareApprovedReportReplacement" },
  { operation: "replacement_fulfillment", guardSite: "replacement_resume", module: "apps/web/src/db/report-replacement-fulfillments.ts", symbol: "resumeApprovedReplacementModelRepair" },
  { operation: "replacement_fulfillment", guardSite: "replacement_terminalize", module: "apps/web/src/db/combined-replacement-terminalization.ts", symbol: "terminalizeCombinedReplacement" },
  { operation: "correction", guardSite: "correction_prepare", module: "apps/web/src/db/report-corrections.ts", symbol: "prepareApprovedReportCorrection" },
  { operation: "correction", guardSite: "correction_confirm", module: "apps/web/src/db/report-corrections.ts", symbol: "confirmApprovedReportCorrection" },
  { operation: "correction", guardSite: "correction_terminalize", module: "apps/web/src/db/combined-correction-terminalization.ts", symbol: "terminalizeCombinedCorrection" },
  { operation: "legacy_mutation", guardSite: "legacy_mutation", module: "apps/web/src/db/reports.ts", symbol: "saveGeoReport" }
] as const satisfies readonly ReportV4ProhibitedOperationManifestEntry[];

const ENTRY_KEYS = ["guardSite", "module", "operation", "symbol"] as const;
const operationSet = new Set<string>(REPORT_V4_PROHIBITED_OPERATIONS);
const guardSiteSet = new Set<string>(REPORT_V4_PROHIBITED_OPERATION_GUARD_SITES);

export function defineReportV4ProhibitedOperationManifest(
  entries: readonly unknown[]
): readonly ReportV4ProhibitedOperationManifestEntry[] {
  const seenSites = new Set<string>();
  const seenEntries = new Set<string>();
  const parsed = entries.map((value, index) => {
    if (!isPlainObject(value) || !hasExactKeys(value, ENTRY_KEYS)) {
      throw new TypeError(`Report V4 prohibited-operation manifest entry ${index} has an unknown or missing field.`);
    }
    const { operation, guardSite, module, symbol } = value;
    if (typeof operation !== "string" || !operationSet.has(operation)) {
      throw new TypeError(`Report V4 prohibited-operation manifest entry ${index} has an unknown operation.`);
    }
    if (typeof guardSite !== "string" || !guardSiteSet.has(guardSite)) {
      throw new TypeError(`Report V4 prohibited-operation manifest entry ${index} has an unknown guard site.`);
    }
    if (!safeManifestName(module) || !safeManifestName(symbol)) {
      throw new TypeError(`Report V4 prohibited-operation manifest entry ${index} has an invalid module or symbol.`);
    }
    if (REPORT_V4_PROHIBITED_OPERATION_BY_GUARD_SITE[guardSite as ReportV4ProhibitedOperationGuardSite] !== operation) {
      throw new TypeError(`Report V4 prohibited-operation manifest entry ${index} crosses the authoritative guard-site operation mapping.`);
    }
    const siteKey = guardSite;
    const entryKey = `${siteKey}\u0000${module}\u0000${symbol}`;
    if (seenSites.has(siteKey) || seenEntries.has(entryKey)) {
      throw new TypeError(`Report V4 prohibited-operation manifest entry ${index} is duplicated.`);
    }
    seenSites.add(siteKey);
    seenEntries.add(entryKey);
    return Object.freeze({
      operation: operation as ReportV4ProhibitedOperation,
      guardSite: guardSite as ReportV4ProhibitedOperationGuardSite,
      module,
      symbol
    }) as ReportV4ProhibitedOperationManifestEntry;
  });
  return Object.freeze(parsed);
}

export const REPORT_V4_PROHIBITED_OPERATION_MANIFEST_ENTRIES =
  defineReportV4ProhibitedOperationManifest(manifestEntries);

export const REPORT_V4_PROHIBITED_OPERATION_MANIFEST_HASH = createHash("sha256")
  .update(canonicalManifestJson(REPORT_V4_PROHIBITED_OPERATION_MANIFEST_ENTRIES))
  .digest("hex");

export function lookupReportV4ProhibitedOperationManifestEntry(
  guardSite: unknown
): ReportV4ProhibitedOperationManifestEntry {
  if (typeof guardSite !== "string") {
    throw new TypeError("A known Report V4 prohibited-operation guard site is required.");
  }
  const entry = REPORT_V4_PROHIBITED_OPERATION_MANIFEST_ENTRIES.find(
    (candidate) => candidate.guardSite === guardSite
  );
  if (!entry) throw new TypeError("The Report V4 prohibited-operation guard site is not registered.");
  return entry;
}

export function assertKnownReportV4ProhibitedOperationGuardSite(input: unknown): asserts input is {
  readonly guardSite: ReportV4ProhibitedOperationGuardSite;
} {
  if (!isPlainObject(input) || !hasExactKeys(input, ["guardSite"])) {
    throw new TypeError("The Report V4 prohibited-operation guard identity has unknown or missing fields.");
  }
  lookupReportV4ProhibitedOperationManifestEntry(input.guardSite);
}

function canonicalManifestJson(entries: readonly ReportV4ProhibitedOperationManifestEntry[]): string {
  return JSON.stringify({
    domain: REPORT_V4_PROHIBITED_OPERATION_MANIFEST_DOMAIN,
    version: REPORT_V4_PROHIBITED_OPERATION_MANIFEST_VERSION,
    entries: entries.map(({ operation, guardSite, module, symbol }) => ({ operation, guardSite, module, symbol }))
  });
}

function safeManifestName(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256 && /^[A-Za-z0-9_@./-]+$/u.test(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}
