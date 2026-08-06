# Reader-first GEO Article Deliverable Implementation Plan

> **For agentic workers:** Execute this plan task-by-task inline. The current
> authority forbids subagent dispatch, Git commits, external calls and release
> actions, so each task ends with focused tests and a diff review instead.

**Goal:** Deliver a readable, single-intent buyer article when the one model
call succeeds, or an honestly labelled evidence-based outline when it does
not, followed by a separate GEO explanation.

**Architecture:** Add a V2 discriminated deliverable beside the readable V1
contract, make the existing one-call worker return either `article` or
`outline`, and teach readiness/rendering to handle both versions. Keep facts
bound to existing question/source/finding authority and normalize legacy V1
fallbacks as outlines without rewriting stored reports.

**Tech Stack:** TypeScript, React server rendering, Vitest, npm workspaces,
existing disposable PostgreSQL harness.

## Global constraints

- Work only in `E:\project\open-geo-console` on the current `main` checkout.
- Touch only files listed in `docs/ACTIVE-CHANGE-SCOPE.md`.
- Preserve the uncommitted Preview metadata receipt in scope history.
- Use one existing bounded model call; no retry or second critique call.
- Use Q1 as the sole primary article intent.
- No real model, search, crawl, report, database write, payment, email,
  deployment, Preview, Staging, Production or Git state-changing action.
- New article prose must precede its separate explanation; fallback is always
  an outline and never a publish-ready article claim.

---

### Task 1: Versioned deliverable contract and legacy read compatibility

**Files:**

- Modify: `packages/ai-report-engine/src/combined-geo-report-v3.ts`
- Test: `packages/ai-report-engine/src/combined-geo-report-v3.test.ts`

**Interfaces:**

- Produces `GEO_ARTICLE_DELIVERABLE_VERSION = "geo_article_deliverable_v2"`.
- Produces `GeoArticleDeliverableV2`, `GeoArticleDeliverable`,
  `GeoArticleExplanationV2`, and `parseGeoArticleDeliverable(...)`.
- `CombinedGeoReportV3.geoArticleExample` becomes `GeoArticleDeliverable` so
  existing call sites keep their field name while accepting V1 or V2.

- [ ] Write failing parser tests for a valid article branch, valid outline
  branch, mutual exclusion, Q1-only identity, unknown evidence, section/FAQ
  bounds, provider ordinals, duplicate prose, and legacy V1 acceptance.

- [ ] Run the focused contract test and verify the V2 imports fail:

  ```powershell
  npx vitest run packages/ai-report-engine/src/combined-geo-report-v3.test.ts
  ```

  Expected: FAIL because the V2 exports do not exist.

- [ ] Add the exact contract shape:

  ```ts
  export const GEO_ARTICLE_DELIVERABLE_VERSION = "geo_article_deliverable_v2" as const;
  export type GeoArticleFallbackReason =
    | "provider_error" | "timeout" | "invalid_output"
    | "contract_rejected" | "quality_rejected";
  export interface GeoArticleEvidenceTextV2 {
    readonly text: string;
    readonly evidenceRefs: readonly string[];
  }
  export interface GeoArticleExplanationV2 {
    readonly elementId: string;
    readonly heading: string;
    readonly reason: string;
    readonly geoFunction: string;
    readonly evidenceRefs: readonly string[];
  }
  export type GeoArticleDeliverableV2 =
    | { readonly version: typeof GEO_ARTICLE_DELIVERABLE_VERSION;
        readonly kind: "article"; readonly primaryQuestionId: string;
        readonly article: { readonly title: string;
          readonly introduction: GeoArticleEvidenceTextV2;
          readonly sections: readonly { readonly id: string; readonly heading: string;
            readonly paragraphs: readonly GeoArticleEvidenceTextV2[] }[];
          readonly faq: readonly { readonly question: string;
            readonly answer: GeoArticleEvidenceTextV2 }[] };
        readonly explanation: readonly GeoArticleExplanationV2[] }
    | { readonly version: typeof GEO_ARTICLE_DELIVERABLE_VERSION;
        readonly kind: "outline"; readonly primaryQuestionId: string;
        readonly outline: { readonly workingTitle: string;
          readonly readerQuestion: string; readonly directAnswer: string;
          readonly plannedSections: readonly { readonly id: string;
            readonly heading: string; readonly purpose: string;
            readonly evidenceRefs: readonly string[] }[];
          readonly evidenceToAdd: readonly string[];
          readonly faqAngles: readonly string[] };
        readonly explanation: readonly GeoArticleExplanationV2[];
        readonly fallbackReason: GeoArticleFallbackReason };
  export type GeoArticleDeliverable = GeoArticleExampleV1 | GeoArticleDeliverableV2;
  ```

- [ ] Implement `parseGeoArticleDeliverable` by dispatching on `version`.
  Reuse `articleText` and evidence-authority validation. Enforce V2 article
  bounds of 3–5 sections and 2–3 FAQ items, exact Q1 identity
  (`authority.questionIds[0]`), mutually exclusive branches, no
  `/来源\s*\d+/u`, no normalized duplicate paragraphs/FAQ answers, and an
  explanation entry for `title`, `introduction`, every `section:<id>`, and
  `faq`.

- [ ] Change `parseCombinedGeoReportV3` to call the version-dispatch parser,
  preserving the existing V1 authority and receipt/hash behavior.

- [ ] Re-run the focused contract test. Expected: PASS.

- [ ] Review `git diff -- packages/ai-report-engine/src/combined-geo-report-v3.ts packages/ai-report-engine/src/combined-geo-report-v3.test.ts`
  for only contract/parser changes and no unrelated report semantics.

### Task 2: One-call article generation and deterministic outline

**Files:**

- Modify: `apps/web/src/worker/geo-article-example.ts`
- Test: `apps/web/src/worker/geo-article-example.test.ts`

**Interfaces:**

- `generateGeoArticleExample(input)` returns `Promise<GeoArticleDeliverableV2>`.
- `buildGeoArticleFallback(input, reason)` returns the V2 outline branch.
- The input interface and single `JsonCompletionClient.completeJson` call stay
  unchanged.

- [ ] Replace existing model fixtures with a V2 article containing Q1 only,
  3 sections, 2 FAQ entries, structured evidence refs, and complete
  explanation coverage. Add failing tests for forbidden `来源0`, generic
  domain guide title, exact buyer-answer reuse, article/FAQ duplication,
  provider error, timeout, invalid output and unknown evidence.

- [ ] Run:

  ```powershell
  npx vitest run apps/web/src/worker/geo-article-example.test.ts
  ```

  Expected: FAIL against the V1 generator.

- [ ] Change the model payload to request this exact top-level shape:

  ```ts
  {
    primaryQuestionId: questions[0].id,
    article: {
      title: "reader problem or decision scenario",
      introduction: { text: "direct answer", evidenceRefs: ["known ref"] },
      sections: [{ id: "stable-id", heading: "reader heading",
        paragraphs: [{ text: "substantive prose", evidenceRefs: ["known ref"] }] }],
      faq: [{ question: "adjacent intent",
        answer: { text: "non-duplicative answer", evidenceRefs: ["known ref"] } }]
    },
    explanation: [{ elementId: "title|introduction|section:<id>|faq",
      heading: "structure label", reason: "business reason",
      geoFunction: "understanding/extraction role", evidenceRefs: ["known ref"] }]
  }
  ```

- [ ] Rewrite the system prompt so the article directly solves Q1 for a buyer,
  forbids catalogue/search/report/process voice, requires 3–5 progressive
  sections and 2–3 distinct FAQ items, and keeps evidence refs structured.

- [ ] Add a deterministic pre-parser quality guard for target/domain plus
  generic guide titles and exact reuse of any complete `answerText(card, "")`.
  Let the engine parser handle structural, evidence, language, provider-token
  and duplicate checks.

- [ ] Classify failures without storing exception text:

  ```ts
  function fallbackReason(error: unknown, timedOut: boolean): GeoArticleFallbackReason {
    if (timedOut) return "timeout";
    if (error instanceof SyntaxError) return "invalid_output";
    if (error instanceof TypeError) return "contract_rejected";
    return "provider_error";
  }
  ```

  Use `quality_rejected` only for the explicit reader-quality guard. Do not
  retry. Preserve the existing timeout and outer Paid-report completion.

- [ ] Build the deterministic outline from Q1, website facts and known refs.
  It must contain a working buyer-problem title, direct answer, 3–5 planned
  sections, explicit evidence gaps, 2–3 FAQ angles, separate explanation, and
  a safe fallback reason. Do not reuse the full Q1 answer as a planned section.

- [ ] Re-run the focused generator tests. Expected: PASS and every test asserts
  `completeJson` was called at most once.

- [ ] Review the scoped diff for one-call preservation and no provider/client
  configuration change.

### Task 3: Readiness and semantic completeness

**Files:**

- Modify: `apps/web/src/report/combined-artifact-readiness.tsx`
- Test: `apps/web/src/report/combined-artifact-readiness.test.tsx`

**Interfaces:**

- `PrepareCombinedGeoReportV3Input.geoArticleExample` accepts
  `GeoArticleDeliverable`.
- Add one local projection helper that returns every customer-visible string
  for V1, V2 article and V2 outline.

- [ ] Add failing readiness tests that retain a V2 article, retain a V2
  outline, and fail completeness when any visible article, outline or
  explanation string is absent from rendered HTML.

- [ ] Run:

  ```powershell
  npx vitest run apps/web/src/report/combined-artifact-readiness.test.tsx
  ```

  Expected: FAIL because readiness only reads V1 flat fields.

- [ ] Change the input type import to `GeoArticleDeliverable` and replace the
  direct V1 field flattening with an exhaustive `geoArticleVisibleText(value)`
  helper. Do not change unrelated report-language, evidence or readiness gates.

- [ ] Re-run the focused readiness test. Expected: PASS.

- [ ] Review the scoped diff to confirm no persistence, checkpoint or artifact
  terminalization behavior changed.

### Task 4: Article/outline rendering, citations and explanation hierarchy

**Files:**

- Modify: `apps/web/src/components/combined-geo-report-v3-artifact.tsx`
- Modify: `apps/web/src/report/artifact-styles.ts`
- Modify: `apps/web/src/components/combined-artifact-fixtures.ts`
- Test: `apps/web/src/components/combined-geo-report-v3-artifact.test.tsx`

**Interfaces:**

- `GeoArticleSection` receives the deliverable plus report answer cards so it
  can map structured refs to customer-visible source ordinals and links.
- V2 article label: `可发布文章示例`; V2/legacy fallback label:
  `GEO 内容提纲`; explanation label: `这份内容为什么这样组织`.

- [ ] Add V2 article and outline fixtures. Add failing static-render tests for
  mode labels, article/outline-before-explanation order, citation links,
  absence of `来源0` and internal handles, legacy fallback-as-outline, and
  unchanged methodology placement.

- [ ] Run:

  ```powershell
  npx vitest run apps/web/src/components/combined-geo-report-v3-artifact.test.tsx
  ```

  Expected: FAIL because the component assumes V1 fields.

- [ ] Add exhaustive V1/V2 rendering. For structured V2 refs, resolve
  `source:<id>` against generative `sources` or legacy `sourceEvidence`, assign
  stable `[1]`, `[2]` ordinals, and render the known title/link. Do not render
  raw refs. For legacy text, reuse provider-reference normalization so
  `来源0` cannot leak.

- [ ] Render article text uninterrupted, then one explanation block, then the
  existing methodology section. Render outline fields as a plan/checklist with
  the qualification notice above them.

- [ ] Add only scoped styles for the outline notice, plan list, structured
  citations and explanation cards. Preserve the report-wide visual system and
  390px behavior.

- [ ] Re-run the component test. Expected: PASS.

- [ ] Review the renderer/style diff for no report-wide redesign and no hidden
  or dropped evidence.

### Task 5: Paid-flow regression and full local verification

**Files:**

- Test: `apps/web/src/worker/paid-v3-direct-linear-flow.postgres.test.ts`
- Verification-only adjustments, if compilation requires them, are limited to
  the other allowlisted test files.

**Interfaces:** No new production interface; this task proves the integrated
V2 deliverable remains inside the existing Paid Direct terminalization path.

- [ ] Update the disposable-flow fixture expectation from V1 fallback to V2
  outline and assert the rendered artifact says `GEO 内容提纲`, contains no
  `来源0`, and still reaches the existing ready/terminal result.

- [ ] Run all focused unit/component tests together:

  ```powershell
  npx vitest run packages/ai-report-engine/src/combined-geo-report-v3.test.ts apps/web/src/worker/geo-article-example.test.ts apps/web/src/report/combined-artifact-readiness.test.tsx apps/web/src/components/combined-geo-report-v3-artifact.test.tsx
  ```

  Expected: PASS with zero skips.

- [ ] Run the canonical selected disposable PostgreSQL test through the repo
  harness using its supported test-selection argument. Expected: the Paid V3
  direct linear-flow test passes with zero selected-test skips and the harness
  persists its normal receipt before cleanup.

- [ ] Run scoped lint:

  ```powershell
  npx eslint packages/ai-report-engine/src/combined-geo-report-v3.ts packages/ai-report-engine/src/combined-geo-report-v3.test.ts apps/web/src/worker/geo-article-example.ts apps/web/src/worker/geo-article-example.test.ts apps/web/src/report/combined-artifact-readiness.tsx apps/web/src/report/combined-artifact-readiness.test.tsx apps/web/src/components/combined-geo-report-v3-artifact.tsx apps/web/src/components/combined-geo-report-v3-artifact.test.tsx apps/web/src/components/combined-artifact-fixtures.ts apps/web/src/report/artifact-styles.ts
  ```

  Expected: zero errors; record any pre-existing warnings separately.

- [ ] Run `npm run build`. Expected: every workspace build succeeds.

- [ ] Run `git diff --check`, measure production/test/doc diffs against the
  approved budgets, and confirm `git status --short` contains only allowlisted
  paths plus the preserved Preview metadata receipt.

- [ ] Render zero-external-call V2 article and outline fixtures and inspect at
  desktop and 390px mobile width. Confirm readable hierarchy, working local
  citation anchors/links and no horizontal overflow. Do not submit forms or
  open external links.

- [ ] Record exact local evidence in `docs/ACTIVE-CHANGE-SCOPE.md`, move the
  terminal scope record to history, and return the active scope to `NONE`.
  Do not commit or push; report local implementation/verification separately
  from any unperformed real-model or deployment acceptance.
