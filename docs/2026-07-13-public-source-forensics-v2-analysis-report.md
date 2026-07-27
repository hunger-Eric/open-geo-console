# Public-source Recommendation Forensics V2 — Implementation Analysis

Date: 2026-07-13  
Branch: `codex/refactor-simulator-log-analyzer`  
Plan: `docs/superpowers/specs/2026-07-12-public-web-recommendation-source-forensics-implementation-plan.md`

## Executive conclusion

MiMo is now the first compile-time registered public-search adapter behind an independent configuration and identity boundary. Its redacted protected-staging probe and a re-signed inactive authority are complete, but it is not activated: no active exact authority or authorized V2 customer report exists, so catalog and checkout remain closed.

Read-only database evidence on 2026-07-13 found zero non-terminal recommendation rows, zero non-terminal V1 rows, and zero terminal commercial jobs with a reserved credit in both staging and production. The normal CLI audits were not used because they can bootstrap/migrate schema state; no database migration was authorized in this adapter implementation.

The same-date MiMo capability probe passed official-factual, Chinese B2B and narrow structured-search cases after a bounded 30-second timeout and three-source sample; a redacted retry passed as well. A sensitive protected-Preview HMAC signed inactive authority `public-search-authority-101c9dbb38db639d7f5b4207f8eb14e9832008672df617858239b6770b546c6e`. Runtime stays false; this does not authorize activation, customer collection, paid delivery/refund drills, or production change.

Phases 4–9 of the approved V2 plan are implemented. The repository now has a versioned, public-source-based recommendation-forensics pipeline whose persisted evidence, report construction, artifact rendering, commercial terminalization and certification admission are explicit and fail closed.

This is an implementation-complete framework, not a claim that a live public-search vendor has been certified. The compile-time approved adapter registry is empty, there is no active exact V2 authority, and no authorized live V2 report exists. Catalog and checkout therefore remain closed. No developer fixture, historical answer-provider result, HTML snapshot, or unit test is presented as external production evidence.

## What changed

### Phase 4 — V2 report contract and evidence model

- Added strict V1/V2 report dispatch and `RecommendationForensicReportV2` validation.
- Added public-source evidence graphs, claim verification, cost provenance and an independent V2 report repository.
- Bound report snapshot references to questions, query variants and observations.
- Rejected unsupported or causal recommendation language before persistence.

### Phase 5 — fulfillment and commercial state machine

- Added coverage freshness boundaries, cache/resume behavior and bounded collection budgets.
- Added exact-authority runtime collaborator validation, a job-bound V2 snapshot lease/attempt/observation resolver and safe source retrieval. It persists structured annotations only and marks un-fetched sources `not_retrieved` rather than fabricating evidence.
- Made V2 report persistence, terminal job state, credit settlement/refund, order/refund state and email intent one PostgreSQL transaction.
- Kept PostgreSQL as the sole job, payment, delivery and access authority.

### Phase 6 — customer artifacts

- Added discriminated V1/V2 artifact models and version-routed HTML/PDF rendering.
- Made the V2 HTML component canonical and required PDF materialization from that exact component.
- Added an artifact-readiness gate that renders the canonical V2 component with print CSS and rejects a missing or malformed real Chromium PDF before commercial terminalization, without persisting the report early.

### Phase 7 — V1 retirement from active fulfillment

- Audited staging and production to zero non-terminal V1 recommendation jobs.
- Removed OpenAI/Perplexity answer-provider imports, credentials, flags and certification commands from active checkout, catalog and Worker graphs.
- Preserved historical V1 rows, parsing, authority and rendering so existing reports remain readable.

### Phase 8 — public-search surface certification

- Added signed, immutable certification artifacts with exact environment/surface/capability/terms/storage/error/budget evidence.
- Added artifact hashing, HMAC verification, path confinement and provenance validation.
- Added an installer that can create only inactive authority after artifact verification.
- Kept the approved adapter registry empty, so certification refuses before any network call.

### Phase 9 — documentation and operator handoff

- Updated project rules, README, project state, task pool and architecture decisions.
- Added the operator runbook at `docs/operations/public-search-surface-certification.md`.
- Recorded the implementation evidence and remaining external gates in this report.

## Resulting architecture

The active V2 flow is:

`canonical buyer questions -> query fanout -> immutable market snapshot -> public result observations -> safe evidence retrieval -> public-source evidence graph -> V2 report builder -> canonical HTML -> same-component PDF -> atomic terminalization`

Key ownership boundaries:

- `packages/public-search-observer`: surfaces, authorities, questions, fanout, observations, coverage, registry and prohibited claims.
- `packages/citation-intelligence`: V2 evidence graph, entity resolution, source families, evidence readiness and non-causal opportunity hypotheses.
- `apps/web`: PostgreSQL persistence, runtime/certification authority, fulfillment, commercial outcomes, access control and artifact delivery.
- `packages/answer-engine-observer`: frozen historical V1 contract only.

## Safety and correctness analysis

### Fail-closed admission

Environment flags alone cannot enable the product. Availability requires an exact deployment-matched active authority, approved non-fixture runtime registration, V2 builder and artifact gate. The empty approved registry makes the current result deterministically closed.

### Evidence integrity

Market snapshots and observations are immutable and hash-bound. Retained excerpts may expire, while hashes, source identity, cost ledger and report references remain. Customer claims must resolve to persisted evidence; raw result order is context and is never relabeled as AI rank, recommendation probability or causation.

### Commercial integrity

Terminal commercial outcomes use one atomic boundary. A qualified result completes and settles; a usable limited result completes-limited and refunds; an unusable result fails and refunds. Email intent is created inside the same boundary, preventing a report/job/credit/order split-brain outcome.

### Backward compatibility

New purchases use report version 2 and methodology `public_search_source_forensics_v1`. Historical V1 reports remain accessible through explicit version dispatch. Retirement affects new admission and execution, not historical evidence.

## Verification evidence

| Check | Result | Interpretation |
|---|---|---|
| Full repository unit suite | Final pass: 134 files passed, 12 skipped; 701 tests passed, 28 skipped | Deterministic package/app behavior is covered |
| Lint | Final pass | Next.js workspace static checks passed |
| Production build | Final pass | All packages and the Next.js production app compiled successfully |
| Staging V1 methodology audit | Final pass: zero non-terminal recommendation rows and zero V1 rows requiring retained adapters | V1 active fulfillment retirement boundary satisfied |
| Production V1 methodology audit | Final pass: zero non-terminal recommendation rows and zero V1 rows requiring retained adapters | No production V1 work remained at retirement |
| Staging and production `db:audit` | Final pass in both environments | No terminal commercial job retained reserved credit |
| PostgreSQL integration suite in final pass | Unproven: command exceeded the 244-second execution ceiling | Must not be reported as a pass; rerun without the tool ceiling |
| Fresh-database fault-injection tests | Passed against isolated local PostgreSQL 16 on 2026-07-13 | v9-to-v14 bootstrap/upgrade, snapshot, repository and atomic-commerce suites passed; not staging/production evidence |
| Worker collaborator focused tests | Pass | Job-bound checkpoint, V2 safe retrieval, deferred report persistence, canonical artifact gate, and missing-collaborator fail-closed behavior are covered locally |
| Live V2 browser/PDF customer drill | External unproven | Worker collaborators are implemented, but no paid protected-staging customer drill has exercised them |
| Live vendor certification/failure drills | External unproven | MiMo probe/certification is inactive only; runtime remains false |
| `git diff --check` | Pass | No whitespace error detected |
| CodeGraph sync/status | Pass: index current, 430 files, 4,629 nodes, 11,546 edges | Structural index matches the workspace |

These results were collected after the final documentation edits. The isolated PostgreSQL suite is proven; external live gates remain deliberately classified as unproven rather than inferred from deterministic or local capability evidence.

## Remaining gates before enabling sales

1. Activate the separately reviewed inactive authority only in protected staging, then confirm catalog/checkout remain closed for all identity mismatches.
2. Complete a paid protected-staging V2 drill from signed payment Webhook through collection, report, canonical HTML, materialized PDF, delivery and access.
3. Execute timeout, partial coverage, unusable evidence, refund, retry/resume and artifact-failure drills.
4. Only after all evidence passes, make the separately reviewed production activation decision.

## Commit trail

- `0f01383` — start the V2 report contract.
- `4e6e491` — complete the V2 report layer.
- `8c75ffa` — orchestrate public-source fulfillment.
- `dc8f47a` — render public-source artifacts.
- `25a8837` — retire answer providers from active fulfillment.
- `2d279a6` — add the public-search certification framework.

## Final assessment

The codebase now enforces the intended boundary: it can explain how a public-source recommendation-forensics product will collect, prove, render and settle evidence, while refusing to sell or execute it without independently certified live capability. The remaining work is external certification and protected-environment acceptance, not hidden implementation debt that should be bypassed with flags or fixtures.
