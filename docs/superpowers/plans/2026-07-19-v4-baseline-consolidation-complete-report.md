# V4 Baseline Consolidation and Complete shun-express Report Implementation Plan

> **Execution baseline:** `docs/superpowers/specs/2026-07-19-v4-baseline-consolidation-complete-report-design.md` at `5bc53de7866650b0d311d857aa3f3452c5812f5f`.
>
> **Scope gate:** No production-code edit, process stop, deployment, Docker mutation, database write, report creation, model call, payment, email/refund processing, commit, or push may begin until the user explicitly approves the exact `docs/ACTIVE-CHANGE-SCOPE.md` written beside this plan.

## Goal

Selectively consolidate the approved V4 business-answer and exact one-shot Worker baseline with only the five approved repair groups, align one protected-Staging Web/Worker runtime revision, then create and accept exactly one new CNY 199 deep V4 report for `https://shun-express.com/`. Historical failed authority and production remain immutable.

## Locked definitions

- **Planning SHA:** `5bc53de7866650b0d311d857aa3f3452c5812f5f`.
- **Code integration base:** `fee9c822aedc3b4cde5c2ebe5cffffb239950fff`, the parent of the planning SHA.
- **Integrated runtime SHA:** the full Git SHA produced after Units 1–6 are conformant and committed. Preview, Docker image label, staging runtime deployment marker, exact one-shots, and the report evidence must bind to this SHA.
- **Final evidence SHA:** an optional docs/evidence-only descendant created after live acceptance. It must not change runtime code, configuration, registry meaning, package files, or the integrated runtime SHA. Both SHAs are reported; runtime alignment is judged against the integrated runtime SHA.
- **Target:** `https://shun-express.com/`; organization `深圳市凌顺国际物流有限公司`; customer identity `凌顺国际物流`. `顺丰`, `顺丰速运`, and `SF Express` are prohibited identities.
- **Historical immutable evidence:** report `8446d645-8db1-45ce-8f4a-8016f7ed1b8f`; free job `58f10a1b-25af-4e7c-b7fa-7dee1b4947a4`.
- **Locked questions:** the three Chinese questions in the approved design and scope, byte-for-byte after Unicode normalization.

## Supervisor and checker protocol

The root task is supervisor and evidence owner. Each bounded implementation or external unit is assigned to one file-owned executor when delegation is useful. After the executor stops, an independent checker must reread the design and approved scope and inspect the actual diff, commands, tests, runtime evidence, and external-action ledger. The checker returns exactly one gate:

- `CONFORMANT` — continue automatically.
- `REVISE_WITHIN_PLAN` — repair only the current unit, then recheck.
- `DEVIATION_REVIEW_REQUIRED` — stop all substantive work and ask the user the smallest decision question.

Ordinary compilation, test, tool, and in-scope implementation failures are repaired within the current unit. A budget overrun, new path, behavior outside the design, extra external side effect, report/payment replacement, production mutation, or need to change a locked question is a deviation.

## Read-only starting snapshot

Captured 2026-07-19 before scope approval:

- Branch `codex/v4-answer-optimization-scope-reset`, HEAD `5bc53de7866650b0d311d857aa3f3452c5812f5f`; CodeGraph is up to date.
- Protected-Staging PostgreSQL marker is `staging`, schema is `40`, and three diagnosis checkpoints exist.
- `.data/workstation-docker/staging.env` is `staging` / `preview` / `test` / `realtime` / `postgres` and still reports deployment version `4b8a450d7a4163452982388d48ded7938bf699e1`. The V4 MiMo key, token-hash secret, and database URL are present; their values were not read or printed.
- Windows PID `19532`, started `2026-07-19 14:18:48 +08:00`, is an ordinary `staging-worker.ts free` process using the merged staging env; child PID `25160` is its esbuild service. Its current database presence is `ogc-worker-free-c6a83ff4-0b3a-4c7c-9fc4-4d4933b2ac63` at deployment `4b8a450…`.
- No matching WSL process was found. Docker Staging free/deep containers are exited on image `staging-4b8a450…`. Production deep container `13ccba729da8b36a82193ae46d706ff7f0a49afaedfacba69f1aae36e9e79d67` and free container `e137f4e57d0d2490f6263c2a92a816f6154ab2347cf6acaaa08aa6a11af70cee` run image `sha256:ed17c0fe9e159834df2dc72a5f8a5d70314e2dcb3f6fd5b2b4a4f3174229e234`; production commerce container `be94b86e9febd2621793d800f528ceb5253f8e3aa144dbb38e8abc5456e54663` runs image `sha256:028901e0e5e3f9287524573d62f10cdccc22fb9109bd21875a35e5c0709e1d3a`.
- Fixed protected-Staging alias `https://open-geo-console-staging-itheheda.vercel.app` resolves to Ready Preview `dpl_4S4uCgdmZjavoGLcUCgPzmSkmw85`. Production `https://geo.itheheda.online` resolves to Ready deployment `dpl_3cx4ntaHcXquqJgRyj9E3tBX96BW`.
- The only current non-terminal Staging jobs are three unrelated `repair_wait` rows. They are not authority for this task and must not be claimed or changed.

## Unit 0 — approve the exact lock

**Artifacts:** this plan and `docs/ACTIVE-CHANGE-SCOPE.md` only.

- [ ] Show the complete plan and scope diff.
- [ ] Independent checker rereads the design, both documents, current Git/runtime evidence, and returns a gate.
- [ ] Stop for explicit user approval. Only the exact approval changes scope status from `FROZEN` to `APPROVED`.

## Unit 1 — contain every ordinary protected-Staging Worker

**Repository diff:** none.

- [ ] Re-query Windows PID, parent/child chain, command line, start time, merged runtime marker, recent `worker_presence`, WSL processes, and Docker containers.
- [ ] Stop only the revalidated ordinary Windows free Worker process tree currently represented by PID `19532` and child `25160`; if those PIDs changed, stop at most one replacement process tree only when every identity predicate in the scope matches.
- [ ] Prove no matching Windows/WSL process, running Staging Docker Worker, or recent mismatched Staging presence remains.
- [ ] Snapshot production Vercel deployment and production container IDs before implementation.

**Acceptance:** zero non-target job transition or model-call evidence; unrelated `repair_wait` jobs unchanged.

## Unit 2 — optional `rewriteExample` language fallback

**Source:** selective behavior from `4b8a450d7a4163452982388d48ded7938bf699e1`.

**Files:**

- `packages/ai-report-engine/src/analysis.ts`
- `packages/ai-report-engine/src/index.test.ts`

**Budget:** production at most `+45/-15`; tests at most `+40/-5`.

- [ ] Port only clone-and-omit behavior for violations confined to optional `rewriteExample`.
- [ ] Prove required prose, evidence, locale, GEO terminology, and any mixed violation remain fail-closed.
- [ ] Run `npm test -- packages/ai-report-engine/src/index.test.ts` plus `git diff --check` and scoped diff audit.

## Unit 3 — unique-body V4 admission

**Source:** selective behavior from `17016dfe64230c6571423ce82653a563e9d2cc07`.

**Files:**

- `apps/web/src/worker/report-v4-admission-production.ts`
- `apps/web/src/worker/report-v4-admission-runtime.ts`
- `apps/web/src/worker/report-v4-admission-runtime.test.ts`

**Budget:** production at most `+35/-10`; tests at most `+40/-5`.

- [ ] Count only distinct exact cleaned analyzable-body hashes toward the 51-page boundary.
- [ ] Preserve duplicate pages as immutable exclusions with source/canonical provenance.
- [ ] Prove duplicate URLs/bodies cannot force custom service and 51 unique bodies still do.
- [ ] Run the admission runtime/production/site-collector focused tests, then diff audit.

## Unit 4 — atomic Core publication, canonical errors, and no replay

**Source:** only the atomic publication, commerce terminalization, readiness, and canonical job-error hunks from `9d30ce9a055f0ce27274729a7baab6650a6da0a6`.

**Files:** the exact 19-path Unit 4 allowlist in `docs/ACTIVE-CHANGE-SCOPE.md`.

**Budget:** production/config at most `+160/-70`; tests at most `+180/-70`.

- [ ] Change Core generation from active-before-commerce to `ready` before one transaction atomically activates the artifact, publishes the report pointer, terminalizes job/order/credit/refund/access/email, and records transition evidence.
- [ ] Preserve exact idempotent re-entry and enhancement ancestry.
- [ ] Route V4 runner errors through canonical normalization and `failScanJob` before one-shot exit.
- [ ] Add fault injection at activation and all commercial boundaries and prove complete rollback.
- [ ] Explicitly reject every `recover*`, replay, reopen, demote, unpublish, historical failed-Core, operator terminal-replay export, fixture, or transition. Full cherry-pick of `9d30ce9` is prohibited because it contains replay-related hunks outside the design.
- [ ] Run focused commerce PostgreSQL, artifact-revision, processor, core-acceptance, core-production, orchestrator, and startup-readiness tests.

## Unit 5 — exact ready-Core re-entry and reproducible Staging runtime

**Sources:** selective `e3c684151ca6c940ab820959cad9c4f7925607bc` and `cecfebaac06362dcd4ed9a3e77afd68cc8e3fac2`.

**Files:**

- `apps/web/src/db/report-v4-production-jobs.ts`
- `apps/web/src/db/report-v4-production-jobs.test.ts`
- `apps/web/src/scripts/report-v4-staging-preflight.test.ts`
- `scripts/start-workstation-workers.ps1`

**Budget:** ready-Core production `+10/-10`, tests `+30/-5`; runtime script `+30/-10`, preflight tests `+15/-5`.

- [ ] Admit `pending` or `ready` prepared Core only for the exact report/order/job/config lineage; reject any other artifact or active split.
- [ ] Materialize the locked V4 profile, dedicated MiMo bindings, and token-hash readiness only inside Staging; do not add production fallbacks.
- [ ] Prove startup refuses missing/mismatched profile, secret, full revision, deployment profile, queue mode, or database marker before presence/claim.
- [ ] Run production-job, preflight, launcher parse, startup-readiness, and exact one-shot tests.

## Unit 6 — rerun deterministic and PostgreSQL gates

**Conditional repair file:** only `apps/web/src/db/report-v4-acceptance-authority-phase-snapshot.postgres.test.ts`, and only if the same five `report_v4_acceptance_events_details_check` failures still reproduce from stale fixture shape. Budget `+40/-40`; no production, migration, schema, registry, or acceptance weakening is allowed.

**Approved Unit 6A deviation repair:** independent PostgreSQL reproduction proved the fixture is canonical and the production ledger double-serializes `details` before `$param::jsonb`. The user approved `apps/web/src/db/report-v4-acceptance-ledger.ts` (`+5/-5`), `apps/web/src/db/report-v4-acceptance-ledger.postgres.test.ts` (`+50/-10`), and the directly contradictory stale mock in `apps/web/src/db/report-v4-acceptance-ledger.test.ts` (`+10/-10`). Pass the validated details object through exactly one postgres-js JSON parameter, prove `fault_injection` and `checkpoint_terminal` persist as JSONB objects, update only the stale unit mock to assert one `tx.json` call with the validated object and typed OID-3802 parameter, and do not change schema, migration, constraint, parser, hashing, guard authority, occurrences, or acceptance meaning.

- [ ] Run all focused tests from Units 2–5 and the exact free/V4 one-shot and exact-claim PostgreSQL tests.
- [ ] Rerun the five recorded acceptance phase-snapshot PostgreSQL cases. Their exact five failures have been independently confirmed as the approved Unit 6A ledger double-serialization defect, not a fixture defect.
- [ ] Apply the two-file Unit 6A correction, run the dedicated ledger PostgreSQL regression, then rerun all five phase-snapshot cases without changing the fixture contract.
- [ ] Run `npm run report:v4:traceability`, `npm run report:v4:matrix`, `npm run report:v4:acceptance`, `npm run lint`, `npm run build`, `npm test`, and `git diff --check`.
- [ ] Sync CodeGraph, check status, and inspect affected surfaces.
- [ ] Compare complete diff and per-unit numstat to the approved allowlist/budgets; search for all excluded commit symbols and behaviors.
- [ ] Commit only after an independent `CONFORMANT` result. Record this full SHA as the integrated runtime SHA.

`report:v4:acceptance` may remain fail-closed at this point only because protected-Staging evidence and registry promotion have not yet occurred; structural/test failures are not accepted.

## Unit 7 — align one integrated protected-Staging runtime

**External actions:** exact actions and IDs are listed in the scope.

- [ ] From a clean WSL2 worktree at the integrated runtime SHA, copy only original project link `prj_WVpdlJfsEp0YyWM2W54w8oBy985S`; use pinned `vercel@55.0.0`.
- [ ] Run local workspace build and Vercel Preview build checks before the one permitted Preview creation.
- [ ] Build exactly one Docker Worker image tagged `open-geo-console:staging-<full-runtime-sha>` and label `org.opencontainers.image.revision=<full-runtime-sha>`; do not start a persistent Worker.
- [ ] Update only `OGC_DEPLOYMENT_VERSION` in `.data/workstation-docker/staging.env` to the full runtime SHA after required non-secret values and secret presence pass.
- [ ] Create at most one new protected Preview from the exact worktree. Verify `preview`, `Ready`, project ID, full Git source, healthy authenticated `/zh -> /` navigation, and zero middleware failure before moving the fixed Staging alias once.
- [ ] Verify image ID/label, runtime env marker, database marker, zero ordinary Worker presence, and fixed alias all bind to the integrated runtime SHA.
- [ ] Remove only the two exact exited `staging-4b8a450…` containers and then the two exact superseded images named in scope, after fresh reference checks. Preserve every other image/container.
- [ ] Re-inspect production deployment/container identities and require exact equality to Unit 1.

## Unit 8 — create the one new report and immutable admission snapshot

- [ ] In the authenticated browser selected for the target URL, submit one forced protected-Staging scan for `https://shun-express.com/`.
- [ ] Record exactly one new report ID and its legacy free-job ID; prove neither historical target ID changed.
- [ ] Run `worker:staging:exact-preview <freeJobId> <reportId>` only for that tuple.
- [ ] Verify legacy free completion created exactly one V4 pre-admission job, then run `worker:staging:exact <preAdmissionJobId> <reportId> free` only for that tuple.
- [ ] Verify unique-body admission, at most 50 analyzable bodies, duplicate exclusions, immutable snapshot/hash identity, organization identity, and exact three locked questions.

Stop without another report if the target becomes terminal failed, `completed_limited`, or unauthorized `repair_wait`.

## Unit 9 — one CNY 199 Sandbox payment and exact Core

- [ ] Use the normal protected-Staging checkout UI for exactly CNY 199 and complete one Airwallex Sandbox payment.
- [ ] Prove the signed Webhook, not browser return state, created one paid order, entitlement/credit reservation, config snapshot, and exactly one deep Core job.
- [ ] Run only the exact Core one-shot for the new `(jobId, reportId, deep)` tuple. A repeat invocation is allowed only if the persisted state machine itself schedules the same job retry; no manual state write or replay.
- [ ] Verify full Core `completed`, three substantive Chinese answers, no refusal/unavailable filler, no identity confusion, no more than five sources each, atomic active artifact/order/job/credit/access/email state, and no reserved credit.

## Unit 10 — exact diagnosis, HTML, browser, and identity-chain acceptance

- [ ] Verify the successful Core created exactly one diagnosis-enhancement job, then run only that exact tuple through the exact one-shot.
- [ ] Require diagnosis `completed`; no limited-Core enhancement compatibility is allowed.
- [ ] Read-only load the report/snapshot/order/payment/credit/jobs/artifacts/token/email chain in one repeatable-read transaction and prove a unique identity graph with no active/split state.
- [ ] Open authorized `/reports/<reportId>/report.html`; verify HTTP 200 and visible desktop (1440px) and mobile (390px) content in the authenticated browser. Do not inspect cookies, storage, passwords, or raw tokens.
- [ ] Capture the two exact screenshots named by the scope and record hashes without secrets.
- [ ] Re-run the Staging-bound audit `npx tsx --tsconfig apps/web/tsconfig.json --env-file=.data/workstation-docker/staging.env apps/web/src/scripts/db-audit.ts`, focused access/render tests, V4 Staging evidence verifier, and production non-change checks.

## Unit 11 — promote requirement evidence, sync durable docs, and push

**Files:** only the documentation/registry/evidence allowlist in the scope.

- [ ] Write the single shun-express narrative evidence record and its machine-verifiable protected-Staging projection. Never record credentials, cookies, provider secrets, raw access tokens, or unhashed client IPs.
- [ ] Promote each of the 20 registry statuses from `implemented` to `verified` only when its requirement-bound automated and runtime evidence is present. No title, path, command, product meaning, or acceptance rule may change.
- [ ] Regenerate the matrix and run `report:v4:traceability`, `report:v4:staging:verify`, and `report:v4:acceptance`; all must pass.
- [ ] Replace stale current-state claims in `PROJECT-STATE`, close/update `TASKS` and `DECISIONS`, refreeze the active scope, and record both integrated runtime SHA and final evidence SHA.
- [ ] Run final lint, build, full tests, the same explicitly Staging-bound DB audit command, CodeGraph status, diff checks, allowlist/budget audit, external-action count audit, historical immutability check, and production equality check.
- [ ] Commit the docs/evidence-only closeout if needed. Push `HEAD` once to `origin/codex/v4-answer-optimization-scope-reset`; do not merge and do not deploy production.

## Terminal stop conditions

Stop as `DEVIATION_REVIEW_REQUIRED` if any of these occurs:

- any action needs a path, behavior, schema, question, price, provider adapter, customer layout, product contract, deployment target, or external-action count outside the approved scope;
- any ordinary/persistent Worker or non-target exact Worker claims a job;
- Preview, image, runtime env, database marker, or Worker reports a different revision;
- the one new report enters terminal failed, `completed_limited`, or unapproved `repair_wait`;
- a second report, second payment, manual replay/reopen/recovery, or extra provider call would be required;
- production deployment, production container/image, or production database authority changes;
- final V4 acceptance would require weakening the registry, evidence verifier, or customer acceptance criteria.
