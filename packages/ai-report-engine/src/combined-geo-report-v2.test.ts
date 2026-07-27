import { describe, expect, it } from "vitest";
import { parseCombinedGeoReportV2, parseProviderDiscoveryV1 } from "./combined-geo-report-v2";

describe("combined geo report v2 contracts", () => {
  it("keeps V1 and V2 artifact identities explicit", () => {
    expect(() => parseCombinedGeoReportV2({ version: 1, artifactContract: "combined_geo_report_v1" })).toThrow(/combined_geo_report_v2/i);
  });
  it("reconciles honest discovery counts", () => {
    const value = discovery();
    value.execution.discoveredProviders = 99;
    expect(() => parseProviderDiscoveryV1(value)).toThrow(/counts/i);
  });
  it("accepts zero strict providers without inventing a minimum", () => {
    const value = discovery();
    expect(parseProviderDiscoveryV1(value).strict).toEqual([]);
  });
});

function discovery() { return { version: "provider-discovery-v1", policy: { policyId: "logistics_self_operated_v1", policyVersion: "1" }, identity: { candidateSetHash: "a".repeat(64), queryPlanVersion: "provider-query-plan-v1", passageSelectorVersion: "provider-passage-selector-v1", claimExtractionContract: "provider-claim-extraction-v1", claimExtractionModel: "fixture", claimSetHash: "b".repeat(64) }, execution: { plannedQueries: 18, completedQueries: 12, returnedObservations: 20, safelyRetrievedPages: 10, relevantPassages: 4, discoveredProviders: 1, strictProviders: 0, candidateProviders: 1, rejectedProviders: 0, coverage: "partial" }, strict: [], candidates: [{ entityId: "provider-alpha", canonicalName: "Alpha Logistics", genericRole: "service_provider", policyRole: "carrier", leadEvidenceIds: ["claim-alpha"], missingProof: ["No direct fleet ownership evidence"] }], evidence: [{ evidenceId: "claim-alpha", sourceEvidenceId: "source-alpha", registrableDomain: "alpha.example", title: "Alpha Logistics", sourceAuthority: "company_owned", observedAt: "2030-01-01T00:00:00.000Z", exactExcerpt: "Alpha Logistics offers freight services.", capability: "linehaul_fleet" }], limitation: "Missing public evidence does not prove that a provider lacks a capability." }; }
