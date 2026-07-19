# Active Change Scope Lock

Status: `APPROVED`

Approved by the user on 2026-07-19 with the exact instruction: `批准这份精确 scope，开始 Phase A；Phase A 验收通过后自动执行 Phase B。`

This is a new, two-phase authorization proposal. It replaces the prior shun-express live-run scope, which stopped correctly because the ordinary protected-Staging Worker can only claim by tier/FIFO and would have been able to mutate unrelated queued work. While this document is `FROZEN`, no production-code edit, commit, deployment, Docker/Worker action, database mutation, crawl, model call, payment, email, refund, or browser journey is authorized.

## Objective and locked baseline

Implement the user-approved **Plan A**: a protected-Staging exact-job, one-shot Worker. Only after its independent acceptance is `CONFORMANT`, use that exact Worker path to complete the original `shun-express.com` V4 report chain.

- Branch and initial source: `codex/v4-answer-optimization-scope-reset` at `9c19d2c4e17eebf2d93bd69537f877e4183fb255`.
- Protected-Staging authority: PostgreSQL schema v40 with `deployment_environment=staging`.
- Latest immutable preflight evidence: `docs/operations/evidence/2026-07-19-shun-express-v4-deep-report.md`; it recorded unrelated Staging `analyzing=1` and `synthesizing=1` jobs, so an ordinary Worker start is unsafe.
- Historical shun-express reports, jobs, snapshots, orders, artifacts, questions, credits, access tokens, payments, refunds, and emails are forbidden authority and remain immutable.
- User-owned untracked `assets/` and `docs/superpowers/plans/2026-07-15-v3-paid-acceptance-remediation.md` remain untouched.

## Phase A — exact-job one-shot Worker

### Exact behavior

1. The existing ordinary `claimScanJob(workerId, tier, leaseSeconds)` signature and behavior remain unchanged, including normal tier/FIFO selection and global maintenance.
2. Exact identity is the required tuple `jobId + reportId + tier`. The targeted claim must atomically narrow the existing eligible state, tier, lease, retry-not-before, and attempt conditions to that identity; it must not select an older FIFO job.
3. In exact mode only, expired-lease recovery, exhausted-attempt failure, credit settlement, artifact cleanup, and staging-regeneration cleanup can affect only the exact job. Unrelated jobs in those states remain unchanged.
4. The one-shot CLI must first run the protected-Staging guard, database/schema/profile check, and V4 Worker readiness. It then admits only: `product_contract=recommendation_forensics_v1`, `artifact_contract=combined_geo_report_v4`, `fulfillment_methodology=two_stage_geo_report_v4`, `recommendation_report_version=4`, and `reason` in `v4_pre_admission`, `standard`, or `v4_diagnosis_enhancement`.
5. It claims exactly one job, verifies the returned identity, runs the normal `processScanJob` with its normal heartbeat and terminalization path, and exits. It has no queue loop, Worker-presence reporting, FIFO drain, or queue-provider notification consumption.
6. A not-found, identity mismatch, ineligible state, wrong tier/report, contract/methodology/version/reason mismatch, guard failure, or readiness failure must fail before any other-job mutation or model call.

### Exact implementation allowlist

Only these source/test paths may change; a listed file proved wholly unnecessary by implementation evidence may be omitted, but no eighth code/test path may be added:

1. `apps/web/src/worker/job-transition-service.ts`
2. `apps/web/src/db/jobs.ts`
3. `apps/web/src/worker/exact-job.ts` (new)
4. `apps/web/src/scripts/staging-exact-worker.ts` (new)
5. `apps/web/package.json`
6. `apps/web/src/db/jobs-targeted-claim.postgres.test.ts` (new)
7. `apps/web/src/worker/exact-job.test.ts` (new)

Documentation allowlist only: this file, `docs/operations/evidence/2026-07-19-shun-express-v4-deep-report.md`, `docs/PROJECT-STATE.md`, and optional `docs/TASKS.md`.

### Explicit non-goals and prohibited paths

No schema or migration; root package; start-workstation script; ordinary Worker index; ordinary drain/presence/queue code; Docker Compose; deployment configuration; crawler; prompts; report contracts; payment/commerce; historical recovery/replay; runtime behavior of ordinary workers; or compatibility/refactor work. Do not alter the exact locked questions or report acceptance to accommodate implementation.

### Diff budget

- At most five production/config files and two test files from the exact list above.
- Production/config additions: at most 220 lines. Test additions: at most 320 lines.
- No deletion over 40 lines unless it replaces the same logic.
- No other repository path may be edited. User-owned dirty paths are not part of this diff.

### Phase A mandatory acceptance

Focused tests must prove all of the following:

- the target can be newer than an older eligible FIFO job without claiming the older job;
- unrelated expired and exhausted jobs are unchanged;
- wrong report, tier, contract, methodology, version, reason, or state fail closed;
- exact retry eligibility preserves the existing retry/lease/attempt conditions;
- ordinary FIFO claim and global maintenance are unchanged;
- one-shot mode makes zero or one claim only, with no second claim; and
- the protected-Staging guard runs before exact-job execution.

Run focused tests for the two new test files plus relevant existing job/Worker tests, then `npm run lint`, `npm run build`, and `npm test`. If `npm test` retains a pre-existing failure, record the exact unrelated failure separately; it is not green evidence. Run `codegraph sync`, `codegraph status`, `git diff --check`, and a complete allowlist/budget audit before commit. The independent checker must re-read this scope, source diff, tests, and commands and return `CONFORMANT` before Phase B can begin.

## Phase B — bounded shun-express complete-report acceptance

Phase B is blocked until Phase A is independently `CONFORMANT`, its approved exact diff is committed, and the same exact revision is used everywhere below. It creates one new target only:

- Website: `https://shun-express.com/`
- Company: `深圳市凌顺国际物流有限公司`
- Brand: `凌顺国际物流` / `凌顺速运`
- Never identify the target as 顺丰、顺丰速运、or SF Express.
- Locked Chinese buyer questions:
  1. 凌顺国际物流公开提供哪些具体的跨境运输、集运、仓储、清关支持和末端派送服务，分别覆盖哪些国家、地区和路线？
  2. 对寄往台湾、菲律宾、阿联酋、沙特等路线的不同货物场景，应该选择哪些服务方案，各自有哪些时效、交付条件和限制？
  3. 买家下单前应核实哪些事项，包括服务范围、报价与计费假设、禁限运要求、清关责任、末端派送条件以及主要风险？

### Authorized Phase B actions after explicit approval

1. Commit the accepted exact Phase A revision only after the complete diff allowlist/budget audit; do not push or alter production.
2. Create one protected Preview from that revision, verify Ready, and align only the protected-Staging alias.
3. Build the matching staging Docker image, but do not start persistent workers. Use only a Compose one-shot command for each target job; do not start/stop/recreate persistent free/deep workers.
4. Create exactly one new shun-express report, perform one V4 pre-admission collection of at most 50 analyzable same-site public HTML pages, and retain the resulting immutable snapshot.
5. Process each created V4 free, deep, and diagnosis-enhancement job only through the exact one-shot Worker identity path. No historical job/report may be repaired, reopened, cloned, replayed, or substituted.
6. Create and complete exactly one CNY 199 Airwallex Sandbox payment via the signed Webhook path. Complete the locked three-question core and diagnosis stages, and inspect the access-controlled HTML report.
7. Record command results and immutable identities only in the single allowlisted evidence file; database inspection after a phase is read-only and secrets are never logged.

Phase B completion requires one same-identity report with `combined_geo_report_v4`, methodology `two_stage_geo_report_v4`, version 4, completed core and diagnosis, exactly three substantive Chinese answers, question-owned source counts at or below five, correct 凌顺国际物流 identity with no 顺丰、顺丰速运、or SF Express misidentification, and authorized HTML `/reports/<id>/report.html` HTTP 200. `completed_limited`, unavailable/refusal filler, incomplete diagnosis, or failed/partial commercial delivery is not completion and must stop without replay or replacement.

## Forbidden external actions

Production deployment, production database mutation/query for execution, production Worker/image/service change, historical authority mutation, extra report/collection/payment, whole-report regeneration, ordinary FIFO/persistent Worker operation, model call before exact identity passes, non-target job mutation, repeated payment/refund/email/deployment, and any browser-cookie/storage/password inspection are prohibited. Staging emails/refunds may only follow the new target's terminal policy and remain truthful evidence, never a fabricated success.

## Unit audit and unlock procedure

1. Show this precise FROZEN scope to the user. Change it to `APPROVED` only after explicit approval of this written allowlist.
2. Before every implementation/external unit, state the mapped scope clause, expected artifact, verification, and non-goal. After it, independently audit actual diff/evidence and return only `CONFORMANT`, `REVISE_WITHIN_PLAN`, or `DEVIATION_REVIEW_REQUIRED`.
3. `CONFORMANT` permits the next mapped unit; `REVISE_WITHIN_PLAN` repairs the current unit only; `DEVIATION_REVIEW_REQUIRED` stops all substantive changes and requests the minimal user decision.
4. Before every commit and at final closeout, run `git status --short`, `git diff --check`, and the full allowlist/budget audit. Re-freeze this scope after terminal evidence.
