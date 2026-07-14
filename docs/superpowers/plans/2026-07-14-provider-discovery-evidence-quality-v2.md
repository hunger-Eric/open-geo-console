# Provider Discovery and Evidence Quality V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a prospective `combined_geo_report_v2` pipeline that discovers providers broadly, verifies provider capabilities strictly, separates verified suppliers from evidence-limited candidates, and binds every customer claim to relevant public evidence.

**Architecture:** A generic provider-discovery core in `citation-intelligence` consumes deterministic two-stage query plans from `public-search-observer`. The Web Worker persists immutable discovery, passage and claim evidence, then `ai-report-engine` validates model-assisted claim extraction and renders a versioned V2 report without changing historical V1 artifacts.

**Tech Stack:** TypeScript, npm workspaces, Vitest, Next.js/React, Drizzle ORM, PostgreSQL, existing safe-fetch/site-crawler, existing JSON completion client, Chromium internal PDF readiness.

## Global Constraints

- Use npm workspaces; do not introduce pnpm or yarn.
- Preserve PostgreSQL as the only production report authority.
- Preserve `recommendation_forensics_v1` as the commercial SKU.
- New artifacts use `combined_geo_report_v2`; historical V1 artifacts remain immutable and readable.
- Customer delivery remains HTML-only; internal PDF remains a private readiness gate.
- Public search stays provider-independent, environment selected and fail closed.
- Search and model credentials remain independent.
- Shared market queries must not contain customer brands, domains, order IDs, private questions or private competitor lists.
- A model may extract claims and write grounded prose; deterministic code alone selects policy, validates claims and assigns provider tiers.
- The strict provider list has no minimum count. Never lower evidence thresholds to reach five suppliers.
- Fixed maximums are 30 search requests and 60 safe page retrievals per V2 report.
- Individual query/page/candidate failures lower coverage; authority, identity, storage, contract and artifact failures enter `repair_wait`.
- Terminal job, credit, active artifact and email effects remain atomic and exactly once.
- No request, cookie, header or administrator input may select the V2 contract.
- Follow TDD: each task starts with a focused failing test and ends with its targeted suite passing.
- Preserve unrelated worktree changes and stage only files owned by the current task.

---

## File Structure

New focused domain files:

- `packages/citation-intelligence/src/provider-discovery-types.ts` — generic provider, passage, claim and qualification contracts.
- `packages/citation-intelligence/src/provider-policy-registry.ts` — deterministic compile-time policy selection.
- `packages/citation-intelligence/src/provider-policy-generic.ts` — generic provider-discovery fallback policy.
- `packages/citation-intelligence/src/provider-policy-logistics.ts` — `logistics_self_operated_v1` dimensions and tier rules.
- `packages/citation-intelligence/src/provider-passages.ts` — deterministic chunking and relevance selection.
- `packages/citation-intelligence/src/provider-claims.ts` — model-claim validation and exact excerpt binding.
- `packages/citation-intelligence/src/provider-qualification.ts` — deterministic A/B/C/rejected projection and ranking.
- `packages/public-search-observer/src/provider-query-plan.ts` — discovery and verification fanout contracts.
- `packages/ai-report-engine/src/provider-claim-extraction.ts` — JSON completion prompt, parser and bounded retries.
- `packages/ai-report-engine/src/grounded-business-answers-v2.ts` — claim-level answer contract for questions 2 and 3.
- `packages/ai-report-engine/src/combined-geo-report-v2.ts` — V2 artifact contract and parser.
- `apps/web/src/db/provider-evidence.ts` — immutable passage and claim persistence.
- `apps/web/src/worker/provider-discovery-pipeline.ts` — phase-ledgered provider-discovery orchestration.
- `apps/web/src/components/combined-geo-report-v2-artifact.tsx` — V2 customer HTML.

Existing files change only at their established integration boundaries.

---

### Task 1: Generic Provider Contracts and Policy Registry

**Files:**
- Create: `packages/citation-intelligence/src/provider-discovery-types.ts`
- Create: `packages/citation-intelligence/src/provider-policy-registry.ts`
- Create: `packages/citation-intelligence/src/provider-policy-generic.ts`
- Create: `packages/citation-intelligence/src/provider-policy-logistics.ts`
- Create: `packages/citation-intelligence/src/provider-policy-registry.test.ts`
- Modify: `packages/citation-intelligence/src/index.ts`

**Interfaces:**
- Consumes: locked public question text, locale and website category strings.
- Produces: `ProviderQualificationPolicy`, `selectProviderQualificationPolicy()`, `GENERIC_PROVIDER_POLICY`, `LOGISTICS_SELF_OPERATED_POLICY`, provider/capability/tier types.

- [ ] **Step 1: Write policy-selection and capability-semantics tests**

```ts
import { describe, expect, it } from "vitest";
import {
  LOGISTICS_SELF_OPERATED_POLICY,
  selectProviderQualificationPolicy
} from "./index";

describe("provider qualification policy registry", () => {
  it("selects the reviewed logistics policy deterministically", () => {
    expect(selectProviderQualificationPolicy({
      question: "哪些供应商能够提供自营专线物流？",
      locale: "zh-CN",
      websiteCategories: ["跨境物流"]
    }).policyId).toBe("logistics_self_operated_v1");
  });

  it("falls back to generic provider discovery", () => {
    expect(selectProviderQualificationPolicy({
      question: "哪些软件供应商支持多语言知识库？",
      locale: "zh-CN",
      websiteCategories: ["enterprise software"]
    }).policyId).toBe("generic_provider_discovery_v1");
  });

  it("does not equate a dedicated charter with an owned aircraft", () => {
    const air = LOGISTICS_SELF_OPERATED_POLICY.capabilityDimensions.find(({ id }) => id === "air_capacity");
    expect(air?.states).toContain("dedicated_charter");
    expect(air?.states).toContain("owned");
    expect(air?.states.indexOf("owned")).not.toBe(air?.states.indexOf("dedicated_charter"));
  });
});
```

- [ ] **Step 2: Run the test and verify missing exports fail**

Run:

```powershell
npx vitest run packages/citation-intelligence/src/provider-policy-registry.test.ts
```

Expected: FAIL because the policy registry and exports do not exist.

- [ ] **Step 3: Add exact generic contracts**

Define in `provider-discovery-types.ts`:

```ts
export type ProviderRole = "service_provider" | "platform" | "software_vendor" | "directory_or_media" | "unknown";
export type ProviderEvidenceGradeV2 = "A" | "B" | "C" | "D";
export type ProviderQualificationTier = "verified_full_chain" | "verified_core_segments" | "candidate" | "rejected";
export type ProviderClaimDirectness = "direct" | "associated" | "lead_only";

export interface CapabilityDimensionDefinition {
  id: string;
  label: Readonly<Record<"zh" | "en", string>>;
  states: readonly string[];
  mandatoryForFullChain: boolean;
}

export interface ProviderClaim {
  claimId: string;
  subjectName: string;
  subjectEntityId: string;
  genericRole: ProviderRole;
  policyRole: string;
  capability: string;
  operatingMode: string;
  serviceScope: string[];
  routeScope: string[];
  exactExcerpt: string;
  passageId: string;
  sourceEvidenceId: string;
  sourceAuthority: string;
  directness: ProviderClaimDirectness;
  relevanceScore: number;
  grade: ProviderEvidenceGradeV2;
  sourceEligibility: { eligible: boolean };
  registrableDomain: string;
  contradictionGroupId?: string;
}

export interface ProviderQualificationPolicy {
  policyId: string;
  version: string;
  matches(input: { question: string; locale: string; websiteCategories: string[] }): boolean;
  queryFacets: readonly { id: string; terms: Readonly<Record<"zh" | "en", readonly string[]>> }[];
  capabilityDimensions: readonly CapabilityDimensionDefinition[];
  classifyEntityRole(claims: readonly ProviderClaim[]): string;
  qualify(input: ProviderQualificationInput): ProviderQualificationResult;
}
```

Add complete `ProviderQualificationInput`, `ProviderQualificationResult`, `QualifiedProvider`, `CapabilityAssessment`, `ProviderCandidate` and `ProviderRejection` shapes used by later tasks. Make every returned collection readonly and require explicit missing-proof strings for candidates.

- [ ] **Step 4: Implement the compile-time registry and policies**

Implement selection in registry order:

```ts
const POLICIES = [LOGISTICS_SELF_OPERATED_POLICY, GENERIC_PROVIDER_POLICY] as const;

export function selectProviderQualificationPolicy(input: ProviderPolicySelectionInput): ProviderQualificationPolicy {
  return POLICIES.find((policy) => policy.matches(input)) ?? GENERIC_PROVIDER_POLICY;
}
```

The logistics matcher normalizes NFKC lowercase text and requires a logistics term plus a self-operation/dedicated-route term. Define the eight approved logistics dimensions and states exactly as the design spec. The generic policy exposes `service_capability`, `region_fit`, `use_case_fit` and `qualification` dimensions.

- [ ] **Step 5: Export and run the package tests**

Run:

```powershell
npx vitest run packages/citation-intelligence/src/provider-policy-registry.test.ts
npm run build -w @open-geo-console/citation-intelligence
```

Expected: PASS.

- [ ] **Step 6: Commit the policy foundation**

```powershell
git add packages/citation-intelligence/src
git commit -m "feat: add provider qualification policy registry"
```

---

### Task 2: Deterministic Relevant Passage Selection

**Files:**
- Create: `packages/citation-intelligence/src/provider-passages.ts`
- Create: `packages/citation-intelligence/src/provider-passages.test.ts`
- Modify: `packages/citation-intelligence/src/index.ts`
- Modify: `apps/web/src/worker/public-source-retriever.ts`
- Modify: `apps/web/src/worker/public-source-retriever.test.ts`

**Interfaces:**
- Consumes: normalized page text, provider identity terms and policy query facets.
- Produces: `selectProviderPassages(input): ProviderEvidencePassage[]` with exact excerpts, hashes, matched facets and scores.

- [ ] **Step 1: Add the irrelevant-first-page and middle-passage regressions**

```ts
it("rejects an unrelated publication even when it is readable", () => {
  const result = selectProviderPassages({
    sourceEvidenceId: "source-huawei",
    normalizedText: "华为技术创刊100期。技术创新与行业发展。",
    candidateNames: ["华为"],
    serviceTerms: ["物流", "专线"],
    controlTerms: ["自营", "自有"],
    capabilityTerms: ["车队", "仓库", "清关", "末端"],
    selectorVersion: "provider-passage-selector-v1"
  });
  expect(result).toEqual([]);
});

it("selects a relevant passage from the middle of the document", () => {
  const text = `${"首页导航。".repeat(300)}\n美新物流在美国运营自有海外仓和卡车车队，提供固定专线门到门服务。\n联系我们。`;
  const [passage] = selectProviderPassages({
    sourceEvidenceId: "source-anl",
    normalizedText: text,
    candidateNames: ["美新物流"],
    serviceTerms: ["物流", "专线"],
    controlTerms: ["自有", "运营"],
    capabilityTerms: ["海外仓", "卡车车队"],
    selectorVersion: "provider-passage-selector-v1"
  });
  expect(passage?.exactExcerpt).toContain("自有海外仓和卡车车队");
  expect(passage?.relevanceScore).toBeGreaterThanOrEqual(70);
  expect(text).toContain(passage!.exactExcerpt);
});
```

- [ ] **Step 2: Verify the selector test fails**

Run:

```powershell
npx vitest run packages/citation-intelligence/src/provider-passages.test.ts
```

Expected: FAIL because `selectProviderPassages` is missing.

- [ ] **Step 3: Implement chunking, scoring and stable ordering**

Implement heading/paragraph/list chunking with 200-1,200 character targets. Score exact identity 25, service/route 25, operating control 25, capability object 15 and proximity 10. Reject scores below 45, retain at most three passages, and sort by descending score then excerpt hash rather than domain spelling.

Return:

```ts
export interface ProviderEvidencePassage {
  passageId: string;
  sourceEvidenceId: string;
  passageOrder: number;
  exactExcerpt: string;
  excerptHash: string;
  relevanceScore: number;
  matchedEntityTerms: string[];
  matchedServiceTerms: string[];
  matchedControlTerms: string[];
  matchedCapabilityTerms: string[];
  selectorVersion: "provider-passage-selector-v1";
}
```

- [ ] **Step 4: Stop presenting the first 1,000 characters as verified evidence**

Change `executePublicSourceRetrieval` to return bounded normalized text and content metadata without assigning `verifiedExcerpt` from `normalizedText.slice(0, 1000)`. Existing V1 callers that require a legacy excerpt must use an explicit compatibility projection outside the safe retriever; V2 calls the passage selector.

Add a retriever assertion:

```ts
expect(fact.normalizedText).toContain("Public freight evidence.");
expect(fact).not.toHaveProperty("verifiedExcerpt");
```

- [ ] **Step 5: Run targeted tests and build**

```powershell
npx vitest run packages/citation-intelligence/src/provider-passages.test.ts apps/web/src/worker/public-source-retriever.test.ts
npm run build -w @open-geo-console/citation-intelligence
```

Expected: PASS.

- [ ] **Step 6: Commit passage selection**

```powershell
git add packages/citation-intelligence/src apps/web/src/worker/public-source-retriever.ts apps/web/src/worker/public-source-retriever.test.ts
git commit -m "feat: select relevant provider evidence passages"
```

---

### Task 3: Claim Validation, Evidence V2 and Qualification

**Files:**
- Create: `packages/citation-intelligence/src/provider-claims.ts`
- Create: `packages/citation-intelligence/src/provider-claims.test.ts`
- Create: `packages/citation-intelligence/src/provider-qualification.ts`
- Create: `packages/citation-intelligence/src/provider-qualification.test.ts`
- Modify: `packages/citation-intelligence/src/public-source-evidence.ts`
- Modify: `packages/citation-intelligence/src/public-source-graph.ts`
- Modify: `packages/citation-intelligence/src/index.ts`

**Interfaces:**
- Consumes: selected passages, raw extracted claim candidates, source authority, domain and policy.
- Produces: accepted/rejected `ProviderClaim` records, evidence Grade A-D V2 and deterministic tiered `ProviderQualificationResult`.

- [ ] **Step 1: Add role-transfer, capability and ordering regressions**

```ts
it("does not transfer a customer capability to its TMS vendor", () => {
  const result = qualifyProviders(logisticsInput([
    claim({ subjectName: "易仓科技", policyRole: "software_vendor", capability: "software", operatingMode: "self_operated" }),
    claim({ subjectName: "德邦", policyRole: "integrated_logistics", capability: "fleet", operatingMode: "self_operated" })
  ]));
  expect(result.strict.map(({ canonicalName }) => canonicalName)).not.toContain("易仓科技");
  expect(result.candidates.find(({ canonicalName }) => canonicalName === "易仓科技")?.missingProof).toContain("实际物流承运主体");
});

it("keeps charter distinct from owned aircraft", () => {
  const value = validateProviderClaimCandidate(candidate({ capability: "air_capacity", operatingMode: "dedicated_charter" }), context());
  expect(value.accepted?.operatingMode).toBe("dedicated_charter");
});

it("orders by qualification and evidence strength, not domain spelling", () => {
  const result = qualifyProviders(logisticsInput([providerClaims("Zulu Logistics", 95), providerClaims("Alpha Logistics", 72)]));
  expect(result.strict[0]?.canonicalName).toBe("Zulu Logistics");
});
```

- [ ] **Step 2: Run the tests and verify missing functions fail**

```powershell
npx vitest run packages/citation-intelligence/src/provider-claims.test.ts packages/citation-intelligence/src/provider-qualification.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement exact claim validation**

`validateProviderClaimCandidate()` must reject when the excerpt is not contained in the selected passage, capability/state is not in the selected policy, relevance is below 45, identity cannot be mapped, or the claimed relationship is absent from the passage facets. It returns exactly one of:

```ts
type ProviderClaimValidation =
  | { status: "accepted"; accepted: ProviderClaim }
  | { status: "rejected"; rejected: RejectedProviderClaim };
```

Accepted claims at relevance 45-69 are forced to `lead_only` and Grade C. Grade A requires direct first-party/regulatory evidence at relevance 70+. Grade B requires direct independent evidence at relevance 70+. All other evidence is C or D.

- [ ] **Step 4: Implement deterministic tier projection**

Group accepted claims by `subjectEntityId`. Produce capability assessments for every policy dimension, resolve contradictions before qualification, and apply the exact Tier A/B/C rules from the spec. A provider with no strict qualification but a relevant lead becomes a candidate with sorted missing-proof labels. A software-only or irrelevant entity becomes rejected.

Stable ordering keys are:

```text
tier rank
-> verified mandatory dimension count descending
-> Grade A claim count descending
-> independent domain count descending
-> canonical entity name
-> entity ID
```

- [ ] **Step 5: Tighten public-source evidence construction**

Modify `assessPublicSourceEvidenceGrade` and graph construction so a non-empty excerpt alone cannot create Grade B. `sourceEligibility.eligible` must require traceable accepted claims for provider evidence. Preserve the V1 evidence functions through explicit V1 names or compatibility overloads so historical fixtures remain readable.

- [ ] **Step 6: Run citation-intelligence suites**

```powershell
npx vitest run packages/citation-intelligence/src
npm run build -w @open-geo-console/citation-intelligence
```

Expected: PASS, including zero software-vendor and irrelevant-page strict false positives.

- [ ] **Step 7: Commit evidence and qualification**

```powershell
git add packages/citation-intelligence/src
git commit -m "feat: qualify providers from claim-bound evidence"
```

---

### Task 4: Two-Stage Provider Query Plans

**Files:**
- Create: `packages/public-search-observer/src/provider-query-plan.ts`
- Create: `packages/public-search-observer/src/provider-query-plan.test.ts`
- Modify: `packages/public-search-observer/src/types.ts`
- Modify: `packages/public-search-observer/src/index.ts`

**Interfaces:**
- Consumes: canonical public question, selected policy, public candidate identities and public-search surface.
- Produces: immutable `ProviderDiscoveryQueryPlanV1` and `ProviderVerificationQueryPlanV1` with fixed budgets and deterministic hashes.

- [ ] **Step 1: Add privacy, budget and identity tests**

```ts
it("creates six discovery queries and at most twelve verification queries", () => {
  const discovery = createProviderDiscoveryQueryPlan(input());
  expect(discovery.queries).toHaveLength(6);
  expect(discovery.queries.every(({ resultDepth }) => resultDepth === 5)).toBe(true);

  const verification = createProviderVerificationQueryPlan({
    ...input(),
    parentPlanId: discovery.id,
    candidates: Array.from({ length: 20 }, (_, index) => ({ entityId: `entity-${index}`, canonicalName: `Provider ${index}` }))
  });
  expect(verification.queries).toHaveLength(12);
});

it("rejects customer identity in either stage", () => {
  expect(() => createProviderDiscoveryQueryPlan({ ...input(), question: customerBrandedQuestion() })).toThrow(/customer identity/i);
});
```

- [ ] **Step 2: Verify the test fails**

```powershell
npx vitest run packages/public-search-observer/src/provider-query-plan.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement versioned plan contracts**

Define query kinds `provider_discovery`, `candidate_verification` and `standard_question`. Discovery uses six policy facets, `resultDepth: 5`, `maxResults: 5`. Verification truncates deterministic ranked candidates to twelve, creates one query each, and includes `parentPlanId`, `candidateSetHash`, policy identity, locale, region, surface and fanout version in its plan ID.

- [ ] **Step 4: Run observer tests and build**

```powershell
npx vitest run packages/public-search-observer/src
npm run build -w @open-geo-console/public-search-observer
```

Expected: PASS.

- [ ] **Step 5: Commit query plans**

```powershell
git add packages/public-search-observer/src
git commit -m "feat: add two-stage provider search plans"
```

---

### Task 5: Schema V20 and Immutable Evidence Persistence

**Files:**
- Modify: `apps/web/src/db/schema.ts`
- Modify: `apps/web/src/db/migrations.ts`
- Modify: `apps/web/src/db/index.ts`
- Modify: `apps/web/src/db/index.test.ts`
- Modify: `apps/web/src/db/market-snapshots.ts`
- Create: `apps/web/src/db/provider-evidence.ts`
- Create: `apps/web/src/db/schema-v20.postgres.test.ts`
- Create: `apps/web/src/db/provider-evidence.postgres.test.ts`

**Interfaces:**
- Consumes: snapshot plans, selected passages and validated claims.
- Produces: schema V20 tables/APIs, immutable append/read operations and snapshot ancestry validation.

- [ ] **Step 1: Add disposable PostgreSQL migration assertions**

```ts
expect(DATABASE_SCHEMA_VERSION).toBe(20);
expect(await columns("market_snapshots")).toEqual(expect.arrayContaining([
  "snapshot_kind", "parent_snapshot_id", "candidate_set_hash", "query_plan_version"
]));
expect(await tableExists("market_source_passages")).toBe(true);
expect(await tableExists("market_provider_claims")).toBe(true);
```

Add cases proving historical snapshots default to `standard_question`, verification cannot reference an incomplete/non-discovery parent, a fourth passage for one source is rejected, updates/deletes are rejected, and private customer identity fails the shared-data trigger.

- [ ] **Step 2: Run the PostgreSQL test and verify failure**

```powershell
npx vitest run apps/web/src/db/schema-v20.postgres.test.ts apps/web/src/db/provider-evidence.postgres.test.ts
```

Expected: FAIL because schema V20 does not exist.

- [ ] **Step 3: Add schema V20 migration**

Export `V20_DATABASE_MIGRATIONS`, append it after V19, and set `DATABASE_SCHEMA_VERSION = 20`. Add constrained snapshot columns, self-referential ancestry, immutable passage/claim tables, indexes, exact bounds and privacy triggers described in the spec. Extend public metadata validation keys only for the new reviewed fields.

- [ ] **Step 4: Implement persistence APIs**

Export:

```ts
appendMarketSourcePassages(input: { token: SnapshotLeaseToken; passages: ProviderEvidencePassage[] }): Promise<ProviderEvidencePassage[]>;
appendMarketProviderClaims(input: { token: SnapshotLeaseToken; claims: ProviderClaimPersistenceInput[] }): Promise<StoredProviderClaim[]>;
getMarketProviderEvidenceBundle(snapshotIds: readonly string[]): Promise<MarketProviderEvidenceBundle>;
```

Validate IDs, hashes, parent snapshot, candidate set, policy identity and public metadata before database writes. Repeating an identical append is idempotent; conflicting identity rejects.

- [ ] **Step 5: Run database suites**

```powershell
npx vitest run apps/web/src/db/schema-v20.postgres.test.ts apps/web/src/db/provider-evidence.postgres.test.ts apps/web/src/db/market-snapshots.postgres.test.ts apps/web/src/db/index.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit schema V20**

```powershell
git add apps/web/src/db
git commit -m "feat: persist immutable provider evidence"
```

---

### Task 6: Model-Assisted Provider Claim Extraction

**Files:**
- Create: `packages/ai-report-engine/src/provider-claim-extraction.ts`
- Create: `packages/ai-report-engine/src/provider-claim-extraction.test.ts`
- Modify: `packages/ai-report-engine/src/index.ts`

**Interfaces:**
- Consumes: `JsonCompletionClient`, policy identity, candidate, source and selected passages.
- Produces: validated raw claim candidates for deterministic validation, with at most three model attempts.

- [ ] **Step 1: Add malformed, unsupported and exact-excerpt tests**

```ts
it("rejects a claim whose excerpt is not supplied", async () => {
  const client = fixtureClient({ claims: [{
    subjectName: "Example Logistics",
    genericRole: "service_provider",
    policyRole: "integrated_logistics",
    capability: "fleet",
    operatingMode: "self_operated",
    serviceScope: ["dedicated line"],
    routeScope: [],
    exactExcerpt: "Invented owned fleet statement"
  }] });
  await expect(extractProviderClaimCandidates(client, extractionInput())).rejects.toThrow(/exact excerpt/i);
});
```

Add a test proving the model cannot return `owned` when the passage says only `dedicated charter`, and a test proving malformed JSON is retried at most three times.

- [ ] **Step 2: Run and verify failure**

```powershell
npx vitest run packages/ai-report-engine/src/provider-claim-extraction.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the extraction contract**

Use temperature `0.1`, JSON-only output, the selected report language, supplied policy dimensions and exact excerpts. Parse only the allowed fields. Before returning candidates, require every excerpt to appear in one supplied passage and every capability/state to be valid for the policy. Retry format/contract failures up to three total calls; abort and authentication errors propagate without semantic retry.

- [ ] **Step 4: Run engine tests and build**

```powershell
npx vitest run packages/ai-report-engine/src/provider-claim-extraction.test.ts
npm run build -w @open-geo-console/ai-report-engine
```

Expected: PASS.

- [ ] **Step 5: Commit extraction**

```powershell
git add packages/ai-report-engine/src
git commit -m "feat: extract provider claims from verified passages"
```

---

### Task 7: V2 Report and Claim-Level Answer Contracts

**Files:**
- Create: `packages/ai-report-engine/src/grounded-business-answers-v2.ts`
- Create: `packages/ai-report-engine/src/grounded-business-answers-v2.test.ts`
- Create: `packages/ai-report-engine/src/combined-geo-report-v2.ts`
- Create: `packages/ai-report-engine/src/combined-geo-report-v2.test.ts`
- Modify: `packages/ai-report-engine/src/index.ts`

**Interfaces:**
- Consumes: V1 technical foundation, V2 source forensics, `ProviderQualificationResult`, locked question set and report locale.
- Produces: strict `CombinedGeoReportV2`, `ProviderDiscoveryV1`, and `GroundedBusinessQuestionAnswersV2` parsers/synthesizers.

- [ ] **Step 1: Add V1/V2 dispatch and claim citation tests**

```ts
it("requires evidence for every factual answer claim", () => {
  const value = validAnswersV2();
  value.answers[1]!.claims[0]!.evidenceIds = [];
  expect(() => parseGroundedBusinessAnswersV2(value, evidenceContext())).toThrow(/evidence/i);
});

it("requires two domains for verified confidence", () => {
  const value = validAnswersV2();
  value.answers[2]!.claims[0]!.confidence = "verified";
  value.answers[2]!.claims[0]!.evidenceIds = ["same-domain-a", "same-domain-b"];
  expect(() => parseGroundedBusinessAnswersV2(value, evidenceContext())).toThrow(/independent domains/i);
});

it("keeps V1 and V2 contracts explicit", () => {
  expect(() => parseCombinedGeoReportV2(v1Fixture())).toThrow(/combined_geo_report_v2/i);
  expect(parseCombinedGeoReportV1(v1Fixture()).artifactContract).toBe("combined_geo_report_v1");
});
```

- [ ] **Step 2: Run and verify failure**

```powershell
npx vitest run packages/ai-report-engine/src/grounded-business-answers-v2.test.ts packages/ai-report-engine/src/combined-geo-report-v2.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement exact V2 contracts**

Define `ProviderDiscoveryV1` with policy identity, execution counts, strict/candidate results and internal rejection count. Define question 2/3 answers as ordered `GroundedAnswerClaim[]`; verified claims require two independent eligible domains, limited claims require at least one direct eligible source and explicit limitation text. Question 1 data comes only from `ProviderDiscoveryV1` and cannot be replaced by model prose.

`CombinedGeoReportV2` retains V1 technical foundation and evidence assets but requires V2 source methodology, provider discovery, grounded answers, exact locale and V2 artifact identity.

- [ ] **Step 4: Implement V2 synthesis prompt and validation**

Supply only eligible claim evidence for questions 2 and 3. The model returns claim sentences plus evidence IDs; code overwrites model-selected IDs with the permitted exact set for each claim subject and rejects unsupported facts. Apply existing report-language validation with one language-correction call maximum.

- [ ] **Step 5: Run engine suites**

```powershell
npx vitest run packages/ai-report-engine/src
npm run build -w @open-geo-console/ai-report-engine
```

Expected: PASS.

- [ ] **Step 6: Commit V2 contracts**

```powershell
git add packages/ai-report-engine/src
git commit -m "feat: add grounded combined report v2 contracts"
```

---

### Task 8: Provider Discovery Worker and Recoverable Checkpoints

**Files:**
- Create: `apps/web/src/worker/provider-discovery-pipeline.ts`
- Create: `apps/web/src/worker/provider-discovery-pipeline.test.ts`
- Modify: `apps/web/src/worker/job-state.ts`
- Modify: `apps/web/src/worker/job-state.test.ts`
- Modify: `apps/web/src/worker/public-source-snapshot-resolver.ts`
- Modify: `apps/web/src/worker/public-source-forensics.ts`

**Interfaces:**
- Consumes: locked questions, policy registry, public-search authority, snapshot resolver, safe retriever, claim extraction client and evidence persistence.
- Produces: `ProviderDiscoveryPipelineResult`, four immutable snapshot refs and `ProviderDiscoveryCheckpointV1`.

- [ ] **Step 1: Add phase ordering, partial coverage and resume tests**

```ts
it("resumes after candidate verification without repeating search", async () => {
  const calls = counters();
  const first = pipelineDeps({ calls, failAt: "passage_selection" });
  await expect(runProviderDiscoveryPipeline(input(first))).rejects.toThrow();
  const second = pipelineDeps({ calls, checkpoint: first.savedCheckpoint });
  await runProviderDiscoveryPipeline(input(second));
  expect(calls.discoverySearch).toBe(1);
  expect(calls.verificationSearch).toBe(1);
});

it("completes with zero strict providers", async () => {
  const result = await runProviderDiscoveryPipeline(input(candidateOnlyDeps()));
  expect(result.providerDiscovery.strict).toEqual([]);
  expect(result.providerDiscovery.candidates.length).toBeGreaterThan(0);
  expect(result.coverage.status).toBe("partial");
});
```

Add mismatch tests for policy, candidate-set, adapter, model, evidence cutoff and question-set identities.

- [ ] **Step 2: Run and verify failure**

```powershell
npx vitest run apps/web/src/worker/provider-discovery-pipeline.test.ts apps/web/src/worker/job-state.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Add the V2 phases and checkpoint contract**

Extend `AnalysisJobPhase` with the approved provider phases. Define `ProviderDiscoveryCheckpointV1` exactly from the spec and hash canonical JSON for candidate, passage, claim and qualification boundaries. Phase transitions remain append-only and stage projection remains compatible with existing customer status UI.

- [ ] **Step 4: Implement the orchestration**

Execute discovery search, deterministic candidate resolution, verification search, bounded shared retrieval, passage selection, claim extraction, claim validation, evidence qualification and provider projection. Run questions 2 and 3 through standard fanouts and the tightened relevance gate. Stop scheduling new work after the hard deadline and preserve abort reason through retrieval.

Classify individual search/page/candidate failures as coverage limitations. Throw typed repairable errors for authority, checkpoint identity, stable extraction contract, database, private storage and artifact collaborators.

- [ ] **Step 5: Run Worker suites**

```powershell
npx vitest run apps/web/src/worker/provider-discovery-pipeline.test.ts apps/web/src/worker/public-source-snapshot-resolver.test.ts apps/web/src/worker/job-state.test.ts
```

Expected: PASS with exact call counts and no duplicate phase work.

- [ ] **Step 6: Commit the pipeline**

```powershell
git add apps/web/src/worker
git commit -m "feat: orchestrate recoverable provider discovery"
```

---

### Task 9: Processor, Artifact Revision and Commercial Integration

**Files:**
- Modify: `apps/web/src/worker/processor.ts`
- Modify: `apps/web/src/worker/processor-contract.test.ts`
- Modify: `apps/web/src/db/schema.ts`
- Modify: `apps/web/src/db/migrations.ts`
- Modify: `apps/web/src/db/combined-reports.ts`
- Modify: `apps/web/src/db/combined-correction-terminalization.ts`
- Modify: `apps/web/src/db/staging-combined-artifact-refresh.ts`
- Modify: `apps/web/src/db/recovery-state.postgres.test.ts`
- Modify: `apps/web/src/db/schema-v20.postgres.test.ts`
- Modify: `apps/web/src/public-source-forensics/production-runtime.ts`
- Modify: `apps/web/src/public-source-forensics/production-runtime.test.ts`

**Interfaces:**
- Consumes: V2 deployment selection, provider pipeline result and V2 report builder.
- Produces: prospective V2 jobs/revisions, staging-only `evidence_refresh`, atomic activation and exactly-once commercial effects.

- [ ] **Step 1: Add contract-selection and exactly-once tests**

Add tests proving:

```ts
expect(resolveCombinedReportContract({ OGC_COMBINED_REPORT_CONTRACT: "combined_geo_report_v2" })).toBe("combined_geo_report_v2");
expect(() => resolveCombinedReportContract({ OGC_COMBINED_REPORT_CONTRACT: "request" })).toThrow();
```

Add a PostgreSQL recovery test that fails artifact readiness after V2 report preparation, resumes, and asserts one active revision, one settlement, zero refunds and one completion-email intent.

- [ ] **Step 2: Run and verify failure**

```powershell
npx vitest run apps/web/src/worker/processor-contract.test.ts apps/web/src/db/recovery-state.postgres.test.ts apps/web/src/db/schema-v20.postgres.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Extend artifact and job contracts prospectively**

Add `combined_geo_report_v2` to deployment/job/access/artifact constraints and add `evidence_refresh` revision kind. Historical rows remain V1. A failed V2 evidence refresh cannot replace the active revision. New paid admission selects from deployment configuration only and persists the selected contract on the job.

- [ ] **Step 4: Wire V2 processor finalization**

Dispatch V2 jobs to `runProviderDiscoveryPipeline`, build the V2 report, run the same-HTML artifact readiness gate and reuse existing atomic terminalization. Keep V1 dispatch unchanged. Extend correction/refresh resume parsing with explicit contract dispatch; never parse V1 as V2.

- [ ] **Step 5: Run processor and PostgreSQL recovery suites**

```powershell
npx vitest run apps/web/src/worker/processor-contract.test.ts apps/web/src/db/recovery-state.postgres.test.ts apps/web/src/db/schema-v20.postgres.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit integration**

```powershell
git add apps/web/src/worker/processor.ts apps/web/src/worker/processor-contract.test.ts apps/web/src/db
git commit -m "feat: integrate combined report v2 jobs"
```

---

### Task 10: V2 HTML, Honest Metrics and Internal PDF Readiness

**Files:**
- Create: `apps/web/src/components/combined-geo-report-v2-artifact.tsx`
- Create: `apps/web/src/components/combined-geo-report-v2-artifact.test.tsx`
- Modify: `apps/web/src/report/artifact-model.ts`
- Modify: `apps/web/src/report/artifact-model.test.ts`
- Modify: `apps/web/src/report/combined-artifact-readiness.tsx`
- Modify: `apps/web/src/report/combined-artifact-readiness.test.tsx`
- Modify: `apps/web/src/app/reports/[id]/report.html/page.tsx`

**Interfaces:**
- Consumes: authorized `CombinedGeoReportV2` artifact model.
- Produces: customer HTML with Tier A/B/C provider discovery, claim citations and exact coverage counters; same payload feeds private PDF readiness.

- [ ] **Step 1: Add HTML structure and secrecy tests**

```ts
expect(html).toContain("全链路自营已证实");
expect(html).toContain("核心环节自营已证实");
expect(html).toContain("候选但证据不足");
expect(html).toContain("计划查询");
expect(html).toContain("成功安全抓取页面");
expect(html).not.toMatch(/搜索 3 个关键词|参考 16 篇资料/);
expect(html).not.toMatch(/query-|evidence-|snapshot-|inputHash|relevanceScore/);
expect(html).not.toContain("PDF");
```

Add assertions for explicit `unknown`, partner/mixed states, source-original excerpts, candidate missing proof, claim footnotes and zero-strict-provider copy.

- [ ] **Step 2: Run and verify failure**

```powershell
npx vitest run apps/web/src/components/combined-geo-report-v2-artifact.test.tsx apps/web/src/report/artifact-model.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement explicit V1/V2 artifact dispatch**

Extend the private artifact model union and route renderer by artifact contract. Render V2 question 1 from deterministic provider discovery, not answer prose. Render exact counters: planned/completed queries, result observations, safe pages, relevant passages, strict providers and candidates.

Evidence expansion shows domain/title, authority type, observed time, capability and at most 300 source-original characters. It never shows internal IDs, hashes or scores.

- [ ] **Step 4: Keep HTML-only customer delivery and private PDF parity**

Run language validation over customer prose and deterministic labels, excluding source-original passages and URLs. Feed the same V2 component to Chromium readiness. Keep all customer PDF routes/actions absent and require HTML hash, private PDF hash/storage key and page count before activation.

- [ ] **Step 5: Run artifact tests**

```powershell
npx vitest run apps/web/src/components/combined-geo-report-v2-artifact.test.tsx apps/web/src/report/artifact-model.test.ts apps/web/src/report/combined-artifact-readiness.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit V2 rendering**

```powershell
git add apps/web/src/components apps/web/src/report apps/web/src/app
git commit -m "feat: render evidence-bound provider reports"
```

---

### Task 11: Full Regression, Security and Documentation Gate

**Files:**
- Modify: `docs/PROJECT-STATE.md`
- Modify: `docs/TASKS.md`
- Modify: `docs/DECISIONS.md`
- Modify: `docs/PROTECTED-STAGING-OPERATIONS.md`
- Create: `docs/operations/provider-discovery-v2-acceptance.md`
- Modify only if implementation exposes a new hard rule: `AGENTS.md`

**Interfaces:**
- Consumes: all completed V2 tasks and verification output.
- Produces: green deterministic/local acceptance and honest staging-ready project state.

- [ ] **Step 1: Run focused provider suites**

```powershell
npx vitest run packages/citation-intelligence/src/provider-policy-registry.test.ts packages/citation-intelligence/src/provider-passages.test.ts packages/citation-intelligence/src/provider-claims.test.ts packages/citation-intelligence/src/provider-qualification.test.ts
npx vitest run packages/public-search-observer/src/provider-query-plan.test.ts
npx vitest run packages/ai-report-engine/src/provider-claim-extraction.test.ts packages/ai-report-engine/src/grounded-business-answers-v2.test.ts packages/ai-report-engine/src/combined-geo-report-v2.test.ts
npx vitest run apps/web/src/worker/provider-discovery-pipeline.test.ts apps/web/src/components/combined-geo-report-v2-artifact.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run full deterministic verification**

```powershell
npm test
npm run lint
npm run build
npm run db:audit
npm run test:postgres:staging-security
git diff --check
```

Expected: all commands PASS. If protected PostgreSQL prerequisites are unavailable, record the exact skipped suite and keep staging activation blocked.

- [ ] **Step 3: Re-sync CodeGraph and inspect affected boundaries**

```powershell
codegraph sync
codegraph status
codegraph impact selectProviderQualificationPolicy
codegraph impact runProviderDiscoveryPipeline
```

Expected: up-to-date graph and only intended package/Worker/report consumers.

- [ ] **Step 4: Perform scoped neat sync**

Update existing state/decision/task/runbook entries rather than appending a chat transcript. Record schema V20, V2 prospective status, exact local verification, remaining protected-staging gates and the environment-only contract selector. Do not claim staging acceptance before it occurs.

- [ ] **Step 5: Commit verified implementation state**

```powershell
git add -- docs/PROJECT-STATE.md docs/TASKS.md docs/DECISIONS.md docs/PROTECTED-STAGING-OPERATIONS.md docs/operations/provider-discovery-v2-acceptance.md
if (git diff --quiet -- AGENTS.md) { } else { git add -- AGENTS.md }
git commit -m "docs: record provider discovery v2 readiness"
```

---

### Task 12: Protected-Staging Acceptance and Production Gate

Local implementation through Task 11 is complete as of 2026-07-14: full deterministic tests, lint, build and diff checks pass. Real PostgreSQL V20 suites are included in the staging-security command but remain conditionally skipped without an isolated admin URL; the available staging database connection timed out during the security suite and read-only audit. Task 12 therefore remains open and production V2 admission remains disabled. Use `docs/operations/provider-discovery-v2-acceptance.md` as the live evidence checklist.

**Files:**
- Modify after live evidence exists: `docs/operations/provider-discovery-v2-acceptance.md`
- Modify after live evidence exists: `docs/PROJECT-STATE.md`
- Modify after live evidence exists: `docs/TASKS.md`

**Interfaces:**
- Consumes: reviewed commit, protected-staging V2 configuration, exact Worker image and sanctioned operator flow.
- Produces: staging evidence or an honest blocked report; it does not authorize production by itself.

- [ ] **Step 1: Deploy only to protected staging**

Set `OGC_COMBINED_REPORT_CONTRACT=combined_geo_report_v2` only in protected staging, preserve the exact public-search authority and build/start the staging Web/Worker revision through the existing sanctioned workflow. Do not change production containers, aliases, database or commerce admission.

- [ ] **Step 2: Generate the required acceptance reports**

Create one Chinese logistics report, one English generic-provider report and one report whose strict list is empty. Record job IDs, four snapshot refs, candidate-set hashes, completed/planned query counts, safe retrievals, relevant passages, strict/candidate counts and artifact revision IDs without secrets.

- [ ] **Step 3: Run the logistics evidence audit**

Verify in the active HTML and persisted evidence that:

```text
the Huawei publication is rejected as irrelevant
Eccang is a software vendor, not a verified carrier
Eccang customers remain independent entities
no unsupported full-chain self-operated label appears
candidate rows state exact missing proof
every strict capability opens a directly relevant excerpt
```

- [ ] **Step 4: Run recovery and readiness fault injections**

Interrupt one job after candidate verification, resume it and prove search/model call counts are not duplicated. Fail one artifact-readiness attempt, repair and resume it, then prove one active artifact, one settlement, zero refunds and one completion email.

- [ ] **Step 5: Run browser and access acceptance**

In headed Chromium, verify Tier A/B/C layout, claim footnotes, honest counters, Chinese/English locale integrity, customer HTML only, private evidence authorization and application `404` for anonymous HTML/evidence/internal-PDF requests.

- [ ] **Step 6: Record the gate result and commit evidence docs**

If every acceptance item passes, mark protected staging accepted while leaving production V2 disabled pending explicit authorization. If any item fails, record the exact phase, checkpoint, artifact and next sanctioned command; do not describe V2 as ready.

```powershell
git add docs/operations/provider-discovery-v2-acceptance.md docs/PROJECT-STATE.md docs/TASKS.md
git commit -m "docs: record provider discovery v2 staging acceptance"
```

---

## Plan Completion Criteria

The implementation is complete only when Tasks 1-11 pass locally and Task 12 has either a successful protected-staging record or an explicit external/configuration blocker. Production activation remains a separate operator decision even after staging acceptance.
