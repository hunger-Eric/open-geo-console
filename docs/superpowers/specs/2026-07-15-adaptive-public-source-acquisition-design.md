# Adaptive Public-Source Acquisition and Answer Degradation Design

**Date:** 2026-07-15

**Status:** Approved design; implementation not started

**Scope:** Prospective `combined_geo_report_v3` public-source acquisition, answer evidence states, recovery, artifact activation, and commercial outcomes

## 1. Problem

The current Worker can return many structured search observations while producing no answer because the selected result pages do not become eligible direct evidence. That outcome currently conflates several different conditions:

- the publisher is genuinely unreachable;
- `robots.txt` is denied, unavailable, malformed, or served with an unexpected content type;
- DNS, TLS, redirect, timeout, HTTP, content-type, or body-size validation fails;
- the page requires JavaScript;
- the page is fetched but readable text extraction fails;
- text is extracted but is not relevant to the question;
- text is relevant but its subject is ambiguous;
- evidence persistence rejects the normalized record; or
- the Worker is interrupted before the candidate pool is exhausted.

The downstream projection often collapses these conditions into `inaccessible`. A customer-visible insufficient-evidence card can therefore describe an internal acquisition failure as if the public web contained no answer. That is not an acceptable product boundary.

## 2. Design Principle

The system may declare direct evidence insufficient only after it has exhausted the sanctioned, safe, question-specific acquisition process and can prove that exhaustion from an immutable attempt ledger.

Three decisions remain independent:

1. whether collection executed to a valid terminal state;
2. what evidence grade each question reached; and
3. whether the report is activated, settled, delivered, repaired, or refunded.

An internal collection failure is never evidence absence. Search-result observations are never promoted to verified page facts.

## 3. Goals

- Give all three locked questions independent acquisition budgets and progress.
- Replace fixed, one-shot URL selection with adaptive candidate replenishment.
- Preserve exact, privacy-safe failure stages and reasons.
- Improve safe HTTP retrieval, text extraction, character decoding, and supported document handling.
- Add a browser fallback without weakening DNS, SSRF, robots, redirect, or resource limits.
- Separate retrieval, extraction, relevance, subject resolution, and evidence eligibility.
- Produce a useful, explicitly graded customer answer whenever the persisted evidence permits one.
- Preserve immutable checkpoints and exactly-once commercial effects.

## 4. Non-Goals

- Bypassing CAPTCHAs, authentication, paywalls, publisher access controls, or robots policy.
- Treating generated search prose, titles, or snippets as verified page facts.
- Guaranteeing that every public question has a factual answer.
- Weakening existing URL safety, public-IP validation, redirect validation, byte limits, or private-network blocks.
- Rewriting historical artifacts, jobs, evidence rows, payments, refunds, or emails.
- Enabling production paid admission as part of this change.

## 5. Chosen Approach

Use hybrid adaptive acquisition:

1. collect and persist structured search observations;
2. build a question-scoped candidate pool;
3. try safe HTTP retrieval first;
4. classify the result without collapsing failure reasons;
5. replenish failed or irrelevant candidates from the remaining pool;
6. use a hardened browser only for eligible client-rendered cases;
7. perform one bounded query reformulation when the original pool is exhausted;
8. stop when the evidence target, question budget, or candidate pool reaches a deterministic terminal state.

HTTP-only retrieval cannot cover client-rendered pages. Browser-first retrieval is too expensive and creates a larger security boundary. The hybrid design reserves the browser for cases where it can materially change the result.

## 6. Component Boundaries

### `packages/public-search-observer`

Owns canonical questions, query plans, query reformulation contracts, structured observations, and provider execution budgets. It does not decide whether a page was safely retrieved or whether an answer claim is supported.

### `packages/site-crawler`

Owns public URL safety, DNS resolution, IP classification, safe redirects, robots evaluation, document retrieval, character decoding, readable-content extraction, supported-document parsing, and the hardened browser fetch primitive.

It exposes typed results. It does not persist report state or assign evidence grades.

### `packages/citation-intelligence`

Owns question relevance, subject resolution, evidence-family identity, direct-evidence eligibility, independent-domain calculation, contradiction handling, and the distinction between direct page evidence and search observation evidence.

### `packages/ai-report-engine`

Owns the prospective answer-card contract, prompts, structured parsing, deterministic evidence binding, allowed answer language for each grade, and final validation. A model may not select or upgrade its evidence grade.

### `apps/web`

Owns `QuestionAcquisitionCoordinator`, PostgreSQL attempt ledgers and checkpoints, Worker orchestration, leases, report revision materialization, artifact activation, credit settlement, refunds, email intents, and access control.

## 7. Acquisition State Model

### 7.1 Per-attempt stages

Each candidate attempt advances through explicit stages:

```text
candidate_selected
dns_validation
robots_evaluation
http_request
http_response_validation
document_decoding
content_extraction
question_relevance
subject_resolution
evidence_classification
terminal
```

Browser fallback uses the same later stages, with `method=browser` and its own network-security events.

### 7.2 Stable outcomes

The bounded failure/outcome vocabulary includes:

```text
available
duplicate
domain_cap
question_budget_exhausted
unsafe_destination
dns_failed
connect_timeout
tls_failed
robots_denied
robots_unavailable
redirect_invalid
redirect_limit
http_403
http_404
http_429
http_5xx
challenge_detected
authentication_required
unsupported_content_type
response_too_large
body_empty
javascript_shell
decoding_failed
extraction_failed
irrelevant_to_question
subject_ambiguous
contradictory
evidence_rejected
caller_aborted
phase_deadline
worker_deadline
internal_failure
```

Provider- or publisher-specific text is not stored in the public status code. Internal diagnostic detail remains bounded and privacy-safe.

### 7.3 Question collection states

- `collecting`: sanctioned work remains.
- `evidence_target_met`: the configured direct-evidence target is met.
- `exhausted`: candidates, one allowed reformulation, and the question budget were consumed normally.
- `collection_failed`: internal failure or control-flow interruption prevented valid exhaustion.

Only `evidence_target_met` and `exhausted` are valid inputs to final answer grading. `collection_failed` enters recovery.

## 8. Adaptive Candidate Scheduling

Each question receives an independent minimum budget before unused capacity may be shared. Q1 cannot consume the Q2 or Q3 minimum.

The coordinator maintains:

- canonical candidate URL and registrable domain;
- originating query and observation;
- structured result order;
- source-role hint;
- retrieval risk;
- methods already attempted;
- stable outcome and retry eligibility;
- remaining per-question requests, wall time, browser slots, and query rewrites;
- current direct-evidence count and independent-domain count.

Default scheduling priority is:

1. ordinary HTML from a previously untried domain;
2. official, institutional, and earned editorial sources;
3. retryable HTTP failures using a different validated public address;
4. browser-eligible JavaScript shells;
5. supported PDF documents;
6. remaining lower-ranked or same-domain candidates;
7. candidates from one bounded reformulated query plan.

The scheduler replenishes after every terminal attempt. It stops a question when the evidence target is met, no sanctioned candidate remains, or its budget is exhausted. Every skipped candidate receives a bounded reason.

## 9. HTTP Retrieval Contract

The HTTP retriever must:

- retain caller, phase, per-source, and Worker-deadline abort identity;
- try multiple independently validated public DNS addresses when connection failure permits safe failover;
- pin each request to its validated address;
- revalidate every redirect destination and origin;
- evaluate robots separately from the document request and record its outcome separately;
- preserve status, content type, final URL, byte count, duration, and decoding result;
- decode declared and safely detected common character sets, including common Chinese encodings;
- use a structured readability extractor rather than regex-only boilerplate removal;
- identify client-rendered shells, access challenges, authentication pages, empty bodies, and irrelevant content separately;
- support bounded, text-only parsing for reviewed document types such as PDF;
- persist normalized excerpts and hashes only after the document passes the evidence storage contract.

A robots failure is not silently treated as evidence absence. Robots denial remains a hard publisher boundary. Robots unavailability may be retried according to a bounded policy but never bypassed by the browser.

## 10. Browser Fallback Security Contract

The existing general site-crawler browser helper is not reused unchanged. URL prevalidation without transport pinning is insufficient against DNS rebinding.

The public-source browser path requires:

- a successful robots decision before launch;
- an allowlisted fallback reason such as `javascript_shell`;
- an ephemeral context with no inherited cookies, cache, storage, authentication, downloads, or file access;
- a network layer that connects only through validated, pinned public destinations;
- validation for the main document, redirects, scripts, styles, XHR, and fetch requests;
- blocking of private, reserved, metadata, benchmark, local, non-HTTP, WebSocket, media, font, and download destinations as applicable;
- bounded navigation time, total requests, response bytes, redirects, and rendered document size;
- interruption propagation with no new requests after phase or Worker abort;
- terminal typed outcomes identical to the HTTP path where meanings overlap.

If transport pinning cannot be proved for the browser runtime, browser fallback remains disabled and the report must not claim it was attempted.

## 11. Persistence Contract

The next prospective schema adds an append-only public-source retrieval-attempt ledger. Each row contains at least:

- report, job, question, snapshot, query, observation, and candidate identities;
- canonical and final public URLs;
- registrable domain;
- method, attempt order, stage, outcome, and stable failure code;
- safe HTTP status, robots outcome, content type, content bytes, and duration;
- extractor, decoder, and browser-policy versions where applicable;
- extraction, relevance, subject-resolution, and evidence-classification outcomes;
- started and completed timestamps;
- retry and browser-fallback eligibility.

The ledger never stores raw credentials, cookies, request authorization, private IPs, unbounded response bodies, or exception stacks.

A question acquisition checkpoint contains:

- exact query-plan and candidate-pool identity;
- planned, attempted, remaining, and skipped candidates;
- direct evidence and independent domains;
- search, HTTP, browser, reformulation, time, and cost budgets used and remaining;
- terminal collection state;
- coordinator, retriever, extractor, classifier, and policy versions.

Existing immutable search observations and source-evidence rows remain separate authorities. A retrieval attempt is not evidence.

## 12. Evidence and Answer States

The backend deterministically selects the maximum allowed answer state before model synthesis:

### `verified`

At least two independent registrable domains provide eligible direct page evidence for the same question and resolved subject. The answer may state the supported fact and cite the exact evidence.

### `limited`

At least one eligible direct page excerpt supports the answer. The answer states the supported fact and the deterministic limitation that independent confirmation is missing.

### `observed`

No eligible direct page evidence exists, collection is `exhausted`, and at least two relevant structured search observations from independent result domains consistently describe the same subject. The answer may state only that public search results mention or describe the subject. It cannot state the underlying capability as verified fact.

### `unresolved`

Collection is `exhausted`, but the observations are absent, insufficient, contradictory, or too ambiguous for an observational answer. No factual model-authored answer is allowed. The card explains the searched coverage and the exact evidence gap.

### `collection_failed`

This is execution state, not an answer state. No final card is activated from it. The job resumes from its checkpoint or follows the existing SLA failure boundary.

Every factual or observational sentence binds only evidence allowed by its state. The model cannot change question order, subject identity, evidence IDs, confidence, or status. Deterministic validation rejects any upgrade or cross-question binding.

## 13. Report and Commercial Outcomes

- All three cards `verified`: `completed`; activate the artifact, settle the credit, and enqueue completion delivery.
- Any card `limited`, `observed`, or `unresolved`, with all questions validly exhausted or target-met: `completed_limited`; activate and deliver the truthful report, refund under the existing commercial promise, and show its limitations.
- Any question `collection_failed` while attempts and SLA remain: non-terminal `repair_wait`; preserve checkpoints and create no refund or failure email yet.
- Unrepaired collection failure after sanctioned retry/SLA exhaustion: `failed`; do not activate the incomplete revision, atomically refund, and enqueue the appropriate failure communication.

The artifact may be materialized privately for readiness before terminalization, but a collection-failed revision cannot become active. Existing exactly-once order, credit, refund, and email invariants remain unchanged.

## 14. Recovery and Identity

Recovery resumes from immutable completed attempts and evidence. It does not repeat successful search, retrieval, extraction, browser, or model work.

Resume identity binds:

- report, job, artifact revision, question-set hash, and locale;
- public-search authority and exact query plan;
- candidate-pool and reformulation identity;
- acquisition policy and all component versions;
- completed attempt and evidence hashes;
- remaining budgets.

An identity mismatch is operator-repairable and cannot be normalized to public evidence insufficiency.

## 15. Customer Presentation

Each question card shows:

- its direct, limited, observational, or unresolved conclusion;
- a localized evidence-level label;
- planned and completed queries;
- returned structured observations;
- attempted candidate pages;
- successfully retrieved and extracted pages;
- eligible direct evidence and independent domains;
- a bounded explanation of why the card did not reach the next level;
- source links appropriate to the answer state;
- a recommended retest question.

The customer artifact does not expose internal IDs, raw diagnostics, costs, IPs, stack traces, or security-policy details.

## 16. Delivery Plan

Implementation is divided into independently verifiable stages:

1. Add the attempt ledger, stable outcome taxonomy, and question checkpoints without changing customer answer behavior.
2. Separate retrieval, extraction, relevance, subject, persistence, and evidence states; remove lossy `inaccessible` projections.
3. Add adaptive candidate replenishment and independent question budgets.
4. Improve HTTP address failover, decoding, extraction, challenge detection, and reviewed document handling.
5. Implement and security-test the pinned browser fallback.
6. Add `observed` answer evidence and prospective V3 answer-card parsing/rendering.
7. Update recovery, artifact, terminalization, refund, email, and customer-status contracts.
8. Run historical snapshot replays and one new protected-staging paid acceptance after every pre-order gate passes.

No historical artifact is reparsed or rewritten. Production paid admission remains disabled until explicit operator authorization after acceptance.

## 17. Verification

### Deterministic fixtures

Cover at least:

- static HTML;
- JavaScript shell with browser success;
- GBK or equivalent Chinese decoding;
- supported PDF text extraction;
- robots allow, deny, missing, unavailable, and malformed states;
- first validated DNS address failing and a second succeeding;
- safe and unsafe redirects;
- HTTP 403, 404, 429, 5xx, challenge, and authentication pages;
- response-size, content-type, and timeout limits;
- extraction success with question irrelevance;
- subject ambiguity and contradictory evidence;
- adaptive candidate replenishment;
- one bounded query reformulation;
- three-question budget isolation;
- interruption and checkpoint resume;
- browser SSRF, DNS rebinding, subresource, download, WebSocket, and local-protocol blocks;
- deterministic answer-grade enforcement and model-overclaim rejection;
- exactly-once terminalization, credit, refund, and email effects.

### Required invariants

- `collection_failed` can never become `unresolved` or `completed_limited`.
- `observed` sentences can cite only qualifying structured observations and use observational language.
- `limited` and `verified` sentences cite only eligible direct page evidence for the same question and subject.
- no question uses another question's reserved minimum budget.
- no source is retried after a terminal non-retryable outcome.
- no completed attempt is repeated after valid resume.
- browser fallback cannot run without a recorded allowlisted reason and safe transport policy.

### Protected-staging acceptance

The acceptance report must prove:

- all three questions received independent candidates and budgets;
- every attempted URL has a stable outcome and stage;
- initial candidate failures caused replenishment where candidates remained;
- `unresolved` was used only after deterministic exhaustion;
- internal interruptions entered recovery rather than evidence insufficiency;
- every customer card contains a direct answer, an observational conclusion, or an honest exhausted-coverage explanation;
- the authorized canonical HTML and private PDF readiness reference the same immutable revision;
- `completed` settles, `completed_limited` activates and refunds, and `failed` does not activate;
- no duplicate order, charge, credit, provider request, source row, refund, or email was created;
- production and historical records remained unchanged.

## 18. Acceptance Decision

This design is accepted only when a real protected-staging run demonstrates that the system exhausts its safe adaptive acquisition methods before declaring evidence insufficient. A green deterministic suite without that live proof is necessary but not sufficient.
