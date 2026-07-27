# V4 Baseline Consolidation and Complete Report Design

## Status

Approach A was approved by the user on 2026-07-19. This document is the written design for review before the implementation plan and exact change scope are approved.

## Goal

Restore one coherent protected-Staging report pipeline, then generate and verify one new complete deep report for `https://shun-express.com/`.

The result must not depend on an old branch, an unlabelled runtime, an ordinary FIFO Worker, a historical failed report, or a partially terminalized commercial state. Web, Worker image, runtime environment, deployment marker, report identity, and evidence must all resolve to one accepted Git revision.

## Confirmed Baseline Problem

The current repository and runtime are split after common commit `bbdcf1b`:

- `fee9c82` contains the approved V4 business-answer prompt and exact V4/free one-shot Workers.
- `d9ee6a9` contains later free-analysis, V4 admission, commercial terminalization, error-state, and Staging-runtime repairs.
- Neither branch contains the full required behavior.
- The fixed protected-Staging Preview is `fee9c82`, while the live ordinary host Worker most likely loaded `17016df` and reported stale deployment version `4b8a450d`.
- The existing shun-express report `8446d645-8db1-45ce-8f4a-8016f7ed1b8f` was processed by the contaminated runtime and remains immutable failure evidence.

The design therefore creates a new integrated revision rather than treating either branch as a complete replacement.

## Approaches Considered

1. **Selective integration onto `fee9c82` (selected).** Preserve the approved prompt and exact Worker boundaries, and port only the required later repairs with their tests. This has the smallest behavior surface and makes excluded recovery/product changes explicit.
2. **Use `d9ee6a9` and reapply current work.** This carries broad, not-yet-accepted replay and limited-enhancement behavior and makes it harder to prove the final diff.
3. **Reimplement from remote `bbdcf1b`.** This duplicates already reviewed work and has the highest omission and regression risk.

## Locked Product and Authority Decisions

- The contaminated report and job remain immutable and are never resumed, reopened, replayed, deleted, or presented as the final result.
- After the integrated runtime passes deterministic and protected-Staging gates, create exactly one new shun-express report.
- Complete exactly one CNY 199 Airwallex Sandbox payment for that new report through the verified signed-Webhook path.
- The three previously approved Chinese buyer questions remain unchanged.
- Completion requires `combined_geo_report_v4`, methodology `two_stage_geo_report_v4`, version 4, full `completed` Core and diagnosis, exactly three substantive Chinese answers, no more than five sources per question, correct 凌顺 identity, and authorized HTML HTTP 200.
- `completed_limited`, unavailable/refusal filler, partial diagnosis, failed commercial delivery, or a replacement/replay report is not completion.
- Production remains unchanged.

## Integrated Code Boundary

The integration starts from `fee9c82` and carries only these later behaviors:

1. **Legacy free analysis resilience (`4b8a450`).** A language violation confined to optional `rewriteExample` prose may remove that optional field rather than fail the report. Required fields, evidence, locale, and GEO terminology remain fail-closed.
2. **V4 admission content deduplication (`17016df`).** Count unique analyzable body hashes rather than duplicate URLs toward the 51-page custom-service boundary. Duplicate pages remain immutable exclusions with explicit provenance.
3. **Atomic V4 Core publication and commerce (`9d30ce9` plus its required `e3c6841` compatibility).** A Core remains `ready` until artifact activation, active-report pointer, job, order, credit, refund, access token, and email intent can terminalize in one transaction. Ready-Core re-entry is accepted only for the exact lineage.
4. **Canonical V4 error persistence (`9d30ce9`).** A V4 runner error is normalized and persisted through the job state machine before an exact one-shot exits. It must not remain an unexplained `running` job that later becomes only `lease_exhausted`.
5. **Reproducible protected-Staging runtime (`cecfeba` plus the token-secret readiness carried by the atomic Core repair).** Runtime materialization must carry the exact V4 model profile, MiMo bindings, token hash secret, profile, queue mode, and accepted Git revision; startup fails before presence or claim on mismatch.

Every behavior is ported with its focused unit/PostgreSQL tests. Commits may be cherry-picked only when their complete behavior matches this design; otherwise reproduce the smallest reviewed diff in the current integration branch.

## Explicit Exclusions

- Do not import `6e0d3a8` operator replay or reopen any terminal paid Core.
- Do not import `d1b12e6` or `7911c80` limited/refunded-Core diagnosis enhancement behavior.
- Do not switch wholesale to `d9ee6a9` or deploy any unreviewed experimental commit.
- Do not modify payment pricing, question wording, customer HTML layout, database schema, provider adapters, production configuration, production images, or historical commercial authority unless a focused test proves the selected integration cannot work without that change and the scope is re-approved.
- Do not use `run-report.bat`, ordinary drain/FIFO Workers, or persistent protected-Staging Workers for the acceptance report.
- Do not delete user-owned untracked files or unrelated worktrees.

## Runtime Containment and Provenance

Before creating another report:

1. Revalidate PID, command line, start time, and staging profile for the live ordinary host Worker, then stop only that exact process.
2. Verify no live Windows, WSL, Docker, or remote Worker can claim protected-Staging free or deep work.
3. Keep the old Staging containers stopped. After the integrated image is built and verified, remove only the exact superseded Staging containers and images that are unreferenced and named in the approved implementation scope.
4. Materialize a fresh protected-Staging runtime environment from the integrated source and verify only non-secret identities and presence of required secrets.
5. Build one integrated Docker image labelled with the full accepted Git SHA. Do not start a persistent Worker.
6. Create one protected Preview from the same SHA, verify it Ready and healthy, then move only the fixed protected-Staging alias.
7. Read-only verify production deployment and production container identities remain unchanged.

The remote source-of-truth branch will use a matching `codex/` branch name. It may be pushed only after the local integration, deterministic tests, independent diff audit, Preview/image alignment, and live report acceptance pass. No merge or production deployment is implied.

## New Report Data Flow

1. Browser-submit one new forced protected-Staging scan for `https://shun-express.com/` and record the new report/free-job identities.
2. Run only the exact legacy-free one-shot for that tuple.
3. Read-only verify free completion and exact creation of one V4 pre-admission job.
4. Run only the exact V4 pre-admission one-shot. Verify at most 50 unique analyzable same-site HTML bodies, duplicate exclusions, immutable snapshot identity, and correct 凌顺 organization identity.
5. Confirm exactly three locked Chinese questions and no question drift.
6. Complete one CNY 199 Airwallex Sandbox checkout and verified signed Webhook. Record order, entitlement, credit reservation, and paid Core job identities.
7. Run only the exact paid Core one-shot. Verify atomic completed commercial state and a ready/active artifact lineage with no split state.
8. Run only the exact diagnosis-enhancement job when the successful full-Core contract creates it. Limited-Core compatibility is not enabled.
9. Open the authorized HTML report in the protected browser and verify desktop/mobile customer-visible content, correct organization identity, three complete answers, adjacent sources, completed diagnosis, and HTTP 200.
10. Run commerce reconciliation only when the new report has queued truthful email/refund work. Do not drain historical outbox items.

## Error Handling

- Every phase is exact-identity and fail-closed before a model or commercial side effect.
- Ordinary test failures, deterministic code defects, and scope-contained corrections are repaired automatically within the current unit.
- A second model execution is allowed only when the accepted job state machine itself classifies and schedules the retry; no manual replay is allowed.
- If the new report becomes terminal failed, `completed_limited`, or `repair_wait` without an already approved exact repair boundary, stop and preserve evidence. Do not create another report or payment.
- If any non-target job is claimed, any process reports a mismatched revision, or production changes, stop immediately and classify the unit `DEVIATION_REVIEW_REQUIRED`.
- Payment, credit, refund, token, artifact activation, order, and email intent must agree atomically before the report is accepted.

## Verification Strategy

### Deterministic verification

- Focused legacy page-analysis language-correction tests.
- V4 admission duplicate-content and 51-page threshold tests.
- Atomic Core fault-injection and ready-Core re-entry PostgreSQL tests.
- V4 error normalization/state-transition tests.
- Runtime materialization and startup-readiness tests.
- Existing exact V4/free Worker and exact-claim PostgreSQL tests.
- Locked three-question and answer-contract tests.
- Report access, HTML rendering, and commerce-authority tests.
- `git diff --check`, CodeGraph sync/status/affected analysis, `npm run lint`, `npm run build`, focused tests, then full `npm test`.

The five previously recorded acceptance-ledger PostgreSQL failures must be rerun on the integrated branch. Fix them only if they still fail and the defect is in the selected V4 acceptance contract; unrelated schema or historical-data work remains outside scope.

### Runtime verification

- No ordinary/persistent protected-Staging Worker is live.
- Preview, image label, runtime deployment marker, and acceptance observer resolve to the same full SHA.
- Fixed Staging alias points only to the accepted Ready Preview.
- Production deployment and all production image/container identities are unchanged.
- The new report has one immutable identity chain from scan through HTML delivery.
- Read-only database audit shows no reserved credit on terminal jobs and no split artifact/order/job state.

## Documentation and Cleanup

After stable facts are accepted, perform a scoped documentation sync:

- Keep current task state only in `docs/ACTIVE-CHANGE-SCOPE.md`; preserve historical state in evidence and Git history rather than appending competing current-state narratives.
- Keep `docs/ACTIVE-CHANGE-SCOPE.md` limited to the current approved unit and move superseded narrative into the single evidence record where needed.
- Record the contaminated report, integrated SHA, runtime identities, new report/order/job/artifact/token identities, commands, and acceptance result in one shun-express evidence file.
- Update task/decision/acceptance documents only when the integrated behavior changes their current truth.
- Preserve user-owned untracked assets, the protected V3 plan, Qoder files, and unrelated worktrees.

## Final Acceptance

The task is complete only when all of the following are true:

- one integrated, independently audited Git revision contains the selected prompt, exact Worker, free-analysis, deduplication, atomic Core, error-state, and runtime fixes;
- the protected Preview, Docker image, runtime environment, and acceptance marker use that same revision;
- no old ordinary protected-Staging Worker can claim work;
- deterministic verification is green or every unrelated pre-existing failure is explicitly proven unchanged;
- exactly one new shun-express report and one Sandbox payment were created after containment;
- the same report has completed full Core and diagnosis with exactly three substantive Chinese answers and correct 凌顺 identity;
- the authorized customer HTML returns 200 and passes visible inspection;
- commercial state is internally consistent, production is unchanged, and the final evidence/docs reflect current truth;
- the accepted integration branch is pushed without merging or deploying to production.
