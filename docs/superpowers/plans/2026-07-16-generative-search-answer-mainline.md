# Generative Search Answer Mainline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make prospective `combined_geo_report_v3` reports generate three complete web-search-enabled model answers with the sources returned by the same answer operations, while independent retrieval and evidence auditing remain non-blocking enrichments.

**Architecture:** Add a provider-independent generative-search answer contract and a MiMo implementation, then extend V3 cards as a backward-compatible discriminated union. The Worker generates and checkpoints answers before it runs the existing audit sidecar; the renderer and commercial outcome use answer delivery rather than page-retrieval coverage as the customer boundary.

**Tech Stack:** TypeScript, npm workspaces, Vitest, Next.js 16 App Router, PostgreSQL/Drizzle, existing OpenAI-compatible MiMo transport, existing public-search runtime, React server rendering, Chromium private readiness.

## Global Constraints

- Read `AGENTS.md`, `docs/PROJECT-STATE.md`, and `docs/superpowers/specs/2026-07-16-generative-search-answer-mainline-design.md` before editing.
- Start each execution wave with `git status --short --branch` and `codegraph status`; sync CodeGraph after source/config edits before later graph impact analysis.
- Preserve unrelated user changes in the two HeyGen documents and the untracked 2026-07-15 remediation plan.
- Use npm workspaces. Do not add dependencies or switch package managers.
- Keep artifact contract `combined_geo_report_v3`, paid SKU `recommendation_forensics_v1`, and fulfillment methodology `public_search_source_forensics_v1`.
- Historical V1/V2/V3 payloads remain immutable and readable. Cards without `answerMode` retain legacy evidence-bound semantics.
- New V3 cards must persist `answerMode: "generative_search_v1"`.
- Do not use independently retrieved evidence, `retrievalReady`, `eligibleDirectEvidence`, entity resolution, exact excerpts, or domain-count thresholds as permission to answer.
- Sources must come from the same logical provider answer operation; never invent a citation after generation.
- Only typed safety, policy, or high-risk provider refusals may render as `refused`.
- Provider transport/authentication/timeout/malformed-response failures remain Worker failures; they may not become customer refusals or evidence limitations.
- PostgreSQL remains commercial authority; terminal job, credit, order, refund/email intent, artifact revision, and access state remain atomic.
- Customer delivery remains authorized HTML only. Keep private Chromium PDF readiness and add no customer PDF route, button, attachment, or email claim.
- Production configuration, database, Workers, aliases, orders, and reports are out of scope. Live mutation is protected-staging-only after deterministic gates pass.
- Subagents work only in their assigned files and do not stage or commit; the root reviewer runs the scoped commit step after diff and test review.

## Parallel Execution Map

- **Wave 1:** Task 1 (core contract), Task 3 (MiMo adapter), and Task 6 (commercial outcome fixtures) may run in parallel because their file ownership does not overlap.
- **Wave 2:** Task 2 (V3 union) starts after Task 1; Task 4 (Worker orchestration) starts after Tasks 1 and 3.
- **Wave 3:** Task 5 (renderer/readiness) starts after Tasks 2 and 4. Task 6 receives a short reconciliation pass after Task 2 if shared type names changed.
- **Wave 4:** Tasks 7 and 8 are root-owned integration, staging, and documentation work.

---

### Task 1: Add the provider-independent generative-search answer contract

**Files:**
- Create: `packages/ai-report-engine/src/generative-search-answer.ts`
- Create: `packages/ai-report-engine/src/generative-search-answer.test.ts`
- Modify: `packages/ai-report-engine/src/index.ts`

**Interfaces:**
- Produces: `GenerativeSearchAnswerProvider`, `GenerativeSearchAnswerResult`, `GenerativeSearchSource`, `GenerativeSearchRefusal`, `parseGenerativeSearchAnswerResult`, `generativeSearchAnswerHash`, and `generativeSearchSourceHash`.
- Consumes: URL canonicalization/domain helpers already exported by `@open-geo-console/citation-intelligence`; use existing Web Crypto or `node:crypto` hashing patterns in the package.

- [ ] **Step 1: Write contract tests before implementation**

Create `generative-search-answer.test.ts` with these exact behaviors:

```ts
import { describe, expect, it } from "vitest";
import {
  generativeSearchAnswerHash,
  parseGenerativeSearchAnswerResult
} from "./generative-search-answer";

const valid = {
  questionId: "question-1",
  answerText: "服务商甲提供跨境海运，服务商乙提供跨境空运。",
  sources: [
    {
      sourceId: "source-1",
      title: "服务商甲跨境物流服务",
      canonicalUrl: "https://provider.example/services?utm_source=model",
      registrableDomain: "provider.example",
      citedText: "提供跨境海运服务",
      providerResultOrder: 1
    }
  ],
  refusal: null,
  searchedAt: "2030-01-01T00:00:00.000Z",
  completedAt: "2030-01-01T00:00:01.000Z",
  providerResponseId: "response-1"
};

describe("parseGenerativeSearchAnswerResult", () => {
  it("accepts a nonblank answer and canonical public sources", () => {
    const parsed = parseGenerativeSearchAnswerResult(valid, {
      expectedQuestionId: "question-1",
      locale: "zh-CN"
    });
    expect(parsed.answerText).toContain("服务商甲");
    expect(parsed.sources).toHaveLength(1);
    expect(parsed.sources[0]!.canonicalUrl).toBe("https://provider.example/services");
  });

  it("rejects a search-results-only response", () => {
    expect(() => parseGenerativeSearchAnswerResult({ ...valid, answerText: "" }, {
      expectedQuestionId: "question-1",
      locale: "zh-CN"
    })).toThrow(/nonblank answer/i);
  });

  it("rejects unsafe and private-network source URLs", () => {
    expect(() => parseGenerativeSearchAnswerResult({
      ...valid,
      sources: [{ ...valid.sources[0], canonicalUrl: "http://127.0.0.1/private" }]
    }, { expectedQuestionId: "question-1", locale: "zh-CN" })).toThrow(/public HTTP/i);
  });

  it("accepts only a typed refusal when answer text is blank", () => {
    const refusal = parseGenerativeSearchAnswerResult({
      ...valid,
      answerText: "",
      sources: [],
      refusal: { code: "safety_refusal", reason: "Provider safety refusal." }
    }, { expectedQuestionId: "question-1", locale: "zh-CN" });
    expect(refusal.refusal?.code).toBe("safety_refusal");
  });

  it("produces a stable normalized hash", async () => {
    await expect(generativeSearchAnswerHash(valid)).resolves.toMatch(/^[a-f0-9]{64}$/);
  });
});
```

- [ ] **Step 2: Run the new test and confirm red state**

Run:

```powershell
npm exec vitest run -- packages/ai-report-engine/src/generative-search-answer.test.ts
```

Expected: FAIL because `generative-search-answer.ts` does not exist.

- [ ] **Step 3: Implement the exact public contract**

Create `generative-search-answer.ts` with these exported shapes:

```ts
export type GenerativeSearchRefusalCode =
  | "safety_refusal"
  | "policy_refusal"
  | "high_risk_refusal";

export interface GenerativeSearchRefusal {
  code: GenerativeSearchRefusalCode;
  reason: string;
}

export interface GenerativeSearchSource {
  sourceId: string;
  title: string;
  canonicalUrl: string;
  registrableDomain: string;
  citedText: string | null;
  providerResultOrder: number;
}

export interface GenerativeSearchAnswerResult {
  questionId: string;
  answerText: string;
  sources: GenerativeSearchSource[];
  refusal: GenerativeSearchRefusal | null;
  searchedAt: string;
  completedAt: string;
  providerResponseId: string | null;
}

export interface GenerativeSearchAnswerProvider {
  readonly providerId: string;
  readonly model: string;
  readonly searchMode: string;
  answerWithSources(input: {
    questionId: string;
    question: string;
    locale: string;
    region: string;
    signal: AbortSignal;
  }): Promise<GenerativeSearchAnswerResult>;
}
```

Implement `parseGenerativeSearchAnswerResult` so it:

- requires the exact question ID;
- permits blank `answerText` only with one of the three refusal codes;
- rejects simultaneous nonblank answer and refusal;
- bounds answer text to 12,000 characters, title/reason to 500, cited text to 2,000, and sources to 20;
- canonicalizes public HTTP(S) URLs, strips fragments and tracking parameters, rejects embedded credentials and non-public/private destinations with the existing URL safety helper;
- deduplicates by canonical URL and preserves the lowest `providerResultOrder`;
- recalculates `registrableDomain` from the canonical URL instead of trusting provider input;
- validates ISO timestamps and ensures `completedAt >= searchedAt`;
- hashes stable normalized JSON with SHA-256.

- [ ] **Step 4: Export the contract and run package tests**

Add the following to `packages/ai-report-engine/src/index.ts`:

```ts
export * from "./generative-search-answer";
```

Run:

```powershell
npm exec vitest run -- packages/ai-report-engine/src/generative-search-answer.test.ts
npm exec vitest run -- packages/ai-report-engine/src
```

Expected: PASS; historical package tests remain green.

- [ ] **Step 5: Root review and commit**

```powershell
git add packages/ai-report-engine/src/generative-search-answer.ts packages/ai-report-engine/src/generative-search-answer.test.ts packages/ai-report-engine/src/index.ts
git commit -m "feat: add generative search answer contract"
```

---

### Task 2: Extend V3 answer cards without reinterpreting historical payloads

**Files:**
- Modify: `packages/ai-report-engine/src/open-geo-answer-v3.ts`
- Modify: `packages/ai-report-engine/src/open-geo-answer-v3.test.ts`
- Modify: `packages/ai-report-engine/src/combined-geo-report-v3.ts`
- Modify: `packages/ai-report-engine/src/combined-geo-report-v3.test.ts`

**Interfaces:**
- Consumes: Task 1 contracts and the existing inline legacy GEO diagnosis, legacy parser, hashes, engine provenance, and combined V3 readiness parser.
- Produces: `LegacyEvidenceBoundAnswerCardV3`, `GenerativeSearchAnswerCardV3`, the union `OpenGeoAnswerCardV3`, `parseGenerativeSearchAnswerCardsV3`, and diagnosis over generated answer text plus returned sources.

- [ ] **Step 1: Add backward-compatibility and new-mode failing tests**

Add fixtures proving:

```ts
const generativeCard = {
  answerMode: "generative_search_v1" as const,
  questionId: context.questionSet.questions[0]!.id,
  exactQuestion: context.questionSet.questions[0]!.privateText,
  status: "answered" as const,
  answerText: "服务商甲提供跨境海运，目标品牌未出现在本次答案中。",
  sources: [{
    sourceId: "source-1",
    title: "服务商甲",
    canonicalUrl: "https://provider.example/services",
    registrableDomain: "provider.example",
    citedText: null,
    providerResultOrder: 1,
    retrievalStatus: "search_source_only" as const,
    ownershipCategory: "unknown" as const
  }],
  provenance: {
    providerId: "mimo",
    model: "mimo-v2.5-pro",
    searchMode: "native_web_search",
    promptVersion: "generative-search-answer-v1",
    searchedAt: "2030-01-01T00:00:00.000Z",
    completedAt: "2030-01-01T00:00:01.000Z",
    answerHash: "a".repeat(64),
    sourceHash: "b".repeat(64)
  },
  geoDiagnosis: emptyDiagnosis(context.questionSet.questions[0]!.privateText),
  audit: { verifiedBodyCount: 0, searchSourceOnlyCount: 1, inaccessibleCount: 0 }
};
```

Tests must assert:

- a historical card with no `answerMode` still parses and preserves legacy `sentences`/`sourceEvidence`;
- a generative card rejects legacy `sentences` as its answer source;
- `answered` requires nonblank `answerText` and at least one source;
- `source_limited` requires nonblank `answerText` and zero usable sources;
- `refused` requires blank `answerText`, zero sources, and a typed refusal provenance field;
- target/competitor mention is derived from `answerText`, not audit evidence;
- forced audit changes do not change answer/source hashes.

- [ ] **Step 2: Run focused tests and confirm red state**

```powershell
npm exec vitest run -- packages/ai-report-engine/src/open-geo-answer-v3.test.ts packages/ai-report-engine/src/combined-geo-report-v3.test.ts
```

Expected: FAIL because the current interface has only evidence-bound sentences.

- [ ] **Step 3: Implement the discriminated union and explicit parser dispatch**

Use these public types:

```ts
export interface LegacyEvidenceBoundAnswerCardV3 {
  answerMode?: "legacy_evidence_bound_v1";
  // retain the current questionId/exactQuestion/status/sentences/sourceEvidence/geoDiagnosis/coverage fields unchanged
}

export interface GenerativeSearchAnswerSourceV3 extends GenerativeSearchSource {
  retrievalStatus: "verified_body" | "search_source_only" | "inaccessible";
  ownershipCategory: OpenGeoAnswerOwnershipCategoryV3;
}

export interface OpenGeoAnswerDiagnosisV3 {
  targetMentioned: boolean;
  targetFirstSentence: number | null;
  targetRoles: string[];
  competitorEntityIds: string[];
  citedOwnership: Record<OpenGeoAnswerOwnershipCategoryV3, number>;
  missingEvidenceFamilies: string[];
  retestQuestion: string;
}

export interface GenerativeSearchAnswerProvenanceV3 {
  providerId: string;
  model: string;
  searchMode: string;
  promptVersion: "generative-search-answer-v1";
  searchedAt: string;
  completedAt: string;
  answerHash: string;
  sourceHash: string;
}

export interface GenerativeSearchAnswerCardV3 {
  answerMode: "generative_search_v1";
  questionId: string;
  exactQuestion: string;
  status: "answered" | "source_limited" | "refused";
  answerText: string;
  sources: GenerativeSearchAnswerSourceV3[];
  provenance: GenerativeSearchAnswerProvenanceV3;
  refusal: GenerativeSearchRefusal | null;
  geoDiagnosis: OpenGeoAnswerDiagnosisV3;
  audit: {
    verifiedBodyCount: number;
    searchSourceOnlyCount: number;
    inaccessibleCount: number;
  };
}

export type OpenGeoAnswerCardV3 =
  | LegacyEvidenceBoundAnswerCardV3
  | GenerativeSearchAnswerCardV3;
```

Extract the current inline `geoDiagnosis` shape into `OpenGeoAnswerDiagnosisV3` without changing legacy fields. Extend `OpenGeoAnswerOwnershipCategoryV3` with `institution`, `community`, `social`, and `unknown`; legacy parsing must initialize the new ownership counters to zero when they are absent.

In `parseOpenGeoAnswerCardsV3`, dispatch on `answerMode === "generative_search_v1"`; otherwise call the existing legacy parser byte-for-byte. Do not widen legacy evidence rules.

- [ ] **Step 4: Add generative diagnosis and hash support**

Add `diagnoseGenerativeSearchAnswerCardV3(card, input)` that tokenizes `answerText` into sentences for mention order, matches target/competitor aliases, and uses `sources` for cited-domain/ownership mix. Keep the existing legacy `diagnoseOpenGeoAnswerCardV3` behavior unchanged.

Update `openGeoAnswerHashV3` and combined V3 parsing to hash/accept both union members without converting one representation into the other.

- [ ] **Step 5: Run focused and full package tests**

```powershell
npm exec vitest run -- packages/ai-report-engine/src/open-geo-answer-v3.test.ts packages/ai-report-engine/src/combined-geo-report-v3.test.ts
npm exec vitest run -- packages/ai-report-engine/src
```

Expected: PASS, including all legacy fixtures.

- [ ] **Step 6: Root review and commit**

```powershell
git add packages/ai-report-engine/src/open-geo-answer-v3.ts packages/ai-report-engine/src/open-geo-answer-v3.test.ts packages/ai-report-engine/src/combined-geo-report-v3.ts packages/ai-report-engine/src/combined-geo-report-v3.test.ts
git commit -m "feat: add generative answer mode to v3"
```

---

### Task 3: Implement the MiMo generative-search answer adapter

**Files:**
- Create: `apps/web/src/public-search-adapters/mimo/generative-answer.ts`
- Create: `apps/web/src/public-search-adapters/mimo/generative-answer.test.ts`
- Modify: `apps/web/src/public-search-adapters/mimo/config.ts`
- Modify: `apps/web/src/public-source-forensics/production-runtime.ts`
- Modify: `apps/web/src/public-source-forensics/production-runtime.test.ts`

**Interfaces:**
- Consumes: Task 1 `GenerativeSearchAnswerProvider`, existing MiMo configuration/base URL/API key/model, fetch injection pattern, adapter error taxonomy, and production runtime authority.
- Produces: `createMiMoGenerativeSearchAnswerProvider({ config, fetch, now })` and `resolveGenerativeSearchAnswerProvider(environment)`.

- [ ] **Step 1: Add deterministic adapter tests with captured requests**

Test a mocked MiMo OpenAI-compatible response containing generated content and citations. Assert the request:

```ts
expect(requestBody).toMatchObject({
  model: "mimo-v2.5-pro",
  temperature: 0.1,
  response_format: { type: "json_object" }
});
expect(JSON.stringify(requestBody)).toContain("Answer the supplied ordinary question completely");
expect(JSON.stringify(requestBody)).toContain("Return only sources actually used");
```

The response fixture must yield:

```ts
{
  questionId: "question-1",
  answerText: "服务商甲提供跨境海运。",
  sources: [{
    sourceId: "source-1",
    title: "服务商甲跨境服务",
    canonicalUrl: "https://provider.example/services",
    registrableDomain: "provider.example",
    citedText: "跨境海运服务",
    providerResultOrder: 1
  }],
  refusal: null
}
```

Also test authentication failure, timeout/AbortError, malformed JSON, search-results-only output, unsafe citation URLs, and typed refusal parsing. No test or error output may contain the configured API key or raw provider body.

- [ ] **Step 2: Run adapter tests and confirm red state**

```powershell
npm exec vitest run -- apps/web/src/public-search-adapters/mimo/generative-answer.test.ts apps/web/src/public-source-forensics/production-runtime.test.ts
```

Expected: FAIL because the answer provider and runtime resolver do not exist.

- [ ] **Step 3: Implement the adapter using existing MiMo configuration**

Use one JSON completion request per question with this system contract:

```text
Return JSON only.
Answer the supplied ordinary question completely using web search.
Return only public sources actually used by this answer operation.
Do not replace the answer with a description of search coverage.
If sources are incomplete, still return the complete answer and the sources available.
Set refusal only for a genuine safety, policy, or high-risk refusal.
Write generated prose in the requested locale; preserve source titles and cited text verbatim.
```

Required JSON shape:

```ts
{
  questionId: input.questionId,
  answerText: "complete answer or empty only for typed refusal",
  sources: [{ sourceId, title, canonicalUrl, citedText, providerResultOrder }],
  refusal: null | { code, reason }
}
```

Normalize the result through Task 1's parser. Use the existing safe timeout, header, API-key redaction, and HTTP error patterns from `mimo/adapter.ts`; do not copy raw error responses into thrown messages.

- [ ] **Step 4: Wire a provider resolver without changing the public-search registry**

Export from `production-runtime.ts`:

```ts
export function resolveGenerativeSearchAnswerProvider(
  environment: NodeJS.ProcessEnv,
  input: { locale: string; region: string },
  dependencies: { fetch?: typeof fetch; now?: () => Date } = {}
): GenerativeSearchAnswerProvider {
  const config = readMiMoPublicSearchConfig(environment, input.locale, input.region);
  return createMiMoGenerativeSearchAnswerProvider({ config, ...dependencies });
}
```

Do not reuse `PublicSearchSurfaceAdapter` as an answer type; search observations and generated answers remain distinct interfaces.

- [ ] **Step 5: Run focused tests and the real staging probe in read-only mode**

```powershell
npm exec vitest run -- apps/web/src/public-search-adapters/mimo/generative-answer.test.ts apps/web/src/public-source-forensics/production-runtime.test.ts
npm run public-search:probe -- --adapter mimo --locale zh-CN --region CN
```

Expected: deterministic tests PASS; the existing probe still returns a valid search observation and prints no secrets. The probe does not yet prove the new answer operation; Task 8 adds that live preflight.

- [ ] **Step 6: Root review and commit**

```powershell
git add apps/web/src/public-search-adapters/mimo/generative-answer.ts apps/web/src/public-search-adapters/mimo/generative-answer.test.ts apps/web/src/public-search-adapters/mimo/config.ts apps/web/src/public-source-forensics/production-runtime.ts apps/web/src/public-source-forensics/production-runtime.test.ts
git commit -m "feat: add mimo generative search answers"
```

---

### Task 4: Make generative answers the V3 Worker mainline

**Files:**
- Modify: `apps/web/src/worker/answer-first-v3.ts`
- Modify: `apps/web/src/worker/answer-first-v3.test.ts`
- Modify: `apps/web/src/worker/processor.ts`
- Modify: `apps/web/src/worker/processor-contract.test.ts`

**Interfaces:**
- Consumes: Tasks 1-3 provider/card contracts, exact locked question set, existing checkpoint writer, public-source forensic result, provider discovery, and pending artifact readiness boundary.
- Produces: `resolveGenerativeAnswerFirstV3`, checkpoint version `answer-first-v3-checkpoint-v2`, three generative cards, one bounded source-correction call, and audit-sidecar enrichment that never mutates answer text.

- [ ] **Step 1: Replace evidence-gate assumptions with failing mainline tests**

Add tests proving:

```ts
it("keeps all three answers when every independent retrieval is unavailable", async () => {
  const provider = answerProvider([
    answer("q1", "服务商甲提供跨境海运。", [source("q1-source")]),
    answer("q2", "海运适合大件，空运适合高时效货物。", [source("q2-source")]),
    answer("q3", "采购时应核验服务范围、时效、赔付与禁运限制。", [source("q3-source")])
  ]);
  const result = await resolveGenerativeAnswerFirstV3({
    ...fixture,
    provider,
    auditSources: []
  });
  expect(result.answerCards.map((card) => card.answerText)).toEqual([
    "服务商甲提供跨境海运。",
    "海运适合大件，空运适合高时效货物。",
    "采购时应核验服务范围、时效、赔付与禁运限制。"
  ]);
  expect(result.answerCards.every((card) => card.status === "answered")).toBe(true);
});
```

Also prove:

- three calls run in canonical question order with bounded concurrency;
- a nonblank answer with zero safe sources receives exactly one correction call;
- a second sourceless answer becomes `source_limited` without losing text;
- a typed refusal becomes `refused` and no correction call runs;
- a transport error rejects instead of producing a card;
- audit enrichment can change `retrievalStatus`/ownership but not `answerText`, source order, answer hash, or source hash;
- matching checkpoint resume makes zero provider calls;
- legacy checkpoint v1 remains readable only for historical prepared artifacts and is never used to create a new generative card;
- a market-statistic-only Q1 fixture is rejected as nonresponsive by a deterministic semantic guard.

- [ ] **Step 2: Run focused Worker tests and confirm red state**

```powershell
npm exec vitest run -- apps/web/src/worker/answer-first-v3.test.ts apps/web/src/worker/processor-contract.test.ts
```

Expected: FAIL because V3 still calls evidence-bound synthesis after the audit pipeline.

- [ ] **Step 3: Implement the v2 checkpoint and three-answer orchestration**

Use this checkpoint:

```ts
export interface AnswerFirstV3CheckpointV2 {
  version: "answer-first-v3-checkpoint-v2";
  stage: "answers_collected" | "cards_ready";
  identityHash: string;
  questionSetIdentity: string;
  providerId: string;
  model: string;
  searchMode: string;
  promptVersion: "generative-search-answer-v1";
  locale: string;
  region: string;
  answerHash: string;
  sourceHash: string;
  engineProvenance: OpenGeoEngineProvenanceV3;
  answerResults: [GenerativeSearchAnswerResult, GenerativeSearchAnswerResult, GenerativeSearchAnswerResult];
  answerCards?: [GenerativeSearchAnswerCardV3, GenerativeSearchAnswerCardV3, GenerativeSearchAnswerCardV3];
}

export type AnswerFirstV3Checkpoint = AnswerFirstV3CheckpointV1 | AnswerFirstV3CheckpointV2;
```

Call `provider.answerWithSources` for each canonical question. Parse each result before building cards. Run one correction only when the answer is nonblank and normalized sources are empty. Persist an `answers_collected` checkpoint immediately after normalizing the three results; this is the provider-call idempotency boundary. After sidecar enrichment and deterministic diagnosis, persist `cards_ready` with the same answer/source hashes. Resume from either stage without repeating provider calls.

Populate the existing combined-report `OpenGeoEngineProvenanceV3` honestly: `searchSurface` is `${providerId}:${searchMode}`, `queryPlanVersion` and `synthesisPromptVersion` are `generative-search-answer-v1`, `passageSelectorVersion` is `audit-sidecar-v1`, `synthesisModel` is the provider model, `evidenceHash` is the normalized source hash, and `answerHash` is the normalized answer hash. Keep locale/region/timestamps and input hash deterministic.

The Q1 semantic guard must require at least one named provider/approach phrase beyond generic market-size/statistical language. It may trigger one contract correction; exhausted nonresponsive output becomes a typed model-contract Worker failure, never `unresolved`.

- [ ] **Step 4: Reorder `finalizeProviderDiscoveryCombinedJob`**

For `combined_geo_report_v3`:

1. resolve the answer provider and create/reuse the v2 answer checkpoint before public-source forensics;
2. run provider discovery/public-source forensics as the audit sidecar;
3. enrich sources by canonical URL without changing provider answer/source identity;
4. build the V3 artifact even when audit retrieval has zero eligible direct evidence;
5. retain the existing four immutable snapshot refs only when the audit pipeline produced them; do not fabricate refs;
6. if the sidecar is unavailable under an existing recoverable failure classification, persist truthful inaccessible/search-only audit labels and continue only when commercial snapshot/refund invariants permit it;
7. keep pending artifact, private readiness, and terminalization resume idempotent.

Delete the generative-mode call to `synthesizeOpenGeoAnswerCardsV3`; retain it only for legacy fixtures/readers.

- [ ] **Step 5: Run Worker and processor tests**

```powershell
npm exec vitest run -- apps/web/src/worker/answer-first-v3.test.ts apps/web/src/worker/processor-contract.test.ts apps/web/src/worker/job-errors.test.ts
```

Expected: PASS; retrieval failure fixtures preserve three answers and provider failures remain typed Worker failures.

- [ ] **Step 6: Root review and commit**

```powershell
git add apps/web/src/worker/answer-first-v3.ts apps/web/src/worker/answer-first-v3.test.ts apps/web/src/worker/processor.ts apps/web/src/worker/processor-contract.test.ts
git commit -m "feat: make generative answers the v3 mainline"
```

---

### Task 5: Render complete answers before sources and preserve private readiness

**Files:**
- Modify: `apps/web/src/components/combined-geo-report-v3-artifact.tsx`
- Modify: `apps/web/src/components/combined-geo-report-v3-artifact.test.tsx`
- Modify: `apps/web/src/report/artifact-model.ts`
- Modify: `apps/web/src/report/artifact-model.test.ts`
- Modify: `apps/web/src/report/combined-artifact-readiness.tsx`
- Modify: `apps/web/src/report/combined-artifact-readiness.test.tsx`
- Modify: `apps/web/src/report/artifact-styles.ts`

**Interfaces:**
- Consumes: Tasks 2 and 4 union cards, existing `CombinedPrivateReportArtifactModelV3`, technical foundation, evidence assets, canonical HTML/private PDF materializer, and language validation.
- Produces: explicit legacy/generative rendering, answer-first completeness verification, and per-source audit labels.

- [ ] **Step 1: Add failing renderer and readiness tests**

Render three generative cards and assert DOM order using string indices:

```ts
const html = renderToStaticMarkup(<CombinedGeoReportV3Artifact model={model} />);
expect(html.indexOf("服务商甲提供跨境海运")).toBeLessThan(html.indexOf("provider.example/services"));
expect(html).toContain("正文已独立核验");
expect(html).toContain("仅模型搜索来源");
expect(html).toContain("当前无法访问");
expect(html).toContain("完整技术分析");
expect(html).not.toMatch(/report\.pdf|Print \/ PDF|打印 \/ PDF/);
```

Also assert:

- legacy cards still render the existing sentence/citation layout;
- `answered` displays complete `answerText` and sources immediately below;
- `source_limited` displays answer plus deterministic source limitation;
- `refused` displays typed refusal copy and never an evidence-retrieval explanation;
- internal query/retrieval metrics remain in the appendix and do not precede the answer;
- desktop and mobile CSS wrap long source URLs without horizontal overflow;
- readiness fails if any generative answer or returned source is omitted from canonical HTML;
- private PDF hash/storage/page-count fields remain required.

- [ ] **Step 2: Run focused component/readiness tests and confirm red state**

```powershell
npm exec vitest run -- apps/web/src/components/combined-geo-report-v3-artifact.test.tsx apps/web/src/report/artifact-model.test.ts
```

Expected: FAIL because the renderer assumes legacy `sentences`/`sourceEvidence`.

- [ ] **Step 3: Implement explicit render dispatch**

In `CombinedGeoReportV3Artifact`, use:

```tsx
{card.answerMode === "generative_search_v1"
  ? <GenerativeSearchAnswerCard card={card} locale={locale} />
  : <LegacyEvidenceBoundAnswerCard card={card} locale={locale} />}
```

`GenerativeSearchAnswerCard` renders exact question, complete answer, ordered source list, audit badge, GEO diagnosis, and compact provenance. Do not create sentence-level citations that the provider did not return.

- [ ] **Step 4: Extend artifact model and readiness completeness checks**

Preserve the union in `CombinedPrivateReportArtifactModelV3`. Readiness must include every `answerText`, source title, canonical URL, GEO diagnosis string, and full technical section in canonical HTML before private PDF export.

Language validation applies to generated answer/refusal/diagnosis prose. Provider-returned titles and cited text remain source-original exceptions.

- [ ] **Step 5: Run focused and visibility tests**

```powershell
npm exec vitest run -- apps/web/src/components/combined-geo-report-v3-artifact.test.tsx apps/web/src/report/artifact-model.test.ts apps/web/src/report/combined-artifact-readiness.test.tsx apps/web/src/report/visibility.test.ts
```

Expected: PASS; customer PDF searches remain empty and internal readiness references remain.

- [ ] **Step 6: Root review and commit**

```powershell
git add apps/web/src/components/combined-geo-report-v3-artifact.tsx apps/web/src/components/combined-geo-report-v3-artifact.test.tsx apps/web/src/report/artifact-model.ts apps/web/src/report/artifact-model.test.ts apps/web/src/report/combined-artifact-readiness.tsx apps/web/src/report/combined-artifact-readiness.test.tsx apps/web/src/report/artifact-styles.ts
git commit -m "feat: render generative search answers first"
```

---

### Task 6: Base V3 commercial outcomes on delivered answers

**Files:**
- Modify: `apps/web/src/db/combined-correction-terminalization.ts`
- Modify: `apps/web/src/db/combined-correction-terminalization.test.ts`
- Modify: `apps/web/src/db/combined-replacement-terminalization.ts`
- Modify: `apps/web/src/db/combined-replacement-terminalization.test.ts`
- Verify unchanged: `apps/web/src/db/staging-combined-artifact-refresh.ts`

**Interfaces:**
- Consumes: Task 2 `OpenGeoAnswerCardV3` union and existing atomic terminalization functions.
- Produces: `combinedV3CommercialOutcome` with explicit legacy/generative branches.

- [ ] **Step 1: Add failing outcome-table tests**

Add this exact table:

```ts
it.each([
  [[generative("answered"), generative("answered"), generative("answered")], "completed"],
  [[generative("answered"), generative("source_limited"), generative("answered")], "completed_limited"],
  [[generative("answered"), generative("refused"), generative("answered")], "completed_limited"],
  [[generative("source_limited"), generative("source_limited"), generative("source_limited")], "failed"]
] as const)("maps generative cards to %s", (cards, expected) => {
  expect(combinedV3CommercialOutcome(cards)).toBe(expected);
});
```

Retain all existing legacy status/sentence cases. Add an atomic terminalization fixture proving audit-sidecar coverage shortfall does not create a refund when three cards are `answered`.

- [ ] **Step 2: Run focused DB tests and confirm red state**

```powershell
npm exec vitest run -- apps/web/src/db/combined-correction-terminalization.test.ts apps/web/src/db/combined-replacement-terminalization.test.ts
```

Expected: FAIL because the function currently reads legacy `status`/`sentences` only.

- [ ] **Step 3: Implement explicit outcome dispatch**

Use:

```ts
export function combinedV3CommercialOutcome(cards: readonly OpenGeoAnswerCardV3[]) {
  const modes = new Set(cards.map((card) => card.answerMode ?? "legacy_evidence_bound_v1"));
  if (modes.size !== 1) throw new TypeError("V3 commercial outcome rejects mixed answer modes.");
  if (cards.every((card) => card.answerMode === "generative_search_v1")) {
    const generative = cards as readonly GenerativeSearchAnswerCardV3[];
    if (generative.every((card) => card.status === "answered")) return "completed";
    if (generative.every((card) => card.status !== "refused" || card.refusal !== null)
        && generative.some((card) => card.status === "answered")) return "completed_limited";
    return "failed";
  }
  return legacyCombinedV3CommercialOutcome(cards as readonly LegacyEvidenceBoundAnswerCardV3[]);
}
```

Do not change atomic settlement/refund/email mechanics. Audit fields are not inputs to the outcome function.

- [ ] **Step 4: Run focused and PostgreSQL audit tests**

```powershell
npm exec vitest run -- apps/web/src/db/combined-correction-terminalization.test.ts apps/web/src/db/combined-replacement-terminalization.test.ts
npm run db:audit
```

Expected: PASS; no terminal commercial job has a reserved credit.

- [ ] **Step 5: Root review and commit**

```powershell
git add apps/web/src/db/combined-correction-terminalization.ts apps/web/src/db/combined-correction-terminalization.test.ts apps/web/src/db/combined-replacement-terminalization.ts apps/web/src/db/combined-replacement-terminalization.test.ts
git commit -m "fix: settle v3 from delivered answers"
```

---

### Task 7: Run deterministic integration and regression gates

**Files:**
- Modify only files directly owned by Tasks 1-6 when a failing gate requires a focused regression test and minimal fix.

**Interfaces:**
- Produces: one locally verified, backward-compatible generative-search V3 implementation with no unrelated refactor.

- [ ] **Step 1: Sync CodeGraph and inspect the changed blast radius**

```powershell
codegraph sync
codegraph status
```

Expected: index is current. Use `codegraph impact` for `OpenGeoAnswerCardV3`, `resolveAnswerFirstV3`, and `combinedV3CommercialOutcome`; add any missed direct consumer to the focused test command.

- [ ] **Step 2: Run all focused tests together**

```powershell
npm exec vitest run -- packages/ai-report-engine/src/generative-search-answer.test.ts packages/ai-report-engine/src/open-geo-answer-v3.test.ts packages/ai-report-engine/src/combined-geo-report-v3.test.ts apps/web/src/public-search-adapters/mimo/generative-answer.test.ts apps/web/src/public-source-forensics/production-runtime.test.ts apps/web/src/worker/answer-first-v3.test.ts apps/web/src/worker/processor-contract.test.ts apps/web/src/components/combined-geo-report-v3-artifact.test.tsx apps/web/src/report/artifact-model.test.ts apps/web/src/report/visibility.test.ts apps/web/src/db/combined-correction-terminalization.test.ts apps/web/src/db/combined-replacement-terminalization.test.ts
```

Expected: all PASS.

- [ ] **Step 3: Run repository gates**

```powershell
npm test
npm run lint
npm run build
npm run db:audit
git diff --check
```

Expected: all PASS. If a failure is caused by Tasks 1-6, add a focused regression in the owning task's test file, implement the smallest fix, rerun that task's focused test, then rerun this step.

- [ ] **Step 4: Verify customer/internal PDF boundaries**

```powershell
rg -n "report\.pdf|recommendation-report\.pdf|legacy-report\.pdf|Print / PDF|打印 / PDF|same-source PDF|同源 PDF" apps/web/src
rg -n "exportCanonicalArtifactHtmlPdf|pdfSha256|pdfStorageKey|pageCount" apps/web/src/report apps/web/src/worker apps/web/src/db
```

Expected: no customer PDF surface; internal export/hash/storage/page-count references remain.

- [ ] **Step 5: Commit only integration fixes**

Stage only files changed to fix a proven integration regression:

```powershell
git diff --name-only
git diff --check
git commit -m "fix: integrate generative search mainline"
```

Skip this commit when no integration fix was required.

---

### Task 8: Add live preflight, deploy protected staging, and accept one real report

**Files:**
- Create: `apps/web/src/scripts/probe-generative-answer.ts`
- Create: `apps/web/src/scripts/probe-generative-answer.test.ts`
- Modify: `apps/web/package.json`
- Modify: root `package.json`
- Create after real evidence exists: `docs/operations/evidence/2026-07-16-generative-search-v3-acceptance.md`
- Modify: `docs/PROJECT-STATE.md`
- Modify: `docs/TASKS.md`
- Modify: `docs/DECISIONS.md`
- Modify: `docs/AI-REPORT-ENGINE.md`
- Modify: `docs/REPORT-WORKSPACE.md`
- Modify: `docs/PROTECTED-STAGING-OPERATIONS.md`

**Interfaces:**
- Consumes: the new provider resolver, protected-staging guard, immutable question fixture, existing Vercel/Docker staging workflow, commerce audit, and Browser acceptance.
- Produces: secret-safe answer preflight, matching staging Web/Worker revision, one real three-answer artifact, and durable acceptance evidence.

- [ ] **Step 1: Add a secret-safe live answer preflight**

The script accepts `--question`, `--locale`, and `--region`, calls `prepareStagingCommand`, resolves the answer provider, and emits only:

```ts
{
  profile: "staging",
  providerId: provider.providerId,
  model: provider.model,
  searchMode: provider.searchMode,
  answerNonblank: result.answerText.trim().length > 0,
  sourceCount: result.sources.length,
  sourceDomains: result.sources.map(({ registrableDomain }) => registrableDomain),
  refusalCode: result.refusal?.code ?? null
}
```

The test mocks the provider and asserts output contains no API key, raw provider response, complete answer text, cited text, customer identity, or source query parameters.

Add scripts:

```json
// apps/web/package.json
"generative-answer:staging:probe": "node --env-file=../../.data/workstation-docker/staging.env --import tsx src/scripts/probe-generative-answer.ts"

// root package.json
"generative-answer:staging:probe": "npm run generative-answer:staging:probe --workspace apps/web --"
```

- [ ] **Step 2: Test and commit the preflight**

```powershell
npm exec vitest run -- apps/web/src/scripts/probe-generative-answer.test.ts
git add package.json apps/web/package.json apps/web/src/scripts/probe-generative-answer.ts apps/web/src/scripts/probe-generative-answer.test.ts
git commit -m "feat: add generative answer staging probe"
```

Expected: PASS and a scoped commit.

- [ ] **Step 3: Run all deterministic and provider gates before deployment**

```powershell
npm test
npm run lint
npm run build
npm run db:audit
npm run public-search:probe -- --adapter mimo --locale zh-CN --region CN
npm run generative-answer:staging:probe -- --question "采购跨境物流服务时，应核验哪些服务范围、交付条件、限制与风险？" --locale zh-CN --region CN
```

Expected: all deterministic gates pass; both provider probes succeed; generative probe reports `answerNonblank: true`, `sourceCount >= 1`, and `refusalCode: null`. Stop before deployment on any failure.

- [ ] **Step 4: Deploy one exact revision to protected Preview and matching staging Workers**

Deploy without `--prod`, wait for Ready, repoint only `open-geo-console-staging-itheheda.vercel.app`, rebuild/restart staging free/deep Docker services from the exact same commit, and verify the staging database marker/schema. Do not touch production services, aliases, variables, or data.

Expected: Web commit, Worker image commit, alias, deployment profile, and database marker agree.

- [ ] **Step 5: Create one new Chinese report and inspect questions before payment**

Submit the agreed test website through protected staging, drain the free Worker, and confirm the persisted question set contains exactly three ordinary questions in Chinese. Stop before checkout if a question leaks target identity into neutral search wording or is mechanically repetitive.

- [ ] **Step 6: Complete one Airwallex Sandbox payment and drain the deep lane**

Use the official Sandbox success flow in the in-app browser. Confirm the signed Webhook creates exactly one entitlement/deep job. Drain the staging deep Worker and commerce operations until terminal.

Expected database/artifact evidence:

- three `generative_search_v1` cards;
- three nonblank answers;
- at least one safe provider-returned source per card;
- Q1 names providers/approaches rather than only market statistics;
- Q2 covers solution, cargo, timing, and delivery conditions;
- Q3 contains a procurement verification checklist;
- audit retrieval failures, if any, change only audit labels;
- exactly one active V3 revision and one private storage key;
- completed job/credit/order/email state is atomic;
- `npm run db:audit` passes.

- [ ] **Step 7: Browser-verify the real authorized HTML**

At desktop and 390x844 verify:

- each card renders exact question, complete answer, then sources;
- source URLs are visible and safe;
- audit labels are secondary;
- GEO target/competitor diagnosis matches answer text;
- technical analysis remains complete;
- no customer PDF action or claim exists;
- anonymous/wrong-scope access returns application 404;
- console has no relevant application error.

Save screenshots outside the repository.

- [ ] **Step 8: Record acceptance and synchronize durable project truth**

Create the dated evidence record with report/order/job/artifact IDs, provider/model/search mode, answer/source hashes, per-card status/source count, snapshot/audit coverage, commerce states, deployment/Worker commit, commands, browser dimensions, screenshot paths, and production-nonchange evidence.

Update existing project docs by replacing evidence-first prospective language with the approved generative-search mainline. State explicitly that `docs/superpowers/plans/2026-07-15-v3-paid-acceptance-remediation.md` is superseded and must not be executed; do not delete or edit that unrelated untracked file during this task.

- [ ] **Step 9: Run scoped neat sync and final gates**

Use the installed `neat-freak` skill, then run:

```powershell
git diff --check
git status --short --branch
npm run db:audit
codegraph sync
codegraph status
```

Expected: no whitespace errors; only intentional code/docs plus preserved unrelated user changes; commercial audit passes; CodeGraph is current.

- [ ] **Step 10: Commit acceptance evidence and project-state updates**

```powershell
git add docs/operations/evidence/2026-07-16-generative-search-v3-acceptance.md docs/PROJECT-STATE.md docs/TASKS.md docs/DECISIONS.md docs/AI-REPORT-ENGINE.md docs/REPORT-WORKSPACE.md docs/PROTECTED-STAGING-OPERATIONS.md
git commit -m "docs: record generative search v3 acceptance"
```

## Final Stop Conditions

Stop without creating or charging another order when any of these occurs:

- deterministic tests, lint, build, DB audit, or CodeGraph freshness fail;
- the answer provider returns search results without a nonblank answer;
- the staging answer preflight returns zero safe sources or a refusal for the ordinary procurement question;
- Web, Worker image, alias, deployment profile, database marker, or schema disagree;
- the signed Webhook does not create exactly one entitlement/deep job;
- a new report contains an empty ordinary answer, all three `source_limited`, fabricated/post-hoc sources, or a market-statistic-only Q1;
- audit retrieval failure still erases or replaces provider answer text;
- artifact readiness, credit settlement, order/refund/email state, access scope, or DB audit is inconsistent;
- browser evidence is a fixture/local render instead of the live protected artifact.

Return to the owning task, add a deterministic regression, make the smallest root-cause fix, rerun every gate, and resume only from the last sanctioned boundary.
