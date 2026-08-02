# Active Change Scope Lock

Status: `APPROVED`

Approved by the user on 2026-08-02 for the exact diagnostic-only objective,
allowlist, budgets, acceptance checks, and forbidden actions below.

No production/runtime source may be edited until the user explicitly approves
this exact objective, allowlist, behavior boundary, budgets, acceptance checks,
and forbidden actions.

This file is the sole executable authority for the Paid V3 Direct diagnostic
trace task. It deliberately does not authorize the later semantic-boundary
repair.

## Objective

Add an opt-in, default-off, structured and redacted diagnostic trace for the
fresh Paid V3 `free_direct` Worker path so that one user-operated manual run
can identify the exact operation, model-call boundary, code-validation boundary,
duration, remaining hard-deadline budget, and terminal outcome behind a visible
85% or later stall.

The runtime switch is exactly:

- `OGC_PAID_V3_DEBUG_TRACE=1`: emit the diagnostic trace.
- unset, `0`, or every other value: emit no Paid V3 debug-trace events.

The switch controls logging only. It must not change model inputs or outputs,
attempt counts, concurrency, timeouts, progress, checkpoints, persistence,
artifact readiness, commerce, refund behavior, or terminal outcome.

This phase ends after code and basic tests. The user owns deployment and the
manual website submission. Any behavioral repair inferred from the fresh trace
requires a separate FROZEN scope and approval.

## Current baseline and first-principles conclusion

- Working directory: `E:\project\open-geo-console`.
- Git identity and worktree state are intentionally not read because Git
  operations remain forbidden. Existing and unrelated edits are user-owned.
- The prior local repair and its accepted tests are archived in
  `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md`; they are context, not continuing
  authority.

### Confirmed facts

1. `processor.ts` writes progress `85` immediately before
   `synthesizeWebsiteReportWithRecovery()`.
2. It does not write progress `90` until website synthesis, deep visual
   evidence capture, and AI-report persistence have all returned.
3. The public status API returns `stage` and `progress` but omits the stored
   `currentPhase`; the client therefore displays only the coarse 85%.
4. Direct page analysis and website synthesis now use `free_direct` and one
   attempt, but page planning still calls `planPagesWithRecovery()` without a
   Direct override; that helper defaults to three model attempts.
5. Provider-claim extraction is created without a Direct carrier and defaults
   to three model attempts.
6. Provider-claim output is semantically judged by the model and then
   re-adjudicated by code through operating-mode synonym matching and normalized
   scope substring checks. Other code gates correctly own structural and
   integrity facts such as exact candidate identity, allowed enum membership,
   exact excerpt ownership, URL/evidence binding, hashes, and artifact
   completeness.
7. The existing PostgreSQL combined regression directly composes leaf
   functions and fixtures rather than executing the actual `processJob`,
   provider-discovery, visual-evidence-to-artifact, and full readiness chain.

### Root-cause status

- **CONFIRMED: progress ambiguity:** 85% is a three-operation bracket, not a
  precise statement that one AI step is still running.
- **CONFIRMED: incomplete Direct carrier:** one-attempt Direct policy is not
  propagated through every model-bearing layer.
- **CONFIRMED: mixed semantic authority:** some code heuristics re-decide the
  semantic meaning of model claims, while failures in those gates can trigger
  hidden model retry.
- **UNRESOLVED: exact fresh 85% stall:** without a current run-scoped timeline,
  source alone cannot distinguish a slow/failed website-synthesis call, visual
  browser navigation, persistence, or another overlapping deadline failure.

The first divergent architectural boundary is that the Paid Direct
orchestrator has neither one run-scoped trace authority nor one fully propagated
Direct execution/semantic authority. This diagnostic phase addresses only the
missing trace authority. It must not guess at or implement the later ownership
repair.

## Diagnostic trace contract

Every trace line must be one JSON object with a stable prefix and schema version
and must be correlatable by `jobId` and `reportId`. The allowed fields are:

- event schema version, timestamp, event kind, step name, phase, outcome;
- job/report identity, Direct semantic mode, configured model identifier;
- provider-call ordinal and configured maximum attempts where known;
- start/end duration, remaining total-job milliseconds at the boundary;
- page/batch/citation/unique-canonical-URL counts;
- canonical URL hash and registrable host only, never a full URL with query;
- validator/gate name, safe error class/code, violation count, and schema paths;
- artifact/fulfillment/refund state names and non-secret immutable IDs/hashes
  already owned by the job, only when those values are available at the traced
  boundary.

Trace events must cover, with balanced start plus success/failure where the
operation returns:

1. job admission and hard-deadline envelope;
2. discovery;
3. page planning and every actual planner provider call;
4. page fetch/technical audit summary;
5. every page-analysis batch and every actual provider call;
6. website synthesis and every actual provider call;
7. visual evidence grouped by canonical URL, including navigation start/end,
   citation count, and capture/validation outcome;
8. AI-report persistence;
9. Direct public-source budget admission;
10. Q2/Q3 answer collection and the actual answer-call counts available from
    the Direct checkpoint;
11. provider-discovery phase transitions and each provider-claim extraction
    call;
12. public-source forensics;
13. Q2/Q3 Direct analysis independently, preserving their concurrency;
14. combined artifact preparation/readiness, terminalization, fulfillment, and
    refund-not-required outcome;
15. the final typed failure boundary when any earlier step exits.

No trace line may contain prompts, message bodies, model JSON/prose, page text,
evidence quotes, full URLs/query strings, request/response headers, API keys,
access/report/payment tokens, raw IPs, email addresses, stacks, or unredacted
error messages. Logging must not be persisted into report JSON, checkpoints, or
new database rows.

## Allowed production files and behavior

1. `apps/web/src/worker/paid-v3-direct-debug-trace.ts` (new)
   - Own the exact environment-switch parser, stable event schema, redacted
     field allowlist, structured console emission, span/call ordinals, and
     no-op behavior when disabled.
   - Production budget: at most `+120/-0` lines.

2. `apps/web/src/worker/processor.ts`
   - Create one trace context only for Paid V3 `free_direct`.
   - Add trace boundaries around the existing operations listed above and wrap
     the already-selected JSON client so actual calls can be counted without
     changing requests, results, retries, concurrency, or exceptions.
   - Do not add or move progress/checkpoint writes.
   - Production budget: at most `+150/-30` lines.

3. `apps/web/src/worker/visual-evidence.ts`
   - Accept an optional no-op-compatible trace sink and emit one navigation
     span per canonical URL plus bounded citation/capture/integrity outcomes.
   - Preserve the existing one-navigation-per-canonical-URL behavior and every
     per-citation asset binding/integrity gate.
   - Production budget: at most `+55/-15` lines.

4. `apps/web/src/worker/provider-discovery-production.ts`
   - Accept an optional trace sink and emit provider-discovery phase and
     per-source/candidate claim-extraction call boundaries.
   - Do not change passage selection, claim parsing/validation, qualification,
     retry policy, or accepted/rejected claim meaning in this phase.
   - Production budget: at most `+65/-15` lines.

5. `apps/web/src/worker/paid-v3-direct-semantics.ts`
   - Accept an optional trace sink for the concurrent Q2/Q3 Direct analysis
     calls and record completed versus incomplete outcomes without changing the
     existing fail/incomplete behavior.
   - Production budget: at most `+45/-10` lines.

Aggregate production-source budget: at most `+435/-70` measured lines. These
are hard limits. No other production/runtime file may be touched.

## Allowed test files

- `apps/web/src/worker/paid-v3-direct-debug-trace.test.ts` (new)
- `apps/web/src/worker/processor.test.ts`
- `apps/web/src/worker/visual-evidence.test.ts`
- `apps/web/src/worker/provider-discovery-production.test.ts`
- `apps/web/src/worker/paid-v3-direct-semantics.test.ts`

Aggregate test-source budget: at most `+650/-120` measured lines. No reusable
test harness, dependency, schema fixture API, or production-only test seam may
be introduced.

## Acceptance checks

Focused tests must prove:

1. With the switch unset, `0`, malformed, or any value other than exact `1`,
   the trace emits zero lines and all wrapped values/errors remain identical.
2. With `OGC_PAID_V3_DEBUG_TRACE=1`, every emitted line conforms to the stable
   schema, has the same job/report correlation identity, and contains only the
   field allowlist.
3. The 85% bracket produces distinct `website_synthesis`,
   `visual_evidence`, and `ai_report_persist` spans, each with duration and
   remaining-deadline values, so a fresh stall is attributable.
4. A fixture client that is actually invoked N times produces exactly N
   provider-call events; tracing neither adds nor suppresses a call.
5. Q2/Q3 Direct analysis remains concurrent and produces independent call and
   outcome events.
6. Eleven citations across four canonical URLs still navigate exactly four
   times and produce exactly four navigation spans, while every citation keeps
   its own asset/integrity outcome.
7. Provider-claim extraction logs each actual call and its validator outcome,
   including retry ordinals if the existing runtime performs them; the trace
   itself does not alter that existing policy.
8. Injected failures at synthesis, visual navigation, persistence, claim
   extraction, Q2/Q3 analysis, and artifact readiness each produce the precise
   failed step and a safe error class/code without swallowing or replacing the
   original failure.
9. Sentinel prompt text, model prose, evidence quotes, full query URLs, secrets,
   tokens, raw IPs, emails, and unredacted error text do not appear anywhere in
   captured trace output.
10. Existing schema, language, evidence ownership, visual asset integrity,
    artifact readiness, terminalization, fulfillment, and refund gates remain
    unchanged; tests may not be made green by weakening them.

## Verification allowed after approval

1. Focused Vitest runs covering only the five allowed test files and direct
   dependencies.
2. `npm run lint`.
3. Re-read every changed file and focused output.

No PostgreSQL/Docker run, browser/manual submission, live website scan, model
call, deployment, payment/commerce action, or Git command is authorized in this
diagnostic implementation phase.

## Forbidden scope

- No change to model prompts, response contracts, schema parsing, semantic
  validation, language/terminology rules, evidence gates, deterministic
  fallbacks, attempt counts, retries, backoff, concurrency, timeouts, hard
  deadlines, progress percentages, checkpoints, resume/defer/replay, or job
  state.
- No checkout, V3/V4 product selection, snapshot reuse, schema/migration,
  dependency, lockfile, crawler, database, commerce, refund transition, email,
  status API/UI, or customer-copy change.
- No new database/file/object-storage telemetry sink; trace output is
  process-console-only and default-off.
- No deployment, browser submission, live external request, model call, payment
  access, new report/order/payment/refund, historical repair/replay/mutation,
  Git operation, branch, worktree, commit, or push.

## Stop conditions

- Useful tracing requires a production/runtime file outside the five-file
  allowlist, a schema/dependency/config-file change, or persistence of new
  telemetry.
- Safe attribution would require logging prompt/model/page/evidence content,
  full URLs, secrets, personal data, or unredacted errors.
- Instrumentation changes an existing call count, ordering, timeout,
  concurrency, validation result, checkpoint, progress, artifact, or commercial
  outcome.
- An exact stall cause still requires a real run: finish local trace
  implementation and tests, then stop for the user's deployment/manual run.
- Any semantic authority or retry repair is proposed before a fresh trace is
  available: stop and write a separate FROZEN behavior scope instead of
  expanding this one.
