# Active Change Scope Lock

Status: `APPROVED`

This file records historical scopes and the **current** executable authority.
**Current executable authority:** section
`Current authority: Code-AI seam hardening W3 — free-teaser degradation safety (APPROVED)`.
All earlier sections are context only.

## Current authority: Code-AI seam hardening W3 — free-teaser degradation safety (APPROVED)

**Status: `APPROVED`** — user approved this written allowlist on 2026-07-29
("批准 W3"), including the narrow opening of
`packages/ai-report-engine/src/report-semantic-review.ts` for rule 1's
degradation-marker exposure only. Deployment and staging reruns remain
excluded and require separate later authorization.

### Baseline and evidence

- HEAD `8cde23f` (W1+W2 committed, not yet deployed; Staging Web `e3fe6a0`,
  Workers `staging-737ad6d-overlay-v1`).
- Parent design: session plan `shazam-stargirl-stargirl.md` (approved
  2026-07-29), workstream W3.
- User-visible symptom: free AI preview stalled at 96% on staging
  (2026-07-28/29) — the second of the two distinct "96%" stalls.
- Code-verified mechanisms at HEAD `8cde23f`:
  - `packages/ai-report-engine/src/report-semantic-review.ts:1672-1677`: the
    degraded-annotation fallback **fabricates** `targetPresence:"present"`,
    `entityRole:"target"`, `targetFirstSentence:1`. It passes the W1 guard
    (`report-v4-free-teaser.ts:913-921`) and persists as truth
    (`targetMentioned:true`, :934); only an uninspected `reason` string marks
    the degradation.
  - `entityRole` is validated at the parse boundary
    (`report-semantic-review.ts:1656`) but never stored or consumed after
    `report-v4-free-teaser.ts:919`, so self-consistent fabrication is
    undetectable downstream.
  - Free-path Q1 incompleteness throws `FreeTeaserQ1IncompleteError`
    classified **permanent** (`report-v4-free-teaser.ts:82-91,:748-750`)
    while the paid-path equivalent is transient with one self-correction
    (`answer-first-v3.ts:360-371,:754-762`); checkpoint-integrity guards at
    `report-v4-free-teaser.ts:815-854` still throw bare `Error`s.
  - The free deferred path never runs the mechanical language gate
    (`report-v4-free-teaser.ts:741-746` parses with `"deferred"`), so no
    `ReportLanguageValidationError` can fire there — asymmetric with the
    paid path (typed, transient per W1).
  - `estimateTokens` is a UTF-8 byte-length upper bound
    (`apps/web/src/report-v4/model-runtime-config.ts:58-68`), over-counting
    Latin prose ~4x; every `ModelTokenBudgetError` is **permanent**
    (`job-errors.ts:164-166`), so an estimation artifact terminally kills
    jobs.

### Design lock

| # | Rule |
|---|------|
| 1 | **A degraded Q1 annotation must not persist as fact.** Expose a structured degradation marker in the review output (narrow change in `report-semantic-review.ts`, instead of relying on the uninspected `reason` string); the free teaser treats a degraded Q1 annotation as a transient model-contract failure (W1 fingerprint escalation is the deterministic backstop) instead of persisting fabricated `targetPresence`/`entityRole`/`targetFirstSentence`. Paid-path review behavior unchanged. |
| 2 | **entityRole reaches the persistence boundary.** The persisted free-teaser Q1 projection carries/asserts entityRole consistency at the point of write, so a self-consistent-but-fabricated annotation cannot pass silently. No schema change; projection shape change only inside the existing persisted JSON. |
| 3 | **Free Q1 incompleteness becomes transient.** `FreeTeaserQ1IncompleteError` classification permanent -> transient (model randomness, mirroring the paid path; no correction-retry addition, no retry-count/backoff changes). The bare `Error`s in `verifyMarkedFreeTeaserDraftCheckpoint` (:815-854) become typed JobErrors — transient where the cause is model-output incompleteness, permanent invariant where internal checkpoint state is contradictory. |
| 4 | **Language gate symmetry.** The post-review applied Q1 answer text passes the existing mechanical language assertion before persistence in the free path; failure surfaces as the existing typed `ReportLanguageValidationError` (already transient per W1). Deferred-mode parse semantics otherwise unchanged. |
| 5 | **Token estimation calibrated.** Replace the pure byte-length estimator with a calibrated conservative estimator (CJK runs ~ bytes/3, Latin ~ chars/4, keeping an upper-bound bias) so Latin prose is not over-rejected ~4x; `ModelTokenBudgetError` stays permanent for genuine budget excess. Estimator/tokenizer id version bumped in place; no dependency or provider change. |

### Production allowlist (closed)

| Path | Role |
|------|------|
| `apps/web/src/worker/report-v4-free-teaser.ts` | Rules 1, 2, 3, 4 |
| `apps/web/src/worker/job-errors.ts` | Rule 3 classification mapping only if the error class alone cannot carry it |
| `apps/web/src/report-v4/model-runtime-config.ts` | Rule 5 estimator only |
| `packages/ai-report-engine/src/report-semantic-review.ts` | Rule 1 structured degradation marker exposure only — no sanitizer/review logic changes beyond surfacing the marker |
| `docs/ACTIVE-CHANGE-SCOPE.md` | This authority |

### Tests allowlist (closed)

| Path | Role |
|------|------|
| `apps/web/src/worker/report-v4-free-teaser.test.ts` and `report-v4-free-teaser-resume-harness.test.ts` | Rule assertions; scenario shapes preserved |
| `apps/web/src/worker/job-errors.test.ts` | Rule 3 classification assertions |
| `packages/ai-report-engine/src/report-semantic-review.test.ts` | Rule 1 marker assertions only |
| `apps/web/src/report-v4/model-runtime-config.test.ts` | Rule 5 calibration assertions |
| `apps/web/src/report-v4/mimo-provider.test.ts`, `apps/web/src/report-v4/mimo-site-synthesis-provider.test.ts`, `apps/web/src/worker/report-v4-website-synthesis-production.test.ts` | Amendment 2026-07-29 (user approved "批准夹具修复"): mechanical oversized-fixture resizing only, to restore the declared over-budget-rejection scenario under the rule-5 calibrated estimator; no assertion-contract weakening |

Rule 5 bookkeeping decision 2026-07-29 (user approved "保持 v1 现状"): only
`ESTIMATOR_ID` was bumped to v2 in code; the tokenizer id pinned in
`config/model-profiles/report-v4-mimo-v2.5-pro.json` stays
`mimo-v2.5-pro-utf8-conservative-v1` because the registry resolves the
estimator by that string at module init. Calibration drift remains detectable
via the bumped estimator id flowing into `resolvedProfile.operations[*].estimatorId`.

### Forbidden

- All other `packages/*` files (prompts, contract validators, model profiles, provider adapters)
- `answer-first-v3.ts` and paid V3 diagnosis behavior (W4 scope)
- Tokenizer/provider dependency additions, `max_attempts`/backoff numbers
- Market snapshots/resolver/forensics (W2, complete), commerce/refund/SLA
- Deployment, Docker, push, payments, report reruns (separate authorization)
- Replaying/mutating terminal jobs or orders

### Diff budget

- Production source: <= 200 changed lines. Hard limit.
- Tests: <= 300 changed lines (tracking bound, measured +20%).
- Docs: <= 80 changed lines.

### Acceptance checks

1. New unit tests: a degraded Q1 annotation is rejected as transient and
   never persisted as `targetMentioned:true`; entityRole consistency is
   asserted at persistence; `FreeTeaserQ1IncompleteError` and the checkpoint
   guards classify per rule 3; post-review applied text failing the language
   gate surfaces a transient `ReportLanguageValidationError`; the calibrated
   estimator stays an upper bound on mixed CJK/Latin fixtures and no longer
   ~4x-over-counts Latin prose.
2. `npm test`, `npm run lint`, `npm run build` green.
3. Deployment and any staging rerun require separate later authorization.

## Historical: Code-AI seam hardening W2 — public-source snapshot availability (APPROVED)

**Status: `APPROVED`** — user approved this written allowlist on 2026-07-29
("批准"), plus the rule-1 amendment adding `apps/web/src/db/market-snapshots.ts`
("批准修订"). Implemented and committed as `8cde23f`; acceptance checks green
(2943 tests passed, lint 0 errors, build exit 0). Deployment, staging reruns,
and the MiMo probe remain excluded and require separate later authorization.

### Baseline and evidence

- HEAD `b75b750` (W1 committed, not yet deployed; Staging Web runs `e3fe6a0`,
  Workers `staging-737ad6d-overlay-v1`).
- Parent design: session plan `shazam-stargirl-stargirl.md` (approved
  2026-07-29), workstream W2. W1 scope above is complete.
- Staging evidence:
  - job `36c78f69` (report `1940f8e8`, paid, failed @98): MiMo outage window
    from 02:47:54Z; 24/24 fanout attempts timed out (~30 s each) across 4
    retries ~2 min apart — every retry landed inside the same outage window.
    Forensics fanout identity `market-28d78e5a…` (6 queries) had **no**
    completed prior snapshot, while the same question's provider-discovery
    identity `market-8208165f…` (3 queries, a strict prefix of the 6) had
    completed snapshots at 01:14 and 02:46 that could not be reused
    (`public-source-snapshot-resolver.ts:106-111` requires exact identity +
    metadata match).
  - job `b286633f` (failed @98): `observation_persistence` privacy-trigger
    rejection retried as transient, then permanent resume-identity mismatch.
  - `market_snapshot_leases`: lease-wait deadline is 15 s
    (`public-source-snapshot-resolver.ts:97-98`) while a real refresh takes
    minutes, so retries repeatedly collide with the previous lease.
  - `public-source-execution-budget.ts:20-23` returns sub-budgets that call
    sites (`processor.ts:1230,:1389`) discard.

### Design lock

| # | Rule |
|---|------|
| 1 | **Prefix-equivalent snapshot reuse as fallback only.** When the forensics fanout's first N queries exactly match a completed provider-discovery snapshot's query set for the same question text + surface, the resolver may use that snapshot as the prior-fallback (same role as the existing prior-snapshot path). Exact-identity fresh refresh remains the primary path; reuse never crosses questions and never replaces the primary path. Metadata mismatch on an otherwise usable prior downgrades to "stale but usable" instead of forcing refresh when a refresh is impossible (provider down). |
| 2 | **Provider-down with no prior → defer, not terminal.** When `PublicSourceSnapshotUnavailableError` has no prior fallback, the job defers to a later attempt *without consuming* `phase_attempt` (new defer classification, narrow change in the attempt-accounting path), bounded by the existing hard deadline/SLA. Deterministic unavailability still fails fast per W1. |
| 3 | **Lease-wait window matches real refresh duration.** Raise the wait deadline / block-reuse while the holder is actively heartbeating, instead of failing after 15 s and colliding with the same live lease on every retry. |
| 4 | **Resume re-fetch updates checkpoint identity.** When a prior snapshot is unavailable at resume and a normal re-fetch produces new snapshot IDs, the checkpoint's snapshotIds/identity are updated to the new fetch instead of throwing `PublicSourceResumeIdentityMismatchError`. Genuine authority drift (question set, foundation hash) stays permanent. |
| 5 | **Sub-budgets are actually propagated.** `searchMs`/`retrievalMs` from the execution budget are passed into resolver/retriever per-query deadlines so a slow provider cannot consume the artifact-verification reserve. |

### Production allowlist (closed)

| Path | Role |
|------|------|
| `apps/web/src/worker/public-source-snapshot-resolver.ts` | Rules 1, 2, 3, 5 |
| `apps/web/src/worker/public-source-execution-budget.ts` | Rule 5 |
| `apps/web/src/worker/public-source-forensics.ts` | Rule 4 |
| `apps/web/src/worker/processor.ts` | Call sites for rules 2, 4, 5 only |
| `apps/web/src/db/jobs.ts` | Rule 2 defer attempt-accounting only |
| `apps/web/src/db/market-snapshots.ts` | Amendment 2026-07-29 (user approved "批准修订"): rule 1 read-only prefix-reuse lookup only — one new query function (memory + postgres paths), no schema/migration/privacy-trigger change |
| `docs/ACTIVE-CHANGE-SCOPE.md` | This authority |

### Tests allowlist (closed)

| Path | Role |
|------|------|
| Existing resolver / forensics / budget / processor test files | New rule assertions; scenario/contract shapes preserved |
| `apps/web/src/db/market-snapshots.test.ts` | Amendment 2026-07-29 (with the production amendment above): rule 1 prefix-lookup assertions only |

### Forbidden

- `packages/*` (cache-identity derivation, search orchestrator, provider adapters)
- Privacy triggers, market-table schemas/migrations, prompt/model profiles
- `max_attempts`/backoff numbers, commercial/refund/SLA logic
- Deployment, Docker, push, payments, report reruns (separate authorization)
- Replaying/mutating terminal jobs or orders

### Diff budget

- Production source: ≤ 250 changed lines. Hard limit. (Measured: 185.)
- Tests: ≤ 363 changed lines (tracking bound updated per the verification-only
  provision: measured 303 + 20% headroom).
- Docs: ≤ 80 changed lines.

### Acceptance checks

1. New unit tests: prefix-equivalent reuse is fallback-only and rejects any
   cross-question/cross-surface match; defer path does not consume
   `phase_attempt` and still fails fast on deterministic unavailability;
   lease-wait no longer fails against an actively-heartbeating holder;
   resume re-fetch updates checkpoint snapshotIds; per-query deadlines
   receive the propagated sub-budgets.
2. `npm test`, `npm run lint`, `npm run build` green.
3. `npm run public-search:probe -- --adapter mimo`, deployment, and any
   staging rerun require separate later authorization.

## Historical: Code-AI seam hardening W1 — failure-classification skeleton (APPROVED)

**Status: `APPROVED`** — user approved this written allowlist on 2026-07-29
("批准，那你都可以退回去，反正都是测试订单"). The same grant authorized
standard staging refunds for both test orders (`99cc6ddc` failed-fulfillment
refund via `commerce:staging:all`, and `9cec1db7` provider-side refund).

### Baseline and evidence

- HEAD `e3fe6a0` (Staging Web `dpl_EBTxqJ3h7w8TAUuSyqD4wvoEAV5n`; Workers
  `staging-737ad6d-overlay-v1`).
- Approved total design: session plan `shazam-stargirl-stargirl.md`
  (code–AI seam hardening, principles P1–P5, workstreams W1–W5), approved by
  the user on 2026-07-29. This scope implements **workstream W1 only**.
- Staging evidence of misclassification costs:
  - job `1afcaec2`: deterministic `input_validation/$diagnosisInput.sources`
    burned 5 transient attempts before terminal failure.
  - job `b286633f`: deterministic privacy-trigger rejection
    (`Shared market data contains private customer identity.`) retried as
    transient before hitting a permanent resume-identity error.
  - job `36c78f69`: 4 transient retries all inside one ~8-minute MiMo outage
    window, terminal @98.
- Root mechanism: `classifyUnknown` (`apps/web/src/worker/job-errors.ts:275-281`)
  defaults unknown errors to transient and classifies by English message
  keywords; orchestration guards throw bare `Error`s that inherit this
  misclassification.

### Design lock

| # | Rule |
|---|------|
| 1 | **Fingerprint escalation.** In `job-errors.ts`, when the same error fingerprint recurs in the same job+phase, classify it permanent instead of consuming further attempts. First occurrence keeps its normal classification. No change to `max_attempts` or backoff numbers. |
| 2 | **Bare orchestration `Error`s become explicit permanent `JobError`s.** Sites: `processor.ts` (:1482, :1517, :1520-1522, :1620, :2480-2481, :2502-2514, :2539-2542, :1685-1688) and `report-v4-free-teaser.ts:912-921`. Error-class replacement only; no control-flow, checkpoint, or retry-budget changes. |
| 3 | **Diagnosis-enhancer failure mapping by structured stage/code.** Extend the `job-errors.ts:193-200` handling into a full table: `input_validation`/`token_budget`/`provider_safety`/`semantic_contract`/`canonical_contract`/`correction_contract` → permanent; `provider_authentication`/`provider_configuration` → operator_repairable; provider transient stages → transient. No enhancer behavior change. |
| 4 | **Model-randomness misclassifications corrected.** Language-validation and Q1-responsiveness failures (`answer-first-v3.ts:754-762` wrapper; `job-errors.ts:107,114-117`) become transient instead of operator_repairable. |
| 5 | **`mimo_output_truncated` unified.** One rule everywhere: at most one in-flight retry (sampling variance), job-level transient, and rule 1's fingerprint escalation as the deterministic backstop. Align `mimo-provider.ts:57-63` and `:649-657` to that rule. |

### Production allowlist (closed)

| Path | Role |
|------|------|
| `apps/web/src/worker/job-errors.ts` | Rules 1, 3, 4 |
| `apps/web/src/worker/processor.ts` | Rule 2 error-class replacements only |
| `apps/web/src/worker/report-v4-free-teaser.ts` | Rule 2 error-class replacements only |
| `apps/web/src/worker/answer-first-v3.ts` | Rule 4 wrapper only |
| `apps/web/src/report-v4/mimo-provider.ts` | Rule 5 mapping only |
| `docs/ACTIVE-CHANGE-SCOPE.md` | This authority |

### Tests allowlist (closed)

| Path | Role |
|------|------|
| `apps/web/src/worker/job-errors.test.ts` | Rules 1, 3, 4, 5 classification assertions |
| `apps/web/src/worker/report-v4-free-teaser.test.ts` | Rule 2 error-class assertions |
| Existing answer-first / mimo-provider / processor test files | Assertions updated to the new classifications only; no scenario or contract changes |

### Forbidden

- `packages/*` contract validators, prompts, model profiles
- Snapshot resolver, market-snapshot tables, privacy triggers (W2/W5 scopes)
- Retry-budget numbers (`max_attempts`, backoff intervals), defer semantics (W2)
- Commerce, refund, SLA, deployment, Docker, push, payments, report reruns
- Replaying/mutating terminal jobs or orders

### Diff budget

- Production source: ≤ 200 changed lines. Hard limit.
- Tests: ≤ 300 changed lines (tracking bound, measured +20%).
- Docs: ≤ 80 changed lines.

### Acceptance checks

1. New unit tests: fingerprint escalation (first occurrence transient, second
   occurrence permanent, no further attempts consumed); each converted guard
   throws a permanent typed `JobError`; enhancer stage/code mapping matches
   the rule-3 table; language/responsiveness failures classify transient;
   truncated mapping unified.
2. `npm test`, `npm run lint`, `npm run build` green.
3. Deployment and any staging rerun require separate later authorization.

## Historical: Vercel serverless DB cold-start resilience (APPROVED)

**Status: `APPROVED`** — user approved this written allowlist and its
acceptance plan on 2026-07-28 ("批准并部署冷启动修复"), including Staging
deployment of the Web function changes below. Live evidence at approval time:
Sandbox order `9cec1db7` was `SUCCEEDED` at Airwallex (23:50:09Z) but two
webhook deliveries (07:50:10, 08:00:19) reached the function with zero
`payment_events` rows, and order-status polling lambdas were erroring
("自动更新已暂停") — the cold-start crash pattern below, now blocking the
737ad6d paid acceptance.

### Baseline and evidence

- Staging runs `737ad6d` (Web `dpl_Bfp5XRzUYhmhUNcStAyRwh2Auu6q`, alias
  `open-geo-console-staging-itheheda.vercel.app`, functions in `sin1`).
- Vercel runtime logs 2026-07-28 17:51 CST (twice): lambdas die on cold start
  with `An error occurred while loading instrumentation hook:
  write CONNECT_TIMEOUT ep-broad-sky-aoslq8jq-pooler.c-2.ap-southeast-1.aws.neon.tech:5432`
  → `Node.js process exited with exit status: 128`.
- User-visible result: report pages show "This page couldn't load / A server
  error occurred"; order-status polling pauses ("自动更新已暂停") leaving stale
  "全额退款已提交，正在等待支付机构确认" copy, although DB shows refund
  `acbab8a5` **succeeded** and order `1dd58782` `refund_status=refunded` at
  2026-07-28T07:35:31Z.
- DB proof the unlock click never reached `createPaymentOrder`: zero
  `payment_orders` rows after 07:35:31Z.
- Database is healthy: staging worker container connects in ~460 ms; the Neon
  pooler hostname resolves 3×AAAA + 3×A and both families are reachable from
  the user network. Neon sits in `ap-southeast-1`, same region as the lambdas.
- Root-cause hypothesis: Node ≥17 default verbatim DNS order can pick a AAAA
  record first on a cold start; Vercel serverless functions have no IPv6
  egress, so the TCP connect blackholes until the 10 s `connect_timeout`.
  Intermittency matches per-cold-start DNS answer ordering. Amplifier:
  `instrumentation.register()` awaits `ensureDatabase()` uncaught, so one
  failed connect kills the entire lambda (exit 128) instead of failing one
  request.

### Design lock

| # | Rule |
|---|------|
| 1 | **Force IPv4 for DB connections.** Call `dns.setDefaultResultOrder("ipv4first")` inside `getDb()` in `apps/web/src/db/index.ts` before creating the postgres client. No connection-string, env, or Neon-side change. |
| 2 | **Instrumentation must not kill the lambda.** Wrap the `ensureDatabase()` await in `apps/web/src/instrumentation.ts` in try/catch that logs the error and returns; request handlers keep their own error paths. No retry/backoff machinery. |
| 3 | No changes to Neon env values, Vercel project settings, commerce/refund logic, UI copy, or worker code. No new dependency. |

### Production allowlist (closed)

| Path | Role |
|------|------|
| `apps/web/src/db/index.ts` | ipv4first DNS result order before client creation (rule 1) |
| `apps/web/src/instrumentation.ts` | try/catch around cold-start ensureDatabase (rule 2) |
| `docs/ACTIVE-CHANGE-SCOPE.md` | This authority |

### Tests allowlist (closed)

No new unit tests: rule 1 is a one-line Node DNS directive and rule 2 is a
log-and-continue guard; both are verified through the staging acceptance
window below. Existing suites must stay green.

### Forbidden

- Neon console/env value changes, Vercel project setting changes
- Switching DB drivers (e.g. Neon serverless HTTP) — that is a separate scope
- Commerce, refund, UI copy, worker, or prompt changes
- Replaying/mutating terminal jobs or orders

### Diff budget

- Production source: ≤ 20 changed lines. Hard limit.
- Docs: ≤ 60 changed lines.

### Acceptance checks

1. `npm test`, `npm run lint`, `npm run build` green.
2. Deploy to Staging (Vercel Web only; worker image untouched), then a
   30-minute observation window with user browsing and **zero**
   `CONNECT_TIMEOUT` / exit-128 events in Vercel logs.
3. User completes the unlock checkout: a new `payment_orders` row appears and
   the hosted checkout opens. The fresh paid validation run itself remains
   governed by the previously authorized validation grant.

## Historical: Paid V3 diagnosis input boundary adaptation (APPROVED)

**Status: `APPROVED`** — user approved this written allowlist and, in the same
grant (2026-07-28: "全部授权"), authorized implementation, commit + push,
Staging redeployment (Vercel Web + Docker overlay Workers), refund submission
via the standard staging commerce reconciliation for any newly failed paid
order, and one fresh paid validation run (new Sandbox payment by the user).

### Baseline and evidence

- HEAD `07ebd3f`; Staging runs `07ebd3f` (Web `dpl_GGYdPG8SdsGGsGuoRHwW17uTinCe`
  + Workers `staging-07ebd3f-overlay-v1`, schema V44 applied).
- Failed paid deep job `1afcaec2-a91d-497d-b04d-076b94054799` (report
  `fe9ca07b`, order `1dd58782`, Sandbox paid): 5 attempts, all
  `stage=input_validation; code=invalid_input; parserPath=$diagnosisInput.sources`
  for `question-0d4bee4d…`, terminal `unexpected_internal_error` at 95.
- DB proof: the question's persisted answer card carries **20 sources**
  (`mimo-annotation-1…20`, no `retrievalStatus` field), while
  `parseReportV4DiagnosisInput` (`packages/ai-report-engine/src/report-v4-diagnosis.ts:137`)
  allows at most `REPORT_V4_MAX_DIAGNOSIS_SOURCES` (5) and requires
  `retrievalStatus ∈ {not_checked, available, inaccessible}`.
- Same root cause as job `5dbaea88` attempt 1 this morning (message then had
  no detail; the failure-transparency fix in `debe66e` exposed it now).

### Design lock

| # | Rule |
|---|------|
| 1 | **Boundary adaptation, not contract loosening.** In `enhanceReportV4QuestionDiagnosis` (`apps/web/src/worker/report-v4-diagnosis-enhancer.ts`), before calling `parseReportV4DiagnosisInput`, normalize `input.question.sources`: keep at most `REPORT_V4_MAX_DIAGNOSIS_SOURCES` entries in their existing order (provider result order), and default a missing/blank `retrievalStatus` to `"not_checked"`. The validator contract itself is unchanged and stays fail-closed. |
| 2 | **Deterministic input-validation failures are permanent.** Register the diagnosis enhancer's `stage=input_validation` failure as `permanent` in the job-error taxonomy so a deterministic contract violation fails fast instead of burning all retries against the 24h SLA clock. Message/classification mapping only; no behavior change to the enhancer result shape. |
| 3 | Customer-facing report content is untouched: the answer card keeps all 20 sources for rendering; the cap applies only to the diagnosis provider input. |

### Production allowlist (closed)

| Path | Role |
|------|------|
| `apps/web/src/worker/report-v4-diagnosis-enhancer.ts` | Source cap + retrievalStatus default (rule 1) |
| `apps/web/src/worker/job-errors.ts` | input_validation → permanent mapping (rule 2) |
| `docs/ACTIVE-CHANGE-SCOPE.md` | This authority |

### Tests allowlist (closed)

| Path | Role |
|------|------|
| `apps/web/src/worker/report-v4-diagnosis-enhancer.test.ts` | >5 sources → capped and completes; missing retrievalStatus → defaults; duplicate/invalid source content still fails closed |
| `apps/web/src/worker/job-errors.test.ts` | input_validation classification permanent |

### Forbidden

- Changing `packages/ai-report-engine` validator contracts or the 5-source limit
- Replaying/mutating terminal jobs `1afcaec2`, `b286633f`, `5dbaea88` or their orders
- Refund/SLA/commerce logic, prompts/model profiles, answer-card rendering
- Deploy / Docker / push / new payment runs without separate authorization

### Diff budget

- Production source: ≤ 100 changed lines. Hard limit.
- Tests: ≤ 200 changed lines (tracking bound, measured +20%).
- Docs: ≤ 60 changed lines.

### Acceptance checks

1. New unit tests: 20-source question (mirroring `question-0d4bee4d` shape)
   passes diagnosis input validation after the cap; missing retrievalStatus
   defaults to `not_checked`; genuinely invalid sources still throw.
2. `npm test`, `npm run lint`, `npm run build` green.
3. Deploy + fresh paid validation (new Sandbox payment) require separate
   later authorization.

## Historical: Paid deep resume identity + shared-market guard (APPROVED, implemented)

**Status: `APPROVED`** — user approved this written allowlist (2026-07-28: "批准").
Implement only within the closed allowlists and budgets below. Deploy, Docker,
commit/push, and any new paid validation run require separate later authorization.

### Baseline and evidence

- HEAD `debe66e` (local dirty tree may also hold the unfinished reissue WIP under
  historical authority; that WIP is **out of this scope** and must not be
  expanded or committed here).
- Failed paid deep job `b286633f-28bd-4950-bc08-1c1375e4d754`
  (report `64c7d182-97cc-4cc6-983a-ebf6d65d0a57`, order `11a43674…`):
  1. Attempt 1: provider discovery reached `phase=complete`; public-source
     forensics failed at `observation_persistence` with
     `Shared market data contains private customer identity.` (V42 guard
     matching `identityExclusions` such as brand/domain inside SERP
     title/snippet). Classified **transient**.
  2. Attempt 2: `ProviderDiscoveryResumeIdentityMismatchError` —
     `websiteFoundationHash` recomputed from DB-loaded foundation
     (`baef51a8…`) ≠ checkpoint (`ad62a851…`). Classified **permanent** →
     terminal fail at progress 98.
- Design intent of shared-market isolation remains valid for **our authored**
  query/question text. Applying brand `identityExclusions` to third-party SERP
  result bodies is product-incorrect and causes false permanent-path retries.

### Design lock

| # | Rule |
|---|------|
| 1 | **Frozen resume identity for provider discovery.** When a prior `providerDiscovery` checkpoint exists on the job, the pipeline run identity MUST be taken from that checkpoint’s identity fields (including `websiteFoundationHash` and `evidenceCutoffAt`), not recomputed from live `JSON.stringify(websiteFoundation)`. Fresh runs (no prior checkpoint) still build identity from current inputs. Real authority/model/policy changes on a **new** job remain free to form a new identity; mid-job resume must not self-invalidate completed stages. |
| 2 | **Stable foundation hash on first write.** Fresh `websiteFoundationHash` MUST use a deterministic canonical JSON serialization (sorted object keys, stable array order as-is) before SHA-256, applied consistently at the provider-discovery and public-source-forensics call sites that currently use raw `JSON.stringify`. |
| 3 | **Shared-market identity guard V44 (function replace only).** Replace `ogc_reject_private_identity_in_shared_market_data` so that: (a) **query-side** tables `market_snapshot_questions` / `market_snapshot_queries` still reject `order_id`, `report_id`, private≠neutral question text, and `identityExclusions` in the same field surfaces V42 already scans for those tables; (b) **result-side** tables `market_search_observations`, `market_source_evidence`, `market_source_passages`, `market_provider_claims`, and `market_search_attempts` reject only `order_id` and `report_id` (and private≠neutral question text if present in the scanned fields) — **not** brand/domain `identityExclusions`. No table/column/index DDL. Trigger names and attachment tables unchanged. |
| 4 | **No job replay / no historical mutation.** Do not repair, replay, or re-terminalize job `b286633f` or order `11a43674`. No refund/SLA/commerce changes. No deploy/Docker/push in this scope. |

### Production allowlist (closed)

| Path | Role |
|------|------|
| `apps/web/src/worker/processor.ts` | Resume: pass frozen provider-discovery identity when checkpoint exists; stable foundation hash for fresh runs |
| `apps/web/src/worker/provider-discovery-pipeline.ts` | Optional small helper to extract identity from checkpoint (only if needed to keep processor thin) |
| `apps/web/src/worker/public-source-forensics.ts` | Stable foundation hash; when prior forensics checkpoint exists, compare using that checkpoint’s `websiteFoundationHash` / freeze resume identity the same way |
| `apps/web/src/db/migrations.ts` | Add `V44_DATABASE_MIGRATIONS` function replace + wire into migration list |
| `apps/web/src/db/index.ts` | `DATABASE_SCHEMA_VERSION = 44` |
| `docs/ACTIVE-CHANGE-SCOPE.md` | This authority |

### Tests allowlist (closed)

| Path | Role |
|------|------|
| `apps/web/src/worker/provider-discovery-pipeline.test.ts` | Resume with prior checkpoint ignores recomputed foundation hash drift when identity is frozen from checkpoint (via production wiring test or pipeline identity input) |
| `apps/web/src/worker/processor.test.ts` and/or new focused unit test under `apps/web/src/worker/` | Fresh vs resume identity construction for provider discovery |
| `apps/web/src/db/schema-v44.postgres.test.ts` (new) | Query-side still rejects exclusion brand in `normalized_question`/`query_text`; result-side allows brand in title/snippet/excerpt; still rejects order/report id leakage |
| `apps/web/src/db/index.test.ts` | Schema version 44 + `databaseMigrationsAfter` chain |
| `apps/web/src/db/schema-v42.postgres.test.ts` | Only if required for version-chain bookkeeping comments; prefer not to weaken V42 historical assertions—V44 tests carry the new contract |

### Forbidden

- Touches to `commercial-orders.ts` / reissue WIP (user-owned dirty files)
- Refund, SLA, commerce reconciliation, email, checkout UI/routes
- Replaying or mutating job `b286633f`, order `11a43674`, report `64c7d182`
- Broad `docker system prune`, production deploy, new paid Sandbox run
- Softening query-side exclusion checks (questions/queries must still strip brands)
- LLM-based privacy judgment
- Changing permanent/transient taxonomy tables beyond what falls out of the above (no drive-by job-errors rewrite unless a single-line mapper is required by a new typed error—prefer none)

### Diff budget

- Production source: ≤ 220 changed lines. Hard limit.
- Tests: ≤ 280 changed lines (tracking bound, measured +20%).
- Docs: ≤ 80 changed lines.

### Acceptance checks

1. Unit: provider-discovery resume with prior complete/partial checkpoint succeeds when live foundation JSON hash would differ but checkpoint identity is reused.
2. Postgres V44: observation title containing a known `identityExclusions` brand is **accepted**; normalized_question containing the same brand is **rejected**; observation containing a `report_id` UUID substring still **rejected**.
3. `npm test`, `npm run lint`, `npm run build` green.
4. Deploy / re-run of a paid deep job requires a **separate** later authorization.

**Deployment authorization (2026-07-28: "确认 授权"):** user authorized
commit + push of this fix **and** the historical question-set reissue fix
(two separate commits), Staging redeployment (Vercel Web + Docker overlay
Workers), submission of the pending refund for order `11a43674` via the
standard staging commerce reconciliation (Sandbox), and one fresh paid
validation run (user unlocks report `45a6f76a` via the reissue path).
Terminal jobs `b286633f` / `5dbaea88` remain untouched.

## Historical: Re-checkout after terminal refund via question-set reissue (APPROVED, WIP outside this lock)

**Status: `APPROVED` historically** — user approved (2026-07-28: "批准方案B的修改").
Local dirty files `commercial-orders.ts` + reissue test may remain user/agent WIP
but are **not** authorized by the current FROZEN section above.

### Baseline and evidence (historical)

- Report `45a6f76a` re-checkout blocked by locked question set on terminal-refunded order.

### Design lock (historical)

Reissue confirmed question-set revision on terminal-refunded binding only; no
schema change; no mutation of refunded order.

## Historical: Paid V3 forensics resume identity and failure transparency (APPROVED, implemented)

**Status: `APPROVED`** — user approved this written allowlist (2026-07-28:
"可以，开始修复"). Implement only within the closed allowlists and budgets
below. Deploy, Docker, commit/push, and any new paid validation run require
separate later authorization.

### Baseline and evidence

- HEAD `fc07129`; Staging runs `fc07129` (Web `dpl_J5duwNJsWFdscmus2FadA4gLB98f`
  + Workers `staging-fc07129-overlay-v1`).
- Failed paid job `5dbaea88-0f56-49c0-a9f5-f831f75a1549` (report `45a6f76a`),
  terminal `unexpected_internal_error` at progress 95 after 3 attempts:
  - Attempt 1: `Paid V3 per-question diagnosis did not complete.`
    (`processor.ts:2478`), real `result.failure{stage,code,parserPath}` discarded.
  - Attempts 2–4: `PublicSourceResumeIdentityMismatchError`
    (`public-source-forensics.ts:102`), empty message normalized to
    "Unexpected internal error.", misclassified transient.
  - DB proof: `publicSourceForensics.evidenceCutoffAt=2026-07-28T03:38:01.387Z`
    while self-collected `snapshot-e747…` has `completed_at=03:40:03` (after
    the cutoff), so `findExactMarketSnapshot`'s `completed_at <= cutoff`
    filter excludes the job's own product on every retry → new snapshotId →
    deterministic identity mismatch. Deferred mode also lacks
    `prepareArtifactVerification` (`processor.ts:1924`), so retries always
    re-run the forensics pipeline.
  - `diagnosisByQuestion` checkpoint empty: attempt 1 died before any
    per-question diagnosis persisted; its true cause is unknowable until
    failure detail is preserved (fix 3).

### Design lock

| # | Fix | Rule |
|---|-----|------|
| 1 | Forensics resume | When a prior forensics checkpoint exists, resolve its persisted `snapshotIds` by exact ID first; only re-collect snapshots whose exact ID is missing or not completed. No behavior change on the first (no-prior) run. The identity-mismatch guard stays fail-closed for genuine drift. |
| 2 | Error taxonomy | Register `PublicSourceResumeIdentityMismatchError` in the typed boundary mapping as `permanent` (mirroring the provider-discovery mismatch mapping), so genuine drift fails fast instead of 3 pointless retries. |
| 3 | Diagnosis failure transparency | `processor.ts:2477-2478` must preserve `result.failure` detail (questionId, stage, code, parserPath, failureReason where present) in the thrown error message; no behavior/classification change beyond message content. |

### Production allowlist (closed)

| Path | Role |
|------|------|
| `apps/web/src/worker/public-source-forensics.ts` | Exact-ID snapshot resume (fix 1) |
| `apps/web/src/worker/job-errors.ts` | Register mismatch error as permanent (fix 2) |
| `apps/web/src/worker/processor.ts` | Preserve diagnosis failure detail (fix 3) |
| `docs/ACTIVE-CHANGE-SCOPE.md` | This authority |

### Tests allowlist (closed)

| Path | Role |
|------|------|
| `apps/web/src/worker/public-source-forensics.test.ts` (or the existing forensics/resume test file if named differently) | Resume-by-exact-ID: fresh self-collected snapshot is reused, no mismatch throw |
| `apps/web/src/worker/job-errors.test.ts` | Mismatch → permanent |
| `apps/web/src/worker/processor.test.ts` | Diagnosis incompletion error carries failure detail |

### Forbidden

- Historical job repair/replay/clone; the failed job `5dbaea88` stays terminal
- Paid `report_global_v1` semantic review behavior; Free V4 review code
- Deploy / Docker / push / any new payment or validation run
- DB schema, commerce, refund logic, cutoff semantics for first runs,
  snapshot-collector behavior, prompt or model-profile changes

### Diff budget

- Production source: ≤ 200 changed lines. Hard limit.
- Tests: ≤ 300 changed lines (tracking bound, may update to measured +20%).
- Docs: ≤ 70 changed lines.

### Acceptance checks

1. New unit tests: (a) forensics resume reuses exact prior snapshot IDs even
   when their `completed_at` is after `evidenceCutoffAt` — no throw;
   (b) genuine identity drift still throws and maps to permanent;
   (c) diagnosis incompletion error message contains questionId/stage/code.
2. `npm test`, `npm run lint`, `npm run build` green.
3. Deploy and a fresh paid validation run (new Sandbox payment) require
   separate later authorization.

**Deployment authorization (2026-07-28: "三项都同意"):** user authorized
commit + push of this fix, Staging redeployment (Vercel Web + Docker overlay
Workers, same procedure as the `fc07129` deployment), and one fresh paid
validation run (user performs a new Sandbox unlock; the terminal failed job
`5dbaea88` is not replayed and its refund flow is untouched).

## Historical: Free V4 semantic review graceful degradation (APPROVED, implemented)

**Status: `APPROVED`** — user approved this written allowlist (2026-07-27:
"同意"). Implement only within the closed allowlists and budgets below.
User later authorized commit + push + Staging Gates 1–3 deployment + one
Gate 4 real-flow run (2026-07-27: "123"), lineage: wholly new submitted URL →
Foundation → Free V4 → Q1 answer/diagnosis → semantic receipt (the
v4_pre_admission deep lane; no Sandbox payment in this authorization).

### Baseline

- HEAD `9849d23`; Staging runs `8c9e375` (Web `dpl_FqrnykugzZSgEBdyM5JG5hQL4Vwn`
  line + Workers `staging-8c9e375-overlay-v1`).
- Gate 4 evidence: job `729674de-33ee-4312-afb5-36e18b857898` failed
  `semantic_review_evidence_missing` (permanent) at
  `$reviewOutput.fields[17]` on 2026-07-27 15:32:09 UTC — the global-policy gate
  is gone, the failure moved to a field-local non-empty-allowlist field.
- Full gate enumeration of the review chain: 60+ throw points; six real
  failures (truncation, disallowed subset ref, blank correctedText, global and
  local missing refs, invalid response) all at A/B-class gates, none at C-class
  code invariants.

### Problem (first principles)

The review contract treats a stochastic model as a deterministic function:
success = product of ~300 per-gate pass probabilities. Log-driven fixes only
move the failure to the next gate. Structural faults:

1. Class A gates force the model to echo information code already holds
   (path, originalTextHash, IDs, order, coverage).
2. Error classification is inverted: deterministic contract violations are
   `transient` (6 backoff retries × ~6.5 min each); truncation that could
   benefit from retry is `permanent`; assembly "missing" messages
   misclassify to `operator_repairable`.
3. Fail-closed is applied to a prose-polish step: any single field's
   bookkeeping slip, or the model self-reporting `blocked`, kills the whole
   job (`report-semantic-review.ts:824`).

### Design lock

| Layer | Rule |
|-------|------|
| C-class code invariants (input-side `parseInputCore`, ID existence/uniqueness, hash recompute, mutability at apply, receipt/ready re-validation) | **Unchanged, fail-closed** |
| Paid V3 `report_global_v1` (global=true) path | **Unchanged** |
| Free V4 (global=false) field-level A/B gates | **Degrade, never throw**: invalid field entry is replaced by a code-synthesized `pass` entry (original text, manifest path/hash, empty issueCodes); evidence/source refs are code-mounted from the field allowlist ∩ ownership-compatible IDs, never model-echoed |
| Model self-reported `blocked` (Free) | Degrades to per-field `pass`; `overallDecision` is recomputed by code from sanitized decisions; blocked never kills a Free job |
| Free batch assembly | Missing fields are filled with synthesized `pass` entries; duplicate paths first-wins; unknown entries dropped |
| Structurally unparseable output (no fields array / not JSON) | Stays an error → `transient` retry (genuine transport/model failure) |
| `mimo_output_truncated` | Reclassified `permanent` → `transient` (batch-splitting already reduced size; retry may succeed) |
| Worker Q1 semantic gates (`report-v4-free-teaser.ts:912-921`) | Unchanged this scope (accepted residual, transient-retried) |
| Sparse/minimal output redesign (prompt rewrite) | **Explicit non-goal**, deferred |

Result guarantee: Free semantic review is an enhancement lane. Worst outcome
is per-field fallback to original prose; it can never terminalize a job.

### Production allowlist (closed)

| Path | Role |
|------|------|
| `packages/ai-report-engine/src/report-semantic-review.ts` | Free (global=false) parse path: per-field sanitize/degrade, code-mounted refs, assembly tolerance, recomputed overallDecision; Paid path untouched |
| `apps/web/src/worker/job-errors.ts` | `mimo_output_truncated` → transient; keep other mappings |
| `docs/ACTIVE-CHANGE-SCOPE.md` | This authority |

### Tests allowlist (closed)

| Path | Role |
|------|------|
| `packages/ai-report-engine/src/report-semantic-review.test.ts` | Degradation tests per historical failure class |
| `apps/web/src/worker/job-errors.test.ts` | Truncation reclassification |
| `apps/web/src/worker/report-v4-free-teaser.test.ts` | Only if Free review fakes need alignment |

### Forbidden

- Paid V3 / global=true behavior change
- Prompt or output-format redesign (sparse output)
- Historical job repair/replay; deploy / Docker / Gate 4 (separate authority)
- DB schema, commerce, crawler, deployment, worker Q1 gates, error taxonomy
  beyond the two named mappings

### Diff budget

- Production source: ≤ 300 changed lines. Hard limit.
- Tests: ≤ 400 changed lines (tracking bound, may update to measured +20%).
- Docs: ≤ 60 changed lines.

### Amendment: marker-forwarding fix for the report page loader (APPROVED)

User approved (2026-07-28: "可以，开始修复") a post-Gate-4 latent bug fix plus
commit, push, and Staging redeploy of the same lineage. Gate 4 job
`57c1a65d` completed the first ever marker-present ready checkpoint, which
exposed that `loadConfirmedFreeTeaserQuestionSet`
(`apps/web/src/worker/report-v4-free-teaser.ts:1224`) re-parses the checkpoint
without forwarding `semanticReviewContractVersion`, crashing SSR at
`apps/web/src/app/[locale]/reports/[id]/page.tsx:114` with
`Free teaser ready checkpoint does not match root semantic-review lineage.`

Additional allowlist (closed):

| Path | Role |
|------|------|
| `apps/web/src/worker/report-v4-free-teaser.ts` | Accept + forward the parse options in `loadConfirmedFreeTeaserQuestionSet` |
| `apps/web/src/app/[locale]/reports/[id]/page.tsx` | Pass the already-read marker into the loader |
| `apps/web/src/worker/report-v4-free-teaser.test.ts` | Marker-present ready checkpoint loads through the loader |

Budget: production ≤ 30 changed lines; tests ≤ 60 changed lines. Deploy:
commit + push + Staging Gates 1–3 redeploy (thin overlay) is authorized;
rollback identities remain the `22ab4fb` Web deployment and
`staging-22ab4fb-overlay-v1` Worker image. No new Gate 4 run is required;
acceptance is the existing report `45a6f76a` rendering without SSR error.

### Acceptance checks

1. New unit tests replay each historical Free failure class (local missing
   refs; subset violation; blank correctedText; self-reported blocked;
   missing batch fields) and assert per-field degradation, code-mounted refs,
   recomputed overallDecision, and successful apply — no throw.
2. Paid `report_global_v1` tests unchanged and green.
3. `npm test`, `npm run lint`, `npm run build` green.
4. Deploy and a fresh Gate 4 real run require separate later authorization.

## Historical: Free V4 field-local evidence re-anchor (APPROVED, implemented)

**Status: `APPROVED`** — user directed implementation (2026-07-27): keep code
to deterministic work only; model owns analysis/judgment; stop Free V4 from
forcing Paid-style `report_global_v1` on multi-domain teaser prose.

### Problem (first principles)

Marker-present Free V4 mixed two designs:

1. **Code-only analysis era** — program tried to force “analysis complete”
   with deterministic gates.
2. **Model analysis era** — model writes/reviews prose, but Free still applied
   Paid’s `report_global_v1`: every non-blocked field/answer/evidenceUse must
   cite a report-wide search catalog.

Free catalog is Q1 sources + limited target page slices. Foundation and
question texts are **not** authored from that catalog. Result: model often
returns empty refs → permanent `semantic_review_evidence_missing` (seen on
Staging job `2ca2ee66-…` after batching cleared `mimo_output_truncated`).

### Design lock (closed)

| Layer | Owner | Free V4 rule |
|-------|--------|--------------|
| Materials, IDs, schema, ownership, hashes | Code | Deterministic only |
| Language, diagnosis meaning, faithfulness | Model | Analysis only |
| Evidence binding | Field-local allowlists | Non-empty allowlist ⇒ at least one accepted ref on non-blocked **field** result; empty allowlist ⇒ **no** ref required |
| Free `evidencePolicy` | **Omit** | Free must **not** set `report_global_v1` |
| Paid V3 | Unchanged | Keeps `report_global_v1` |

Domain expectation for Free manifests (already reflected in field seeds):

- `foundation.*` / `questions[*].text`: empty allowlists → language review only
- `q1AnswerCard.answerText` / `q1Diagnosis.*`: Q1/diagnosis allowlists → local
  fail-closed when model omits refs on non-blocked fields

Batching (prior scope) remains the Free generation shape. This scope does not
re-open maxOutputTokens, historical job repair, deploy, or Gate 4.

### Objective

1. Remove Free teaser `evidencePolicy: "report_global_v1"` so Free uses
   field-local allowlists and legacy field result schema (no forced
   rejectedEvidence/rejectedSources global shape).
2. Map non-empty local allowlist + empty field refs (non-blocked) to typed
   `ReportSemanticReviewEvidenceMissingError` with local reason (permanent),
   not a bare TypeError → `unexpected_internal_error`.
3. Update Free unit tests and review fakes for field-local refs; keep Paid and
   optional Free+global unit coverage for `report_global_v1`.

### Production allowlist (closed)

| Path | Role |
|------|------|
| `apps/web/src/worker/report-v4-free-teaser.ts` | Drop Free `evidencePolicy`; brief domain comment |
| `packages/ai-report-engine/src/report-semantic-review.ts` | Local empty-ref typed error; blocked exemption parity |
| `docs/ACTIVE-CHANGE-SCOPE.md` | This authority |

### Tests allowlist (closed)

| Path | Role |
|------|------|
| `apps/web/src/worker/report-v4-free-teaser.test.ts` | Field-local Free expectations + fake review refs |
| `packages/ai-report-engine/src/report-semantic-review.test.ts` | Local allowlist missing-ref typed error if needed |
| `apps/web/src/worker/job-errors.test.ts` | Only if reason/message mapping needs it |

### Forbidden

- Paid V3 behavior change
- Historical job repair/replay
- Deploy / Docker / Gate 4 without separate authority
- Weakening ID existence / ownership / receipt / hash gates
- Silent program rubber-stamp of first global source onto all fields
- New dependencies / schema migrations
- UI / commerce / production env mutation

### Diff budget

| Surface | Budget |
|---------|--------|
| Production allowlisted | max `+80` / `-40` |
| Tests allowlisted | max `+120` / `-60` |
| External expensive actions | `0` |

### Verification

```text
npx vitest run packages/ai-report-engine/src/report-semantic-review.test.ts apps/web/src/worker/report-v4-free-teaser.test.ts apps/web/src/worker/job-errors.test.ts
npm run lint
```

Acceptance:

1. Free review input has **no** `evidencePolicy` / not `report_global_v1`.
2. Free answer/diagnosis fields retain **non-empty** local allowlists where
   seeded; foundation/questions keep empty allowlists.
3. Blueprint `referenceRequirement` is `none` or `at_least_one_exact_local_id`
   for Free (not global).
4. Paid V3 still builds with `report_global_v1`.
5. Empty refs on Free foundation pass; empty refs on Free Q1 answer field with
   allowlist fail typed evidence-missing.

### Baseline / Staging deploy (user-authorized 2026-07-27)

- Feature commit: `8c9e375577876f60522d7087de9e3e751bc4cf01` on `origin/main`
- Thin Worker overlay: `open-geo-console:staging-8c9e375-overlay-v1`
  (base full `staging-330b27a…-full-v1`; rollback image `staging-7b44722-overlay-v1`)
- Web Preview: `dpl_Ab3KjkHnC5uKv842wpseMpvBK3Lz` → fixed alias
  `https://open-geo-console-staging-itheheda.vercel.app`
- Gate 3 catalog read-only: `mode=test`, CNY/USD/HKD prices present
- **Gate 4 real-flow not authorized**

---

## Historical — Free V4 semantic review batching (completed; not current)

**Status: implemented + Staging Gates 1–3** — user approved ("同意") and
deployed candidate `7b44722b819a5ab20853ca1c666b1bdde9951fe3` (2026-07-27).
**Gate 4 not authorized under that scope.**

### Problem (evidence-backed; not an estimate)

Staging job `c9a11e40-e2b7-480f-9cde-473a96c890ac` (report
`8fee4621-8147-47d0-87c0-bdd5772ae887`, host `shun-express.com`):

1. Free foundation completed.
2. Free V4 teaser reached `q1_answer_ready` with Q1 draft + diagnosis draft +
   three observation snapshots.
3. Failed in `reviewFreeTeaser` → `runOfflineReportSemanticReview` → MiMo
   structured invoke with `operation: "websiteSynthesis"`.
4. Durable error: `ReportV4MimoProviderError` / job code `mimo_output_truncated`
   / classification **permanent**, from `assertFinishReasonAllowed` when
   provider `finish_reason === "length"`.
5. Stack proves failure **before** field-contract parse /
   `semantic_review_evidence_missing`.
6. Current contract forces **one** model call to return the **complete**
   review JSON skeleton (all fields + questionDistinctness + all annotation
   arrays + overallDecision). That monolithic output shape is the structural
   hazard; **token estimation is not an acceptance method and must not be
   used as root-cause authority or gate.**

This scope does **not** claim a single ultimate root cause of all historical
96% failures. It fixes the Free V4 review generation shape so completion
truncation on one mega-JSON is no longer the only path.

### Objective

Replace Free V4 **single-shot** `unified_report_semantic_review` generation
with **structure-based multi-invoke batches**, then **programmatically merge**
into one `ReportSemanticReviewOutput` that still passes the existing
`parseReportSemanticReviewOutput` + `applyReportSemanticReview` + receipt
gates unchanged in meaning.

**Do not** use token/character estimation as a design driver, budget gate, or
acceptance criterion.

### Required batch design (closed)

Batches are defined by **contract slots and manifest structure**, not size:

| Batch ID | Model produces | Coverage rule |
|----------|----------------|---------------|
| `B_fields_readonly` | `fields` subset | Exactly the Free V4 input fields with `mutability === "read_only"`, input order preserved among themselves |
| `B_fields_mutable` | `fields` subset | Exactly the Free V4 input fields with `mutability === "mutable"`, input order preserved among themselves |
| `B_obs` | `annotations.observationResults` | Exactly `input.observationResults`, input order |
| `B_answers` | `annotations.answers` | Exactly `input.answerSubjects`, input order (Free V4: one Q1 subject) |
| `B_evidence_use` | `annotations.evidenceUse` | Exactly `input.fields`, input order |

**Program-owned after batches (no model inventing overall):**

- Reassemble `fields` in **full input.fields order** from the two field
  batches.
- Reassemble `annotations` object.
- Derive `questionDistinctness` and `overallDecision` with the **same rules
  already enforced by the parser** (distinct/duplicate/blocked;
  blocked/corrected/pass from field and answer decisions). If a pure function
  for overall decision already exists in
  `packages/ai-report-engine`, reuse it; if not, extract the existing
  `deriveOverallDecision` (or equivalent) without changing semantics.
- Set `version`, `inputHash`, `providerId`, `modelId` from input authority
  (copy, never invent).

**Merge then validate once** with existing
`parseReportSemanticReviewOutput(merged, fullInput)` (or an internal merge
helper that ends in that parser). No weakening of
`report_global_v1` evidence fail-closed rules.

### Free-teaser integration

- `reviewFreeTeaser` in `report-v4-free-teaser.ts` must call the batched
  path for marker-present Free V4.
- On batch failure, throw typed errors (see below); **do not** write
  `stage: "ready"` or partial `semanticReview` that fails closed inconsistently.
- Checkpoint remains durable at `q1_answer_ready` with drafts when review
  fails (existing behavior preserved).
- Resume from `q1_answer_ready` must re-run **only** review batches, not Q1
  answer, diagnosis, or snapshot resolution (existing resume contract).

### Optional in-scope product tightening (only if cheap and tested)

- Map `mimo_output_truncated` for Free V4 review batches to **transient** with
  existing phase-attempt budget (not infinite retry), **or** keep permanent
  but per-batch so a single truncated batch can be retried without redoing
  successful batches. Prefer **per-batch retry within the existing phase
  attempt budget** without inventing a new state machine.
- Do **not** raise `maxOutputTokens` as the primary fix in this scope. A
  profile bump is out of scope unless a later amendment explicitly allows it.

### Typed errors (job boundary)

Add or map durable codes (redacted, no bodies):

| Event | Job code | Classification |
|-------|----------|----------------|
| Batch transport / invalid_response / length on a batch | prefer existing `mimo_*` codes | same as Phase-1 map; length may be transient **only** inside review-batch retry budget if implemented |
| Merge/parse of assembled review fails closed | keep existing TypeError / evidence-missing paths | unchanged |
| Incomplete batch coverage (wrong paths/order) | `free_teaser_review_batch_contract` or equivalent permanent | permanent |

No raw provider bodies, secrets, or customer prose in logs beyond current
redaction.

### Production allowlist (closed)

| Path | Role |
|------|------|
| `packages/ai-report-engine/src/report-semantic-review.ts` | Batch types, merge, derive overall/distinctness if needed; Free V4 batch prompts that reference **only** the batch's blueprint slice |
| `packages/ai-report-engine/src/report-semantic-review-provider-adapter.ts` | Batched offline runner entry (e.g. `runOfflineReportSemanticReviewBatched`) while keeping single-shot runner for Paid V3 unless explicitly shared |
| `packages/ai-report-engine/src/index.ts` | Export new symbols if required |
| `apps/web/src/worker/report-v4-free-teaser.ts` | Wire Free V4 review to batched runner |
| `apps/web/src/worker/job-errors.ts` | Map any new Free V4 review-batch JobError / provider codes |
| `docs/ACTIVE-CHANGE-SCOPE.md` | Authorization record |

### Tests allowlist (closed)

| Path | Role |
|------|------|
| `packages/ai-report-engine/src/report-semantic-review.test.ts` | Batch merge; full coverage; fail-closed on missing path; overallDecision parity |
| `packages/ai-report-engine/src/report-semantic-review-manifests.test.ts` | Only if Free V4 manifest fixtures need batch labels |
| `apps/web/src/worker/report-v4-free-teaser.test.ts` | Review path uses N invokes; resume from `q1_answer_ready`; truncated batch does not mark ready |
| `apps/web/src/worker/job-errors.test.ts` | New/adjusted codes only |
| Optional: `apps/web/src/worker/report-v4-free-teaser-resume-harness.test.ts` | Resume budget still holds |

### Forbidden

- Token/character **estimation** as design authority, acceptance gate, or
  root-cause claim
- Changing Paid V3 review to batched **unless** the same pure merge is
  reused with zero Paid V3 behavior change (default: Free V4 only)
- DB schema / migrations / historical job repair / resume of `c9a11e40`
  without a separate amendment
- Prompt rewrites that relax evidence/source/receipt/hash gates
- Raising model profile `maxOutputTokens` / context window as primary fix
- UI progress redesign, commerce, deploy, Docker, production
- New dependencies
- Real model calls in unit tests (fake invokers only)
- Logging raw provider bodies

### Diff budget

| Surface | Budget |
|---------|--------|
| Production allowlisted | max `+420` / `-120` |
| Tests allowlisted | max `+500` / `-80` |
| Dependencies / migrations | `0` |
| External expensive actions | `0` (no deploy, no real model, no DB write) |

### Verification (after APPROVED implementation)

Focused:

```text
npx vitest run packages/ai-report-engine/src/report-semantic-review.test.ts apps/web/src/worker/report-v4-free-teaser.test.ts apps/web/src/worker/job-errors.test.ts
```

Full local:

```text
npm run lint
npm test
npm run build
git diff --check
```

Acceptance checks:

1. Free V4 review path performs **multiple** structured invokes (≥2) for a
   happy path, not exactly one.
2. Merged output passes existing full-input parse/apply/receipt.
3. Injected `finish_reason=length` (or `mimo_output_truncated`) on one batch
   fails closed without writing ready; other successful batches need not be
   re-invoked if an in-memory/resume structure is present—or document that
   all batches re-run only from `q1_answer_ready` with no Q1/diagnosis/snapshot
   re-run (minimum resume bar).
4. No test uses token estimates as assertions.
5. Diff ⊆ allowlist and budgets.

### Expensive external actions

All **0** under this FROZEN→APPROVED implementation slice:

- real model, Docker, Vercel deploy, push (unless later authorized)
- historical Job mutation / repair of `c9a11e40…`
- new report/payment

A later **Staging validation amendment** may authorize one new free report or
one resume of a named job; it is **not** included here.

### STOP

- Edit production/tests while still `FROZEN`
- Expand into Paid V3 source-selection draft batching
- Estimate-driven "budget" logic
- Deploy or historical job ops

### User decision required

Reply **`APPROVED`** (or equivalent explicit approval of this allowlist) to
start implementation. Phrases like "fix it" without referencing this scope
do not expand the lock.

---

## Prior authority: Protected Staging deploy of 838a680 (Gates 1–3 complete)

**Status: `APPROVED` (complete for deploy Gates 1–3)** — user authorized
"push、部署 Staging" (2026-07-27). Candidate full SHA
`838a680ec1940544bf30e2782594799198812e0b`. **Gate 4 real-flow not
authorized.** Production not touched.

### Deploy deliverables

| Gate | Result |
|------|--------|
| Push | `5039adc..838a680` → `origin/main` |
| 1 Preview | `dpl_5uK13VGosp1ujFnxWukLJUQj6d99` READY; git/ogc/github SHA = candidate |
| 2 Workers | thin overlay `staging-838a680-overlay-v1` free+deep; restart 0 |
| 2 Alias | fixed `open-geo-console-staging-itheheda.vercel.app` → candidate |
| 3 Catalog | authenticated GET catalog `mode=test` prices CNY/USD/HKD; no report/payment |
| Production | `geo.itheheda.online` still prior production alias; containers not started |

Ledger (non-git):
`.data/protected-staging-release-ledger/838a680ec1940544bf30e2782594799198812e0b.json`

---

## Prior authority: 96% local fault matrix — Phase 5 (APPROVED / complete)

**Status: `APPROVED` (complete)** — user opened optional Phase 5 Deep
`provider_claim_extraction` progress=96 taxonomy (2026-07-27). Deployed to
Protected Staging under separate user authorization in the same session.

### Phase 5 objective

Deep paid discovery marks `provider_claim_extraction` at **progress 96** (via
`providerPhaseProgress`). Failures in that lane must map to **durable, redacted
job codes** instead of undifferentiated `unexpected_internal_error` when the
class is known:

1. `ProviderDiscoveryResumeIdentityMismatchError` → permanent
2. `ProviderDiscoveryDeadlineExceededError` → transient
3. `ProviderDiscoveryPipelineContractError` → permanent
4. `AiClientError` during phase `provider_claim_extraction` →
   `provider_claim_extraction_*` (auth / rate / temporary / timeout /
   invalid_response / configuration / transport) with correct
   permanent/transient/operator_repairable
5. Same `AiClientError` outside that phase → `ai_client_*` (shared transport
   taxonomy; no raw response body in job diagnostics)

Do **not** redesign the discovery state machine, change progress numbers,
mutate historical jobs, or log provider response bodies.

### Phase 5 production allowlist

- `apps/web/src/worker/job-errors.ts`
- `apps/web/src/worker/provider-discovery-pipeline.ts` — only durable `name` on
  the three ProviderDiscovery* error classes (no pipeline logic change)
- `docs/ACTIVE-CHANGE-SCOPE.md`

### Phase 5 tests allowlist

- `apps/web/src/worker/job-errors.test.ts`

### Phase 5 budgets

- Production: `+80/-20` (job-errors + pipeline error names)
- Tests: `+120/-20`
- External: all `0` (no push/deploy unless asked)

### Phase 5 delivered

| Boundary | Job code | Classification |
|----------|----------|----------------|
| Resume identity mismatch | `provider_discovery_resume_identity_mismatch` | permanent |
| Hard deadline | `provider_discovery_deadline_exceeded` | transient |
| Pipeline contract | `provider_discovery_pipeline_contract` | permanent |
| AiClient at `provider_claim_extraction` | `provider_claim_extraction_{authentication,rate_limited,temporary,timeout,invalid_response,configuration,transport}` | auth/config operator_repairable; rest transient |
| AiClient other phases | `ai_client_*` (same suffixes) | same |

Progress numbers and discovery state machine unchanged. Phase 4 still clears
public progress when stage is `failed`.

### Phase 5 stop

No processor progress table rewrite, free-teaser, commerce, Docker, deploy,
historical Job mutation, or public-search adapter production rewrites.

---

## Prior authority: 96% local fault matrix — Phase 4 (APPROVED / complete)

**Status: `APPROVED` (complete)** — user authorized "push、开 Phase 4"
(2026-07-27). Phase 1–3 on `origin/main` (`14809f6`). **No deploy** unless
separately authorized.

### Phase 4 objective

Public status/UI progress semantics: a **failed** Free/Deep report job must not
present as “still generating at 96%”. Clear public progress for terminal
`unavailable` without inventing a false mid-run or completed percentage.

1. Shared projection: `publicProgressForStage(stage, progress)` returns
   - `null` when stage is `failed` (public state `unavailable`)
   - `100` when stage is `completed` / `completed_limited` / legacy `partial`
   - clamped `0..99` for in-flight stages (never publish 100 while generating)
2. Report status API uses this projection for `job.progress`.
3. UI types accept `progress: number | null`; progress bar remains
   `state === "generating"` only (already true).
4. Do not mutate stored job rows, retry machine, or invent new public stages.

### Phase 4 production allowlist

- `apps/web/src/report/job-status.ts`
- `apps/web/src/app/api/reports/[id]/status/route.ts`
- `apps/web/src/components/ai-report-status.tsx` (type + null-safe progress only)
- `docs/ACTIVE-CHANGE-SCOPE.md`

### Phase 4 tests allowlist

- `apps/web/src/report/job-status.test.ts`
- `apps/web/src/app/api/reports/[id]/status/route.test.ts`
- `apps/web/src/components/ai-report-status.test.ts` (only if needed)

### Phase 4 budgets

- Production: `+60/-20` (track measured)
- Tests: `+80/-20` (track measured)
- External: Phase 1–3 push done; Phase 4 push authorized with same user turn;
  **no deploy**

### Phase 4 delivered

| Input | Public `state` | Public `progress` |
|-------|----------------|-------------------|
| stage `failed`, stored progress 96 | `unavailable` | `null` (not 96) |
| stage `synthesizing`, 96 | `generating` | `96` |
| stage `completed`, any | `completed` | `100` |

DB job.progress unchanged; only status API projection changes.

### Phase 4 stop

No processor, free-teaser, db terminalize, deep claim-extraction, commerce,
Docker, or historical Job mutation.

---

## Historical context — Free V4 teaser typed error boundary (completed work; not current execution)

Status: historical (implementation may already be on `main`; not the active task)

### User-approved decisions (locked for that prior task)

- **A:** typed `mimo_invalid_response` + limited transient retry (existing phase attempt budget)
- **B:** permanent typed fail-closed `semantic_review_evidence_missing` (keep `report_global_v1`)
- **C:** preventive strict `{ type: "text", text }` content-parts parsing on structured MiMo path (not historical payload proof)

### Objective

为 marker-present Free V4 teaser unified semantic review 的两类已记录失败建立明确、脱敏、可测试的 typed error 和 job 分类边界；保持 `report_global_v1` fail-closed 契约，不修改或重跑任何历史 Job。

This is not a claim to fix a single deeper ultimate root cause of all V4 failures.

### Baseline (historical evidence only; do not mutate)

- Workspace: `E:\project\open-geo-console`
- Branch: `main`
- Complete HEAD at scope start: `330b27a74c5c3d9d56c71bc8e6ade1859499e92e`
- Verified Staging job (no repair/replay/retry authorized):
  - Job: `caf0e8c3-71f5-4004-bd29-abe87c9b96e3`
  - Report: `90ee4925-bdd3-4154-b789-3625ebf4cb8e`
  - Terminal: `failed` / `unexpected_internal_error` at progress 96 after Q1 answer, diagnosis, and three observation snapshots
  - Direct failures: structured invalid response; `report_global_v1` missing accepted evidence/source
  - Historical records do not prove content-parts array as the raw payload shape

### Required behavior

1. Keep `report_global_v1` fail-closed for missing accepted evidence/source on non-blocked fields, answer annotations, and evidenceUse annotations.
2. Emit typed redacted outcomes:
   - `mimo_invalid_response` (transient)
   - `semantic_review_evidence_missing` (permanent)
3. Structured `message.content`:
   - non-empty string path retained
   - array path accepts only `{ type: "text", text: non-empty string }` parts
   - reject bare strings, missing type, `content` field objects, non-text types, empty/mixed/over-limit arrays
   - `MAX_STRUCTURED_CONTENT_PARTS = 128`, `MAX_STRUCTURED_CONTENT_CHARS = 1_000_000` with early rejection
4. Do not log raw provider bodies, secrets, tokens, or customer prose beyond existing redaction.
5. Resume from `q1_answer_ready` must not re-run Q1 answer, diagnosis, or snapshots.
6. No historical job mutation.

### Production allowlist (closed)

| Path | Role |
|------|------|
| `apps/web/src/report-v4/mimo-provider.ts` | Structured parse typing; strict content-parts; limits |
| `apps/web/src/worker/job-errors.ts` | Map typed provider/review errors to job classification/codes |
| `packages/ai-report-engine/src/report-semantic-review.ts` | Typed fail-closed for global evidence on fields, answers, evidenceUse |
| `docs/ACTIVE-CHANGE-SCOPE.md` | Authorization record only |

### Tests allowlist (closed)

| Path | Role |
|------|------|
| `apps/web/src/report-v4/mimo-provider.test.ts` | String/parts success; strict reject matrix; shared websiteSynthesis/questionAnswer/sourceDiagnosis |
| `apps/web/src/worker/job-errors.test.ts` | `mimo_invalid_response` transient; `semantic_review_evidence_missing` permanent |
| `packages/ai-report-engine/src/report-semantic-review.test.ts` | Field/answer/evidenceUse typed evidence-missing fail-closed |
| `apps/web/src/worker/report-v4-free-teaser.test.ts` | Regression gate (no production free-teaser edits required) |
| `apps/web/src/worker/processor.test.ts` | Regression gate for job failure classification wiring |

### Forbidden

- `apps/web/src/db/**`, migrations, schema meaning, historical data
- Claim/lease/checkpoint/retry state-machine redesign
- Q1/Q2/Q3 public-search or diagnosis production logic changes
- Deep report, commerce, payment, refund, email
- UI, status routes
- Docker, Vercel, deploy, env mutation
- Historical Job retry/replay/repair/reopen/clone (including `caf0e8c3…`)
- Relaxing evidence/source/receipt/hash/identity/URL gates
- New dependencies
- Real model, Worker, Docker, database write, deploy, push

### Diff budget

| Surface | Budget |
|---------|--------|
| Production allowlisted files | max `+180` / `-50` (measured ~`+156` / `-18`) |
| Tests allowlisted files | max `+480` / `-10` (measured ~`+394` / `-4`; verification-only budget refresh = measured + ≤20% headroom) |
| Dependencies / migrations | `0` |

### Verification commands (closed)

Focused (required before full suite):

```text
npx vitest run apps/web/src/report-v4/mimo-provider.test.ts packages/ai-report-engine/src/report-semantic-review.test.ts apps/web/src/worker/job-errors.test.ts apps/web/src/worker/report-v4-free-teaser.test.ts apps/web/src/worker/processor.test.ts
```

Full local verification:

```text
npm run lint
npm test
npm run build
git diff --check
```

### Expensive external actions

All counts are **0**: real model, Worker, Docker, database writes, historical Job actions, deploy, push.

### STOP conditions

- Edit outside the closed allowlists above
- Expand retry/state machine, model calls, DB semantics, or evidence gates
- Historical Job mutation
- Treat content-parts as proven historical payload root cause of `caf0e8c3…`

### Implementation status

Implementation and bounded rework authorized under this APPROVED lock with A/B/C fixed as above.

## Release / acceptance amendment (user-confirmed 2026-07-27)

Status remains `APPROVED`. The user explicitly confirmed promotion of the
already implemented and locally accepted Free V4 semantic-review fix from the
current `main` checkout to Protected Staging only, followed by a pause at the
fixed web entry for the user to type the site URL and perform any later test.

### Release allowlist

- Git may stage and commit only these seven currently tracked, allowlisted
  files: `apps/web/src/report-v4/mimo-provider.test.ts`,
  `apps/web/src/report-v4/mimo-provider.ts`,
  `apps/web/src/worker/job-errors.test.ts`,
  `apps/web/src/worker/job-errors.ts`,
  `packages/ai-report-engine/src/report-semantic-review.test.ts`,
  `packages/ai-report-engine/src/report-semantic-review.ts`, and this
  `docs/ACTIVE-CHANGE-SCOPE.md`. Exclude untracked `.codex/` entirely.
- Release actions may include the push and Preview / fixed Protected Staging
  promotion or configuration actions required by
  `docs/PROTECTED-STAGING-OPERATIONS.md`, strictly for the linked Staging
  project and never Production. The runbook order is mandatory: package one
  candidate, create a unique `READY` Preview only if no matching one exists,
  independently verify its full SHA identity, then move the fixed alias once
  and verify the Web plus both Staging Workers.
- The fixed business entry is
  `https://open-geo-console-staging-itheheda.vercel.app`; a unique Preview is
  artifact identity only and must not be used as the user acceptance site.
- For this amendment only, the release operator is authorized for Protected
  Staging Gate 2 Docker work. Read-only preflight may inspect `docker system
  df`, target-drive free space, Compose/container/image metadata, and exact
  current/candidate/rollback image IDs plus container references. If
  `package.json`, `package-lock.json`, `Dockerfile.worker`, the base-image
  digest, and browser/system dependencies are unchanged, a full Worker build
  is forbidden; use only a thin source-overlay from the currently accepted
  exact Worker image, copy the required `apps/` and `packages/` source, and
  label it with the final candidate full SHA. Recreate only the named Staging
  Free and Deep Worker services, never Production or commerce. Verify exact
  image ID/SHA, health, zero restart count, and zero-claim state before the
  single fixed-alias promotion. Retain current plus one rollback image only;
  do not prune, clean up, or delete images, volumes, or shared layers.
  Immediately stop if target free space is below 20 GiB or any identity or
  rollback evidence is missing. Record before/after free space, `docker system
  df`, image IDs, container references, and net bytes; after a failed build do
  not retry until remaining space and retry authority are revalidated.
- The user explicitly accepts the risk of Staging credentials entering the
  Codex tool context for this release, does not request rotation, and confirms
  deployment may continue. This is not confirmation of third-party leakage.
  Never query or output Docker `.Config.Env`; Docker inspection is limited to
  `.Image`, revision label, `State.Status`, `RestartCount`, image ID/
  `RepoDigest`, and container/Compose service identity fields.
- Release operations may atomically write the non-Git ledger
  `.data/protected-staging-release-ledger/<candidate-full-sha>.json` with
  restricted access and no secrets. Each action is idempotent under
  `protected-staging:<sha>:<action>:<target>`: read an existing successful
  record first and do not repeat it. Record platform/project/team,
  fixed-domain/SHA, Preview action and deployment ID, overlay image ID,
  Staging Free/Deep container IDs, alias action, rollback ID, and status.
- One inline Dockerfile is authorized for this release, with no repository
  script added: `FROM` the current accepted immutable Worker RepoDigest/ID,
  `COPY` only `apps` and `packages`, and `LABEL` the final candidate SHA.
  `npm ci`, Playwright/browser installation, OS packages, and full builds are
  forbidden; the overlay is Staging Free/Deep only.
- Before mutation, bind current, rollback, and candidate identities using only
  the whitelist above; environment inspection is prohibited. The user's
  release authorization remains active for these actions.
- After Gate 3 technical checks, stop at the fixed site. The user—not the
  agent—will type the target URL and initiate any subsequent browser test.

### Explicit prohibitions for this amendment

The agent must not submit a scan, create a report or job, pay, call a model,
write the database, replay or mutate historical jobs, touch
commerce/payment/refund/email, perform a second report or deployment, or touch
Production. These actions require a later explicit scope and authorization.

### Required release and rollback evidence

The release operator must record the candidate commit's complete SHA (the same
identity in the clean detached worktree and Preview `gitCommitSha` / `ogcGitSha`),
the linked Vercel project/team, and opaque IDs for any newly created Preview and
the fixed-alias promotion. Before any Staging mutation, record candidate,
current, and one rollback Worker image IDs; after verification record both
Workers' image/SHA, tier, Staging identity, restart counts, and no-claim check.
If any post-change check fails, restore the recorded rollback Worker images and
fixed alias, then report the rollback identity and before/after evidence.

## Vercel packaging amendment (user-confirmed 2026-07-27)

Status remains `APPROVED`. The user approved fixing the packaging blocker and
continuing only after its read-only acceptance gate passes. A Vercel dry
manifest included `.codegraph/codegraph.db` (148,279,296 bytes), exceeding the
100 MB single-file limit; no deployment was created.

### Narrow allowlist and budget

- Allowlist is exactly the existing `docs/ACTIVE-CHANGE-SCOPE.md` plus a new
  root `/.vercelignore`.
- `/.vercelignore` must contain exactly these exclusions: `.codegraph/`,
  `.data/`, `.tmp/`, `.codex/`, `.vercel/`, `**/node_modules/`, and `**/.next/`.
- Do not exclude `apps/`, `packages/`, config, or public build-required source;
  do not modify `vercel.json`, package files, Docker, or runtime behavior.
- Diff budgets are `.vercelignore` `+7/-0` and this scope amendment `+40/-0`.

### Acceptance gate and stop rule

- The completed Vercel `deploy --dry --format=json` evidence is: exit code 0,
  `fileCount=1694`, `totalSize=37,885,894`, `max=7,605,346`, no file over 100
  MB, and required tracked deployment sources present. In the seven excluded
  directory classes, no regular upload file has content, non-zero size, or a
  file hash. Vercel zero-byte directory metadata without a SHA is allowed and
  does not count as upload content.
- The dry-manifest gate is `PASS` on that evidence. Git may now stage, commit,
  and push only `docs/ACTIVE-CHANGE-SCOPE.md` and root `/.vercelignore`;
  exclude `.codex/`, the `.data` release ledger, `.tmp/`, and every other
  path. A normal (non-forced) push to `main` is allowed only when `behind=0`.
- After this technical gate, resume the already approved Protected Staging
  Preview/fixed-alias process. No additional output-directory exclusion is
  authorized, and the release remains Staging-only.

## Current authority: 96% local fault matrix — Phase 3 (APPROVED / complete)

**Status: `APPROVED` (complete)** — user authorized "提交本地、开 Phase 3"
(2026-07-27). Phase 1–2 committed as `4e48533`. **No push / deploy** unless
separately authorized.

### Phase 3 objective

Prove Free V4 teaser **checkpoint / resume** at every durable stage with an
**in-memory dry harness** (mocked providers, no real DB, no real model):

1. Resume from each saved stage does **not** re-run already-durable expensive
   work (snapshot resolve, Q1 generative answer, diagnosis, unified review) when
   that stage’s artifact is already present.
2. After a typed diagnosis failure, resume from the last durable
   `q1_answer_ready` (answer draft, no diagnosis) re-runs diagnosis only and can
   complete when the provider succeeds.
3. Corrupt / incomplete stage shapes still fail closed without writing a new
   checkpoint or invoking later expensive stages.

No prompt rewrite, no claim/lease/CAS redesign, no UI progress rewrite, no real
model/DB/Docker/deploy, no historical Job mutation.

### Phase 3 production allowlist

- `apps/web/src/worker/report-v4-free-teaser.ts` — only if a proven resume gap
  requires a minimal fix; prefer test-only if production already correct
- `docs/ACTIVE-CHANGE-SCOPE.md`

### Phase 3 tests allowlist

- `apps/web/src/worker/report-v4-free-teaser.test.ts` — resume matrix + dry harness
- `apps/web/src/worker/report-v4-free-teaser-resume-harness.ts` — pure dry harness
- `apps/web/src/worker/report-v4-free-teaser-resume-harness.test.ts` — harness unit tests

### Phase 3 budgets

- Production free-teaser: `+40/-20` (**measured `+0/-0`** — no production fix required)
- Tests + harness: measured `~+349/-0` (free-teaser.test `+123`, harness
  `~+132`, harness.test `~+94`) + ≤20% headroom → **`+419/-0`** (verification-
  only refresh of prior `+280/-40`; test/harness files only)
- External actions: all `0`

### Phase 3 delivered

| Resume kind | Expensive re-run budget |
|-------------|-------------------------|
| `ready` | all 0 |
| `q1_diagnosis_ready` | semanticInvoke 1 only |
| `q1_answer_ready` | enhanceDiagnosis 1 + semanticInvoke 1 |
| `observations_ready` | answer + diagnosis + review (no snapshot re-resolve) |
| `questions_ready` | resolveSnapshot 3 + answer + diagnosis + review |
| typed diagnosis fail → resume | no diagnosis draft saved; resume = q1_answer_ready budget |

### Phase 3 stop

Do not expand into UI, processor progress mapping, deep discovery 96 path,
public-search adapter production logic, or deploy without a new scope.

---

## Prior authority: 96% local fault matrix — Phase 2 (APPROVED / complete)

**Status: `APPROVED` (complete)** — user directed "继续" after Phase-1 local
acceptance (2026-07-27). Local commit authorized with "提交本地" (2026-07-27).

### Phase 2 objective

Type free-teaser **diagnosis failure** and **Q1 incomplete answer** (and map
diagnosis/provider-class errors at the job boundary) so they no longer collapse
to `unexpected_internal_error` + blind transient when the stage/code is known.
Still no prompt rewrite, no state-machine redesign, no UI rewrite, no real
model/DB/Docker/deploy.

### Phase 2 production allowlist

- `apps/web/src/worker/report-v4-free-teaser.ts`
- `apps/web/src/worker/job-errors.ts`
- `docs/ACTIVE-CHANGE-SCOPE.md`

### Phase 2 tests allowlist

- `apps/web/src/worker/job-errors.test.ts`
- `apps/web/src/worker/report-v4-free-teaser.test.ts` (regression / typed throws only)

### Phase 2 budgets

- Production: `+120/-40` (measured free-teaser+job-errors **`+112/-11`** — under budget)
- Tests: verification-only refresh to measured `+219/-14` + ≤20% headroom →
  **`+263/-17`** (was `+200/-40`; allowlisted test files only; no production
  behavior change from budget refresh)
- External actions: all `0`

### Phase 2 delivered behavior

| Throw / boundary | Job code | Classification |
|------------------|----------|----------------|
| `FreeTeaserDiagnosisFailedError` stage=`semantic_contract` etc. | `free_teaser_diagnosis_<stage>` | permanent (provider transport/rate/temporary → transient; auth/config → operator_repairable) |
| `FreeTeaserQ1IncompleteError` | `free_teaser_q1_incomplete` | permanent |
| `ReportV4DiagnosisProviderError` | `diagnosis_*` (from mimo map) | same as MiMo map |
| `ReportV4QuestionProviderError` | `question_*` | same as MiMo map |
| `MiMoGenerativeSearchAnswerError` | `generative_search_{authentication,unavailable,malformed,aborted}` | auth→operator_repairable; others→transient |

### Phase 2 stop

Do not expand into checkpoint harness, UI, public-search adapters production
logic, or deep discovery 96 path without a new scope.

---

## Prior authority: 96% local fault matrix — Phase 1 (APPROVED / complete)

**Status: `APPROVED` (complete)** — user authorized Phase-1 implementation and
test recap (2026-07-27). Historical detail below remains the Phase-1 contract.

### Objective (Phase 1 only)

Locally enumerate and harden **structured MiMo provider + job-error
classification** so every failure in the Phase-1 surface maps to a stable,
redacted, typed code with correct permanent/transient/retry-after semantics.
Do not assume the provider never fails. Do not dump remaining 96% categories
into `unexpected_internal_error`.

**Out of Phase 1 (report only; no file authority):** semantic-review
satisfiability beyond existing typed evidence-missing; public-search/snapshot
chains; free-teaser checkpoint/resume matrix; UI progress mapping; prompt
rewrites; state-machine redesign; deep discovery `provider_claim_extraction`
progress=96 path (see inventory below).

### Baseline

- Workspace: `E:\project\open-geo-console`, branch `main`.
- Complete HEAD when this Phase-1 block was authored: must be re-read from
  `git rev-parse HEAD` at approval time (dirty scope-only edits may exist).
- User-owned dirty at authoring: `M docs/ACTIVE-CHANGE-SCOPE.md`, `?? .codex/`
  (do not touch `.codex/`).
- 30-day Staging sample (operator evidence, not authority to mutate jobs):
  25 Deep jobs, 107 error events; 18 failed; 13 terminal at progress 96;
  `unexpected_internal_error` 71/20 (events/jobs); public-source 20/8;
  language 8/6; deferred 5/5; semantic typed 1/1. **96% is multi-cause.**
- Prior typed work already in tree (if present on HEAD): `mimo_invalid_response`
  (transient), `semantic_review_evidence_missing` (permanent), strict
  content-parts. Phase 1 extends provider taxonomy + job-error mapping + local
  fault fixtures; it does not re-open historical Job mutation.

### Code inventory: where progress can show 96 (read-only)

| Path | Code | Meaning |
|------|------|---------|
| Free teaser non-ready | `processor.ts` `withFreeTeaserAfterAdmission` saveCheckpoint: `progress: freeTeaser.stage === "ready" ? 99 : 96` | Any free-teaser stage after admission until `ready` (questions / observations / Q1 / diagnosis / review) displays **96** |
| Free teaser terminal fail | `jobs.ts` `terminalizeScanJob`: failed keeps prior progress | Failed job can **retain 96** on disk |
| Free teaser retry window | `executionState=retry_wait`, stage still synthesizing | UI `publicStateForStage` → `generating` + progress 96 |
| Free teaser terminal UI | stage `failed` → `unavailable` | Progress bar hidden; field may still be 96 |
| Paid/deep discovery | `providerPhaseProgress`: `provider_claim_extraction: 96` | **Different product path** than free teaser; must not be “fixed” by Phase-1 free-teaser assumptions alone |
| Paid grounded synthesis | progress 98 not 96 | Not the free-teaser 96 bucket |

Free-teaser stages that checkpoint at 96 (all call `saveCheckpoint(..., phase)` with progress 96 until ready):

1. `question_generation` after questions_ready
2. `snapshot_resolution` after observations_ready
3. `grounded_answer_synthesis` after Q1 draft/result
4. `grounded_answer_synthesis` after diagnosis draft
5. `grounded_answer_synthesis` after review → ready (then 99)

### Failure classes in Phase-1 surface (must classify, not silence)

**A. Provider preflight (mimo-provider / runtime config)**
Missing/invalid base URL or key; billing channel mismatch; locked profile drift;
token budget reject (`ModelTokenBudgetError` if reaches job boundary);
diagnosis input over bound → existing `configuration`.

**B. Transport / HTTP (mimo-provider `invokeOnce`)**
Fetch throw → `transport` (retryable).
401/403 → `authentication` (non-retryable provider; job map TBD in Phase 1).
429 → `rate_limited` (retryable).
408 / ≥500 → `temporary_provider` (retryable).
Other 4xx → `configuration` today.
Non-JSON body → `mimo_invalid_response` (retryable typed).
**Gap:** AbortSignal / hang timeout not always distinct codes; no dedicated
`timeout` code unless derived from abort. **Gap:** `finish_reason`
(`stop`/`length`/`content_filter`/unknown) is **not** read by structured
MiMo path today — Phase 1 must define fail-closed handling without logging body.

**C. Envelope / content**
Missing choices; missing/invalid message; missing content; unsupported
content-parts shape; parts/length limits; bad JSON content →
`mimo_invalid_response` (and related stable reasons). Multi-choice: only
`choices[0]` used (document; do not expand multi-choice product).

**D. Job boundary mapping (job-errors)**
Today only maps `mimo_invalid_response` and `semantic_review_evidence_missing`.
Most free-teaser `Error`/`TypeError` and other provider codes still collapse to
`unexpected_internal_error` + often `transient`. Phase 1 must map structured
MiMo codes that reach `normalizeJobError` to durable codes and correct
retryability. **Must** add `OGC_REPORT_V4_MIMO_API_KEY` to processor redact
list only if processor is allowlisted — **not** in Phase 1 allowlist; report
as Phase-1.5 gap if redact remains incomplete.

**E. Explicitly NOT Phase 1 (enumerated for later)**
Public-search / snapshot load failures; diagnosis plain `Error` wrapper;
semantic field/annotation failures beyond existing evidence-missing type;
checkpoint CAS; lease; UI progress zeroing on failed; deep
`provider_claim_extraction` 96.

### Production allowlist (closed — Phase 1)

| Path | Role |
|------|------|
| `apps/web/src/report-v4/mimo-provider.ts` | Typed outcomes for transport/HTTP/envelope/content/finish_reason; no raw body logs |
| `apps/web/src/worker/job-errors.ts` | Map those outcomes to job codes + permanent/transient/retry-after |
| `docs/ACTIVE-CHANGE-SCOPE.md` | Authorization record only |

### Tests / fixtures allowlist (closed — Phase 1)

| Path | Role |
|------|------|
| `apps/web/src/report-v4/mimo-provider.test.ts` | Fixed fixtures + fake-fetch fault injection matrix |
| `apps/web/src/worker/job-errors.test.ts` | Classification matrix for each new/stable code |
| `apps/web/src/report-v4/__fixtures__/mimo-provider-errors/**` | Optional fixed response envelopes only; create only if used |

No free-teaser, processor, semantic-review, UI, or db files in Phase 1.

### Required behavior after approval

1. Every Phase-1 injected failure yields a **stable, redacted** code (not
   undifferentiated `unexpected_internal_error` when the class is known).
2. Explicit **permanent vs transient** (and retry-after only when transient).
3. No raw provider body, API keys, tokens, or customer prose in errors/logs.
4. Fixed-seed property/fuzz ≥ **1000** cases for envelope/content/json structural
   rejects; failure prints seed.
5. Local only: fake fetch, no real model, no DB, no Docker, no deploy.

### Diff budget (Phase 1)

| Surface | Budget |
|---------|--------|
| Production (2 files) | max `+260` / `-80` |
| Tests (2 files) | max `+800` / `-80` |
| Fixtures (optional dir) | max `+300` / `-0` |
| This scope file | max `+220` / `-80` |
| Dependencies / migrations | `0` |

### Acceptance (Phase 1)

1. Focused:
   `npx vitest run apps/web/src/report-v4/mimo-provider.test.ts apps/web/src/worker/job-errors.test.ts`
2. `npm run lint` · `npm test` · `npm run build` · `git diff --check`
3. Diff ⊆ allowlist and budgets
4. Classification matrix table in PR/notes: input → code → permanent/transient → retry
5. Independent reviewer/tester; **no deploy**

### Expensive external actions

All **0**: real model, DB write, real report/job, Docker, Vercel, push, historical
Job replay/repair.

### STOP

- Edit production/tests while still `FROZEN`
- Touch free-teaser, processor, semantic-review, UI, db, deploy
- Real model/DB/Docker/Vercel
- Expand Phase 1 into Phase 2–4 without a new approved scope

### Non-executable roadmap (no file authority)

- **Phase 2:** Semantic review satisfiability + free-teaser diagnosis typed
  errors; allowlist candidates only after new scope
- **Phase 3:** Checkpoint/resume matrix + in-memory dry harness (no real DB)
- **Phase 4:** Status/UI progress semantics (failed clears “generating 96%”
  messaging without inventing false progress)
- **Phase 5 (optional):** Deep `provider_claim_extraction` progress=96 taxonomy
- **Deploy stage:** Separate user approval only after local gates pass

### Implementation status

**APPROVED for Phase-1 implementation.** Production edits limited to the closed
allowlist; external actions remain zero; no deploy.
