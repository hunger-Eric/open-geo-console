# Answer-First Open GEO Report V3 Design

**Date:** 2026-07-14  
**Status:** Approved design  
**Scope:** Prospective paid reports only

## 1. Problem

The current public-source V2 report persists buyer questions, query fanout, search observations, retrieved evidence, an evidence graph, and operational coverage. Its primary report, however, does not persist or render a final answer for each buyer question. A customer therefore sees search and evidence activity without the central result: what the generative engine concluded and which sources support that conclusion.

This is a contract gap rather than a layout-only defect. Reformatting the existing evidence list cannot create an answer that was never synthesized and persisted.

## 2. Product Definition

Open GEO Console is itself a controlled generative search engine for this report. It searches public sources, safely retrieves eligible pages, synthesizes a grounded answer, cites the sources used by that answer, and diagnoses the target organization's visibility inside that generated answer.

The customer label is:

> **Open GEO 生成式答案**  
> 基于本次公开搜索结果综合生成

The report must not claim that its answer came from Doubao, ChatGPT, Kimi, Gemini, or any other external answer product. External products are separate generative engines with different indexes, query expansion, ranking, models, and citation selection. This report measures the reproducible Open GEO engine run identified in its provenance.

This is a GEO report because its primary observable is visibility inside a synthesized, citation-backed answer: whether the target is mentioned, how it is described, which competitors appear, and which sources are cited. Search indexing and retrieval remain necessary foundations, but classic link rank is not the customer result.

## 3. Goals

- Give every canonical buyer question a complete Chinese answer or an explicit insufficient-evidence result.
- Bind every factual answer sentence to the exact public evidence that supports it.
- Put answer sources immediately below the answer instead of relying on a detached evidence appendix.
- Compute GEO diagnosis from the persisted final answer and its citations.
- Preserve reproducible query, source, model, locale, time, and hash provenance.
- Reuse the existing search, safe-retrieval, evidence, provider-discovery, commercial, HTML, and private readiness boundaries.
- Apply the new contract only to newly admitted reports.

## 4. Non-Goals

- Do not reproduce or impersonate the live output of external consumer answer platforms.
- Do not backfill, translate, reinterpret, or rewrite historical V1/V2 reports.
- Do not use model prior knowledge as report evidence.
- Do not claim that a technical website change causes ranking, mention, or citation.
- Do not expose customer PDF routes, buttons, attachments, or email claims.
- Do not activate the contract in production as part of implementation or staging acceptance.

## 5. Version and Compatibility Boundary

- Keep the paid commercial product code `recommendation_forensics_v1` unchanged.
- Add the prospective artifact contract `combined_geo_report_v3` with report version `3`.
- Keep all existing V1/V2 parsers, renderers, database rows, access scopes, and active revisions readable without reinterpretation.
- Admit V3 only through an environment-owned prospective setting after the matching schema, Web, and deep Worker are deployed to protected staging.
- Existing orders remain bound to the artifact contract and report version persisted at admission.

## 6. Customer Report Contract

A ready V3 report contains exactly three answer cards in the immutable canonical buyer-question order. Each card contains:

1. The exact customer-facing question used by the run.
2. The Open GEO engine label and run coverage.
3. A complete answer rendered as one to three coherent paragraphs.
4. Inline citation ordinals attached to every factual sentence.
5. A source list with title, canonical URL, registrable domain, ownership category, exact supporting excerpt, observed time, and the sentence it supports.
6. A deterministic GEO diagnosis covering target mention, mention role and order, competitors, cited ownership mix, evidence gaps, and the exact retest question.

The full report order is:

1. Executive summary.
2. Three answer cards.
3. Cross-question GEO diagnosis summary.
4. Complete technical analysis.
5. Evidence, provenance, methodology, and limitations appendix.

The appendix remains available for auditability but is not the primary customer experience.

## 7. Grounded Answer Data Contract

`combined_geo_report_v3` adds an ordered `answerCards` tuple with exactly three entries. Each entry has:

- `questionId` and `exactQuestion` bound to the immutable question set.
- `status`: `answered`, `limited`, or `insufficient`.
- `sentences`: ordered answer sentences.
- `sourceEvidence`: the eligible evidence referenced by those sentences.
- `geoDiagnosis`: deterministic answer-level GEO observations.
- `coverage`: planned queries, completed queries, returned results, safely retrieved pages, and reasons for any shortfall.

Each answer sentence has:

- `sentenceId`.
- `text` in the persisted report locale.
- `kind`: `grounded_claim` or `scope_note`.
- `evidenceIds`.
- `confidence`: `verified` or `limited` for grounded claims.

Contract rules:

- A `grounded_claim` requires at least one eligible, direct evidence record for the same question and subject.
- `verified` requires supporting evidence from at least two independent registrable domains.
- A one-domain claim is `limited` and carries deterministic limitation copy.
- A `scope_note` is deterministic application copy about coverage or uncertainty; it cannot introduce a factual claim and has no evidence IDs.
- `answered` contains at least one grounded claim and no limited claims.
- `limited` contains at least one grounded claim and at least one limited claim or a material coverage shortfall.
- `insufficient` contains no grounded claims and renders deterministic insufficient-evidence copy rather than model prose.
- Citation ordinals are derived from first use in the ordered sentences and are not model-controlled.
- Every cited evidence ID must be rendered immediately below the answer and must include an exact supporting excerpt.
- Evidence may support more than one sentence, but an answer sentence may not reference unrelated evidence merely because it came from the same query.

This sentence-level representation is the canonical answer. The renderer groups consecutive sentences into readable paragraphs and appends citation ordinals; it does not maintain a second unverified long-form answer string.

## 8. Engine and Synthesis Provenance

Each V3 artifact persists an `engineProvenance` record containing:

- Engine identifier `open_geo_public_search_answer_v1`.
- Exact public-search surface authority identity.
- Query-plan and fanout versions.
- Retrieval and passage-selector versions.
- Synthesis model and prompt contract versions.
- Persisted locale and region.
- Search, evidence-cutoff, synthesis, and artifact timestamps.
- Input, evidence, answer, HTML, and private readiness hashes.

Customer copy names the Open GEO engine. The methodology appendix may disclose the certified search surface and synthesis model accurately, but it may not relabel the result as an external consumer platform observation.

## 9. Processing Flow

For each of the three canonical questions:

1. Build the bounded query fanout.
2. Execute the certified public-search surface and persist normalized observations.
3. Safely retrieve public pages and select relevant exact passages.
4. Resolve entities, ownership, and eligible direct evidence.
5. Run provider discovery and qualification where the first question asks for providers or approaches.
6. Build one question-scoped evidence input containing only eligible evidence.
7. Ask the configured model for ordered grounded claim sentences using only that input.
8. Parse and verify question identity, subjects, evidence IDs, confidence, locale, and sentence limits.
9. Run at most one field-scoped corrective model call for language or contract failure without re-running search.
10. If validation still fails, enter the existing operator-repairable boundary; do not deliver ungrounded prose.
11. Compute GEO diagnosis deterministically from the validated answer, target aliases, resolved competitor entities, and cited source ownership.
12. Persist the complete pending V3 artifact checkpoint before HTML/private-readiness verification.
13. Resume readiness or terminalization from that checkpoint without re-fetching public sources.

The first question must produce an answer, not only a provider table. Qualified providers, evidence-limited candidates, and explicit unknowns become grounded answer sentences with citations. Questions two and three extend the existing claim-bound answer machinery to the same customer contract.

## 10. GEO Diagnosis Rules

The answer-level diagnosis is deterministic and never asks the model to grade itself. It records:

- Whether a normalized target alias appears in any grounded answer sentence.
- The first sentence position and semantic role of the target mention.
- Resolved competitor entities appearing in grounded answer sentences.
- Which citations are target-owned, competitor-owned, third-party editorial, directory, government, or other authority types.
- Whether target-owned evidence is supported by an independent source.
- Missing evidence families that prevented a target claim or verified confidence.
- The exact canonical question to use for a later comparison run.

Cross-run comparison is valid only when the engine, locale, region, question identity, and compatible query-plan contract are recorded. A future comparison may report mention, position, citation, and confidence changes; it may not infer causal impact from a single change.

## 11. Failure and Commercial Outcomes

- All three cards `answered` with complete required readiness produces `completed`.
- Any `limited` or `insufficient` card, or a material query/retrieval coverage shortfall, produces `completed_limited` when at least one useful grounded answer remains.
- No useful grounded answer, exhausted non-repairable processing, or an unrecoverable readiness failure produces `failed`.
- Existing commercial policy remains authoritative: `completed_limited` and `failed` receive one full refund, while any later usable artifact is a non-billable courtesy delivery.
- Configuration, authority, storage, locale, or repairable answer-contract failures remain `repair_wait` and do not prematurely trigger a terminal customer promise.
- Terminal report, job, credit, order, refund intent, email intent, and access scope remain atomic.

## 12. HTML and Private Readiness

- The customer artifact is secure HTML only.
- The answer card is the primary component and must render desktop and mobile layouts without horizontal overflow.
- Inline ordinals link to the source block in the same card.
- External source links show their destination and use safe link attributes.
- Exact excerpts remain source-original and are visually distinguished from generated Chinese prose.
- The same canonical HTML is rendered privately through Chromium for page-count, `%PDF-`, hash, storage, and readiness checks.
- The private PDF is not a customer format and has no public route, action, or email claim.

## 13. Security and Privacy

- Do not persist raw model keys, access tokens, customer email, or unhashed client IPs in provenance or evidence.
- Preserve safe-fetch, public-routability, robots, access-barrier, and bounded-content rules.
- Render only normalized safe URLs and escaped source text.
- Keep Vercel Authentication as the outer protected-staging boundary.
- Production continues to reject staging operator access and prospective V3 admission until explicitly authorized.

## 14. Verification

### Deterministic tests

- V3 parser accepts exactly three ordered cards and rejects missing, duplicate, or foreign question IDs.
- Every grounded claim rejects empty, ineligible, indirect, cross-question, or cross-subject evidence.
- Verified confidence rejects fewer than two independent domains.
- Insufficient answers reject model-generated factual prose.
- Chinese locale rejects unapproved English system or generated answer text while preserving source-original exceptions.
- GEO terminology appears on customer surfaces; stable historical/internal identifiers remain compatible.
- Citation ordinals and source blocks are derived deterministically.
- GEO diagnosis uses the persisted answer and citations, not search-result order alone.
- Historical V1/V2 fixtures continue to parse and render byte-for-byte equivalent customer meaning.

### Integration tests

- Search observations and retrieved passages flow into all three answer cards.
- Provider discovery produces a cited first-question answer rather than only a provider table.
- A model attempt containing an unsupported sentence is rejected and receives at most one bounded correction.
- Checkpoint resume reuses persisted observations, evidence, and pending artifact without duplicate search, evidence, billing, refund, or email effects.
- HTML authorization accepts the exact V3 access scope and anonymous requests return application `404`.
- Customer surfaces and email contain only the secure HTML link; internal PDF readiness remains populated.

### Protected-staging acceptance

Generate one new Chinese paid report and verify:

- Three exact questions.
- Three complete answer cards or an honest insufficient card.
- Every factual sentence has visible, adjacent, working source evidence.
- The target, competitor, ownership, gap, and retest diagnostics agree with the persisted answer.
- No external platform attribution is present.
- Customer prose is Chinese and customer terminology is GEO.
- Desktop and mobile Chromium views are readable.
- Private readiness hash, storage key, and page count are populated.
- The correct commercial outcome, refund behavior, emails, access token, and credit state are terminal and auditable.
- Production database, containers, aliases, environment values, and admission remain unchanged.

## 15. Documentation Impact

Implementation must update the project state, tasks, decisions, report workspace, AI report engine contract, commercial operations, protected-staging runbook, and a dated acceptance record. Documentation must distinguish Open GEO engine results from external platform observations and must not market the output as AI ranking.

