# Active Change Scope Lock

## Historical superseded scope (context only)
Status: `FROZEN`

This file is the mandatory authorization boundary for the next implementation. While it is `FROZEN`, no production-code edits or external mutations are allowed.

The deviation audit, convergence steps, and paste-ready fresh-chat prompt are recorded in `docs/handoffs/2026-07-19-v4-answer-optimization-scope-recovery.md`.

## Intended objective

Preserve the existing Report V4 behavior in which three business questions are answered independently, and implement only the user's original answer-optimization requirement after it has been reconstructed from the remote baseline and approved in writing.

## Baseline

- Remote baseline: `origin/codex/report-v4-implementation`
- Current local branch: preserved for review only; the 10 unpushed commits preceding the scope-guard commit are not an approved implementation baseline.
- User-owned untracked files are outside this task and must remain untouched.

## Allowed files

None while `FROZEN`.

Before approval, replace this section with an exact file allowlist. Directory-wide wildcards are not allowed unless the user explicitly approves them.

## Forbidden by default

- Job state-machine changes or new states.
- Recovery, replay, resume, compatibility, migration, or historical-record remediation.
- Payment, order, credit, refund, email, access-token, or other commerce behavior.
- Crawl, site admission, page-limit, deduplication, or URL-discovery behavior.
- Worker launchers, environment handling, Docker images, deployment, production, or staging infrastructure.
- Reuse of another website's report, snapshot, job, order, artifact, or answer.
- Repeating a completed crawl, model run, payment, refund, email pass, or deployment.
- Refactors, cleanup, documentation rewrites, or tests unrelated to the approved answer optimization.

## Diff budget

Zero production files while `FROZEN`.

The approved version must state the maximum number of production files and tests that may change. Exceeding either number requires a new user approval before further edits.

## Acceptance checks

The proposed approved scope must, at minimum, prove:

1. Exactly three V4 questions remain independent.
2. Each answer belongs to the current report and target website.
3. No answer overwrites another answer.
4. The focused report output contains all three answers.
5. No recovery, replay, historical substitution, or repeated crawl is invoked.
6. The complete diff matches the approved file allowlist and budget.

## Unlock procedure

1. Inspect the remote baseline and original product contract without modifying code.
2. Fill in the exact allowed files, expected behavior change, diff budget, tests, and any external action.
3. Show this scope to the user.
4. Change `Status` to `APPROVED` only after the user explicitly approves that written scope.
5. If implementation discovers an out-of-scope blocker, return this file to `FROZEN` and stop.
## Historical non-executable context
## Approved local convergence and worktree consolidation (2026-07-27)
## Current approved consolidation authority

Status: `APPROVED`

`APPROVED` - user explicitly approved the new clean-image second-report scope on 2026-07-26 (Asia/Shanghai), stating: “停止旧 Worker 后创建另一份全新报告；不能重放当前失败报告”. Prior records remain baseline only; approval is limited to the latest scope below.

Approval source: user instruction on 2026-07-27 — “批准，保留 Staging”。
This section is the sole executable authority for the current task; the
historical Q1 scope below is retained for context and is superseded.

### Objective

Converge all already-existing functional/security worktree changes into the
local `main`, verify the result, retain Staging, and leave only the canonical
worktree at `E:\project\open-geo-console`. Do not add functionality.

### Baseline

- Canonical revision: `a35674b`
- Local `main`: `a856280` (ahead by 1)
- Supersession marker: `14786`
- Staging runtime: `235bbc1`
- Worktree count: `15`
- Existing branch and dirty-file inventories are the boundary of work; no new
  branch, file, or behavior may be inferred.

### Allowed surfaces

- Git operations required to classify, preserve, merge, and verify the existing
  branches/worktrees and their already-present dirty files.
- `docs/ACTIVE-CHANGE-SCOPE.md` and other already-existing project status,
  handoff, README, Obsidian, or Hermes projection files only when their facts
  are directly established by the resulting Git/runtime evidence.
- Existing source and test files present in the branch/dirty inventories, only
  to conserve those changes during merge and run the declared verification.
- No new functionality, dependency, schema meaning, or product behavior.

### Dirty preservation

Preserve every user-owned dirty change exactly until classified and safely
merged or explicitly reported. Do not overwrite, discard, reset, stash away
without an auditable mapping, or silently resolve conflicts by choosing one
side. Any unclassifiable or conflicting change is a stop condition.

### Forbidden

- Secrets, credentials, tokens, raw client IPs, or runtime artifacts in files,
  logs, commits, or handoffs.
- New runtime behavior, schema/database changes, dependencies, commerce,
  payments/refunds/email, historical-data replay/repair, or report/job replay.
- Any Production process, image, container, deployment, data, or acceptance
  action.
- Push, remote branch deletion, force-push, broad prune/cleanup, or deletion
  of anything outside the exact named extra worktrees after all gates pass.
- Docker image deletion or pruning except the explicitly authorized Staging
  candidate/current/rollback discipline below.

### Merge strategy

Use a local, auditable merge of all existing functional/security branches and
classified dirty changes into local `main`, preserving every existing unique
commit and recording conflict decisions. Do not synthesize replacement commits
for absent work or introduce unrelated cleanup. The remote remains untouched.

### Conservation budget

- Commits: all existing unique commits from the enumerated worktrees must be
  conserved; zero newly invented product commits.
- Diff: only classified pre-existing dirty diffs and the minimum merge/conflict
  metadata needed to conserve them; zero net new product behavior.
- Documentation projections: update only from established post-merge facts.

### Verification and review gates

1. Independent read-only review confirms branch/worktree inventory, complete
   diff classification, and conservation against the baseline.
2. Run the repository's proportionate tests/lint/build checks for the merged
   source and any affected test surfaces; failures outside this scope stop.
3. Verify Staging runtime identity and health without touching Production.
4. Only after all gates pass may exact extra worktrees be removed.

### Docker and Staging discipline

Before any Docker build, record `docker system df`, target-drive free space,
affected container image IDs, and the candidate diff. A full Worker build is
forbidden unless dependency/base/browser inputs changed and the reason,
expected disk increase, cache strategy, target tag, and rollback image are
recorded. For source-only changes, use the approved thin source-overlay path.
Identify exactly three Staging roles: candidate, current, rollback. Retain
only current plus one rollback image after verification. Only the named
Staging services may be recreated: `Staging Free` and `Staging Deep`.

### Worktree removal and stop conditions

After independent review, tests, and Staging gates pass, remove only the exact
14 non-canonical worktrees, verify `E:\project\open-geo-console` is the sole
worktree, and preserve all remote branches. Stop immediately on an unknown
dirty file, unresolvable conflict, out-of-scope diff, missing authority,
secret/runtime-artifact exposure, disk-space violation, failed gate, or any
request to touch Production, push, delete remote branches, force/prune, or
expand behavior. Report the blocker without substituting or replaying history.

## Accepted Q1 sample presentation (narrative HTML)

Status: `APPROVED`

User accepted the r2/B Q1 sample on 2026-07-25 and directed that the
customer-facing deliverable keep **LLM answer + narrative HTML packaging**,
and drop the previous **code-audit / claim-map table** presentation block.

### Objective

1. Record Q1 sample acceptance for 凌顺 / shun-express.com.
2. Rewrite `fresh-q1-report.html` as narrative report HTML (model ordinary-text
   answer + verified findings about sources and 凌顺), without present/partial/
   unknown claim-map ledgers in the customer page.
3. Keep `fresh-q1-evidence.md` / `fresh-q1-analysis.txt` as technical ledgers.
4. No Free/Deep production code, no third MiMo call, no new page fetches.

### Allowed writes

- `docs/ACTIVE-CHANGE-SCOPE.md`
- `C:\Users\fengc\.codex\visualizations\2026\07\25\019f991c-91c6-7163-aa1f-fb5b905c89e5\fresh-q1-evidence.md`
- `...\fresh-q1-analysis.txt`
- `...\fresh-q1-report.html`
- `...\fresh-q1-report.png`

Production/runtime allowed files: **none**.

### External-action budget

- MiMo / model: 0
- New web reads: 0
- Local screenshot of static HTML only: allowed

### Forbidden

Production/test code; packages; DB/job/report/commerce; containers/deployment;
deleting scope-out auxiliary files; Git stage/commit of user dirty files;
treating external providers as proof of 凌顺 capability.

### Completion

When narrative HTML + screenshot are updated and acceptance is noted in the
technical ledger, stop. Free/Deep product changes require a new scope.
## Historical non-executable context: prior staging refresh objective

The remainder of this file is archived context only and is not executable scope; the consolidation authority above controls the current merge.

Deploy the current candidate worktree via one thin source-overlay to the two local Protected Staging Docker Workers (Free/Deep), then create exactly one new Free report for `https://shun-express.com/` through the fixed Protected Staging entry. The same report may automatically create one `v4_pre_admission` Deep job. Monitor until Free is user-visible and Deep is terminal or has an explicit failure; stop before payment.

Legacy behavior remains unchanged: inputs without policy and marker-absent inputs retain field-level/legacy semantics. Free and Paid each make exactly one review; no retry or third call. Do not upgrade carrier/receipt versions. No DB/schema/migration work.

The deployed bytes are the current `apps/` and `packages/` worktree source, including the recorded semantic-review changes and pre-existing runtime dirty baseline (startup-readiness and postgres-next guard); scripts/docs/tests are not runtime behavior. Do not make opportunistic code changes.

## Baseline (measured before this refresh)

- cwd: `E:\project\open-geo-console-supersession`
- branch: `codex/staging-regeneration-supersession`
- HEAD: `14786f43f478c0b0222cf844dc9c03580922b93b`
- dirty baseline (preserved, not authored by this scope):
  - modified: `apps/web/src/scripts/report-v4-staging-preflight.test.ts`
  - modified: `apps/web/src/worker/report-v4-startup-readiness.test.ts`
  - modified: `apps/web/src/worker/report-v4-startup-readiness.ts`
  - modified: `docs/ACTIVE-CHANGE-SCOPE.md` (this refresh)
  - modified: `scripts/start-workstation-workers.ps1`
  - untracked: `apps/web/docker/`
  - untracked: `apps/web/src/scripts/apply-postgres-next-write-guard.mjs`
  - untracked: `apps/web/src/scripts/apply-postgres-next-write-guard.test.ts`
- tracked diff numstat before this refresh: `46/0` startup-readiness.test.ts, `28/1` startup-readiness.ts, `75/2` this scope file, `12/1` start-workstation-workers.ps1. Untracked paths have no numstat.

## Allowlist

Production (exact):

- `packages/ai-report-engine/src/report-semantic-review.ts`
- `packages/ai-report-engine/src/report-semantic-review-manifests.ts`
- `apps/web/src/worker/report-v4-free-teaser.ts`
- `apps/web/src/worker/processor.ts`

`apps/web/src/worker/paid-v3-semantic-review.ts` is forbidden by default; stop and request scope expansion only if a function signature is proven unavoidable.

Tests (existing paths only; delete nonexistent paths from any plan, create no new test files):

- `packages/ai-report-engine/src/report-semantic-review.test.ts`
- `packages/ai-report-engine/src/report-semantic-review-manifests.test.ts`
- `packages/ai-report-engine/src/report-semantic-review-provider-adapter.test.ts` (only if it exists)
- `apps/web/src/worker/report-v4-free-teaser.test.ts`
- `apps/web/src/worker/paid-v3-semantic-review.test.ts`

Forbidden: UI/status/HTML/loader/admission/commerce/recovery/deployment/runtime changes, historical report repair, real-model calls, dependencies, carrier/receipt version changes, DB/schema/migration changes, and all paths outside this allowlist and the preserved dirty baseline.

## Budgets

- production: hard maximum `+340/-170`
- tests: hard maximum `+600/-250`
- total: hard maximum `+980/-450`

## Acceptance checks

- Focused tests reproduce field 11 accepting a globally valid target evidence and Free/Paid cross-field/action/factor acceptance and rejection reasons.
- Unknown ID, fake URL, hash drift, ineligible accepted evidence, and accepted/rejected overlap remain fail-closed.
- Legacy field-level rejection remains valid; marker-absent semantics remain unchanged.
- Exactly one review per Free and Paid path is evidenced.
- Run focused checks, lint, full test, build, and complete diff/allowlist review.

## External actions and stop conditions

No external action is authorized in the frozen scope: no real model, crawl, payment, deployment, runtime, database, or historical workflow. Stop on any need to touch a forbidden path, expand behavior, add a test file, alter a version/schema/receipt contract, exceed budget, or reconcile conflicting baseline evidence. Approval must explicitly cover this written allowlist and budget before implementation.

## Frozen external-acceptance allowlist

- Candidate identity: cwd `E:\project\open-geo-console-supersession`, branch `codex/staging-regeneration-supersession`, HEAD `14786f43f478c0b0222cf844dc9c03580922b93b`.
- Build exactly one thin overlay tagged `open-geo-console:staging-14786f-global-evidence-v1`, based on current image `sha256:f985a3866b6a5636d4f57f8f8068543a8e132948d0f088e8fdbb0c81bdcf6b58`; full build, `docker cp`, prune, cleanup, deletion, and image replacement outside named workers are forbidden.
- Preflight must record Docker disk usage, E: free space, Free/Deep container and image IDs, one distinct rollback image, and staging marker. Stop if E: is below 20 GiB, current/base or rollback identity is unavailable, candidate bytes are ambiguous, or marker mismatches.
- Recreate only the named local Protected Staging Free and Deep workers (at most two recreates); verify exact image identity, profile/marker, polling, heartbeat, and task claiming. On deployment failure, at most one rollback to the preflight current image; no second route.
- Submit exactly one new `forceFresh=true` (or equivalent protected UI action) Free report for `https://shun-express.com/`; if response is ambiguous, query authoritative state before any action and never resubmit. No historical report/job reuse, redispatch, requeue, reclaim, payment, order, refund, email, Vercel deployment, or manual model retry.
- Monitor only this lineage for at most 40 minutes at 20–30 second intervals. Require Free reviewed Foundation + Q1 answer card + receipt and user-visible URL; require the automatic Deep job to be terminal with artifact/receipt or an exact stage/code/first-error failure. Stop at the payment page.
- Acceptance must confirm marker `report_global_v1`, one semantic review per Free/Deep, persisted accepted/rejected sources and reasons, accepted IDs in the report global eligible catalog, and no old field-local disallowed-reference error.

External-action budget: one overlay build; at most two worker recreates plus one overall rollback; exactly one Free submission; expected one automatic Deep job; zero payment/order/refund/email/Vercel/model-retry actions; zero code/Git mutations.

## Build-failure retry amendment (approved)

The first thin-overlay build was consumed and failed because `FROM sha256:f985...` was interpreted by BuildKit as a remote repository reference. No candidate image was produced and no container changed. Recorded evidence: E: free space `110.5125 GiB`; build cache delta `8.192 kB`.

The user approved exactly one retry (“可以重试”, 2026-07-26 Asia/Shanghai). Retry must retain candidate tag `open-geo-console:staging-14786f-global-evidence-v1` and content hash `809a26b37d05b07dc7d9512c04100096b0ecb5fa57aea698dbc8573cfa6addda`. The Dockerfile `FROM` must use the local exact tag `open-geo-console:staging-14786f43f478c0b0222cf844dc9c03580922b93b-startup-retry-bounded-5x-1-2-4-8s-v1`; immediately before and after the retry build, resolve and verify its image ID equals `sha256:f985a3866b6a5636d4f57f8f8068543a8e132948d0f088e8fdbb0c81bdcf6b58`.

Only this one retry build is authorized. On success, continue the already approved Free/Deep recreate and exactly-one-report actions and stop conditions. On failure, stop; no third build, cleanup, tag overwrite, or full build is allowed.

## Runtime redeploy amendment (archived approval record)

User explicitly approved on 2026-07-26 (Asia/Shanghai) with the exact reply: “批准精确替换”.

The candidate build succeeded: tag `open-geo-console:staging-14786f-global-evidence-v1`, image ID `sha256:6592d914a3debd7d3e8ff4f261b927a5390910d09196767aff8182b4b115106f`; revision/content hash matched. An attempted deployment used the default Compose project `supersession`, creating bypass containers; those were removed as a whole. Original workers were untouched; current image remains local `f985`; no report, database, or payment exists.

Requested minimum authorization: zero builds and zero image cleanup. Use explicit Compose project `open-geo-console` with config `E:\project\open-geo-console-supersession\compose.yaml` plus bounded temporary/STDIN tier override (`free=free`, `deep=deep`, not written to the repo), and `OGC_APP_IMAGE` set to the candidate tag. Force-recreate only exact services `staging-worker-free` and `staging-worker-deep`, targeting names `open-geo-console-staging-worker-free-1` / `open-geo-console-staging-worker-deep-1` on `open-geo-console_default`. Verify exact candidate ID, tier/profile/marker, and two poll+heartbeat cycles.

If deployment fails, allow one rollback using the same two services to exact current local tag `open-geo-console:staging-14786f43f478c0b0222cf844dc9c03580922b93b-startup-retry-bounded-5x-1-2-4-8s-v1` / ID `sha256:f985a3866b6a5636d4f57f8f8068543a8e132948d0f088e8fdbb0c81bdcf6b58`; no new Compose project, third build, code, DB/schema, Vercel, production, or commerce changes. On success, continue the original exactly-one-report action; on failure, stop.

Additional external budget: exactly two candidate container recreates, at most two rollback recreates, zero builds, zero cleanup. Preserve the candidate image and record the existing E: free-space/cache evidence.

## Final runtime outcome

Candidate image `6592d914a3debd7d3e8ff4f261b927a5390910d09196767aff8182b4b115106f` was precisely substituted for the original Free/Deep workers, but both failed in `readDatabaseSchemaVersion` with `CONNECT_TIMEOUT undefined:undefined` and each reached restart count 1 before any poll, heartbeat, or claim evidence. The workers were uniquely rolled back as a whole to exact current image `f985`; current workers are running with restart count 0. No report, job, order, payment, or other commercial side effect exists. E: free space was `110.4811 GiB`; candidate image and build cache were retained with no cleanup.

This external acceptance is `STOPPED/ROLLED_BACK`. Do not continue under this scope. Any next step requires a new scope authorizing container-local PostgreSQL connectivity diagnostics.

## Minimal container connectivity diagnosis (archived approval record)

Objective: determine, with evidence, why the host can connect to Protected Staging PostgreSQL while the original/candidate Worker containers fail during polling/startup. Produce a root-cause classification only; do not implement a repair.

Code write allowlist: none. Git, DB schema, report, payment, deployment, build, recreate, cleanup, persistent containers, and Worker/model loops are forbidden.

Permitted read-only/temporary actions:

1. Inspect base image `f985` and candidate `6592` config/history/entrypoint, env key names, labels, and hashes of the DB schema reader, startup-readiness, Worker entry, postgres-next guard, and actual postgres-related `node_modules` files. Never output secrets.
2. For each current original Free/Deep container, at most one `docker exec`: use existing env/network for DNS, TCP 5432, TLS/auth, `BEGIN READ ONLY` + marker/schema `SELECT` + `ROLLBACK`, and the same `readDatabaseSchemaVersion` initializer path. Each command timeout is 30 seconds; do not mutate containers.
3. For each image (`f985`, `6592`), at most one disposable `docker run --rm` diagnostic container joined explicitly to `open-geo-console_default`, using the same staging env and an overridden entrypoint that runs only the read-only diagnostics. No Worker loop/model. Maximum two DB attempts per image, 30-second timeout; container must be disposable.
4. Compare running and disposable environments: DNS IPv4/IPv6 order, proxy/NO_PROXY, hashed `DATABASE_URL` fingerprint only, Node/Postgres client/patch versions, Compose env differences, and initializer error cause/code/address/port. Never print sensitive values.

The diagnosis must classify the evidence as: base succeeds/candidate fails = image/source overlay; both fail = shared container runtime/network; raw DB succeeds but initializer fails = app pool/startup logic; running succeeds but disposable fails = Compose/runtime injection difference. A bare `CONNECT_TIMEOUT` is insufficient.

External budget: two existing-container execs, two disposable runs, and at most two DB attempts per image; zero persistent containers, builds, recreates, cleanup, report/job/payment. Stop immediately if any command could write DB, start a Worker, or require code changes. Status remains `FROZEN` pending approval.

## Final A/B diagnosis record

Read-only A/B checks completed with zero DB writes, builds, restarts, or reports. Base `f985` existing Free and Deep execs and candidate `6592` disposable containers, on the same network and environment, all succeeded for IPv4-first DNS, TCP 5432, TLS/auth, `BEGIN READ ONLY`, staging marker/schema 42, and `readDatabaseSchemaVersion`. Node `24.18`, postgres `3.4.9`, and the hashed database fingerprint matched.

At `12:49:53Z`, base and candidate showed the same `CONNECT_TIMEOUT`; at `12:54:00Z`/`12:54:03Z`, both were `READY`. The startup blocker is therefore classified as a shared transient Neon pooler/connection-establishment stall that recovered, not an overlay/image/environment/DNS/TLS/schema defect. Post-ready polling/presence still shows generic failures with causes elided and remains undiagnosed. Do not submit a report; a new scope is required to diagnose operation paths.

## Clean full-image + one-report batch acceptance (archived approval record)

Build one clean Worker image from the current worktree `apps/`/`packages/`, `package-lock.json`, and `apps/web/docker/Dockerfile.worker` using its declared upstream base (`--no-cache --pull`; preserve any fixed digest). Do not use `f985` or `6592` as `FROM`, thin overlays, or `docker cp`. Tag `open-geo-console:staging-14786f-global-evidence-clean-v1` and record revision/source-content labels and all package/lock/Dockerfile/base inputs plus the reason: eliminate old-image/shared-runtime-layer ambiguity. Measure E: free space before build; below 20 GiB stops. Expected new usage cap is 15 GiB. One full build only; no retry, prune, cleanup, or deletion. Retain `f985` rollback and `6592` diagnostic images.

Runtime is limited to stopping the exact original local realtime Free/Deep staging workers after recording state/image/network; no permanent recreate. Through the fixed Protected Staging UI (or equivalent `forceFresh` action), create exactly one new Free report for `https://shun-express.com/`. Deduplicate by authoritative DB state on timeout; never resubmit. Run candidate disposable `--rm` batch containers on the same staging env/network/profile/DB marker: exactly one Free batch and one Deep batch for that report, using existing batch lane commands only. Do not run realtime/polling/presence/cloud workers. Before running, verify no other runnable same-tier jobs; stop if the command cannot safely target only this lineage or the queue is non-empty. Never redispatch a live lease.

Accept one unique report/free job/automatic Deep `v4_pre_admission` job; verify `report_global_v1`, one semantic review per Free/Deep, persisted accepted/rejected reasons and receipts, no field-local disallowed-reference error, and a user-visible report URL. Stop before payment; order/payment/refund/email remain zero. On failure record exact stage/code/first error and do not rerun. Always stop/remove disposable batch containers via `--rm` and restore original realtime workers to their preflight state/image/network. External budget: one clean build, one Free report, one Free batch, one Deep batch, 40-minute bounded observation; no code/Git/DB/schema/manual mutation, historical reuse, Vercel, production, or commerce actions.

## Clean-build timeout retry amendment (archived approval record)

The first full build was not a Docker failure: the client exited `124` after `604026 ms` timeout. The candidate tag was not generated and containers did not change. E: free space was `108.1986 GiB`; `1.507 GB` cache remains retained with no cleanup. Dockerfile upstream Node digest was used; neither `f985` nor `6592` was a base.

Requested single retry: same candidate tag, source hash, Dockerfile, and `--no-cache --pull` clean-build semantics; still forbid `f985`/`6592` as `FROM`. The only change is tool timeout `1800000 ms` (30 minutes). Before retry verify no residual running build, tag absent, and E: free space at least 20 GiB. Do not use incomplete cache to alter clean semantics; no prune/cleanup. One retry only; a second failure forbids a third build. On success continue the approved batch-report scope.

## Approved batch command correction record

The first Free disposable command exited in 1.2 seconds before script import with `ERR_MODULE_NOT_FOUND @/db`; therefore no business-significant Free batch occurred and there were zero DB writes, model calls, or leases. The report/model-call budget and objective are unchanged.

Use the existing project entrypoints from the image's default workspace context: `npm run worker:drain:free --workspace @open-geo-console/web`, with Deep corresponding to `:deep`. This replaces hand-written Node imports so workspace cwd, `tsx`, and the TypeScript path alias resolve correctly. After authoritative job-queued and no-live-lease checks, and only after old workers are stopped, permit exactly one actual Free drain and one actual Deep drain. If either command fails before its entrypoint, stop. This is a mechanical command correction within the approved objective; it adds no report, model call, build, or external action authorization. No external action is executed by this record.

## One-report batch final record

Clean image `bf2c` built successfully and remains retained. The user manually created report `040ee9f3...` with Free job `ef671a12...`. The first clean Free batch command failed before entrypoint due to the alias error above; it caused zero DB/model/lease activity, and the corrected command was not run for this job. Original `f985` workers were restored and claimed the job. Free completed through the old path; automatic Deep job `7fe46715...` also ran on `f985`, reached 96% `grounded_answer_synthesis`, then terminally failed at `14:32:58Z` with `unexpected_internal_error`, with no lease, receipt, artifact, or field-local-disallowed indication; nine polls were unchanged.

This report is not clean-image acceptance. Payment and order side effects remain zero. Original `f985` containers are currently running and clean `bf2c` is retained. The one-report scope is consumed and acceptance failed; any new clean-image acceptance requires a new report under a new scope. Do not replay or reuse this historical report.

## Clean-image second-report acceptance (archived approval record)

Do not use, repair, or replay report `040ee9f3...` or its jobs. Stop the exact old `f985` realtime workers, then create exactly one new Free report for `https://shun-express.com/`; run clean image `bf2c` disposable batch Free and Deep exactly once each, stopping before payment.

Preflight must confirm candidate tag/ID/labels unchanged, authoritative queue has zero queued/retry/running/live jobs (ignore but do not modify `repair_wait` and terminal), and record exact old-container stop state. For transient DB timeout, retry read-only preflight every 30 seconds within 40 minutes without changing endpoint. Submit through fixed Protected Staging UI with one `forceFresh`; deduplicate an ambiguous response from authoritative DB and never resubmit.

Use only the image-default-entrypoint commands: `docker run --rm --network open-geo-console_default --env-file ...\\.data\\workstation-docker\\staging.env open-geo-console:staging-14786f-global-evidence-clean-v1 npm run worker:drain:free --workspace @open-geo-console/web`, and Deep with `:deep`. No handwritten imports or realtime workers; each tier has one business run and no retry.

If a clean batch fails before claim/pre-entrypoint while the target remains queued with no lease, keep old workers stopped and stop; never restore them to claim the queued job. If claimed/live, do not interfere; wait for terminal. Restore old `f985` workers only after the clean lineage is terminal and has no live lease. Verify global policy, accepted/rejected sources, receipt/artifact, one review per tier, and zero payment/order. No build, code, Git, cleanup, Vercel, production, or commerce action.

## Second-report command correction record

The second disposable container also exited before the app entrypoint because the npm workspace name was invalid; there were zero DB writes, model calls, leases, or business Free batches. `Dockerfile.worker` ends with `WORKDIR /app`, no `ENTRYPOINT`, and a realtime CMD. The root package exposes canonical `worker:drain:free`/`worker:drain:deep` scripts, while `apps/web` is named `web` (not `@open-geo-console/web`); the root scripts delegate into the workspace and the app scripts use `node --import tsx` with the correct alias context.

Therefore the only permitted container argv correction is to override CMD exactly as `npm run worker:drain:free` or `npm run worker:drain:deep`, with no workspace parameter. Do not guess workspace/prefix values or use handwritten Node imports. After authoritative new-target queued/no-lease and old-worker-stopped checks, permit exactly one actual business drain per tier. These two pre-entrypoint construction failures add no model, DB, or report activity and do not expand the approved objective. No external action is executed by this record.

## Sources of truth

This scope is grounded only in the measured worktree status/numstat above and the user's stated objective and acceptance checks. Existing runtime/status records and prior scope text do not authorize work or override this frozen lock.

## Prior semantic-review implementation and verification baseline

The user approved implementation on 2026-07-26 (Asia/Shanghai). The approved allowlist was implemented within the recorded budgets:

- production diff: `+157/-41`
- test diff: `+135/-34`
- focused checks: `70 passed, 1 skipped`
- lint: pass
- full test: `303 files passed/46 skipped; 2851 passed/193 skipped`
- build: pass
- diff/allowlist check: pass
- independent static reviewer: PASS

No model, Docker, database, Protected Staging, payment, or deployment workflow was run. The original dirty baseline remains preserved and unchanged outside the approved implementation files.
