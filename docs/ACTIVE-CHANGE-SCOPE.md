# Active Change Scope Lock

Status: `APPROVED`

Approval authority: explicitly approved by the user on 2026-07-20 after reviewing this exact document. The allowlist, budgets, external-action limits, immutable authorities, acceptance gates, and deviation brakes below are now binding. On 2026-07-20, after independent reproduction of the Unit 6 JSONB double-serialization defect, the user also explicitly approved the exact Unit 6A expansion recorded below. After the full suite exposed the directly contradictory stale unit mock, the user explicitly approved adding that single test file under its locked budget and behavior.

## Objective and sole baseline

Selectively consolidate the approved V4 baseline and produce exactly one complete protected-Staging deep report for `https://shun-express.com/`, following only:

- Design: `docs/superpowers/specs/2026-07-19-v4-baseline-consolidation-complete-report-design.md`
- Planning/design commit: `5bc53de7866650b0d311d857aa3f3452c5812f5f`
- Code integration base: `fee9c822aedc3b4cde5c2ebe5cffffb239950fff`
- Branch: `codex/v4-answer-optimization-scope-reset`
- Plan: `docs/superpowers/plans/2026-07-19-v4-baseline-consolidation-complete-report.md`

The integrated runtime may carry only:

1. the approved V4 commercial-answer prompt and exact V4/free one-shot Workers already present at `fee9c82`;
2. optional `rewriteExample` language fallback from `4b8a450`;
3. unique analyzable-body-hash V4 admission from `17016df`;
4. atomic ready-Core publication/commercial terminalization and canonical V4 error persistence from selected `9d30ce9` hunks;
5. exact ready-Core re-entry from `e3c6841`;
6. reproducible protected-Staging V4 model/token/runtime readiness from `cecfeba` and the selected atomic-Core readiness hunks.

Full cherry-pick is not authority. Every hunk must map to one item above and stay within the exact file and behavior allowlists below.

## Immutable and locked identities

- Historical contaminated report `8446d645-8db1-45ce-8f4a-8016f7ed1b8f` and free job `58f10a1b-25af-4e7c-b7fa-7dee1b4947a4` are read-only evidence. They may not be resumed, reopened, replayed, cloned, deleted, repaired, requeued, terminalized, or used as the new report.
- New target website: `https://shun-express.com/`.
- Required identity: `深圳市凌顺国际物流有限公司` / `凌顺国际物流`; `凌顺速运` may appear only as supported brand wording. `顺丰`, `顺丰速运`, and `SF Express` are prohibited target identities.
- Price/action: exactly one CNY 199 Airwallex Sandbox payment, authorized only for the one new report.
- Production is read-only and must remain byte/identity-equivalent at every observable deployment/container boundary.

Locked questions, with no rewrite or paraphrase:

1. 凌顺国际物流公开提供哪些具体的跨境运输、集运、仓储、清关支持和末端派送服务，分别覆盖哪些国家、地区和路线？
2. 对寄往台湾、菲律宾、阿联酋、沙特等路线的不同货物场景，应该选择哪些服务方案，各自有哪些时效、交付条件和限制？
3. 买家下单前应核实哪些事项，包括服务范围、报价与计费假设、禁限运要求、清关责任、末端派送条件以及主要风险？

## Exact code and test allowlist

No code, configuration, script, or test path outside this list may change.

### Unit 2 — optional rewrite fallback

1. `packages/ai-report-engine/src/analysis.ts`
2. `packages/ai-report-engine/src/index.test.ts`

Allowed behavior: clone the page analysis and omit only optional `rewriteExample` values whose bounded correction still violates the report language contract. Any required field or mixed violation remains fail-closed.

Budget: production `+45/-15`; tests `+40/-5`.

### Unit 3 — unique-body V4 admission

1. `apps/web/src/worker/report-v4-admission-production.ts`
2. `apps/web/src/worker/report-v4-admission-runtime.ts`
3. `apps/web/src/worker/report-v4-admission-runtime.test.ts`

Allowed behavior: count distinct exact cleaned analyzable-body SHA-256 values toward the 51-page boundary; persist duplicates as exclusions with provenance. URL/site/admission/snapshot meaning otherwise remains unchanged.

Budget: production `+35/-10`; tests `+40/-5`.

### Unit 4 — atomic Core publication and canonical errors

1. `apps/web/src/db/public-source-commerce.postgres.test.ts`
2. `apps/web/src/db/public-source-commerce.test.ts`
3. `apps/web/src/db/public-source-commerce.ts`
4. `apps/web/src/db/report-v4-artifact-revisions.test.ts`
5. `apps/web/src/db/report-v4-artifact-revisions.ts`
6. `apps/web/src/scripts/report-v4-staging-preflight.test.ts`
7. `apps/web/src/worker/processor.test.ts`
8. `apps/web/src/worker/processor.ts`
9. `apps/web/src/worker/report-v4-core-acceptance.test.ts`
10. `apps/web/src/worker/report-v4-core-acceptance.ts`
11. `apps/web/src/worker/report-v4-core-production.postgres.test.ts`
12. `apps/web/src/worker/report-v4-core-production.test.ts`
13. `apps/web/src/worker/report-v4-core-production.ts`
14. `apps/web/src/worker/report-v4-orchestrator.test.ts`
15. `apps/web/src/worker/report-v4-orchestrator.ts`
16. `apps/web/src/worker/report-v4-startup-readiness.test.ts`
17. `apps/web/src/worker/report-v4-startup-readiness.ts`
18. `scripts/start-report-v4-staging-workers.ps1`
19. `scripts/start-workstation-workers.ps1`

Allowed behavior:

- persist Core artifact as `ready`, then atomically activate artifact, publish report pointer, terminalize job/order/credit/refund/access/email, and append transition evidence in one transaction;
- exact idempotent re-entry for the same lineage and legitimate active diagnosis descendant only;
- normalize and persist a V4 runner error through the existing job state machine before the exact one-shot exits;
- add focused rollback, lineage, error, readiness, and compatibility tests.

Explicitly forbidden even inside these files: `recoverFailedPaidReportV4CoreForTerminalReplay`, any replay/reopen/requeue/recovery of a failed or terminal Core, demoting an active artifact, clearing an active report pointer for replay, deleting truthful refund/email state for replay, restoring spent credit for replay, operator-replay exports/fixtures/transitions, and all related hunks from `9d30ce9` or `6e0d3a8`.

Budget: production/config `+160/-70`; tests `+180/-70`. Exceeding either budget requires reapproval even if paths remain allowlisted.

### Unit 5 — exact ready-Core and Staging runtime readiness

1. `apps/web/src/db/report-v4-production-jobs.ts`
2. `apps/web/src/db/report-v4-production-jobs.test.ts`
3. `apps/web/src/scripts/report-v4-staging-preflight.test.ts` (already listed)
4. `scripts/start-workstation-workers.ps1` (already listed)

Allowed behavior: admit only exact pending/ready Core lineage; materialize required V4 profile and dedicated MiMo bindings inside Staging only; require the token-hash secret before presence/claim. No production fallback or production startup change.

Budget: ready-Core production `+10/-10`, tests `+30/-5`; runtime script `+30/-10`, preflight tests `+15/-5`.

### Unit 6 — conditional five-failure test repair

1. `apps/web/src/db/report-v4-acceptance-authority-phase-snapshot.postgres.test.ts`

This file may change only if the same five `report_v4_acceptance_events_details_check` failures reproduce and the defect is a stale test fixture for the already-selected V4 acceptance contract. Budget `+40/-40`. No production code, schema, migration, historical row, registry weakening, or acceptance weakening is authorized. If the fix requires another path, stop.

### Unit 6A — approved acceptance-ledger JSONB serialization correction

1. `apps/web/src/db/report-v4-acceptance-ledger.ts`
2. `apps/web/src/db/report-v4-acceptance-ledger.postgres.test.ts`
3. `apps/web/src/db/report-v4-acceptance-ledger.test.ts`

Allowed behavior: pass the already-validated `input.details` object directly to the postgres-js `$param::jsonb` boundary so the driver serializes it exactly once; add PostgreSQL regression coverage proving canonical `fault_injection` and `checkpoint_terminal` details persist as JSONB objects and satisfy the existing database constraint; update only the directly contradictory unit mock so `tx.json` is called exactly once with the validated object, the mock extracts the typed parameter `.value`, the JSONB parameter type remains OID `3802`, and all existing inserted, idempotency, hashing, and unrelated assertions remain unchanged.

Explicitly forbidden: no database schema, migration, constraint, ledger union/parser, canonical hashing, guard authority, event occurrence, acceptance meaning, historical row, or compatibility behavior change. Do not weaken or bypass `report_v4_acceptance_events_details_check`.

Budget: production `+5/-5`; PostgreSQL tests `+50/-10`; unit test `+10/-10`.

## Documentation, registry, and evidence allowlist

Only these non-code paths may change:

1. `docs/ACTIVE-CHANGE-SCOPE.md`
2. `docs/superpowers/plans/2026-07-19-v4-baseline-consolidation-complete-report.md`
3. `docs/PROJECT-STATE.md`
4. `docs/TASKS.md`
5. `docs/DECISIONS.md`
6. `docs/operations/evidence/2026-07-19-shun-express-v4-deep-report.md`
7. `docs/operations/evidence/report-v4-protected-staging-acceptance.json` (new machine projection of the same accepted run)
8. `docs/operations/evidence/2026-07-19-shun-express-v4-desktop.png` (new)
9. `docs/operations/evidence/2026-07-19-shun-express-v4-mobile.png` (new)
10. `config/report-contracts/combined-geo-report-v4.requirements.json`
11. `docs/REPORT-V4-COVERAGE-MATRIX.md`

Registry changes are limited to changing each of the 20 existing `status` values from `implemented` to `verified` after its exact automated and protected-Staging evidence passes. Contract, spec path, matrix path, IDs, titles, implementation paths, test paths, commands, runtime evidence paths, acceptance logic, and product meaning may not change. The matrix may change only as deterministic output from that status promotion.

The narrative evidence file is the sole human authority for this shun-express run. The JSON is its machine-verifiable projection required by the existing gate, and the PNGs are referenced visual evidence; they do not create additional business runs. No secret, cookie, password, raw provider token, raw report access token, or unhashed client IP may be written.

## Runtime file mutation allowlist

After the integrated runtime SHA is committed and the replacement image passes inspection, `.data/workstation-docker/staging.env` may change in exactly one field: `OGC_DEPLOYMENT_VERSION=<full integrated runtime SHA>`. All other bytes/values must be preserved. The file is not committed. On any pre-update failure it remains unchanged; after update, mismatch is a fail-closed stop.

## Forbidden subsystems and changes

- Commits/behaviors: no `6e0d3a8` operator replay; no `d1b12e6` or `7911c80` limited/refunded-Core diagnosis enhancement; no wholesale `d9ee6a9`; no excluded hunk hidden inside an allowed file.
- No database schema/migration/DDL, provider adapter, price/currency, question wording, customer HTML layout, report contract/methodology/version, V1–V3 behavior, PDF surface, crawler policy outside unique-body dedup, payment Webhook authority, token format, rate limit, email/refund policy, production config, or dependency change.
- No `run-report.bat`; no ordinary FIFO, drain, batch, realtime/persistent Worker for the target; no broad `start-workstation-workers.ps1` or `start-report-v4-staging-workers.ps1` execution.
- No historical report/job/order/payment/credit/refund/artifact/token/email mutation; no compatibility, migration, replay, replacement, correction, presentation refresh, recovery, or operator repair.
- No user-owned `assets/`, Qoder files, `run-report.bat`, the V3 plan, unrelated worktree, unrelated Docker image/container, or unrelated dirty file may be touched, staged, cleaned, reset, stashed, moved, or deleted.
- No production deploy, alias movement, image/container/service action, Worker stop/start, database write, report scan, model call, payment, refund, or email execution.

## Exact verification commands

Focused verification includes the directly changed test files plus:

```powershell
npm test -- packages/ai-report-engine/src/index.test.ts
npm test -- apps/web/src/worker/report-v4-admission-runtime.test.ts apps/web/src/worker/report-v4-admission-production.test.ts apps/web/src/worker/report-v4-site-collector.test.ts
npm test -- apps/web/src/db/public-source-commerce.test.ts apps/web/src/db/public-source-commerce.postgres.test.ts apps/web/src/db/report-v4-artifact-revisions.test.ts apps/web/src/db/report-v4-production-jobs.test.ts apps/web/src/worker/processor.test.ts apps/web/src/worker/report-v4-core-acceptance.test.ts apps/web/src/worker/report-v4-core-production.test.ts apps/web/src/worker/report-v4-core-production.postgres.test.ts apps/web/src/worker/report-v4-orchestrator.test.ts apps/web/src/worker/report-v4-startup-readiness.test.ts apps/web/src/scripts/report-v4-staging-preflight.test.ts
npm test -- apps/web/src/worker/exact-job.test.ts apps/web/src/worker/exact-preview-job.test.ts apps/web/src/db/jobs-targeted-claim.postgres.test.ts
npm test -- apps/web/src/db/report-v4-acceptance-ledger.postgres.test.ts
npm test -- apps/web/src/db/report-v4-acceptance-authority-phase-snapshot.postgres.test.ts
npm run report:v4:traceability
npm run report:v4:matrix
npm run report:v4:acceptance
npm run lint
npm run build
npm test
npx tsx --tsconfig apps/web/tsconfig.json --env-file=.data/workstation-docker/staging.env apps/web/src/scripts/db-audit.ts
git diff --check
codegraph sync
codegraph status
```

Post-live verification also requires:

```powershell
npm run report:v4:staging:verify --workspace apps/web
npm run report:v4:traceability
npm run report:v4:acceptance
npx tsx --tsconfig apps/web/tsconfig.json --env-file=.data/workstation-docker/staging.env apps/web/src/scripts/db-audit.ts
```

PostgreSQL suites use a disposable loopback-only PostgreSQL 17 database or the explicitly sanctioned test admin URL. Staging/production business databases are never substituted for destructive tests.

## Exact expensive and external actions

The following actions are authorized only after this scope becomes `APPROVED`, in the listed order, and only after the preceding deterministic/checker gate is conformant.

### 1. Worker containment

- Revalidate current Windows process PID `19532`, start `2026-07-19 14:18:48 +08:00`, exact command suffix `--env-file=../../.data/workstation-docker/staging.env --import tsx src/scripts/staging-worker.ts free`, active staging marker `4b8a450…`, recent matching database presence, and child PID `25160` before stopping that exact process tree.
- If the PID changed, at most one replacement process tree may be stopped only when all the same executable, cwd/project, command, env-file, tier, staging marker, start-time capture, and recent-presence predicates match. A PID alone is insufficient.
- No production, Codex, CodeGraph, Docker Desktop, WSL, unrelated Node, deep Worker, or nonmatching process may be stopped.

### 2. One integrated image, one Preview, one alias move

- Build exactly one new image tag `open-geo-console:staging-<full-integrated-runtime-sha>` from a clean exact-SHA source, with OCI revision label equal to the full SHA. Build retries are allowed only before any tag/image is successfully created and must not create another accepted image identity.
- Use only Vercel project `prj_WVpdlJfsEp0YyWM2W54w8oBy985S` (`open-geo-console`), WSL's existing credential store, and pinned `vercel@55.0.0`. Do not print/extract/copy credentials.
- Create at most one new Preview deployment for the integrated runtime SHA. No `--prod`, promote, rollback, other project, or second deployment is allowed. A failed deployment command that would require a second created deployment is a stop condition.
- Move only `open-geo-console-staging-itheheda.vercel.app`, once, after the direct Preview is Ready and authenticated runtime checks pass.

### 3. Exact cleanup after replacement verification

After fresh full-ID/reference checks and only after the new image is verified, remove exactly:

- exited container `a3ff80cfa1daf2bc01cd956ba7fbc7baae6a1e45171a1931da26e92e643b232c` (`open-geo-console-staging-worker-deep-1`);
- exited container `a9d112717f0f615774fc3286d54706ea8aa42d6f715c60b30946361f95b7ee0b` (`open-geo-console-staging-worker-free-1`);
- then, if unreferenced, image `sha256:0f4752442cfdb5a53eef22a0bf3b66a8e30945f526dd064445d246df352e91a5` (`staging-4b8a450d7a4163452982388d48ded7938bf699e1`);
- and, if still unreferenced, image `sha256:a223662ed15c392a5a07b13b8ea85adb77482fb5845011c8a210bf832b840ea4` (`staging-fee9c82`).

No other current or dangling image/container may be removed. In particular preserve every `staging-27b25d5…`, `staging-b5ea394…`, `staging-43357d…`, `staging-a13a023…`, `staging-4e30fdb…`, `staging-aee3690`, `prod-v25-11befe9`, `replacement`, and `local` image unless a future separately approved scope names it.

### 4. Exactly one new report and its exact one-shots

- Browser-submit one forced protected-Staging scan for `https://shun-express.com/` and create exactly one new report/free job.
- Invoke the exact legacy-free one-shot only for `(new freeJobId, new reportId)`.
- Invoke the exact V4 pre-admission one-shot only for `(new preAdmissionJobId, new reportId, free)`.
- Do not run any ordinary/persistent Worker. A state-machine-scheduled retry may re-invoke the same exact tuple only when its persisted transition authorizes it; no manual state change or replay.

### 5. Exactly one payment, Core, and diagnosis

- Create and complete one CNY 199 Airwallex Sandbox checkout for the new report. Only a verified signed Webhook may create paid entitlement/credit/Core authority.
- Invoke the exact Core one-shot only for the new deep job tuple.
- Invoke the exact diagnosis-enhancement one-shot only for the one enhancement job created by the successful full Core.
- Do not submit a second checkout/payment, fabricate Webhook state, manually replay, use limited-Core diagnosis compatibility, or drain historical commerce/email/refund queues.
- Commerce processing is permitted only if an existing exact-target operation can prove it will select only the new order/report's truthful queued item. Otherwise acceptance stops at the persisted email/refund intent and does not run broad commerce.

### 6. Browser evidence and final push

- Use the existing authenticated browser selected for the target URL. Inspect HTTP and visible desktop/mobile content and capture only the two allowlisted screenshots. Do not inspect cookies, local/session storage, profiles, passwords, or raw tokens.
- Allow one successful push to `origin/codex/v4-answer-optimization-scope-reset` after final independent acceptance. A failed push may be retried only when remote-ref inspection proves no update occurred. Do not push another branch, merge, open a PR, tag, or deploy production.

## Live acceptance gates

All must pass for the same new report identity:

- `kind=combined_geo_report_v4`, `methodology=two_stage_geo_report_v4`, version `4`;
- full Core `completed` and diagnosis `completed`, never `completed_limited`;
- exactly three substantive Chinese answers, each with at most five owned sources;
- organization is `凌顺国际物流`, never `顺丰` / `顺丰速运` / `SF Express`;
- no unavailable/refusal filler;
- authorized customer HTML returns HTTP 200 and passes 1440px desktop and 390px mobile visible inspection;
- report, immutable snapshot, order, provider payment, credit, Core/diagnosis jobs, artifact lineage, report pointer, access token, and email intent form one unique consistent identity chain;
- terminal jobs have no reserved credit and no active artifact is split from failed/running order/job state;
- Preview deployment, image label, runtime env deployment marker, database deployment marker, and acceptance evidence bind to the full integrated runtime SHA;
- the five PostgreSQL failures are green or proven absent without out-of-scope repair; focused tests, lint, build, full tests, traceability, Staging verifier, final acceptance, DB audit, diff check, and CodeGraph checks pass;
- production deployment remains `dpl_3cx4ntaHcXquqJgRyj9E3tBX96BW`; production deep container remains `13ccba729da8b36a82193ae46d706ff7f0a49afaedfacba69f1aae36e9e79d67` and production free container remains `e137f4e57d0d2490f6263c2a92a816f6154ab2347cf6acaaa08aa6a11af70cee`, both on image `sha256:ed17c0fe9e159834df2dc72a5f8a5d70314e2dcb3f6fd5b2b4a4f3174229e234`; production commerce container remains `be94b86e9febd2621793d800f528ceb5253f8e3aa144dbb38e8abc5456e54663` on image `sha256:028901e0e5e3f9287524573d62f10cdccc22fb9109bd21875a35e5c0709e1d3a`; and no production authority changed.

## Drift brakes

Return `DEVIATION_REVIEW_REQUIRED` and stop immediately if:

- any next action needs an unlisted path, behavior, commit hunk, schema, adapter, product meaning, question, price, layout, deployment target, cleanup target, or extra external side effect;
- any allowlisted file introduces an excluded replay/recovery/limited-Core behavior;
- two revisions fail to reduce the same acceptance failures and a new route is proposed;
- any ordinary/persistent or non-target Worker claims a job, or any runtime reports a mismatched revision;
- the new report enters terminal failed, `completed_limited`, or unapproved `repair_wait`;
- completing the work would require a second report, second payment, second created Preview, manual replay, historical mutation, production mutation, or weakening an acceptance gate;
- exact cleanup identity/reference checks differ from this document;
- production identity differs from the read-only starting snapshot.

## Unit unlock and commit rule

Before every unit, the supervisor states its mapped scope clause, expected artifact, verification, and non-goal. After every unit, an independent checker rereads the design and this scope, then returns only `CONFORMANT`, `REVISE_WITHIN_PLAN`, or `DEVIATION_REVIEW_REQUIRED`.

Before every commit: run `git status --short --branch`, `git diff --check`, exact path/numstat budget audit, excluded-symbol/behavior search, and user-dirty-file audit. Only agent-owned allowlisted paths may be staged. Runtime code/test commits precede deployment; a final docs/evidence-only commit may follow live acceptance. At terminal closeout this scope returns to `FROZEN`.
