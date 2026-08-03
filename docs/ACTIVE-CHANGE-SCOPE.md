# Active Change Scope Lock

Status: `APPROVED`

The user approved the recommended design (complete public-search fanout once,
then exact snapshot reuse) on 2026-08-03 and explicitly approved the original
three-file written scope on 2026-08-03. Pre-implementation identity inspection
then proved that the provider-standard fanout's 60-second timeout and the
forensic fanout's 30-second timeout produce different immutable snapshot
identities. The user explicitly approved the minimal fourth runtime file
`apps/web/src/worker/public-source-forensics.ts` on 2026-08-03. This scope is
executable only within the resulting four-file runtime allowlist and all other
recorded limits.

## Objective

Remove the confirmed structural public-search duplication and deadline error
from the Paid V3 Direct generation path with the smallest production change:

1. The provider-standard-question stage produces the same complete six-query
   fanout that the later public-source-forensics stage requires.
2. The later stage reuses that exact completed snapshot and performs no second
   external search for the same query identities.
3. The fixed 180-second search sub-budget is divided by concurrency waves, not
   raw query count. Six queries at concurrency two receive a 60-second unit
   deadline instead of 30 seconds while the total wall-clock budget remains
   bounded.

The existing secure browser handoff and future-only Staging email consumer in
baseline commit `8d903b349985b8e08879c95eb9f25cce621bf192` are retained unchanged
and must pass the same one fresh end-to-end acceptance path.

## Confirmed baseline

- Repository: `E:/project/open-geo-console`.
- Branch / HEAD: `codex/delivery-root-fix` at
  `8d903b349985b8e08879c95eb9f25cce621bf192`.
- Current unrelated/concurrent worktree dirt is
  `apps/web/next.config.ts`,
  `apps/web/src/components/combined-geo-report-v3-artifact.test.tsx`,
  `apps/web/src/components/combined-geo-report-v3-artifact.tsx`,
  `apps/web/src/components/combined-geo-report-v4-artifact.tsx`,
  `apps/web/src/report/artifact-styles.ts`, and the untracked
  `apps/web/.tmp-preview/`; all must remain untouched and excluded.
- Paid V3 jobs `348d7574-c2c7-4d43-9ee8-46bf95415398` and
  `5452db0a-e95d-4981-b2d8-a15e5ed6d703` completed in 854.168 seconds and
  851.823 seconds respectively with the same structural phase pattern.
- In the user-observed job, one three-query snapshot completed in 167.766
  seconds. The immediately following six-query refresh repeated the exact same
  first three query hashes, split the 180-second budget into 30-second unit
  deadlines, recorded six cancelled attempts, consumed another 107.390
  seconds, and fell back to the completed prefix snapshot.
- Queue delay was 0.696 seconds. The paid job used one job attempt, zero resume
  generations, and no replacement fulfillment; job-level retry/recovery is not
  the cause of this incident.
- Existing detailed Paid V3 trace output is console-only and the incident
  container has been replaced. Durable PostgreSQL transition/snapshot/attempt
  ledgers are the acceptance authority for this optimization.
- `createMarketSnapshotIdentity` includes the fanout budget, including
  `timeoutMs`, in `queryPlanHash`. Therefore a 60-second provider-standard
  snapshot cannot be exactly reused by the current 30-second forensic fanout;
  changing only resolver execution time would make persisted identity
  untruthful.

## Allowed production/runtime files (exact allowlist)

- `apps/web/src/worker/provider-discovery-production.ts`
- `apps/web/src/worker/public-source-execution-budget.ts`
- `apps/web/src/worker/public-source-forensics.ts`
- `apps/web/src/worker/public-source-snapshot-resolver.ts`

No other production, runtime, package, configuration, schema, migration,
prompt, model, crawler, report, commerce, delivery, access, rendering, storage,
or UI file is allowed.

## Allowed test files (exact allowlist)

- `apps/web/src/worker/provider-discovery-production.test.ts`
- `apps/web/src/worker/public-source-execution-budget.test.ts`
- `apps/web/src/worker/public-source-snapshot-resolver.test.ts`
- `apps/web/src/worker/public-source-forensics.test.ts`
- `apps/web/src/worker/paid-v3-direct-linear-flow.postgres.test.ts`

Scope authority/history only:

- `docs/ACTIVE-CHANGE-SCOPE.md`
- `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md`

No new test harness, fixture family, evidence document, dependency, or generated
file is allowed.

## Required behavior

### One complete search product

- Provider standard questions use the complete canonical fanout needed by
  public-source forensics; they do not truncate it to a three-query prefix.
- Query ordering, exact query text, query IDs, fanout version, authority,
  locale, region, cost cap, and maximum query count remain unchanged from the
  existing full forensic plan. The canonical timeout changes uniformly from
  30 to 60 seconds, producing one new truthful identity shared by both stages;
  no historical snapshot is modified.
- The ordinary exact-snapshot cache identity is the only reuse authority. Do
  not introduce a second cache, job-local mutable ledger, cross-snapshot row
  copying, or broadened prefix equivalence.
- When the exact completed snapshot exists, public-source forensics performs
  zero new adapter calls for that fanout.
- Resume and concurrent lease contenders keep the existing idempotency,
  snapshot ownership, and immutable provenance rules.

### Concurrency-aware bounded deadlines

- Search concurrency remains bounded at two.
- A search sub-budget is divided by `ceil(unit count / concurrency)`. For
  180,000 milliseconds, six queries, and concurrency two, the unit deadline is
  60,000 milliseconds.
- The total search sub-budget, artifact reserve, cleanup margin, job deadline,
  provider adapter, provider/model selection, and external-call maximum do not
  increase.
- Source-document retrieval budgeting is unchanged; the confirmed defect is
  limited to search-query budgeting.

### Fail-closed behavior

- No retry, fallback provider, alternate model, replay, replacement job, or
  additional search attempt is added.
- A completed exact snapshot is reused; a real refresh failure retains the
  existing exact-prior, strict-prefix, and metadata fallback order.
- Partial evidence remains partial. Existing `completed_limited`, settlement,
  refund, source-coverage, artifact-readiness, and terminalization semantics
  must not be weakened or bypassed.
- Performance improvement must not come from removing queries, evidence,
  validation, private PDF readiness, or customer delivery checks.

## Explicit non-goals

- No website-synthesis prompt, 12,000-token ceiling, model, or report-shape
  change.
- No page-analysis batching/concurrency change.
- No crawler, candidate ranking, DNS, 404, or page-count change.
- No Chromium/PDF/browser pooling, evidence-storage, HTML activation, or report
  presentation change.
- No durable trace schema, telemetry service, progress UI, or logging project.
- No payment, email, checkout, access-token, refund, SLA, price, product, or
  historical-data change.
- No V4 contract or Production change.

## Diff budget

- Production/runtime: at most 180 changed lines across the four allowlisted
  files.
- Tests: at most 300 changed lines across the five allowlisted test files.
- Scope/history: at most 440 changed lines, including replacement of the prior
  active scope and its bounded history entry.
- No single new abstraction may be introduced unless both allowed runtime
  callers use it and a focused test proves its boundary.

Any required behavior or file outside this allowlist/budget is a stop-and-report
condition, not authority to refactor or expand the scope.

## Local acceptance checks

1. A unit test proves 180,000 ms / six queries / concurrency two yields a
   60,000 ms unit deadline and rejects invalid unit/concurrency inputs.
2. A resolver test proves at most two query calls are active simultaneously and
   all six complete within three concurrency waves.
3. Provider-production tests prove standard-question fanouts are complete and
   no longer force concurrency one.
4. An exact-identity test proves the later forensic resolution reuses the
   completed full snapshot with zero additional adapter calls.
5. A PostgreSQL linear-flow test proves each query hash has at most one actual
   search attempt in the paid lineage, exact snapshot IDs remain immutable, and
   resume does not create a second attempt set.
6. Existing prefix fallback tests prove a real failed refresh remains truthful
   partial coverage and does not become a false full completion.
7. Focused affected tests, the canonical selected disposable PostgreSQL test,
   `npm run lint`, `npm run build`, `git diff --check`, complete allowlist/diff
   review, and an unchanged unrelated-worktree check pass.

Automated checks prove regression coverage only; they do not prove real report
generation or customer delivery.

## Expensive external actions requiring explicit approval of this FROZEN scope

After all local checks pass, this scope proposes exactly one bounded live
sequence:

1. Git: create at most one additional local candidate commit containing only
   the allowlisted optimization, tests, and scope records. Do not push, merge,
   tag, or delete refs.
2. Protected Staging deployment: after the required disk/image preflight,
   create at most one Vercel Preview from the exact candidate; build at most one
   source-only thin Worker overlay; recreate only `staging-worker-free`,
   `staging-worker-deep`, and the baseline `staging-commerce` service; move the
   fixed alias once only after identity/readiness gates pass. Production is
   forbidden.
3. Fresh acceptance: create exactly one new Protected Staging report and one
   Airwallex Sandbox payment. Permit only that lineage's normal Free/Deep work
   and at most its two redirected test emails.
4. Inspect only that new lineage's transition, snapshot, query, attempt,
   artifact, order, access, and delivery records. Cache reuse is acceptable
   evidence only when the exact completed snapshot identity is proven and no
   adapter call was needed.
5. Acceptance must prove: no duplicate external attempt for the same query hash
   in the paid lineage; no six-call 30-second budget cancellation pattern; an
   honestly complete or limited terminal outcome; an active private HTML
   artifact; automatic same-browser navigation; redirected report email sent;
   scoped access succeeds; anonymous access remains denied; and zero historical
   rows/refunds were touched.

Any failure stops the live sequence. It does not authorize a second Preview,
image build, report, payment, email pass, alias move, retry, replay, refund, or
historical repair.

## Performance observation, not acceptance substitution

The measured structural saving is estimated at 95-125 seconds, with an expected
paid wall time around 11 minutes 20 seconds to 11 minutes 50 seconds under
similar provider latency. External latency varies, so total wall time is a
recorded observation rather than the sole pass gate. The hard performance gate
is removal of duplicate external query attempts and the incorrect 30-second
six-query cancellation pattern without reducing coverage or correctness.

## Completion boundary

The optimization is complete only when local checks and the single fresh
Protected Staging lineage both pass. Implementation alone, unit tests, build,
Preview readiness, cache presence, artifact activation, browser navigation, or
email delivery alone cannot substitute for the combined acceptance result.
