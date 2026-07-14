# Answer-First Open GEO Report V3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. If that skill is unavailable, execute inline in this session with the same red/green/refactor and commit checkpoints. Do not spawn subagents unless the user explicitly authorizes delegation.

**Goal:** Add a prospective `combined_geo_report_v3` artifact in which all three canonical buyer questions produce an Open GEO generated answer with adjacent claim-level sources and deterministic GEO diagnosis.

**Architecture:** Extend the existing V2 provider-discovery and grounded-evidence pipeline without changing the paid SKU or historical artifacts. A new AI-engine contract owns three ordered answer cards, sentence-level evidence validation, engine provenance, and deterministic diagnosis; the Web/Worker selects V3 only through the existing environment-owned combined-report admission boundary, checkpoints the complete pending artifact, and reuses the canonical HTML/private-PDF readiness and atomic commercial terminalization paths.

**Tech Stack:** TypeScript, React/Next.js 16 App Router, PostgreSQL migrations, Vitest, existing JSON completion client, existing public-search/citation packages, Chromium private readiness, npm workspaces.

## Global Constraints

- Read `AGENTS.md`, `docs/PROJECT-STATE.md`, `docs/DECISIONS.md`, and `docs/superpowers/specs/2026-07-14-answer-first-open-geo-report-design.md` before editing.
- Start with `git status --short --branch` and `codegraph status`; sync CodeGraph after source/config changes before later impact analysis.
- Keep commercial product code `recommendation_forensics_v1` and fulfillment methodology `public_search_source_forensics_v1` unchanged.
- Add only prospective artifact contract `combined_geo_report_v3`; never rewrite, backfill, translate, or reinterpret V1/V2 rows.
- Keep the default `OGC_COMBINED_REPORT_CONTRACT` fail-safe value unchanged until protected-staging opt-in; never change production configuration or deploy production.
- Customer output is secure HTML only. Keep private Chromium PDF readiness and storage; add no customer PDF route, action, attachment, or email claim.
- Customer copy calls the result `Open GEO 生成式答案` / `Open GEO generated answer`; never attribute it to Doubao, ChatGPT, Kimi, Gemini, or another consumer platform.
- Model prose uses the persisted report locale. Source-original excerpts, names, URLs, code, and stable technical identifiers remain exceptions.
- A grounded factual sentence must resolve to direct, eligible, same-question, same-subject evidence. Verified confidence requires two independent registrable domains.
- Run the focused test after each red/green change and make the task commit before continuing.

---

## File Map

**Create**

- `packages/ai-report-engine/src/open-geo-answer-v3.ts` — answer-card, evidence, provenance, parser, synthesis, and deterministic diagnosis contracts.
- `packages/ai-report-engine/src/open-geo-answer-v3.test.ts` — contract, language, evidence, confidence, and diagnosis tests.
- `packages/ai-report-engine/src/combined-geo-report-v3.ts` — prospective V3 combined artifact parser/readiness contract.
- `packages/ai-report-engine/src/combined-geo-report-v3.test.ts` — V3 composition and V1/V2 compatibility tests.
- `apps/web/src/worker/answer-first-v3.ts` — question-scoped evidence projection and three-card synthesis orchestration.
- `apps/web/src/worker/answer-first-v3.test.ts` — Q1/Q2/Q3 projection, resume, and unsupported-claim tests.
- `apps/web/src/components/combined-geo-report-v3-artifact.tsx` — answer-first customer HTML renderer.
- `apps/web/src/components/combined-geo-report-v3-artifact.test.tsx` — complete-answer, adjacent-source, diagnosis, GEO-copy, responsive-markup tests.
- `apps/web/src/db/schema-v21.postgres.test.ts` — disposable PostgreSQL migration/constraint coverage.
- `docs/operations/evidence/2026-07-15-answer-first-v3-acceptance.md` — live protected-staging acceptance record, created only when real evidence exists.

**Modify**

- `packages/ai-report-engine/src/index.ts`
- `apps/web/src/report/combined-report-contract.ts`
- `apps/web/src/db/migrations.ts`
- `apps/web/src/db/index.ts`
- `apps/web/src/db/index.test.ts`
- `apps/web/src/db/schema.ts`
- `apps/web/src/db/combined-reports.ts`
- `apps/web/src/db/combined-correction-terminalization.ts`
- `apps/web/src/db/commercial-orders.ts`
- `apps/web/src/db/product-contract.test.ts`
- `apps/web/src/worker/provider-discovery-pipeline.ts`
- `apps/web/src/worker/provider-discovery-production.ts`
- `apps/web/src/worker/processor.ts`
- `apps/web/src/worker/processor-contract.test.ts`
- `apps/web/src/report/combined-artifact-readiness.tsx`
- `apps/web/src/report/artifact-model.ts`
- `apps/web/src/report/artifact-model.test.ts`
- `apps/web/src/report/artifact-styles.ts`
- `apps/web/src/server/report-access.ts`
- `apps/web/src/server/report-access.test.ts`
- `apps/web/src/app/reports/[id]/report.html/page.tsx`
- `apps/web/src/app/api/reports/[id]/access/route.ts`
- `apps/web/src/app/[locale]/reports/[id]/staging-access/route.ts`
- relevant route tests under the same directories
- `docs/PROJECT-STATE.md`, `docs/TASKS.md`, `docs/DECISIONS.md`, `docs/AI-REPORT-ENGINE.md`, `docs/REPORT-WORKSPACE.md`, `docs/PROTECTED-STAGING-OPERATIONS.md`

---

### Task 1: Define and validate the V3 answer-first domain contract

**Files:**
- Create: `packages/ai-report-engine/src/open-geo-answer-v3.ts`
- Create: `packages/ai-report-engine/src/open-geo-answer-v3.test.ts`
- Create: `packages/ai-report-engine/src/combined-geo-report-v3.ts`
- Create: `packages/ai-report-engine/src/combined-geo-report-v3.test.ts`
- Modify: `packages/ai-report-engine/src/index.ts`

**Interfaces:**
- Produces: `OpenGeoAnswerEvidenceV3`, `OpenGeoAnswerSentenceV3`, `OpenGeoAnswerCardV3`, `OpenGeoEngineProvenanceV3`, `parseOpenGeoAnswerCardsV3`, `synthesizeOpenGeoAnswerCardsV3`, `CombinedGeoReportV3`, `parseCombinedGeoReportV3`, `requireReadyCombinedGeoReportV3`.
- Consumes: `ConfirmedBusinessQuestionSet`, `JsonCompletionClient`, `CombinedGeoReportV2`, report-language validation, SHA-256 helpers.

- [ ] **Step 1: Write failing contract tests**

Add tests that construct exactly three ordered cards and prove rejection of: two cards, duplicate question IDs, a foreign question ID, an `answered` card without claims, `verified` evidence from one domain, cross-question evidence, a model-authored insufficient answer, and Chinese generated prose containing unapproved English.

Use this canonical shape in the fixture:

```ts
const cards = [{
  questionId: questions.questions[0].id,
  exactQuestion: questions.questions[0].privateText,
  status: "answered",
  sentences: [{
    sentenceId: "sentence-q1-1",
    kind: "grounded_claim",
    text: "公开资料显示，甲物流提供台湾海运与报关服务。",
    evidenceIds: ["evidence-a", "evidence-b"],
    confidence: "verified"
  }],
  sourceEvidence: [evidence("evidence-a", "a.example"), evidence("evidence-b", "b.example")],
  coverage: { plannedQueries: 6, completedQueries: 6, returnedResults: 8, safelyRetrievedPages: 4, reasons: [] },
  geoDiagnosis: diagnosis()
}, cardForQuestion(1), cardForQuestion(2)] as const;
```

- [ ] **Step 2: Run tests and confirm the red state**

Run:

```powershell
npx vitest run packages/ai-report-engine/src/open-geo-answer-v3.test.ts packages/ai-report-engine/src/combined-geo-report-v3.test.ts
```

Expected: FAIL because the V3 modules/exports do not exist.

- [ ] **Step 3: Implement the V3 interfaces and strict parser**

Define these exact public interfaces:

```ts
export const OPEN_GEO_ANSWER_V3_VERSION = "open-geo-answer-v3" as const;
export const OPEN_GEO_ENGINE_ID = "open_geo_public_search_answer_v1" as const;

export interface OpenGeoAnswerEvidenceV3 {
  evidenceId: string;
  questionId: string;
  subjectKey: string;
  canonicalUrl: string;
  title: string;
  registrableDomain: string;
  ownershipCategory: "target_owned" | "competitor_owned" | "third_party_editorial" | "directory" | "government" | "other";
  exactExcerpt: string;
  observedAt: string;
  eligible: boolean;
  direct: boolean;
}

export interface OpenGeoAnswerSentenceV3 {
  sentenceId: string;
  kind: "grounded_claim" | "scope_note";
  text: string;
  evidenceIds: string[];
  confidence?: "verified" | "limited";
}

export interface OpenGeoAnswerCardV3 {
  questionId: string;
  exactQuestion: string;
  status: "answered" | "limited" | "insufficient";
  sentences: OpenGeoAnswerSentenceV3[];
  sourceEvidence: OpenGeoAnswerEvidenceV3[];
  coverage: { plannedQueries: number; completedQueries: number; returnedResults: number; safelyRetrievedPages: number; reasons: string[] };
  geoDiagnosis: {
    targetMentioned: boolean;
    targetFirstSentence: number | null;
    targetRoles: string[];
    competitorEntityIds: string[];
    citedOwnership: Record<OpenGeoAnswerEvidenceV3["ownershipCategory"], number>;
    missingEvidenceFamilies: string[];
    retestQuestion: string;
  };
}

export interface OpenGeoEngineProvenanceV3 {
  engineId: typeof OPEN_GEO_ENGINE_ID;
  searchSurface: string;
  queryPlanVersion: string;
  passageSelectorVersion: string;
  synthesisModel: string;
  synthesisPromptVersion: string;
  locale: string;
  region: string;
  searchedAt: string;
  evidenceCutoffAt: string;
  synthesizedAt: string;
  inputHash: string;
  evidenceHash: string;
  answerHash: string;
}
```

The parser must derive the allowed evidence map per card, enforce same-question/same-subject binding, require two domains for `verified`, require deterministic limitation copy for one-domain `limited`, and allow no factual model prose for `insufficient`.

- [ ] **Step 4: Implement bounded synthesis and deterministic diagnosis**

`synthesizeOpenGeoAnswerCardsV3(client, input)` must submit only question-scoped eligible evidence, request ordered sentences, run at most one correction after a `TypeError` or `ReportLanguageValidationError`, and return parsed cards. Citation ordinals are not part of model output.

`diagnoseOpenGeoAnswerCardV3(...)` must use target aliases, resolved competitor IDs, answer sentence positions, and cited ownership; do not ask the model to grade itself.

- [ ] **Step 5: Implement `CombinedGeoReportV3` as a prospective extension**

```ts
export const COMBINED_GEO_REPORT_V3_VERSION = 3 as const;
export const COMBINED_GEO_REPORT_V3_CONTRACT = "combined_geo_report_v3" as const;

export interface CombinedGeoReportV3 extends Omit<CombinedGeoReportV2, "version" | "artifactContract" | "businessQuestionAnswers"> {
  version: 3;
  artifactContract: "combined_geo_report_v3";
  engineProvenance: OpenGeoEngineProvenanceV3;
  answerCards: [OpenGeoAnswerCardV3, OpenGeoAnswerCardV3, OpenGeoAnswerCardV3];
}
```

Parse the V2 base through the existing V2 parser with a compatibility projection, then require three V3 cards bound to all three canonical questions. Do not change the V1/V2 parsers.

- [ ] **Step 6: Run the focused package tests**

Run the command from Step 2. Expected: PASS with all V3 rejection and compatibility cases green.

- [ ] **Step 7: Commit**

```powershell
git add packages/ai-report-engine/src/open-geo-answer-v3.ts packages/ai-report-engine/src/open-geo-answer-v3.test.ts packages/ai-report-engine/src/combined-geo-report-v3.ts packages/ai-report-engine/src/combined-geo-report-v3.test.ts packages/ai-report-engine/src/index.ts
git commit -m "feat: define answer-first GEO report v3"
```

---

### Task 2: Add schema-v21 and prospective admission/access scope

**Files:**
- Modify: `apps/web/src/db/migrations.ts`
- Modify: `apps/web/src/db/index.ts`
- Modify: `apps/web/src/db/index.test.ts`
- Modify: `apps/web/src/db/schema.ts`
- Modify: `apps/web/src/report/combined-report-contract.ts`
- Modify: `apps/web/src/db/commercial-orders.ts`
- Modify: `apps/web/src/db/product-contract.test.ts`
- Create: `apps/web/src/db/schema-v21.postgres.test.ts`

**Interfaces:**
- Produces: schema version `21`, `CombinedReportContract` including V3, `ReportArtifactScope` including V3, V3 job/revision/token constraints.
- Preserves: default contract, product code, fulfillment methodology, recommendation report version, and all V1/V2 rows.

- [ ] **Step 1: Write failing admission and migration tests**

Add assertions:

```ts
expect(resolveCombinedReportContract({ OGC_COMBINED_REPORT_CONTRACT: "combined_geo_report_v3" }))
  .toBe("combined_geo_report_v3");
expect(resolveCombinedReportContract({})).toBe("combined_geo_report_v1");
expect(DATABASE_SCHEMA_VERSION).toBe(21);
expect(recommendationReportVersionForProductAdmission("recommendation_forensics_v1")).toBe(2);
```

The PostgreSQL test must migrate a disposable v20 database, insert V1/V2 rows before migration, then prove V1/V2/V3 are accepted after migration and an unknown artifact scope is rejected.

- [ ] **Step 2: Run tests and confirm failure**

```powershell
npx vitest run apps/web/src/db/index.test.ts apps/web/src/db/product-contract.test.ts apps/web/src/worker/processor-contract.test.ts
```

Expected: FAIL on schema version and rejected V3 contract.

- [ ] **Step 3: Add `V21_DATABASE_MIGRATIONS`**

Drop and recreate only the existing artifact-contract/scope checks so they include `combined_geo_report_v3` for `scan_jobs`, `report_access_tokens`, `report_artifact_revisions`, correction/refresh checks, and any other V20 constraint that enumerates combined contracts. Append `...V21_DATABASE_MIGRATIONS` after V20 and set `DATABASE_SCHEMA_VERSION = 21`.

Do not update existing rows and do not change the production-safe default contract.

- [ ] **Step 4: Extend TypeScript unions and environment parser**

```ts
export type CombinedReportContract = "combined_geo_report_v1" | "combined_geo_report_v2" | "combined_geo_report_v3";
```

Add V3 to `ReportArtifactScope`. Keep the invalid-value error fail-closed.

- [ ] **Step 5: Run deterministic tests and the disposable PostgreSQL test**

```powershell
npx vitest run apps/web/src/db/index.test.ts apps/web/src/db/product-contract.test.ts apps/web/src/worker/processor-contract.test.ts
npm run test:postgres:staging-security -- --run apps/web/src/db/schema-v21.postgres.test.ts
```

Expected: deterministic tests PASS. The PostgreSQL test must PASS against an isolated `OGC_TEST_DATABASE_ADMIN_URL`; if that variable is unavailable, record the conditional skip and do not claim database acceptance.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/db/migrations.ts apps/web/src/db/index.ts apps/web/src/db/index.test.ts apps/web/src/db/schema.ts apps/web/src/report/combined-report-contract.ts apps/web/src/db/commercial-orders.ts apps/web/src/db/product-contract.test.ts apps/web/src/db/schema-v21.postgres.test.ts
git commit -m "feat: admit combined GEO report v3"
```

---

### Task 3: Produce three grounded answer cards in the Worker

**Files:**
- Create: `apps/web/src/worker/answer-first-v3.ts`
- Create: `apps/web/src/worker/answer-first-v3.test.ts`
- Modify: `apps/web/src/worker/provider-discovery-pipeline.ts`
- Modify: `apps/web/src/worker/provider-discovery-pipeline.test.ts`
- Modify: `apps/web/src/worker/provider-discovery-production.ts`
- Modify: `apps/web/src/worker/provider-discovery-production.test.ts`
- Modify: `apps/web/src/worker/processor.ts`
- Modify: `apps/web/src/worker/processor-contract.test.ts`

**Interfaces:**
- Produces: `buildAnswerFirstV3Evidence`, `resolveAnswerFirstV3`, checkpoint field `answerFirstV3` containing evidence hash, cards, provenance, and identity hash.
- Consumes: provider discovery for question 1, standard-question snapshots/source graph for questions 2/3, configured JSON completion client, exact immutable question set.

- [ ] **Step 1: Write failing Worker tests**

Prove that:

- Q1 provider evidence becomes customer-visible V3 evidence with canonical URL, title, domain, excerpt, subject, and ownership.
- Q2/Q3 evidence remains question- and subject-scoped.
- All three cards are synthesized in canonical order.
- An unsupported model sentence is rejected.
- Reusing a matching checkpoint makes zero new search/retrieval/model calls.
- A changed evidence hash or question-set identity fails resume.

- [ ] **Step 2: Run tests and confirm failure**

```powershell
npx vitest run apps/web/src/worker/answer-first-v3.test.ts apps/web/src/worker/provider-discovery-pipeline.test.ts apps/web/src/worker/processor-contract.test.ts
```

Expected: FAIL because the V3 Worker service/checkpoint does not exist.

- [ ] **Step 3: Generalize provider-discovery identity without changing V2 behavior**

Change only this field:

```ts
artifactContract: "combined_geo_report_v2" | "combined_geo_report_v3";
```

Keep all checkpoint identity keys, hashes, phases, query caps, and V2 fixtures unchanged.

- [ ] **Step 4: Implement evidence projection in the focused V3 service**

`buildAnswerFirstV3Evidence` receives the exact question set, `ProviderDiscoveryV1`, `RecommendationForensicReportV2`, and stored source records. It must produce one deduplicated `OpenGeoAnswerEvidenceV3[]` whose IDs are stable hashes of question, subject, canonical URL, and exact excerpt. No evidence may be invented from a provider name or search-result title alone.

- [ ] **Step 5: Implement checkpointed synthesis**

Use this checkpoint boundary:

```ts
export interface AnswerFirstV3Checkpoint {
  version: "answer-first-v3-checkpoint-v1";
  identityHash: string;
  questionSetIdentity: string;
  evidenceHash: string;
  engineProvenance: OpenGeoEngineProvenanceV3;
  answerCards: [OpenGeoAnswerCardV3, OpenGeoAnswerCardV3, OpenGeoAnswerCardV3];
}
```

Persist it immediately after validated synthesis. On resume, validate version, question set, locale/region, engine identity, and evidence hash before reuse.

- [ ] **Step 6: Wire only V3 jobs through the new service**

In `finalizeProviderDiscoveryCombinedJob`, retain the V2 branch unchanged and add a V3 branch after provider discovery/source evidence resolution. Save progress in `grounded_answer_synthesis`, then pass the V3 checkpoint into readiness. Do not rerun public source collection during answer correction or artifact retry.

- [ ] **Step 7: Run focused Worker tests**

Run the command from Step 2. Expected: PASS, including zero duplicate calls on resume.

- [ ] **Step 8: Commit**

```powershell
git add apps/web/src/worker/answer-first-v3.ts apps/web/src/worker/answer-first-v3.test.ts apps/web/src/worker/provider-discovery-pipeline.ts apps/web/src/worker/provider-discovery-pipeline.test.ts apps/web/src/worker/provider-discovery-production.ts apps/web/src/worker/provider-discovery-production.test.ts apps/web/src/worker/processor.ts apps/web/src/worker/processor-contract.test.ts
git commit -m "feat: synthesize three grounded GEO answers"
```

---

### Task 4: Materialize and atomically terminalize V3 artifacts

**Files:**
- Modify: `apps/web/src/report/combined-artifact-readiness.tsx`
- Modify: `apps/web/src/db/combined-correction-terminalization.ts`
- Modify: `apps/web/src/db/combined-reports.ts`
- Modify: `apps/web/src/worker/processor.ts`
- Test: `apps/web/src/db/combined-correction-terminalization.test.ts`
- Test: `apps/web/src/db/combined-correction-terminalization.postgres.test.ts`
- Test: `apps/web/src/report/combined-artifact-readiness.test.tsx` or the existing readiness test file resolved by `rg --files`

**Interfaces:**
- Produces: `buildReadyCombinedArtifactV3`, V3 parser dispatch, active V3 report loading, unchanged atomic job/credit/order/refund/email settlement.
- Consumes: V3 cards/provenance checkpoint, existing technical foundation, source forensics, provider discovery, evidence assets.

- [ ] **Step 1: Write failing readiness and terminalization tests**

The readiness fixture must require all three exact questions, every answer sentence, every exact source excerpt, every diagnosis block, the active artifact revision ID, and complete technical findings/pages in canonical HTML. Add a failure case with a missing rendered citation.

The terminalization test must prove `completed`, `completed_limited`, and `failed` map through the existing atomic commercial outcome without duplicate refund/email/credit effects.

- [ ] **Step 2: Run tests and confirm failure**

```powershell
npx vitest run apps/web/src/db/combined-correction-terminalization.test.ts apps/web/src/report/combined-artifact-readiness.test.tsx
```

If the readiness test has a different existing filename, obtain it with `rg --files apps/web/src/report | rg "readiness.*test"` and use that exact path. Expected: FAIL on absent V3 dispatch.

- [ ] **Step 3: Implement `buildReadyCombinedArtifactV3`**

Follow the V2 builder, but call `requireReadyCombinedGeoReportV3`, include `engineProvenance` and `answerCards`, run report-language validation over all generated answer/diagnosis prose, render with the V3 component, and verify visible completeness before calling the existing private PDF materializer.

- [ ] **Step 4: Extend parser/terminalization dispatches**

Use explicit three-way dispatch; never fall through V3 to V1:

```ts
if (contract === "combined_geo_report_v3") return requireReadyCombinedGeoReportV3(value);
if (contract === "combined_geo_report_v2") return requireReadyCombinedGeoReportV2(value);
return requireReadyCombinedGeoReport(value);
```

Extend `getActiveCombinedGeoReport` to query/parse V3 while preserving the V1/V2 return paths.

- [ ] **Step 5: Preserve pending-artifact recovery**

Write the complete V3 report to the existing pending artifact checkpoint before real HTML/PDF readiness. On artifact verification retry, reuse `pendingArtifactVerification`; do not call search or answer synthesis again.

- [ ] **Step 6: Run focused deterministic and PostgreSQL tests**

```powershell
npx vitest run apps/web/src/db/combined-correction-terminalization.test.ts apps/web/src/worker/processor-contract.test.ts apps/web/src/report/combined-artifact-readiness.test.tsx
npm run test:postgres:staging-security -- --run apps/web/src/db/combined-correction-terminalization.postgres.test.ts
```

Expected: deterministic tests PASS; PostgreSQL result must be recorded honestly.

- [ ] **Step 7: Commit**

```powershell
git add apps/web/src/report/combined-artifact-readiness.tsx apps/web/src/db/combined-correction-terminalization.ts apps/web/src/db/combined-reports.ts apps/web/src/worker/processor.ts apps/web/src/db/combined-correction-terminalization.test.ts apps/web/src/db/combined-correction-terminalization.postgres.test.ts apps/web/src/report
git commit -m "feat: materialize answer-first GEO artifacts"
```

---

### Task 5: Render and authorize the answer-first HTML report

**Files:**
- Create: `apps/web/src/components/combined-geo-report-v3-artifact.tsx`
- Create: `apps/web/src/components/combined-geo-report-v3-artifact.test.tsx`
- Modify: `apps/web/src/report/artifact-model.ts`
- Modify: `apps/web/src/report/artifact-model.test.ts`
- Modify: `apps/web/src/report/artifact-styles.ts`
- Modify: `apps/web/src/report/combined-artifact-readiness.tsx`
- Modify: `apps/web/src/server/report-access.ts`
- Modify: `apps/web/src/server/report-access.test.ts`
- Modify: `apps/web/src/app/reports/[id]/report.html/page.tsx`
- Modify: `apps/web/src/app/api/reports/[id]/access/route.ts`
- Modify: `apps/web/src/app/[locale]/reports/[id]/staging-access/route.ts`
- Modify: colocated route tests

**Interfaces:**
- Produces: `CombinedPrivateReportArtifactModelV3`, `CombinedGeoReportV3Artifact`, V3 scoped access cookie/token routing.
- Consumes: active V3 combined report and existing technical/evidence assets.

- [ ] **Step 1: Write failing component and access tests**

Assert the rendered HTML includes:

- `Open GEO 生成式答案` for Chinese.
- Three exact questions in order.
- Complete answer sentences with derived `[1]`, `[2]` ordinals.
- Source title, visible domain, canonical URL, exact excerpt, ownership label, observed time, and supported sentence.
- GEO diagnosis: target mention, competitors, ownership mix, missing evidence, retest question.
- Complete technical analysis after answer-first sections.
- No `SEO` customer label, external-platform attribution, `.pdf` link, print/PDF action, or customer PDF wording.

Access tests must prove V3 token/cookie success and anonymous application `404`.

- [ ] **Step 2: Run tests and confirm failure**

```powershell
npx vitest run apps/web/src/components/combined-geo-report-v3-artifact.test.tsx apps/web/src/report/artifact-model.test.ts apps/web/src/server/report-access.test.ts
```

Expected: FAIL because V3 model/component/scope routing does not exist.

- [ ] **Step 3: Implement the V3 model and renderer**

Render in this fixed order: executive summary, three answer cards, cross-question GEO summary, complete technical analysis, evidence/methodology appendix. Group ordered answer sentences into readable paragraphs and derive citation ordinals from first evidence use. Do not render an independent unverified answer string.

- [ ] **Step 4: Add responsive answer-card styles**

Use existing artifact variables. At `max-width:760px`, collapse citation metadata and diagnosis grids to one column; source URLs/excerpts must wrap without horizontal scrolling. Preserve print readiness without exposing print controls.

- [ ] **Step 5: Extend model loading and scoped access**

Add V3 as the highest-priority combined access scope, load only when active artifact contract matches, and render `CombinedGeoReportV3Artifact`. Extend email-access and protected staging-access route scope lists without changing production denial.

- [ ] **Step 6: Run component, route, and visibility tests**

```powershell
npx vitest run apps/web/src/components/combined-geo-report-v3-artifact.test.tsx apps/web/src/report/artifact-model.test.ts apps/web/src/server/report-access.test.ts
npx vitest run apps/web/src/report/visibility.test.ts
```

Expected: PASS; customer PDF searches remain empty while internal readiness references remain.

- [ ] **Step 7: Commit**

```powershell
git add apps/web/src/components/combined-geo-report-v3-artifact.tsx apps/web/src/components/combined-geo-report-v3-artifact.test.tsx apps/web/src/report/artifact-model.ts apps/web/src/report/artifact-model.test.ts apps/web/src/report/artifact-styles.ts apps/web/src/report/combined-artifact-readiness.tsx apps/web/src/server/report-access.ts apps/web/src/server/report-access.test.ts apps/web/src/app
git commit -m "feat: render answer-first GEO report HTML"
```

---

### Task 6: Run the full local acceptance gate

**Files:**
- Modify only files required by failures directly caused by Tasks 1–5.

**Interfaces:**
- Produces: locally verified schema/contracts/Worker/Web artifact with no unrelated refactor.

- [ ] **Step 1: Sync CodeGraph and inspect affected tests**

```powershell
codegraph sync
codegraph affected packages/ai-report-engine/src/open-geo-answer-v3.ts packages/ai-report-engine/src/combined-geo-report-v3.ts apps/web/src/worker/answer-first-v3.ts apps/web/src/components/combined-geo-report-v3-artifact.tsx
```

- [ ] **Step 2: Run all focused V3 tests together**

```powershell
npx vitest run packages/ai-report-engine/src/open-geo-answer-v3.test.ts packages/ai-report-engine/src/combined-geo-report-v3.test.ts apps/web/src/worker/answer-first-v3.test.ts apps/web/src/worker/provider-discovery-pipeline.test.ts apps/web/src/worker/processor-contract.test.ts apps/web/src/components/combined-geo-report-v3-artifact.test.tsx apps/web/src/report/artifact-model.test.ts apps/web/src/server/report-access.test.ts
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

Expected: all deterministic gates PASS and `db:audit` reports no terminal reserved credits. If an external database is unavailable, distinguish that blocker from deterministic failures.

- [ ] **Step 4: Re-run customer-PDF and internal-readiness searches**

```powershell
rg -n "report\.pdf|recommendation-report\.pdf|legacy-report\.pdf|Print / PDF|打印 / PDF|same-source PDF|同源 PDF" apps/web/src
rg -n "exportCanonicalArtifactHtmlPdf|pdfSha256|pdfStorageKey|pageCount" apps/web/src/report apps/web/src/worker apps/web/src/db
```

Expected: no customer PDF delivery surface; internal export/hash/storage/page-count references remain.

- [ ] **Step 5: Return any verification fix to its owning task**

If a gate fails because of Tasks 1–5, return to that task, add a focused regression test, make the smallest fix, commit only that task's files, and rerun Task 6 from Step 1. When every gate passes, this verification task leaves the worktree clean and creates no separate catch-all commit.

---

### Task 7: Deploy only protected staging and complete one real Chinese acceptance

**Files:**
- Create after real evidence exists: `docs/operations/evidence/2026-07-15-answer-first-v3-acceptance.md`
- Modify: `docs/PROTECTED-STAGING-OPERATIONS.md`

**Interfaces:**
- Produces: schema-v21-compatible staging Web/Worker, one newly admitted V3 report, browser/database/provider evidence.
- Must not touch: production deployment, production database, production aliases, production environment values, historical reports.

- [ ] **Step 1: Verify staging prerequisites and current alias**

Run read-only checks for current Vercel project, Preview variables, staging database marker, signed public-search authority, evidence storage, model readiness, Airwallex Sandbox, and redirected Resend. Do not print secrets.

- [ ] **Step 2: Deploy matching schema/Web/Worker to Preview**

Deploy Preview without `--prod`, verify the deployment is Ready, then repoint only `open-geo-console-staging-itheheda.vercel.app`. Do not restart an older-schema Worker image against the migrated staging database.

- [ ] **Step 3: Opt in V3 only in protected staging**

Set `OGC_COMBINED_REPORT_CONTRACT=combined_geo_report_v3` only for the protected Preview environment and redeploy matching Web/Worker code. Verify production retains its previous value and behavior.

- [ ] **Step 4: Generate one new Chinese paid report**

Use a new report/order; do not reuse or rewrite the historical report `6c13e91a-f836-4f04-b426-4b45807234b7`. Complete the verified Sandbox payment, drain the matching deep Worker, and run protected staging commerce through its sanctioned endpoint.

- [ ] **Step 5: Verify authoritative database state**

Record report/order/job/artifact IDs and prove: artifact contract V3; exactly three cards; exact question order; all claim evidence resolves; checkpoint and active revision agree; credit/order/refund/email states match the commercial outcome; no duplicate snapshots/evidence/artifacts; private PDF readiness fields are populated.

- [ ] **Step 6: Verify real browser output**

In authenticated protected staging, confirm desktop and mobile HTML show: all three questions, complete Chinese answers or honest insufficient state, adjacent working sources, exact excerpts, GEO diagnosis, complete technical analysis, no external-platform attribution, no SEO customer label, and no PDF customer action. Confirm anonymous access returns application `404`.

- [ ] **Step 7: Record acceptance without overstating partial evidence**

Write the dated acceptance document with commands, IDs, outcomes, screenshots, hashes, coverage, commercial result, and production-nonchange evidence. A `completed_limited` report is valid evidence for the limited/refund path but does not prove full-completion acceptance.

- [ ] **Step 8: Commit the real acceptance evidence**

```powershell
git add docs/operations/evidence/2026-07-15-answer-first-v3-acceptance.md docs/PROTECTED-STAGING-OPERATIONS.md
git commit -m "docs: record answer-first v3 staging acceptance"
```

---

### Task 8: Scoped neat-freak closeout and handoff

**Files:**
- Modify: `docs/PROJECT-STATE.md`
- Modify: `docs/TASKS.md`
- Modify: `docs/DECISIONS.md`
- Modify: `docs/AI-REPORT-ENGINE.md`
- Modify: `docs/REPORT-WORKSPACE.md`
- Modify: `docs/PROTECTED-STAGING-OPERATIONS.md`
- Modify only if operational behavior changed: `docs/COMMERCIAL-OPERATIONS.md`, `README.md`, `AGENTS.md`

**Interfaces:**
- Produces: concise current-state truth and exact continuation/acceptance commands.

- [ ] **Step 1: Run the `neat-freak` skill against the scoped diff**

Update existing entries instead of appending a chat narrative. Record the prospective V3 contract, Open GEO engine attribution boundary, answer/source/diagnosis contract, staging status, remaining production gate, and exact verification commands.

- [ ] **Step 2: Check documentation and worktree consistency**

```powershell
rg -n "combined_geo_report_v3|Open GEO 生成式答案|Open GEO generated answer" docs README.md AGENTS.md
rg -n "Doubao|豆包|ChatGPT|Kimi|Gemini" docs/PROJECT-STATE.md docs/AI-REPORT-ENGINE.md docs/REPORT-WORKSPACE.md
git diff --check
git status --short --branch
```

Expected: V3 is documented as Open GEO's own engine result; no document claims external-platform observation; worktree contains only intentional closeout docs.

- [ ] **Step 3: Commit closeout documentation**

```powershell
git add docs/PROJECT-STATE.md docs/TASKS.md docs/DECISIONS.md docs/AI-REPORT-ENGINE.md docs/REPORT-WORKSPACE.md docs/PROTECTED-STAGING-OPERATIONS.md
git commit -m "docs: close out answer-first GEO report v3"
```

- [ ] **Step 4: Final handoff**

Report: local test/build results, staging deployment URL and alias, new report/order/job/artifact IDs, browser evidence, commercial outcome, commits, clean/dirty status, remaining blockers, and an explicit statement that production and historical reports were not changed.
