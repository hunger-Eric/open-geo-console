# Generative Search Answer Mainline Design

**Date:** 2026-07-16
**Status:** Approved design
**Scope:** Prospective `combined_geo_report_v3` reports only

## 1. Decision

Open GEO Console will generate each customer answer through a web-search-enabled model and persist the sources returned by that same answer operation. Public-page retrieval, passage selection, entity resolution, evidence graphs, and cross-domain verification remain useful audit enrichments, but none of them may decide whether an ordinary question receives an answer.

The customer contract is intentionally simple:

1. Ask exactly three persisted customer questions.
2. Generate one complete answer for each question with a web-search-enabled model.
3. Persist and render the sources returned by the same model operation.
4. Compute GEO visibility from the persisted final answer and its returned sources.
5. Render retrieval and verification state as secondary confidence information.

This design replaces the prospective answer-generation boundary in the approved 2026-07-14 Answer-First V3 design. Historical V1, V2, and V3 artifacts remain immutable and readable under their original contracts.

## 2. Problem Being Corrected

The current V3 pipeline treats independently retrieved, eligible, direct evidence as permission to answer. A search may return useful results, but the answer becomes `unresolved` when page retrieval, passage selection, subject resolution, or evidence projection produces an empty permitted map. The model is explicitly instructed not to answer without that permitted evidence.

That architecture confuses two different questions:

- **Answer generation:** What answer does the configured web-search-enabled model produce?
- **Evidence audit:** How much of that answer can Open GEO independently retrieve and verify?

The first is the product result. The second is an enrichment and limitation signal. Evidence-audit failure must not erase an otherwise ordinary model answer.

## 3. Goals

- Produce a nonblank, useful answer for every ordinary customer question.
- Persist the answer and source list from the same generative-search operation.
- Keep sources immediately below their answer card.
- Preserve the configured model, search mode, locale, region, timestamps, prompt version, and response hashes.
- Compute target mention, mention order and role, competitor mentions, and cited domains from the final answer.
- Keep existing retrieval and evidence machinery as a non-blocking audit sidecar.
- Preserve historical artifacts, PostgreSQL authority, HTML-only customer delivery, private PDF readiness, atomic commerce, and protected-staging boundaries.
- Avoid a new paid SKU, a new artifact contract name, and an unnecessary schema migration.

## 4. Non-Goals

- Do not imitate or claim to reproduce ChatGPT, Doubao, Kimi, Gemini, or another consumer product's live answer.
- Do not use independently crawled evidence as a prerequisite for answer generation.
- Do not require sentence-level independent verification before rendering an answer.
- Do not infer that a source was used when the provider did not return it with the answer.
- Do not rewrite or backfill historical report payloads.
- Do not remove the technical website analysis, safe-fetch rules, private readiness, access control, or commercial invariants.
- Do not change production admission or deploy production as part of implementation or acceptance.

## 5. Selected Architecture

### 5.1 Mainline

For each persisted question, the Worker calls an answer-capable provider through a provider-independent interface:

```ts
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

export interface GenerativeSearchAnswerResult {
  questionId: string;
  answerText: string;
  sources: GenerativeSearchSource[];
  refusal: GenerativeSearchRefusal | null;
  searchedAt: string;
  completedAt: string;
  providerResponseId: string | null;
}

export interface GenerativeSearchSource {
  sourceId: string;
  title: string;
  canonicalUrl: string;
  registrableDomain: string;
  citedText: string | null;
  providerResultOrder: number;
}

export interface GenerativeSearchRefusal {
  code: "safety_refusal" | "policy_refusal" | "high_risk_refusal";
  reason: string;
}
```

The first adapter uses the currently configured MiMo web-search capability, but neither the report contract nor Worker orchestration may contain MiMo-specific response fields.

The provider operation must generate the answer and return its source list in one logical operation. A search-results-only response is not a successful generative answer.

### 5.2 Audit sidecar

Existing query fanout, normalized observations, page retrieval, passage selection, evidence classification, and cross-domain verification continue after or alongside the answer operation. They may enrich each returned source with:

- `retrievalStatus`: `verified_body`, `search_source_only`, or `inaccessible`;
- independently retrieved title and excerpt;
- source ownership classification;
- cross-domain support and evidence-family metadata.

Sidecar failures are persisted as bounded audit states. They do not change `answerText`, remove returned sources, or convert an ordinary answer into `unresolved`.

## 6. Compatibility Strategy

The artifact contract remains `combined_geo_report_v3`. V3 answer cards become a discriminated union:

```ts
export type OpenGeoAnswerCardV3 =
  | LegacyEvidenceBoundAnswerCardV3
  | GenerativeSearchAnswerCardV3;

export interface GenerativeSearchAnswerCardV3 {
  answerMode: "generative_search_v1";
  questionId: string;
  exactQuestion: string;
  status: "answered" | "source_limited" | "refused";
  answerText: string;
  sources: GenerativeSearchAnswerSourceV3[];
  provenance: GenerativeSearchAnswerProvenanceV3;
  geoDiagnosis: OpenGeoAnswerDiagnosisV3;
  audit: GenerativeSearchAnswerAuditV3;
}
```

Historical V3 cards without `answerMode` parse as `legacy_evidence_bound_v1`. New V3 reports must persist `answerMode: "generative_search_v1"`. Parser and renderer dispatch is explicit; historical payloads are not reinterpreted under the new rules.

The new mode is stored inside the existing JSON artifact/checkpoint boundary. A database migration is unnecessary unless implementation discovers a concrete relational constraint that cannot represent the discriminated payload; that discovery must stop implementation and return to design review rather than adding an opportunistic migration.

## 7. Answer and Source Rules

### 7.1 Ordinary answers

An ordinary question is successful only when `answerText.trim()` is nonempty and the provider did not return a refusal. The prompt requires a direct, complete answer rather than a description of search activity.

The initial Chinese acceptance questions must produce these semantic outcomes:

- Question 1 names actual service providers or service approaches and explains what they provide; a market-size statistic alone is not responsive.
- Question 2 explains suitable service options, cargo types, timing, and delivery conditions.
- Question 3 provides a practical procurement verification checklist covering scope, delivery conditions, limitations, and risk.

### 7.2 Sources

Sources are exactly the public HTTP(S) sources returned with the answer. The application canonicalizes URLs, rejects unsafe schemes and private-network destinations, deduplicates canonical URLs, and preserves provider order. It does not invent a source by searching for a statement after generation.

`citedText` is optional because some providers return a source URL without an exact quotation. Missing cited text affects audit labeling, not answer availability.

### 7.3 Source-limited answers

If a provider returns a complete answer but no safe source survives normalization, the Worker performs one bounded corrective answer call requesting the same answer with public sources. If the second answer remains nonblank without a usable source, the card is delivered as `source_limited` with explicit deterministic copy. It is not replaced by an empty or unresolved answer.

Protected-staging product acceptance still requires at least one safe source per ordinary question. A `source_limited` fixture proves truthful degradation but does not prove full product acceptance.

### 7.4 Refusals

`refused` is legal only when the provider returns a typed safety, policy, or high-risk refusal. Page retrieval failure, robots denial, unsupported content type, passage-selection failure, missing entity resolution, one-domain evidence, or an empty evidence graph can never create a refusal.

Provider authentication, timeout, network, malformed response, and answer-contract errors are Worker failures with existing bounded retry/repair semantics. They must not be rendered as customer refusals or evidence limitations.

## 8. GEO Diagnosis

GEO diagnosis is deterministic over the persisted final answer and its returned sources:

- match normalized target aliases in `answerText`;
- record first mention sentence/order and semantic role;
- match resolved competitor aliases in `answerText`;
- list cited registrable domains in provider order;
- identify target-owned, competitor-owned, editorial, directory, institutional, community, social, or unknown ownership where available;
- distinguish provider-returned citation from independently verified page text;
- preserve the exact question for retesting.

The audit sidecar may strengthen source classifications and verification labels, but it cannot add a brand mention that is absent from the persisted answer or delete one that is present.

## 9. Worker Flow and Checkpoints

The prospective V3 Worker flow becomes:

1. Load the immutable three-question set and persisted locale/region.
2. Resolve the configured `GenerativeSearchAnswerProvider`.
3. Generate three answers with bounded concurrency and persist raw normalized answer checkpoints immediately.
4. Validate exact question IDs, nonblank ordinary answers, typed refusals, safe source URLs, locale, size limits, and stable hashes.
5. Run at most one source-correction call for a nonblank answer with no safe source.
6. Compute deterministic GEO diagnosis from the persisted answers and returned sources.
7. Run or resume the public-source audit sidecar without mutating answer text.
8. Compose the existing technical foundation and the three generative-search answer cards.
9. Persist the complete pending artifact before HTML/private-PDF readiness.
10. Resume readiness and terminalization without repeating successful answer calls.

The checkpoint identity includes question-set hash, locale, region, provider ID, model, search mode, prompt version, normalized answer hash, and normalized source hash. A matching checkpoint makes zero new provider calls. A changed identity fails closed rather than reusing stale answers.

## 10. Commercial Outcome

Commercial usefulness is based on answer delivery, not independent page-retrieval coverage:

- Three `answered` cards plus normal artifact readiness produces `completed`.
- One or more `source_limited` or `refused` cards produces `completed_limited` when all three cards contain either a nonblank answer or a genuine typed refusal.
- Missing answer output caused by exhausted provider/contract failure produces `failed` or the existing repairable state according to the typed error.
- Audit-sidecar shortfalls alone do not cause a refund when three complete sourced answers were delivered.

Existing atomic credit, order, refund, email, job, artifact, and access-token boundaries remain unchanged.

## 11. Customer Presentation

Each new answer card renders in this order:

1. Exact question.
2. Complete generated answer.
3. Source list returned by the model.
4. Per-source audit label: body independently verified, search source only, or inaccessible.
5. GEO diagnosis.
6. Compact search/model provenance and limitations.

Internal query counts, retrieval attempts, evidence IDs, graph details, and long excerpts remain in the audit appendix. They cannot precede or replace the customer answer.

The full report continues to render executive summary, three answer cards, cross-question GEO summary, complete technical analysis, and methodology appendix. Customer delivery remains authorized HTML only; private Chromium PDF readiness remains internal.

## 12. Code Ownership

- `packages/ai-report-engine/src/generative-search-answer.ts` owns provider-independent answer/source/refusal contracts, parsing, normalization, and hashes.
- `packages/ai-report-engine/src/open-geo-answer-v3.ts` owns the backward-compatible V3 answer-card union and deterministic GEO diagnosis dispatch.
- `apps/web/src/public-search-adapters/` owns the answer-capable MiMo adapter and runtime registration.
- `apps/web/src/worker/answer-first-v3.ts` owns generative-answer orchestration, correction, checkpoint identity, and sidecar projection.
- `apps/web/src/worker/processor.ts` owns phase ordering, resume, pending artifact, readiness, and terminalization.
- `apps/web/src/components/combined-geo-report-v3-artifact.tsx` owns answer-first rendering for both legacy and generative modes.

Implementation must not fold provider transport, answer validation, audit retrieval, and rendering into one file.

## 13. Retired Prospective Logic

For `generative_search_v1` cards:

- `eligibleDirectEvidence` is not an answer-availability gate.
- `retrievalReady` is not an answer-availability gate.
- `questionRelevantExcerpt()` is not used to choose answer content.
- two independent domains are not required to answer;
- `deterministicUnresolvedNote()` is not triggered by audit failure;
- the prompt must not say `Do not write an answer when no direct evidence supports it`;
- returned search titles and snippets may be displayed as provider-returned source metadata but may not be relabeled as independently verified body text.

The untracked `docs/superpowers/plans/2026-07-15-v3-paid-acceptance-remediation.md` reflects the superseded evidence-first direction and must not be executed as the implementation plan for this design. It remains untouched until the user approves the implementation plan and an explicit documentation cleanup task owns its disposition.

## 14. Deterministic Verification

Tests must prove:

1. Three ordinary questions produce three nonblank answers in immutable order.
2. Every returned source is a safe, canonical public HTTP(S) URL from the same provider answer result.
3. A search-results-only provider response fails the answer contract.
4. A complete answer with no safe source receives one corrective call and then degrades truthfully to `source_limited` without losing the answer.
5. Forced retrieval, passage-selection, entity-resolution, and evidence-graph failures leave answer text and provider sources unchanged.
6. Only a typed provider refusal produces `refused`.
7. Transport and malformed-response failures use Worker retry/repair behavior and never render as refusals.
8. Question 1 rejects a nonresponsive market-statistic-only answer fixture.
9. Questions 2 and 3 satisfy their required semantic coverage.
10. GEO target/competitor/source diagnosis derives from the persisted answer and returned sources.
11. Checkpoint resume makes zero duplicate answer, search, billing, refund, or email effects.
12. Legacy V3, V2, and V1 fixtures continue to parse and render with unchanged meaning.
13. Customer HTML contains answers before sources, retains complete technical analysis, and exposes no customer PDF surface.

## 15. Protected-Staging Acceptance

One new Chinese protected-staging report must prove:

- exactly three persisted questions;
- three useful nonblank answers;
- at least one safe returned source per question;
- question 1 names providers or approaches rather than only market statistics;
- question 2 covers solution, cargo, timing, and delivery conditions;
- question 3 provides a procurement verification checklist;
- source links render immediately below each answer;
- retrieval/audit failure injection does not erase answers;
- target mention and competitor diagnosis agree with the rendered answers;
- technical analysis remains complete;
- the active V3 artifact, job, credit, order, email, access, and private readiness state are atomic and auditable;
- no production configuration, database, Worker, alias, order, or report changes.

An artifact with an empty ordinary answer, all three `source_limited`, a fabricated source list, or a market-statistic-only answer to question 1 is a failed product acceptance even when the job technically terminalizes.

## 16. Documentation and Rollout

The implementation plan must supersede, not extend, the old evidence-first remediation plan. It must update the durable product definition, project state, tasks, decisions, AI report engine documentation, report workspace, protected-staging runbook, and a dated acceptance record after real evidence exists.

Production admission remains disabled until deterministic tests, protected-staging provider preflight, one real three-answer acceptance, commerce audit, deployment review, and explicit operator authorization all pass.
