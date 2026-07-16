# Source Selection Diagnosis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the low-value V3 cross-question counters with a traceable source-centric diagnosis that explains source contribution, observable selection factors, target gaps, and prioritized GEO actions without claiming hidden provider causality.

**Architecture:** Add a deterministic, provider-neutral diagnosis contract in `ai-report-engine`, map existing same-operation sources and audit-sidecar records into that contract in a focused Worker module, checkpoint the result beside the answer cards, and persist it in prospective V3 artifacts. Render it through a new focused React section component while preserving the legacy cross-question summary for historical V3 payloads that do not contain the diagnosis.

**Tech Stack:** TypeScript, npm workspaces, Vitest, Next.js 16 App Router, React server rendering, existing V3 JSON artifact/checkpoint persistence, existing public-source retrieval sidecar, Chromium private readiness.

## Global Constraints

- Read `AGENTS.md`, `docs/PROJECT-STATE.md`, `docs/superpowers/specs/2026-07-16-source-selection-diagnosis-design.md`, and this plan before editing.
- Use npm workspaces. Add no dependency and do not switch package managers.
- Start each implementation wave with `git status --short --branch` and `codegraph status`; sync CodeGraph after source edits before later impact analysis.
- Preserve `combined_geo_report_v3`, `recommendation_forensics_v1`, and `public_search_source_forensics_v1` identities.
- Preserve normalized generative answer/source objects and their hashes. Diagnosis is a separate `source_selection_diagnosis_v1` object.
- Historical V1/V2/V3 payloads remain readable and unchanged. A V3 payload without diagnosis renders the historical summary.
- Same-operation source presence, independent verification, and analyst inference remain distinguishable.
- Do not invent sentence-level citations or claim provider ranking causality, weights, scores, probabilities, or guaranteed lift.
- Diagnosis failure cannot suppress answers/sources or change payment, credit, refund, email, access, or commercial terminalization authority.
- Customer delivery remains authorized HTML only; private PDF readiness remains required.
- Do not modify, stage, or commit the two local HeyGen document changes or `docs/superpowers/plans/2026-07-15-v3-paid-acceptance-remediation.md`.
- Execute inline in the current session. Do not dispatch subagents.

## File Structure

- Create `packages/ai-report-engine/src/source-selection-diagnosis-v1.ts`: contract types, parser, deterministic builder, ordering, prohibited-claim validation.
- Create `packages/ai-report-engine/src/source-selection-diagnosis-v1.test.ts`: contract and builder fixtures.
- Modify `packages/ai-report-engine/src/index.ts`: public exports.
- Modify `packages/ai-report-engine/src/combined-geo-report-v3.ts`: optional historical-compatible diagnosis parsing.
- Modify `packages/ai-report-engine/src/combined-geo-report-v3.test.ts`: historical and prospective report parsing.
- Create `apps/web/src/worker/source-selection-diagnosis.ts`: map cards, stored audit sources, and target-page signals into the engine input.
- Create `apps/web/src/worker/source-selection-diagnosis.test.ts`: Worker mapping and hash identity.
- Modify `apps/web/src/worker/answer-first-v3.ts`: checkpoint stage/field and exact resume behavior.
- Modify `apps/web/src/worker/answer-first-v3.test.ts`: diagnosis-ready, partial, unavailable, and resume tests.
- Modify `apps/web/src/worker/processor.ts`: pass target pages and diagnosis into artifact building.
- Modify `apps/web/src/report/combined-artifact-readiness.tsx`: require diagnosis for newly built V3 artifacts and validate rendered ancestry.
- Modify `apps/web/src/report/combined-artifact-readiness.test.tsx`: readiness tests.
- Create `apps/web/src/components/source-selection-diagnosis-section.tsx`: source-centric Section 03 rendering.
- Create `apps/web/src/components/source-selection-diagnosis-section.test.tsx`: complete/partial/unavailable rendering.
- Modify `apps/web/src/components/combined-geo-report-v3-artifact.tsx`: dispatch new diagnosis or historical fallback.
- Modify `apps/web/src/components/combined-geo-report-v3-artifact.test.tsx`: ordering and removal of duplicate metrics.
- Modify `apps/web/src/components/combined-artifact-fixtures.ts`: prospective diagnosis fixture.
- Modify `apps/web/src/report/artifact-styles.ts`: polished responsive source-profile styles.
- Modify `docs/PROJECT-STATE.md`, `docs/TASKS.md`, and `docs/DECISIONS.md` only where stable implementation facts, remaining work, or a new decision must be recorded.

---

### Task 1: Add the provider-neutral diagnosis contract and deterministic builder

**Files:**
- Create: `packages/ai-report-engine/src/source-selection-diagnosis-v1.ts`
- Create: `packages/ai-report-engine/src/source-selection-diagnosis-v1.test.ts`
- Modify: `packages/ai-report-engine/src/index.ts`

**Interfaces:**
- Produces: `SourceSelectionDiagnosisV1`, `SourceSelectionDiagnosisBuildInputV1`, `parseSourceSelectionDiagnosisV1`, `buildSourceSelectionDiagnosisV1`, and `SOURCE_SELECTION_DIAGNOSIS_VERSION`.
- Consumes: normalized question/source inputs supplied by the Worker; it performs no network access.

- [ ] **Step 1: Write failing contract tests**

Create tests covering a repeated domain, traceable contributions, categorical factors, stable actions, and invalid ancestry:

```ts
import { describe, expect, it } from "vitest";
import {
  buildSourceSelectionDiagnosisV1,
  parseSourceSelectionDiagnosisV1
} from "./source-selection-diagnosis-v1";

const input = {
  locale: "zh" as const,
  answerHash: "a".repeat(64),
  sourceHash: "b".repeat(64),
  targetFoundationHash: "c".repeat(64),
  targetDomain: "target.example",
  targetPages: [{ id: "target-home", url: "https://target.example/", title: "Target", metaDescription: null, h1: ["Target"], readableTextLength: 120, hasJsonLd: false }],
  questions: [
    { questionId: "q1", answerText: "服务商甲提供跨境海运。", sources: [{ questionId: "q1", sourceId: "s1", title: "采购指南", canonicalUrl: "https://guide.example/a", registrableDomain: "guide.example", citedText: "跨境海运服务商", auditExcerpt: "服务商甲提供跨境海运。", retrievalStatus: "verified_body" as const, ownershipCategory: "third_party_editorial" as const, providerResultOrder: 0 }] },
    { questionId: "q2", answerText: "该服务覆盖欧洲。", sources: [{ questionId: "q2", sourceId: "s2", title: "采购指南", canonicalUrl: "https://guide.example/b", registrableDomain: "guide.example", citedText: "欧洲线路", auditExcerpt: "覆盖欧洲主要港口。", retrievalStatus: "verified_body" as const, ownershipCategory: "third_party_editorial" as const, providerResultOrder: 1 }] },
    { questionId: "q3", answerText: "交付前需确认舱位。", sources: [] }
  ]
};

describe("source selection diagnosis v1", () => {
  it("groups repeated domains and emits traceable actions", () => {
    const result = buildSourceSelectionDiagnosisV1(input);
    expect(result.sourceProfiles).toHaveLength(1);
    expect(result.sourceProfiles[0]!.coveredQuestionIds).toEqual(["q1", "q2"]);
    expect(result.sourceProfiles[0]!.contributions.every((item) => item.sourceId)).toBe(true);
    expect(result.sharedPatterns[0]!.supportingQuestionIds).toEqual(["q1", "q2"]);
    expect(result.targetActions[0]!.actionFamily).toBe("first_party_fact_page");
  });

  it("rejects source ancestry outside the persisted source set", () => {
    const result = buildSourceSelectionDiagnosisV1(input);
    result.sourceProfiles[0]!.sourceRefs[0]!.sourceId = "unknown";
    expect(() => parseSourceSelectionDiagnosisV1(result, { questions: input.questions })).toThrow(/unknown source/i);
  });

  it("rejects causal weights and guarantees", () => {
    const result = buildSourceSelectionDiagnosisV1(input);
    result.sharedPatterns[0]!.summary = "该因素保证模型选择此来源。";
    expect(() => parseSourceSelectionDiagnosisV1(result, { questions: input.questions })).toThrow(/causal|guarantee/i);
  });
});
```

- [ ] **Step 2: Run the new test and confirm red state**

Run:

```powershell
npm exec vitest run -- packages/ai-report-engine/src/source-selection-diagnosis-v1.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement exact public types**

Define these exported unions and interfaces in `source-selection-diagnosis-v1.ts`:

```ts
export const SOURCE_SELECTION_DIAGNOSIS_VERSION = "source_selection_diagnosis_v1" as const;
export type SourceSelectionBasisV1 = "provider_returned" | "independently_verified" | "analyst_inference" | "unavailable";
export type SourceSelectionConfidenceV1 = "confirmed" | "supported" | "inferred" | "unavailable";
export type SourceContributionRoleV1 = "candidate_discovery" | "definition_or_framework" | "first_party_capability" | "constraint_or_risk" | "comparison" | "third_party_validation" | "other";
export type ObservableSelectionFactorKindV1 = "problem_match" | "factual_specificity" | "entity_clarity" | "source_authority" | "accessibility" | "freshness";

export interface SourceSelectionDiagnosisV1 {
  version: typeof SOURCE_SELECTION_DIAGNOSIS_VERSION;
  status: "complete" | "partial" | "unavailable";
  inputIdentity: {
    answerHash: string;
    sourceHash: string;
    targetFoundationHash: string;
    locale: "zh" | "en";
    contributionAnalyzerVersion: "deterministic-contribution-v1";
    factorAnalyzerVersion: "observable-factor-v1";
    targetComparatorVersion: "target-page-signal-v1";
  };
  sourceProfiles: SourceSelectionProfileV1[];
  sharedPatterns: SourceSelectionPatternV1[];
  targetActions: SourceSelectionActionV1[];
  limitations: SourceSelectionLimitationV1[];
}

export interface SourceSelectionSourceInputV1 {
  questionId: string;
  sourceId: string;
  title: string;
  canonicalUrl: string;
  registrableDomain: string;
  citedText: string | null;
  auditExcerpt: string | null;
  retrievalStatus: "verified_body" | "search_source_only" | "inaccessible";
  ownershipCategory: "target_owned" | "competitor_owned" | "third_party_editorial" | "directory" | "government" | "other" | "institution" | "community" | "social" | "unknown";
  providerResultOrder: number;
}

export interface SourceSelectionDiagnosisBuildInputV1 {
  locale: "zh" | "en";
  answerHash: string;
  sourceHash: string;
  targetFoundationHash: string;
  targetDomain: string;
  targetPages: SourceSelectionTargetPageInputV1[];
  questions: Array<{ questionId: string; answerText: string; sources: SourceSelectionSourceInputV1[] }>;
}

export interface SourceSelectionTargetPageInputV1 {
  id: string;
  url: string;
  title: string | null;
  metaDescription: string | null;
  h1: string[];
  readableTextLength: number;
  hasJsonLd: boolean;
}

export interface SourceSelectionProfileV1 {
  profileId: string;
  registrableDomain: string;
  sourceRefs: Array<{ questionId: string; sourceId: string }>;
  coveredQuestionIds: string[];
  contributions: SourceContributionV1[];
  observableFactors: ObservableSelectionFactorV1[];
  targetGaps: TargetSourceGapV1[];
  auditStatus: "verified" | "partial" | "unavailable";
}

export interface SourceContributionV1 {
  questionId: string;
  sourceId: string;
  role: SourceContributionRoleV1;
  summary: string;
  answerExcerpt: string | null;
  sourceExcerpt: string | null;
  basis: SourceSelectionBasisV1;
  confidence: SourceSelectionConfidenceV1;
}

export interface ObservableSelectionFactorV1 {
  factor: ObservableSelectionFactorKindV1;
  observation: string;
  evidenceUrl: string | null;
  evidenceExcerpt: string | null;
  basis: SourceSelectionBasisV1;
  confidence: SourceSelectionConfidenceV1;
}

export interface TargetSourceGapV1 {
  factor: ObservableSelectionFactorKindV1;
  targetState: "present" | "weak" | "missing" | "unavailable";
  comparison: string;
  sourceEvidenceRefs: Array<{ questionId: string; sourceId: string; factor: ObservableSelectionFactorKindV1 }>;
  targetEvidenceRefs: Array<{ kind: "target_page" | "technical_finding"; id: string }>;
}

export interface SourceSelectionPatternV1 {
  patternId: string;
  summary: string;
  supportingProfileIds: string[];
  supportingQuestionIds: string[];
  factorKinds: ObservableSelectionFactorKindV1[];
}

export interface SourceSelectionActionV1 {
  actionId: string;
  priority: "high" | "medium" | "low";
  actionFamily: "first_party_fact_page" | "entity_relationship" | "accessible_structure" | "freshness" | "third_party_validation";
  title: string;
  rationale: string;
  relatedProfileIds: string[];
  relatedGapFactors: ObservableSelectionFactorKindV1[];
}

export interface SourceSelectionLimitationV1 {
  code: "contribution_unconfirmed" | "source_inaccessible" | "target_comparison_unavailable" | "no_cross_question_pattern" | "analysis_unavailable";
  scope: "diagnosis" | "profile" | "contribution" | "target_gap";
  relatedIds: string[];
  message: string;
}
```

Keep every displayed string bounded to 500 characters and every exact excerpt bounded to 2,000 characters.

- [ ] **Step 4: Implement parser validation**

`parseSourceSelectionDiagnosisV1(value, context)` must:

- require exact version and 64-character lower-case SHA-256 identities;
- require all `sourceRefs` and contributions to resolve to the supplied question/source set;
- require `answerExcerpt` to be an exact persisted-answer substring;
- require `sourceExcerpt` to equal the persisted cited text or audit excerpt;
- enforce allowed basis/confidence combinations;
- reject numbers on factors and any score, weight, probability, guarantee, hidden-ranking, or causal-selection customer language;
- require shared patterns to cite at least two profiles or two question IDs;
- require every action to resolve to existing profiles and gap factors;
- accept explicit `partial` and `unavailable` states without empty placeholder cards.

- [ ] **Step 5: Implement deterministic diagnosis building**

`buildSourceSelectionDiagnosisV1(input)` must:

- group source records by normalized registrable domain;
- sort profiles by distinct question count descending, earliest provider order, then domain;
- derive contribution roles from locked question order and source ownership without claiming sentence-level attribution;
- prefer independently verified audit excerpts, then provider cited text, otherwise emit `contribution_unconfirmed`;
- emit only traceable categorical factors;
- use `verified_body` for confirmed accessibility, `search_source_only` for provider-returned availability, and `inaccessible` for unavailable audit state;
- emit a shared pattern only when supported by at least two records/questions;
- emit `no_cross_question_pattern` otherwise;
- emit a high-priority `first_party_fact_page` action when the target domain is not a returned source;
- emit `entity_relationship` and `third_party_validation` only when corresponding accepted factors support them;
- use localized deterministic copy for Chinese and English;
- return the result through `parseSourceSelectionDiagnosisV1` before exposing it.

- [ ] **Step 6: Export and run package tests**

Add:

```ts
export * from "./source-selection-diagnosis-v1";
```

to `packages/ai-report-engine/src/index.ts`.

Run:

```powershell
npm exec vitest run -- packages/ai-report-engine/src/source-selection-diagnosis-v1.test.ts packages/ai-report-engine/src/open-geo-answer-v3.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

```powershell
git add packages/ai-report-engine/src/source-selection-diagnosis-v1.ts packages/ai-report-engine/src/source-selection-diagnosis-v1.test.ts packages/ai-report-engine/src/index.ts
git commit -m "feat: add source selection diagnosis contract"
```

---

### Task 2: Map V3 answer and audit data into the diagnosis

**Files:**
- Create: `apps/web/src/worker/source-selection-diagnosis.ts`
- Create: `apps/web/src/worker/source-selection-diagnosis.test.ts`

**Interfaces:**
- Consumes: three `GenerativeSearchAnswerCardV3` cards, `AnswerFirstV3StoredSource[]`, target URL, target technical pages, locale, answer hash, and source hash.
- Produces: `buildSourceSelectionDiagnosisForGenerativeV3(input): SourceSelectionDiagnosisV1` and `sourceSelectionTargetFoundationHash(pages): string`.

- [ ] **Step 1: Write failing Worker mapping tests**

Create fixtures with two URLs on one domain, one verified audit excerpt, one inaccessible source, and a target page. Assert:

```ts
const diagnosis = buildSourceSelectionDiagnosisForGenerativeV3(input);
expect(diagnosis.inputIdentity.answerHash).toBe(input.answerHash);
expect(diagnosis.sourceProfiles[0]!.sourceRefs).toEqual([
  { questionId: "q1", sourceId: "s1" },
  { questionId: "q2", sourceId: "s2" }
]);
expect(diagnosis.sourceProfiles[0]!.contributions[0]!.basis).toBe("independently_verified");
expect(diagnosis.limitations.some(({ code }) => code === "source_inaccessible")).toBe(true);
```

- [ ] **Step 2: Run red test**

```powershell
npm exec vitest run -- apps/web/src/worker/source-selection-diagnosis.test.ts
```

Expected: FAIL because the Worker mapper does not exist.

- [ ] **Step 3: Implement the focused mapper**

Implement:

```ts
export interface SourceSelectionDiagnosisForGenerativeV3Input {
  answerCards: [GenerativeSearchAnswerCardV3, GenerativeSearchAnswerCardV3, GenerativeSearchAnswerCardV3];
  auditSources: readonly AnswerFirstV3StoredSource[];
  targetUrl: string;
  targetPages: readonly GeoAuditReport["pages"][number][];
  locale: string;
  answerHash: string;
  sourceHash: string;
}
```

Map audit rows by canonical URL. Pass the matched `exactExcerpt`, retrieval status, ownership, and every immutable card/source identity to `buildSourceSelectionDiagnosisV1`. Hash only the bounded target-page signals `{url,title,metaDescription,h1,readableTextLength,hasJsonLd,status}` with stable key order. Do not include raw page bodies, secrets, or provider payloads.

- [ ] **Step 4: Run mapping tests**

```powershell
npm exec vitest run -- apps/web/src/worker/source-selection-diagnosis.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```powershell
git add apps/web/src/worker/source-selection-diagnosis.ts apps/web/src/worker/source-selection-diagnosis.test.ts
git commit -m "feat: derive V3 source selection diagnosis"
```

---

### Task 3: Checkpoint diagnosis with exact resume identity

**Files:**
- Modify: `apps/web/src/worker/answer-first-v3.ts`
- Modify: `apps/web/src/worker/answer-first-v3.test.ts`

**Interfaces:**
- Consumes: Task 2 mapper, `targetPages` on `ResolveGenerativeAnswerFirstV3Input`.
- Produces: `AnswerFirstV3CheckpointV2.stage` including `diagnosis_ready`, optional persisted `sourceSelectionDiagnosis`, and a required diagnosis in production calls that supply audit sources and target pages.

- [ ] **Step 1: Add failing checkpoint tests**

Add tests that assert:

- a call with `auditSources` and `targetPages` saves `answers_collected`, then `diagnosis_ready`;
- the final checkpoint contains `sourceSelectionDiagnosis.version === "source_selection_diagnosis_v1"`;
- exact resumed diagnosis makes no provider call and no diagnosis rewrite;
- changed target pages produce a new diagnosis identity but preserve answer/source hashes;
- an inaccessible audit row produces `partial`, not a failed answer;
- no audit input retains the existing `answers_collected` compatibility behavior.

- [ ] **Step 2: Run red tests**

```powershell
npm exec vitest run -- apps/web/src/worker/answer-first-v3.test.ts
```

Expected: FAIL on missing `targetPages`, `diagnosis_ready`, and diagnosis field.

- [ ] **Step 3: Extend input and checkpoint types**

Apply these compatible additions:

```ts
export interface AnswerFirstV3CheckpointV2 {
  stage: "answers_collected" | "cards_ready" | "diagnosis_ready";
  // existing fields unchanged
  sourceSelectionDiagnosis?: SourceSelectionDiagnosisV1;
}

export interface ResolveGenerativeAnswerFirstV3Input {
  // existing fields unchanged
  targetPages?: readonly GeoAuditReport["pages"][number][];
}
```

- [ ] **Step 4: Build and save diagnosis after cards**

After `buildGenerativeCards`:

```ts
if (input.auditSources === undefined || input.targetPages === undefined || !input.targetUrl) {
  return { checkpoint: collected, answerCards, reused: !providerCalls };
}
const sourceSelectionDiagnosis = buildSourceSelectionDiagnosisForGenerativeV3({
  answerCards,
  auditSources: input.auditSources,
  targetUrl: input.targetUrl,
  targetPages: input.targetPages,
  locale: input.locale,
  answerHash,
  sourceHash
});
const ready: AnswerFirstV3CheckpointV2 = {
  ...collected,
  stage: "diagnosis_ready",
  answerCards,
  sourceSelectionDiagnosis
};
```

Save only when the exact final checkpoint differs. On resume, re-parse the stored diagnosis against the exact cards; if only target foundation identity differs, rebuild the diagnosis without re-calling the answer provider.

- [ ] **Step 5: Run focused Worker tests**

```powershell
npm exec vitest run -- apps/web/src/worker/source-selection-diagnosis.test.ts apps/web/src/worker/answer-first-v3.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```powershell
git add apps/web/src/worker/answer-first-v3.ts apps/web/src/worker/answer-first-v3.test.ts
git commit -m "feat: checkpoint source selection diagnosis"
```

---

### Task 4: Persist diagnosis in prospective V3 artifacts

**Files:**
- Modify: `packages/ai-report-engine/src/combined-geo-report-v3.ts`
- Modify: `packages/ai-report-engine/src/combined-geo-report-v3.test.ts`
- Modify: `apps/web/src/worker/processor.ts`
- Modify: `apps/web/src/report/combined-artifact-readiness.tsx`
- Modify: `apps/web/src/report/combined-artifact-readiness.test.tsx`

**Interfaces:**
- Consumes: Task 3 checkpoint diagnosis.
- Produces: optional `CombinedGeoReportV3.sourceSelectionDiagnosis` for historical parsing, required `sourceSelectionDiagnosis` input for new `buildReadyCombinedArtifactV3` calls.

- [ ] **Step 1: Write failing report-parser tests**

Add one historical fixture without diagnosis and one prospective fixture with diagnosis. Assert the historical fixture parses with `sourceSelectionDiagnosis === undefined`; the prospective fixture parses exact ancestry; corrupt hashes and unknown source IDs fail.

- [ ] **Step 2: Write failing readiness tests**

Assert a new V3 build input without diagnosis is a type/test failure, a valid diagnosis reaches the prepared report, and completeness requires rendered profile/action ancestry when diagnosis is present.

- [ ] **Step 3: Run red tests**

```powershell
npm exec vitest run -- packages/ai-report-engine/src/combined-geo-report-v3.test.ts apps/web/src/report/combined-artifact-readiness.test.tsx
```

Expected: FAIL because the report and builder do not accept diagnosis.

- [ ] **Step 4: Add historical-compatible parsing**

Extend `CombinedGeoReportV3`:

```ts
sourceSelectionDiagnosis?: SourceSelectionDiagnosisV1;
```

In `parseCombinedGeoReportV3`, parse the field only when present, with context built from the parsed generative cards. Leave historical payloads untouched.

- [ ] **Step 5: Require diagnosis for newly built artifacts**

Add `sourceSelectionDiagnosis: SourceSelectionDiagnosisV1` to `buildReadyCombinedArtifactV3` input, include it in the report passed to `requireReadyCombinedGeoReportV3`, and pass `answerResult.checkpoint.sourceSelectionDiagnosis!` from `processor.ts` after an explicit typed guard:

```ts
if (!answerResult.checkpoint.sourceSelectionDiagnosis) {
  throw new Error("Prospective V3 artifact requires source selection diagnosis.");
}
```

Pass `input.technicalReport.pages` into `resolveGenerativeAnswerFirstV3` as `targetPages`.

- [ ] **Step 6: Extend readiness ancestry checks**

When diagnosis exists, require every profile domain, contribution summary, non-null exact excerpt, factor observation, shared-pattern summary, action title/rationale, and limitation message in canonical HTML. Validate stored input hashes through the report parser, but do not render internal hashes visibly.

- [ ] **Step 7: Run report and readiness tests**

```powershell
npm exec vitest run -- packages/ai-report-engine/src/combined-geo-report-v3.test.ts apps/web/src/report/combined-artifact-readiness.test.tsx apps/web/src/worker/processor-contract.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

```powershell
git add packages/ai-report-engine/src/combined-geo-report-v3.ts packages/ai-report-engine/src/combined-geo-report-v3.test.ts apps/web/src/worker/processor.ts apps/web/src/report/combined-artifact-readiness.tsx apps/web/src/report/combined-artifact-readiness.test.tsx
git commit -m "feat: persist V3 source diagnosis"
```

---

### Task 5: Render the polished source-centric Section 03

**Files:**
- Create: `apps/web/src/components/source-selection-diagnosis-section.tsx`
- Create: `apps/web/src/components/source-selection-diagnosis-section.test.tsx`
- Modify: `apps/web/src/components/combined-geo-report-v3-artifact.tsx`
- Modify: `apps/web/src/components/combined-geo-report-v3-artifact.test.tsx`
- Modify: `apps/web/src/components/combined-artifact-fixtures.ts`
- Modify: `apps/web/src/report/artifact-styles.ts`

**Interfaces:**
- Consumes: `SourceSelectionDiagnosisV1`, locale, target URL.
- Produces: `SourceSelectionDiagnosisSection` with insight strip, source profiles, shared pattern, target path, and trust boundary.

- [ ] **Step 1: Add a complete diagnosis fixture**

Extend `combinedV3ArtifactFixture` with two profiles, one repeated domain, independently verified and provider-returned factors, one high-priority action, and Chinese/English-safe deterministic strings.

- [ ] **Step 2: Write failing component tests**

Assert:

- title is `来源选择诊断` / `Source selection diagnosis`;
- duplicate `完整答案/有限答案/目标品牌出现` counters are absent from Section 03;
- repeated domain, covered questions, contribution, factor, target gap, action, and trust boundary render;
- `partial` renders exact limitations without blank panels;
- `unavailable` renders only the bounded unavailable state and trust boundary;
- no output contains `score`, `%`, `weight`, `guarantee`, `排名权重`, or `保证引用`;
- legacy reports without diagnosis retain the existing historical summary.

- [ ] **Step 3: Run red component tests**

```powershell
npm exec vitest run -- apps/web/src/components/source-selection-diagnosis-section.test.tsx apps/web/src/components/combined-geo-report-v3-artifact.test.tsx
```

Expected: FAIL because the section component does not exist.

- [ ] **Step 4: Implement the focused section component**

Create `SourceSelectionDiagnosisSection({ diagnosis, locale, targetUrl })`. Render in this exact order:

1. section index and title/purpose;
2. three prose insight cards: dominant pattern, target position, priority breakthrough;
3. source profiles ordered as persisted;
4. shared-pattern panel or explicit no-pattern limitation;
5. ordered target actions;
6. can-confirm/cannot-assert trust boundary.

Use semantic `article`, `dl`, `ul`, and links. Display basis/confidence as localized text, not scores. Never render an empty `ul` or an empty card.

- [ ] **Step 5: Dispatch from the V3 artifact**

Replace the current Section 03 block with:

```tsx
{report.sourceSelectionDiagnosis
  ? <SourceSelectionDiagnosisSection diagnosis={report.sourceSelectionDiagnosis} locale={model.locale} targetUrl={report.targetUrl}/>
  : <LegacyCrossQuestionDiagnosis report={report} locale={model.locale}/>
}
```

Move the historical block into a small local fallback component. Do not change Sections 01, 02, 04, or 05.

- [ ] **Step 6: Add polished responsive styles**

Add scoped classes matching the approved cream/forest editorial style:

- `.source-selection-diagnosis`;
- `.source-diagnosis-insights` and `.source-diagnosis-insight`;
- `.source-profile-list`, `.source-profile`, `.source-profile-identity`, `.source-profile-contribution`, `.source-profile-factors`;
- `.source-factor-chip`;
- `.source-diagnosis-bottom`, `.source-pattern-panel`, `.target-action-path`, `.target-action-step`;
- `.source-diagnosis-trust`.

Desktop source profiles use three columns `210px minmax(0,1.35fr) minmax(240px,1fr)`. At `max-width: 760px`, all diagnosis grids become one column, links wrap anywhere, and action steps remain readable. Preserve print break-inside behavior for each profile.

- [ ] **Step 7: Run component and readiness tests**

```powershell
npm exec vitest run -- apps/web/src/components/source-selection-diagnosis-section.test.tsx apps/web/src/components/combined-geo-report-v3-artifact.test.tsx apps/web/src/report/combined-artifact-readiness.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit Task 5**

```powershell
git add apps/web/src/components/source-selection-diagnosis-section.tsx apps/web/src/components/source-selection-diagnosis-section.test.tsx apps/web/src/components/combined-geo-report-v3-artifact.tsx apps/web/src/components/combined-geo-report-v3-artifact.test.tsx apps/web/src/components/combined-artifact-fixtures.ts apps/web/src/report/artifact-styles.ts
git commit -m "feat: render source selection diagnosis"
```

---

### Task 6: Run integrated validation and scoped documentation sync

**Files:**
- Modify: `docs/PROJECT-STATE.md`
- Modify: `docs/TASKS.md`
- Modify: `docs/DECISIONS.md`

**Interfaces:**
- Consumes: Tasks 1-5.
- Produces: verified local implementation and restartable project state.

- [ ] **Step 1: Sync CodeGraph and inspect affected tests**

```powershell
codegraph sync
codegraph status
codegraph affected packages/ai-report-engine/src/source-selection-diagnosis-v1.ts apps/web/src/worker/source-selection-diagnosis.ts apps/web/src/components/source-selection-diagnosis-section.tsx
```

Expected: index up to date and an affected-test list consistent with the focused suite.

- [ ] **Step 2: Run the full focused suite**

```powershell
npm exec vitest run -- packages/ai-report-engine/src/source-selection-diagnosis-v1.test.ts packages/ai-report-engine/src/combined-geo-report-v3.test.ts packages/ai-report-engine/src/open-geo-answer-v3.test.ts apps/web/src/worker/source-selection-diagnosis.test.ts apps/web/src/worker/answer-first-v3.test.ts apps/web/src/components/source-selection-diagnosis-section.test.tsx apps/web/src/components/combined-geo-report-v3-artifact.test.tsx apps/web/src/report/combined-artifact-readiness.test.tsx apps/web/src/worker/processor-contract.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run repository acceptance commands**

```powershell
npm test
npm run lint
npm run build
git diff --check
```

Expected: all commands exit 0. If a pre-existing failure is unrelated, preserve the exact command/error and prove the focused suite remains green before reporting a blocker.

- [ ] **Step 4: Perform scoped neat sync**

Update existing project-state/task/decision entries rather than appending a chat log. Record:

- prospective V3 source diagnosis is implemented;
- raw answer/source authority remains unchanged;
- diagnosis is non-blocking and historical-compatible;
- exact focused and repository acceptance commands;
- protected-staging real-report acceptance remains pending if not executed.

- [ ] **Step 5: Review the complete diff**

```powershell
git status --short --branch
git diff --stat HEAD~5..HEAD
git diff --check
```

Confirm the two HeyGen files remain locally ignored and the untracked remediation plan remains untouched.

- [ ] **Step 6: Commit documentation only if changed**

```powershell
git add docs/PROJECT-STATE.md docs/TASKS.md docs/DECISIONS.md
git commit -m "docs: record source diagnosis implementation"
```

Skip this commit when scoped neat sync finds no durable documentation change.

- [ ] **Step 7: Report the protected-staging boundary**

Do not create a paid order or mutate staging unless separately authorized. Handoff the exact acceptance requirement: one new protected-staging V3 report with three sourced answers, at least one independently verified factor, traceable actions, secure HTML visual inspection, and same-component private PDF readiness.
