# Source Selection Diagnosis Design

**Date:** 2026-07-16  
**Status:** Approved design; not yet implemented  
**Scope:** Prospective `combined_geo_report_v3` reports using `answerMode: "generative_search_v1"`

## 1. Objective

Replace the current low-value cross-question summary with a customer-facing source selection diagnosis that answers three practical questions:

1. What did each returned source contribute to the generated answers?
2. Which observable characteristics made that source useful to the answer?
3. What does the target website lack, and what should it change to become a more usable source in a future answer?

The section must turn source attribution into concrete GEO action without claiming access to a provider's hidden ranking weights or causal selection algorithm.

## 2. Current Problem

The current section repeats three counts already visible elsewhere:

- complete answers;
- limited answers;
- target-brand appearances.

It then shows competitor IDs and missing-evidence strings. This does not explain why the answer operation returned its sources, what those sources contributed, or how the target can compete with them. Empty competitor and missing-evidence blocks make the section especially weak.

The generative V3 source contract currently persists the source title, canonical URL, registrable domain, cited text when available, provider result order, retrieval status, and ownership category. It does not persist an explicit source contribution, an observable selection-factor analysis, or a target comparison. A renderer-only change therefore cannot satisfy the approved product goal.

## 3. Product Boundary

The product must keep two questions separate:

- **Source contribution:** what answer content a returned source appears to support.
- **Observable selection factors:** page characteristics that can be verified after the answer, such as topic match, factual specificity, entity clarity, source role, accessibility, and freshness.

The diagnosis may say that a page directly answers the buyer question, contains specific first-party facts, or provides independent validation. It must not say that the provider selected or ranked the page *because* of an inferred factor unless the provider exposes that exact reason as authenticated structured output.

This is a non-blocking audit and optimization sidecar. It may enrich or qualify an answer, but it cannot suppress an already generated answer, remove a same-operation source, or decide the commercial outcome.

## 4. Non-Goals

- Reverse-engineer model or search-provider ranking weights.
- Invent sentence-level citations when the provider did not return them.
- Convert observations into numeric GEO scores or causal probabilities.
- Re-run or rewrite historical reports.
- Change the three locked buyer questions.
- Replace per-question answers or their adjacent same-operation source lists.
- Make independent page retrieval a permission gate for answer generation.

## 5. Customer Experience

Section 03 is renamed from `跨问题 GEO 总结` to `来源选择诊断` (`Source selection diagnosis`). Its purpose statement is:

> 解释这些答案为什么采用当前来源、来源分别贡献了什么，以及目标网站要补齐哪些条件，才更可能进入下一次生成式答案。

The section uses a source-centric layout because Section 02 already uses a question-centric layout.

### 5.1 Insight strip

Remove the duplicate complete/limited/mentioned counters. Show three concise derived insights instead:

- **Dominant source pattern:** for example, third-party buyer guide plus first-party service fact page.
- **Target position:** whether and how the target was used as a source across the three questions.
- **Priority breakthrough:** the highest-priority target action supported by the comparison.

These are bounded prose insights, not scores.

### 5.2 Source profiles

Group source records by registrable domain while retaining every underlying question/source reference. Repeated domains appear first. Stable ordering is:

1. number of distinct covered questions, descending;
2. earliest provider result order;
3. registrable domain, ascending.

Each source profile shows:

- domain and source identity;
- covered questions;
- contribution role and bounded contribution summary;
- an exact answer excerpt when alignment is valid;
- a provider-returned cited excerpt when available;
- observable selection factors with evidence basis;
- retrieval/audit state;
- the corresponding target gap when one can be supported.

Allowed contribution roles are deliberately small and stable:

- `candidate_discovery`;
- `definition_or_framework`;
- `first_party_capability`;
- `constraint_or_risk`;
- `comparison`;
- `third_party_validation`;
- `other`.

### 5.3 Cross-source pattern

After the profiles, summarize only patterns supported by at least two source records or two questions. Examples include:

- third-party sources establish the candidate set while first-party pages verify capabilities;
- pages with explicit entity-service-scenario relationships are repeatedly usable;
- generic brand pages are absent while specific service or constraint pages are used.

If there is no recurring domain or supported shared pattern, state that directly. Do not manufacture a pattern to fill the space.

### 5.4 Target entry path

End with ordered, bounded actions linked to specific gaps. Typical action families are:

- publish a first-party fact page;
- clarify entity, brand, service, location, or scenario relationships;
- expose stable, accessible, structured content;
- add dates and maintain freshness;
- earn independent directory, association, customer-case, or editorial validation.

Every action links back to one or more observed source factors and one target gap. Generic SEO advice is not allowed.

### 5.5 Trust boundary

The section ends with two explicit statements:

- **Can confirm:** the source was returned by the same answer operation, and shown excerpts or page characteristics are traceable.
- **Cannot assert:** an observed factor is a hidden provider ranking weight or guarantees future citation.

## 6. Contract Design

The normalized generative answer and source records remain immutable. Do not add inferred fields to `GenerativeSearchAnswerSourceV3` or change the meaning of its source hash.

Add a separate, versioned diagnosis object to the prospective V3 artifact:

```ts
type SourceSelectionDiagnosisV1 = {
  version: "source_selection_diagnosis_v1";
  status: "complete" | "partial" | "unavailable";
  inputIdentity: {
    answerHash: string;
    sourceHash: string;
    targetFoundationHash: string;
    locale: "zh" | "en";
    contributionAnalyzerVersion: string;
    factorAnalyzerVersion: string;
    targetComparatorVersion: string;
  };
  sourceProfiles: SourceSelectionProfileV1[];
  sharedPatterns: SourceSelectionPatternV1[];
  targetActions: SourceSelectionActionV1[];
  limitations: SourceSelectionLimitationV1[];
};
```

The exact existing target-foundation hash should be reused if the artifact already exposes one. Otherwise, derive one from the immutable technical foundation inputs used by the comparator. Do not introduce a second definition for the same foundation identity.

### 6.1 Source profile

```ts
type SourceSelectionProfileV1 = {
  profileId: string;
  registrableDomain: string;
  sourceRefs: Array<{ questionId: string; sourceId: string }>;
  coveredQuestionIds: string[];
  contributions: SourceContributionV1[];
  observableFactors: ObservableSelectionFactorV1[];
  targetGaps: TargetSourceGapV1[];
  auditStatus: "verified" | "partial" | "unavailable";
};
```

Each `sourceId` must resolve to a source in the exact source hash bound by `inputIdentity`. A profile cannot introduce a URL, source ID, question ID, or domain not present in the normalized answer cards.

### 6.2 Contribution

```ts
type SourceContributionV1 = {
  questionId: string;
  sourceId: string;
  role: SourceContributionRoleV1;
  summary: string;
  answerExcerpt: string | null;
  sourceExcerpt: string | null;
  basis:
    | "provider_returned"
    | "independently_verified"
    | "analyst_inference"
    | "unavailable";
  confidence: "confirmed" | "supported" | "inferred" | "unavailable";
};
```

An `answerExcerpt` must be an exact substring of the persisted answer. A `sourceExcerpt` must be either the persisted provider-returned cited text or an exact bounded excerpt from the independently retrieved page. Model-generated paraphrases cannot occupy either field.

`provider_returned` confirms that the source and any provider citation text came from the same answer operation. It does not by itself prove which sentence used that source. When contribution alignment is not supportable, use `unavailable` rather than creating an attribution.

### 6.3 Observable factor

```ts
type ObservableSelectionFactorV1 = {
  factor:
    | "problem_match"
    | "factual_specificity"
    | "entity_clarity"
    | "source_authority"
    | "accessibility"
    | "freshness";
  observation: string;
  evidenceUrl: string | null;
  evidenceExcerpt: string | null;
  basis:
    | "provider_returned"
    | "independently_verified"
    | "analyst_inference"
    | "unavailable";
  confidence: "confirmed" | "supported" | "inferred" | "unavailable";
};
```

Factors are categorical observations. There are no weights, scores, percentages, or claims of causal lift.

### 6.4 Target gap and action

```ts
type TargetSourceGapV1 = {
  factor: ObservableSelectionFactorV1["factor"];
  targetState: "present" | "weak" | "missing" | "unavailable";
  comparison: string;
  sourceEvidenceRefs: Array<{
    questionId: string;
    sourceId: string;
    factor: ObservableSelectionFactorV1["factor"];
  }>;
  targetEvidenceRefs: Array<{
    kind: "target_page" | "technical_finding";
    id: string;
  }>;
};

type SourceSelectionActionV1 = {
  actionId: string;
  priority: "high" | "medium" | "low";
  actionFamily:
    | "first_party_fact_page"
    | "entity_relationship"
    | "accessible_structure"
    | "freshness"
    | "third_party_validation";
  title: string;
  rationale: string;
  relatedProfileIds: string[];
  relatedGapFactors: ObservableSelectionFactorV1["factor"][];
};

type SourceSelectionPatternV1 = {
  patternId: string;
  summary: string;
  supportingProfileIds: string[];
  supportingQuestionIds: string[];
  factorKinds: ObservableSelectionFactorV1["factor"][];
};

type SourceSelectionLimitationV1 = {
  code:
    | "contribution_unconfirmed"
    | "source_inaccessible"
    | "target_comparison_unavailable"
    | "no_cross_question_pattern"
    | "analysis_unavailable";
  scope: "diagnosis" | "profile" | "contribution" | "target_gap";
  relatedIds: string[];
  message: string;
};
```

A target gap requires evidence on both sides or an explicit `unavailable` target state. Absence from the current target crawl may support “not observed in the audited pages”; it must not be rewritten as “the target does not have this information anywhere.”

Basis and confidence combinations are constrained:

- `provider_returned` confirms only source presence and provider-returned citation text; it cannot independently confirm answer-to-source attribution.
- `independently_verified` may be `confirmed` for an exact page fact or `supported` for a validated answer relationship.
- `analyst_inference` must use `inferred`.
- `unavailable` must use `unavailable`.

## 7. Analysis Pipeline

### 7.1 Freeze inputs

Start only after all three prospective generative answer cards and the technical target foundation are immutable. Bind the analysis to exact answer, source, target-foundation, locale, and analyzer identities.

### 7.2 Build contribution candidates

For each question/source pair:

1. preserve provider-returned cited text and source order;
2. find candidate answer excerpts using bounded model-assisted alignment;
3. require the selected answer excerpt to be an exact persisted substring;
4. require the source excerpt to be persisted provider text or exact retrieved text;
5. validate the contribution role and basis deterministically;
6. emit `unavailable` when the relationship cannot be supported.

The model proposes candidates; deterministic validation owns IDs, exact excerpt identity, enums, bounds, and final acceptance.

### 7.3 Derive observable factors

Reuse the existing independent retrieval sidecar and technical evidence where identities match. Do not refetch a page solely to fill presentation prose when an exact completed retrieval result already exists.

Derive factors from bounded, traceable facts:

- question/page topic alignment;
- presence of specific entities, capabilities, locations, conditions, dates, or constraints;
- first-party, third-party, institutional, directory, community, or other source role;
- safe retrieval and readable body state;
- dated or otherwise observable freshness indicators.

A bounded model classifier may propose factor candidates from retrieved text. Deterministic code validates evidence identity, exact excerpts, enums, and confidence. The analyzer must never output a provider ranking explanation.

### 7.4 Compare the target

Compare accepted source factors with the exact target pages and technical foundation already bound to the report. Record `present`, `weak`, `missing`, or `unavailable` for the corresponding target condition. Preserve the difference between “not observed in audited pages” and global absence.

### 7.5 Aggregate across questions

Aggregate by registrable domain while preserving source-level ancestry. A shared pattern requires support from at least two source records or two questions. Rank actions deterministically from:

1. number of supported questions affected;
2. whether the gap blocks a first-party factual contribution;
3. evidence confidence;
4. stable action-family ordering.

The model may phrase bounded localized summaries after the underlying profiles, patterns, gaps, and priorities are fixed. Language validation applies to generated summaries and actions; source-original titles and excerpts remain existing source exceptions.

### 7.6 Persist and resume

Persist an immutable `source_selection_diagnosis_v1` checkpoint before artifact rendering. Resume may reuse it only when every `inputIdentity` field matches. A mismatch creates a new diagnosis; it never silently rewrites the source or answer checkpoint.

## 8. Failure and Degradation

The diagnosis is non-blocking relative to the answer and commercial outcome, but the artifact must always render one explicit diagnosis state.

- If one page is inaccessible, keep the source profile and state that the source was returned but its page factors could not be independently verified.
- If contribution alignment fails, show `贡献关系未确认`; do not create sentence-level citations.
- If no domain repeats, show `本次三个问题未形成重复来源模式` and retain individual profiles.
- If a question has no safe same-operation source, do not create a source profile for that question.
- If target comparison is impossible, mark the target state `unavailable` and omit derived actions that depend on it.
- If the entire analyzer fails, persist `status: "unavailable"` with bounded typed limitations and render `来源选择分析暂不可用`.
- Partial analysis persists `status: "partial"` and identifies exactly which profiles or comparisons are unavailable.

The renderer must not show empty cards, empty lists, or placeholder counters.

## 9. Prohibited Claims

Validation rejects or deterministically replaces customer prose that claims:

- the model selected a source because of an inferred factor;
- an inferred factor is a provider ranking weight;
- changing a factor guarantees citation, recommendation, or ranking;
- the analysis reproduces the behavior of Doubao, ChatGPT, Kimi, Gemini, or another external consumer answer product;
- absence from the audited target pages proves global absence;
- an independently inferred source relationship was returned directly by the provider.

Approved framing is `可观察入选因素`, `该来源为答案提供`, `在已审计页面中未观察到`, and `更可能成为可用来源`, with the trust boundary visible in the artifact.

## 10. Historical and Version Boundaries

- Historical V1, V2, and V3 artifacts remain byte-for-byte unchanged.
- Historical `generative_search_v1` artifacts without this diagnosis continue to render through their existing path.
- Only newly admitted prospective V3 work after activation requires the versioned diagnosis state.
- The original answer/source checkpoint and hashes remain authoritative for same-operation source claims.
- The diagnosis version is explicit; a future analyzer revision creates a new diagnosis version or checkpoint identity rather than reinterpreting stored output.

## 11. Verification

### 11.1 Contract tests

Test parser and validator behavior for:

- valid complete, partial, and unavailable states;
- unknown source/question/domain references;
- answer excerpts that are not exact answer substrings;
- source excerpts that are not bound provider or retrieved text;
- input hash or analyzer-version mismatch;
- invalid factor, contribution-role, confidence, and target-state values;
- unsupported causal or guarantee language;
- numeric weights or source-selection scores.

### 11.2 Analyzer tests

Use deterministic fixtures for:

- one domain repeated across two questions;
- different URLs under the same registrable domain;
- no recurring source domain;
- provider cited text with valid answer alignment;
- a returned source with no confirmable contribution;
- safely retrieved, inaccessible, and search-source-only states;
- first-party facts, third-party validation, generic brand prose, and directory entries;
- target factor present, weak, missing, and unavailable;
- action priority derived from multiple supported gaps;
- Chinese and English localized summaries.

### 11.3 Worker and resume tests

Prove that:

- the diagnosis runs only after exact answers, sources, and target foundation are frozen;
- exact matching checkpoints resume without a new analysis call;
- changed answer/source/target identity refuses reuse;
- analyzer failure cannot remove answers, sources, activate a different artifact, consume another credit, or change the commercial result;
- no raw provider payload or secret enters the diagnosis or telemetry.

### 11.4 Renderer and readiness tests

Assert the fixed customer order:

1. insight strip;
2. source profiles;
3. shared source pattern;
4. target entry path;
5. trust boundary.

Verify no duplicate answer metrics, empty competitor/missing-evidence boxes, blank profiles, or fabricated citations. Readiness validation must check the exact persisted diagnosis version and input identity before rendering. The canonical HTML and private PDF must contain the diagnosis state, rendered source ancestry, action ancestry, and truthful degradation copy, but need not expose internal hashes to the customer.

### 11.5 Protected-staging acceptance

After deterministic tests pass, create one new protected-staging V3 report. Acceptance requires:

- three complete ordinary answers with same-operation sources;
- at least one independently verified source factor;
- every displayed contribution/factor/gap traceable to stored ancestry;
- truthful handling of any inaccessible source;
- useful target actions tied to exact gaps;
- Chinese-only customer prose apart from approved source-original exceptions;
- visual inspection of secure canonical HTML at desktop and narrow widths;
- private PDF readiness from the same component;
- no change to payment, credit, refund, email, access-token, or commercial terminalization authority.

## 12. Implementation Scope

One implementation plan may cover:

1. versioned engine contracts and validation;
2. immutable persistence/checkpoint identity;
3. contribution, factor, target comparison, and aggregation analyzers;
4. Worker orchestration and truthful degradation;
5. source-centric Section 03 renderer and styling;
6. language/readiness integration;
7. deterministic tests and one protected-staging acceptance run.

Unrelated report sections, historical artifact migration, search-adapter replacement, commerce changes, and external answer-platform observation remain out of scope.
