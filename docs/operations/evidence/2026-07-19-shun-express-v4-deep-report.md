# Unit 1 protected-Staging preflight — shun-express V4

Date: 2026-07-19 (UTC evidence captured during Unit 1)

## Scope and outcome

- Unit: read-only preflight plus exact-commit protected-Staging Web/Worker alignment.
- Exact source requested: `9c19d2c4e17eebf2d93bd69537f877e4183fb255` (short `9c19d2c`).
- Outcome: `DEVIATION_REVIEW_REQUIRED` before deployment or Worker recreation.
- No report, crawl, model call, checkout/payment, commerce/refund/email, historical replay/recovery, production mutation, git commit, or git push was performed.

## Read-only evidence

- `git status --short --branch`: branch `codex/v4-answer-optimization-scope-reset`; only the approved modified scope document plus untracked `assets/` and protected V3 plan were present.
- `git rev-parse HEAD`: `9c19d2c4e17eebf2d93bd69537f877e4183fb255`.
- `codegraph status`: index up to date (764 files, 11,113 nodes, 33,294 edges).
- Protected-Staging V4 preflight, run with `.data/workstation-docker/staging.env`: `{"profile":"staging","schemaVersion":40,"currentSchemaVersion":40,"diagnosisCheckpointTableExists":true,"diagnosisCheckpointCount":3,"v34MigrationSafe":true}`.
- `db-audit`, run against the merged staging environment: passed; no terminal commercial job has a reserved credit.
- Merged staging marker names were present and nonblank: `OGC_DEPLOYMENT_PROFILE=staging`, `VERCEL_ENV=preview`, `COMMERCE_MODE=test`, `FULFILLMENT_MODE=realtime`, `OGC_REPORT_V4_MODEL_PROFILE_ID=report-v4-mimo-v2.5-pro-v1`, and the configured MiMo base URL. Secret values were not printed.
- Docker read-only identity: production free/deep containers remain `Up` on `open-geo-console:prod-v25-11befe9`; staging free/deep containers existed but were `Exited (0)` on the older image `open-geo-console:staging-4b8a450d7a4163452982388d48ded7938bf699e1`. No production container/image was changed.

## Blocking queue-safety finding

Read-only PostgreSQL counts from staging:

```text
scan_jobs: analyzing=1, completed=71, completed_limited=5, failed=57, synthesizing=1
payment_orders: completed=4, completed_limited=5, failed=29, not_started=4
```

The approved launcher `scripts/start-report-v4-staging-workers.ps1` recreates `staging-worker-free` and `staging-worker-deep` with realtime PostgreSQL polling. Because staging already contains `analyzing=1` and `synthesizing=1`, starting either Worker could claim existing business work and invoke the model. The scope explicitly forbids allowing a Worker to claim or generate business reports during Unit 1 and requires stopping if the launcher would drain existing work.

Therefore deployment and Docker alignment were not attempted. Continuing requires the parent/scope owner to decide a safe, in-scope no-claim alignment method or issue a new scope; no code/config/script workaround was created.

## Unit 1 drift audit

`CONFORMANT` for the completed read-only preflight evidence; `DEVIATION_REVIEW_REQUIRED` for the requested alignment because the current staging queue contradicts the no-business-claim gate. Files modified by this unit: this evidence file only. Production/test/config/script files remain unchanged; `assets/` and the protected plan remain untouched.

## Phase A exact-job implementation evidence (local only)

- Added the approved exact one-shot Worker path only: atomic `jobId + reportId + tier` claim, target-only lease/exhaustion/credit/artifact/regeneration maintenance, pre-claim V4 contract admission, and a staging CLI which runs the staging database/profile guard and V4 readiness before one claim and the ordinary processor.
- Ordinary `claimScanJob(workerId, tier, leaseSeconds)` remains unchanged, including FIFO selection and global maintenance; no Worker/presence/drain/queue, deployment, Docker, database runtime, model, payment, browser, or external action was run by Phase A.
- Focused unit result: `apps/web/src/worker/exact-job.test.ts` 10 passed. The new targeted PostgreSQL test is guarded by `OGC_TEST_DATABASE_ADMIN_URL` and was skipped in this shell because that sanctioned admin URL was absent; no staging or production database was substituted.
- Related test result: 45 passed, 1 guarded PostgreSQL suite skipped. `npm run lint` and `npm run build` passed. Full `npm test` had 2,590 passed, 175 skipped, and five pre-existing failures in `report-v4-acceptance-authority-phase-snapshot.postgres.test.ts` at `report_v4_acceptance_events_details_check`; this exact-job diff is outside that ledger path.
- `codegraph sync`/`status` passed (768 files, 11,154 nodes, 33,431 edges) and `git diff --check` passed. Phase A changes remain in the seven approved code/test paths; no commit was made.

### Targeted PostgreSQL recheck

- The independent checker supplied a disposable local PostgreSQL test endpoint and authorized only a passwordless connection attempt for the targeted claim test. The attempt reached no authentication step: `ECONNREFUSED` at the supplied loopback port. No container inspection, environment/secret read, retry against another endpoint, or container/database operation was performed.
- Therefore `apps/web/src/db/jobs-targeted-claim.postgres.test.ts` remains unexecuted against PostgreSQL. This is an environment reachability block, not a code failure; the Phase A acceptance classification remains `REVISE_WITHIN_PLAN`.

### Disposable PostgreSQL targeted-claim execution

- A locally created disposable `postgres:17` container was bound to loopback only, used only for `apps/web/src/db/jobs-targeted-claim.postgres.test.ts`, and removed by the same command's cleanup block. No pre-existing container, staging/production endpoint, Worker, or external workflow was touched; no credential was printed or persisted.
- The test first exposed two fixture-only defects in the new test (an invalid queued phase and order-dependent assertion). Both were corrected in that allowlisted test file. The rerun passed 2/2 against PostgreSQL.
- Regression after the fixture correction: focused/related tests 55 passed; Web lint and monorepo build passed; `git diff --check` and CodeGraph sync/status passed. The previous full-suite result remains the recorded 2,590 passed with five unrelated acceptance-ledger constraint failures; it was not rerun after this test-only correction.

## Phase B Unit 1: exact Preview and staging-image alignment attempt

- Mapped scope clause: Phase B action 2 (one protected Preview from the exact committed Phase A revision and protected-Staging alias alignment) and action 3 (matching staging image only; no persistent Worker action). Non-goals: production, report creation, crawl/model work, database write, payment/commerce/email/refund, browser, runtime-environment update, and persistent Worker lifecycle.
- Exact committed source was verified as `7ea91b1ab646e6accbfd4b26627691d7c8970643` (`feat: add exact protected staging job worker`, parent `9c19d2c4e17eebf2d93bd69537f877e4183fb255`). The main worktree initially contained only the protected untracked `assets/` and `docs/superpowers/plans/2026-07-15-v3-paid-acceptance-remediation.md` paths.
- Read-only baseline: the fixed staging hostname resolved through Vercel inspection to Ready Preview deployment `dpl_GDS3nba7VhWEvgF5Hg9kKH5KyYSm` at `https://open-geo-console-oqciionan-itheheda-6857s-projects.vercel.app`; no alias update was issued. Staging free/deep containers were both `exited` on image `sha256:0f4752442cfd...`; production free/deep and commerce containers were `running` on their existing image identities. No container, image, or production alias was changed.
- The exact-source deployment attempt used a detached temporary worktree at `C:\Users\fengc\AppData\Local\Temp\ogc-phase-b-7ea91b1`. Because the required Vercel project link is Git-ignored and was absent in that clean worktree, `vercel pull --environment=preview` created the unintended Vercel project `itheheda-6857s-projects/ogc-phase-b-7ea91b1` instead of linking `open-geo-console`. Its `vercel build --target=preview` then completed the repository build but failed Vercel prebuilt preparation because that unintended project's default output directory was `public`.
- Result: no deployment was created, no Preview reached Ready, no protected-Staging alias was changed, and Docker image construction did not begin. The temporary worktree registration was removed; its residual directory remained after cleanup because local recursive deletion was blocked by the execution policy. No source, test, configuration, schema, script, runtime, or user-owned file was edited.
- Unit drift audit: `DEVIATION_REVIEW_REQUIRED`. The unintended Vercel project is outside the approved single protected Preview path. Stop before retrying, deleting that project, switching any alias, or building Docker. The minimal decision required is whether the agent may delete the unintended project and then retry using the original project link copied into a clean exact-source worktree.

## Phase B Unit 1: authorized cleanup and corrected retry (blocked before retry)

- The authorized Vercel read-only check identified only the exact accidental project `itheheda-6857s-projects/ogc-phase-b-7ea91b1` (`prj_XHyCNtOqEWxCW9OboYTtsTwhHjkj`). Its deployment listing returned no deployments and the scope alias listing returned no entries for it.
- The exact Vercel project removal completed successfully. A follow-up project inspection returned `There is no project for "ogc-phase-b-7ea91b1"`. The original linked project `open-geo-console` was not selected or changed.
- The corresponding residual path resolved to `C:\Users\fengc\AppData\Local\Temp\ogc-phase-b-7ea91b1`; it is under the system Temp root, has the exact basename, and was a normal `Directory` (not a reparse point). The execution environment then rejected the explicitly required same-PowerShell `Remove-Item -LiteralPath ... -Recurse -Force` command before it ran, including a direct literal-path invocation.
- Result: `DEVIATION_REVIEW_REQUIRED`. Per the cleanup-before-retry sequence, no corrected worktree, `vercel pull`, build, deployment, alias update, Docker build, container action, production action, or external business workflow was started. A sanctioned way to execute the already-authorized exact Temp-directory deletion is required before retrying.

### Authorized .NET deletion retry

- In one PowerShell command, the residual target was recomputed as an absolute path and revalidated: it starts under `[IO.Path]::GetFullPath([IO.Path]::GetTempPath())`, has exact basename `ogc-phase-b-7ea91b1`, exists, and has no `ReparsePoint` attribute.
- The authorized `[System.IO.Directory]::Delete($resolved, $true)` then failed with `UnauthorizedAccessException` on nested entry `client-s3-ecbef8e33fd0b8f0`; the target directory remained present. No attributes, ACLs, or alternative deletion mechanism were changed or attempted.
- Result: `DEVIATION_REVIEW_REQUIRED`. The cleanup-before-retry gate remains unmet, so no corrected worktree, Vercel action, Docker build, container action, alias mutation, or production action was performed.

### Corrected retry setup and build blocker

- A subsequent authorized exact .NET deletion retry passed the same Temp-root, exact-basename, existence, and non-reparse checks, then removed `C:\Users\fengc\AppData\Local\Temp\ogc-phase-b-7ea91b1`; absence was verified.
- A new unique detached Temp worktree was created at exact commit `7ea91b1ab646e6accbfd4b26627691d7c8970643`. The main `.vercel/project.json` was copied into its `.vercel` directory. Before and after `vercel pull --yes --environment=preview`, its project ID was verified as original `prj_WVpdlJfsEp0YyWM2W54w8oBy985S`; Vercel inspection also identified `itheheda-6857s-projects/open-geo-console`, not a new project.
- `npx vercel build` failed before build output with `spawn cmd.exe ENOENT`. One bounded retry with explicit Preview target and an absolute `ComSpec` failed identically. Local read-only diagnostics confirmed `cmd.exe` exists, `ComSpec` and a System32 PATH entry exist, and a direct Node child-process spawn of `cmd.exe` succeeds. No deployment, alias mutation, Docker image build, container action, staging business action, or production change occurred.
- Result: `DEVIATION_REVIEW_REQUIRED` pending a decision on whether an alternate allowed Vercel CLI version may be used for this same exact Preview build.

### Fixed Vercel CLI retry and bounded diagnosis

- The authorized alternative was fixed to `vercel@55.0.0`. In the same detached exact-source worktree, the project link was verified before and after the command as `prj_WVpdlJfsEp0YyWM2W54w8oBy985S`; `git rev-parse HEAD` remained `7ea91b1ab646e6accbfd4b26627691d7c8970643`.
- `npx --yes vercel@55.0.0 build --target=preview --yes --debug` again failed with `spawn cmd.exe ENOENT`. Debug output reached the original `vercel.json`, loaded `.vercel/.env.preview.local`, selected `@vercel/next@4.20.4`, applied the original project's `npm run build` and `apps/web/.next` settings, and failed while building entrypoint `package.json`. It did not create a deployment or alter an alias.
- The bounded local diagnostic in that same worktree confirmed `ComSpec=C:\windows\system32\cmd.exe`, that executable exists, `PATH` contains the System32 directory, and Node can spawn the command interpreter successfully (`cmd-child-ok`). `npm run build` then completed successfully, including all workspace TypeScript builds and the Next.js production build. The project link remained the original ID after the diagnostic.
- No further Vercel command was attempted. No deployment, protected-Staging alias, Docker image/container, Worker, report, crawl, model call, database state, payment/commerce/email/refund, or production authority changed. The exact worktree is retained unmodified apart from normal build output for inspection; it was not deleted while this unresolved builder-only failure remains evidence.
- Unit result: `REVISE_WITHIN_PLAN`. The project build is healthy and fixed CLI 55.0.0 reproduces the same Vercel builder process-spawn failure. Per the approved fallback boundary, stop before switching deployment mode, modifying Vercel/project configuration, or creating a report.

### Spawn trace and one normalized-environment retry

- The temporary trace hook was outside the repository and worktree. It emitted only each child command, arguments, working directory, and presence/validity booleans for `ComSpec`, `SystemRoot`, and `PATH`; it did not print environment values or secrets. The trace identified the failing `cmd.exe /C "npm run build"` child as having a `PATH` without System32, while `ComSpec` and `SystemRoot` were present.
- One authorized normalized-environment retry used the same `vercel@55.0.0`, exact worktree, and original project ID before and after (`prj_WVpdlJfsEp0YyWM2W54w8oBy985S`). It explicitly placed Windows System32 and Windows before the retained child `PATH`, and supplied `ComSpec`/`COMSPEC` and `SystemRoot`/`SYSTEMROOT`. The prior `spawn cmd.exe ENOENT` was resolved: the complete workspace and Next.js build ran successfully under Vercel.
- Vercel then failed during prebuilt output assembly with `EPERM: operation not permitted, symlink '[locale]\\logs.func' -> '...\\.vercel\\output\\functions\\[locale].func'`. The failure occurred after build output but before a usable prebuilt artifact; no deployment, alias, Docker image/container, Worker, report, crawl, model call, database state, payment/commerce/email/refund, or production authority changed.
- Unit result: `DEVIATION_REVIEW_REQUIRED`. The minimum additional authority would need to name one approved way to satisfy the Windows symbolic-link prerequisite for this exact prebuilt build (for example, an explicitly authorized alternate local filesystem/worktree or elevated symbolic-link capability) and authorize one corresponding fresh prebuilt retry. It must not imply remote deploy, Vercel/project configuration or code/dependency changes, production activity, or report creation. The exact worktree and agent-owned trace hook remain retained as failure evidence; neither was deleted after this unresolved operating-system blocker.

### Approved WSL2 exact-source retry: credential boundary

- Ubuntu WSL2, native Linux `/tmp`, Git, Node/npm/npx, and Docker were verified available. Fresh detached `/tmp/ogc-phase-b-7ea91b1-wsl-*` worktrees were created from the exact commit only, and each copied the original `.vercel/project.json` before any Vercel operation; the checked worktree identity was `7ea91b1ab646e6accbfd4b26627691d7c8970643` and project ID `prj_WVpdlJfsEp0YyWM2W54w8oBy985S`.
- WSL2 had no standalone Vercel login. Per the approved credential boundary, the existing Windows Vercel credential was read only into the WSL process environment and never printed, placed on a command line, or written into either Linux worktree. Vercel rejected it with `The token provided via VERCEL_TOKEN environment variable is not valid` before it could pull project settings. A Windows process-environment authentication control produced the same rejection, while the existing Windows CLI credential-store flow still authenticated as the configured account; the stored session cannot be transferred as a valid `VERCEL_TOKEN` by the permitted method.
- No WSL `pull` completed, no build/deploy/prebuilt artifact/alias/Docker image or container action occurred, and no Worker, report, crawl, model call, database state, payment/commerce/email/refund, or production authority changed.
- Unit result: `DEVIATION_REVIEW_REQUIRED`. The minimal next authority is a valid, explicitly supplied process-scoped Vercel deployment token usable by WSL2 for this same project and fixed CLI retry, or an explicitly authorized non-copying credential mechanism that Vercel CLI accepts in WSL2. It must remain limited to the same exact source, protected Preview prebuilt flow, and no report/business/production work. The agent-owned `/tmp` worktrees remain as short-lived failure evidence pending the authorized credential resolution; no cleanup was performed after this unsatisfied authentication gate.

### Approved WSL2 device-login retry: protected Preview and image aligned

- The user explicitly approved one WSL2 device-login request. It completed for the existing account (`whoami`: `itheheda`); no token was printed, extracted, copied, passed on a command line, or persisted outside the WSL Vercel CLI credential store.
- A fresh native-Linux `/tmp` detached worktree was then created at `7ea91b1ab646e6accbfd4b26627691d7c8970643`, copied the original project link, and verified `prj_WVpdlJfsEp0YyWM2W54w8oBy985S` before `pull`, after `pull`, and after the fixed `vercel@55.0.0 build --target=preview --yes`. The protected Preview build completed with `.vercel/output` and no source/config/dependency edit.
- The matching fixed-CLI prebuilt deployment is `dpl_5GPVSKtcuxme87BGkikptBeqtgR3` at `https://open-geo-console-i8kf9r0db-itheheda-6857s-projects.vercel.app`; `inspect` verified target `preview` and status `Ready`. Only `open-geo-console-staging-itheheda.vercel.app` was repointed, and an independent inspection of that alias resolved to the same Ready deployment. No production alias was changed.
- The same exact WSL source built `open-geo-console:staging-7ea91b1` without starting, stopping, or recreating a container. BuildKit completed in 8m55s; image ID is `sha256:7fb2ef102e337ca35ed4a1083918897d2654e5b80fc11e9a2a60802694db0c63`, with `org.opencontainers.image.revision=7ea91b1ab646e6accbfd4b26627691d7c8970643`.
- Read-only production check: `https://geo.itheheda.online` remains Ready on production deployment `dpl_3cx4ntaHcXquqJgRyj9E3tBX96BW`; production free/deep containers remain Up on `open-geo-console:prod-v25-11befe9`, and production commerce remains Up on its existing image. No report, Worker execution, crawl, model call, database mutation, payment, commerce/email/refund, or production mutation occurred in this unit.
- Cleanup: all agent-created WSL `/tmp/ogc-phase-b-7ea91b1-wsl-*` worktrees and the device-login transcript were path-validated and removed. The old Windows exact retry worktree was unregistered, its remaining agent build artifacts were path-validated and removed, and all agent-created trace/WSL helper files under the exact Windows Temp paths were removed. User-owned worktree paths were not touched.
- Unit result: `CONFORMANT` for Phase B Unit 1 alignment. The protected Preview, fixed staging alias, and matching non-running staging image now derive from the same committed exact revision; Phase B report-admission work remains separately gated by the scope.

## Phase A2: exact initial legacy-free preview Worker (local only)

- Added only the approved four-path entrypoint: `worker:staging:exact-preview`, its protected-Staging one-shot script, an isolated `runProtectedExactPreviewJob` boundary, and its focused test. It runs the staging database/profile guard and Worker readiness before candidate inspection, then accepts only the exact `free` legacy contract with null V4 fields and credit reservation, reason `standard` or `staging_regeneration`, claims at most once through `claimExactScanJob`, processes through `processScanJob`, and exits.
- No V4 exact-worker, ordinary FIFO Worker, database claim, admission, schema, Compose/Docker, payment/commerce, deployment, staging business database, model, report, or production behavior was changed or invoked.
- Verification: the new preview tests plus accepted V4 exact-worker tests passed 24/24; the targeted PostgreSQL exact-claim suite passed 2/2 against a new loopback-only disposable `postgres:17` container, removed in the same command's `finally` cleanup. `npm run lint`, `npm run build`, `git diff --check`, and final `codegraph sync`/`status` all passed.
- Final allowlist/budget audit: only the four approved Phase A2 code/test paths are agent changes; production/config additions are 57/100 lines, tests 64/140, deletions 0. Existing scope/evidence edits and user-owned untracked `assets/` and protected V3 plan remain outside this code diff. No commit was created by this unit; independent conformance review remains required before Phase B admission resumes.

## Phase B replacement alignment after Phase A2

- Exact replacement source was verified as `fee9c822aedc3b4cde5c2ebe5cffffb239950fff` (`feat: add exact preview job worker`). The existing WSL Vercel CLI credential store authenticated as `itheheda`; no token was printed, extracted, copied, or passed on a command line.
- A fresh native-Linux `/tmp` detached worktree was created at that exact commit and copied only the original `.vercel/project.json`. Project ID remained `prj_WVpdlJfsEp0YyWM2W54w8oBy985S` before and after fixed `vercel@55.0.0` Preview pull and build. The prebuilt output completed without source/config/dependency changes.
- Replacement Preview deployment `dpl_2kjurMa7dF6MDrXLgNv3aZVDBV5K` at `https://open-geo-console-r2s2r428r-itheheda-6857s-projects.vercel.app` was created only via `deploy --prebuilt`; inspection verified target `preview` and status `Ready`. Only `open-geo-console-staging-itheheda.vercel.app` was repointed, and it resolved to this same Ready deployment.
- Production remained Ready and unchanged on `dpl_3cx4ntaHcXquqJgRyj9E3tBX96BW`. Production free/deep containers remained Up on `open-geo-console:prod-v25-11befe9`; production commerce remained Up on its existing image. The existing staging free/deep containers remained Exited on `open-geo-console:staging-4b8a450d7a4163452982388d48ded7938bf699e1` and were not started, stopped, recreated, or removed.
- From the same exact WSL source, Docker built `open-geo-console:staging-fee9c82` as `sha256:a223662ed15c392a5a07b13b8ea85adb77482fb5845011c8a210bf832b840ea4`, labeled `org.opencontainers.image.revision=fee9c822aedc3b4cde5c2ebe5cffffb239950fff`. Full-container checks found zero references to both the new image and superseded Phase B image `open-geo-console:staging-7ea91b1`.
- Only after that zero-reference check, the old unreferenced `open-geo-console:staging-7ea91b1` tag/image (`sha256:7fb2ef102e337ca35ed4a1083918897d2654e5b80fc11e9a2a60802694db0c63`) was removed. The staging worker image referenced by existing containers and all production images were preserved.
- The exact WSL replacement worktree and all agent-created Windows Temp helper scripts for this unit were path-validated, verified non-symlink/non-reparse, and removed. Apart from the single authorized protected Preview `deploy --prebuilt` recorded above, no additional Preview deployment occurred; no report, Worker execution, database mutation/query for execution, crawl, model call, payment, email, refund, other-project action, production deployment, or production mutation occurred.
- Unit result: `CONFORMANT`. Protected Preview, fixed staging alias, and the non-running staging image are aligned to the same Phase A2 commit; the superseded unreferenced Phase B test image is removed.

## Phase B remote source-build replacement

- The locally assembled prebuilt Preview `dpl_2kjurMa7dF6MDrXLgNv3aZVDBV5K` was rejected as runtime evidence after authenticated `/zh` returned `500 MIDDLEWARE_INVOCATION_FAILED`. Under the user's exact replacement authorization, this unit performed one and only one non-prebuilt Preview source deploy; no second deployment was attempted.
- A fresh native-Linux `/tmp` worktree was detached at exact source `fee9c822aedc3b4cde5c2ebe5cffffb239950fff`, copied the original project link, and verified `prj_WVpdlJfsEp0YyWM2W54w8oBy985S` before and after fixed `vercel@55.0.0 deploy --yes`. The existing WSL Vercel credential store authenticated as `itheheda`; no token was printed, extracted, copied, or passed on a command line. No source/config/dependency file was changed.
- The sole source deployment is `dpl_4S4uCgdmZjavoGLcUCgPzmSkmw85` at `https://open-geo-console-9k84y32qn-itheheda-6857s-projects.vercel.app`. Vercel performed the remote repository and Next.js build, and inspection verified target `preview` and status `Ready`.
- Before alias movement, the main task used its existing authenticated in-app browser on the direct deployment `/zh`. It resolved by the application's locale rule to the same deployment root, title `Open GEO Console`, with the URL input, report-generation button, and protected-staging `forceFresh` control present; no middleware failure was visible. Read-only Vercel logs independently recorded `GET /zh` as `308`, followed by `GET /` as `200`, successful app/static requests, and no middleware `500`.
- Only after that direct-runtime gate passed, `open-geo-console-staging-itheheda.vercel.app` was repointed to `dpl_4S4uCgdmZjavoGLcUCgPzmSkmw85`. The authenticated browser then verified the alias `/zh` resolved to the alias root with the same application controls and no `MIDDLEWARE_INVOCATION_FAILED`. Alias-host logs independently recorded `GET /zh` `308` and subsequent `GET /` `200`, with no middleware `500`.
- Production remained unchanged and Ready on `dpl_3cx4ntaHcXquqJgRyj9E3tBX96BW`. The previously verified `open-geo-console:staging-fee9c82` image was not rebuilt, retagged, deleted, or attached to any container; no Worker/container action occurred.
- The exact WSL worktree and all agent-created Windows Temp helper scripts for this unit were path-validated and removed. No report/job/database write or execution query, crawl, model call, payment, email, refund, Docker change, remote deployment beyond the single authorized Preview, other-project action, or production mutation occurred.
- Unit result: `CONFORMANT`. The fixed protected-Staging alias now points to the one exact-source remote-built Preview whose direct and alias runtimes both passed authenticated UI and Vercel request-log checks.

## Phase B admission runtime gate

- Before submitting the scan form, an authenticated in-app browser request to the fixed protected-Staging `/zh` route returned `500 MIDDLEWARE_INVOCATION_FAILED`; no report or job was created.
- Read-only Vercel edge logs for deployment `dpl_2kjurMa7dF6MDrXLgNv3aZVDBV5K` and request `sfo1::z4wrh-1784468178267-ee531e1bfae7` identified the exact runtime error: the prebuilt CommonJS launcher `apps/web/___next_launcher.cjs` attempted to `require()` the Next 16-generated `apps/web/.next/server/middleware.js`, which is an ES module under the app package boundary (`ERR_REQUIRE_ESM`). `/favicon.ico` failed at the same middleware boundary.
- The deployment remains Vercel `Ready`, but is not runtime-acceptable. Repeating the same prebuilt artifact is invalid evidence. No deployment, alias, Docker, Worker, database, report, crawl/model, payment, commerce, email/refund, or production mutation was performed by this diagnostic.
- Unit result: `DEVIATION_REVIEW_REQUIRED`. Continuing requires an explicitly authorized deployment-mode change or an explicitly scoped code/config repair.

## Current superseding Phase B status

- The earlier prebuilt dpl_2kjurMa7dF6MDrXLgNv3aZVDBV5K runtime failure above is historical and superseded by the single authorized remote source deployment dpl_4S4uCgdmZjavoGLcUCgPzmSkmw85.
- Current runtime evidence is healthy: direct and fixed-alias navigation records /zh 308 to the same deployment / 200, with no middleware 500; production, Docker, Workers, and report/database/commerce state remain unchanged.
- Current audit result is DEVIATION_REVIEW_REQUIRED only because the locked acceptance text required /zh itself to return 200. No scan form was submitted. User approval is required before treating the locale redirect chain as satisfying that gate.

## User clarification: locale runtime gate

- The user clarified that /zh redirecting to the same deployment's Chinese default root is the already-correct application behavior and requires no product change.
- The accepted runtime evidence is the complete authenticated navigation: /zh 308 -> same-deployment / 200, the expected scan controls render, and Vercel logs contain no middleware 500.
- The earlier literal-status process objection was superseded. That checkpoint result was `CONFORMANT` and allowed Phase B to continue without another code/config/image/deployment action; the later final admission outcome below supersedes its continuation status.

## 2026-07-20 final integrated-runtime and target-report evidence

- Integrated branch HEAD: `bd403f77b30b01c6c5a8378d0fc05b63ee56ee71`. Accepted image: `open-geo-console:staging-bd403f77b30b01c6c5a8378d0fc05b63ee56ee71`, ID `sha256:e46c14a2b4b743d4ac3fa422ce74fcbd126c2f7552e1fa171fbcffb2dd4a30fb`, matching OCI revision. Accepted protected Preview: `dpl_FHYqhkYMejCbZs5hgbbuU51c5Du5` at `https://open-geo-console-h65zrx6d9-itheheda-6857s-projects.vercel.app`; fixed alias: `open-geo-console-staging-itheheda.vercel.app`. Direct and alias health passed the accepted `/zh` 308 to same-deployment `/` 200 chain. The merged runtime marker contains the full HEAD exactly once; its raw SHA-256 is `7e18b5f4ec4a33c37c962351cf6e52b21a1a890523bbb0a99e51bed7f473c4b6`.
- Production remained exact: deployment `dpl_3cx4ntaHcXquqJgRyj9E3tBX96BW`; deep container `13ccba729da8b36a82193ae46d706ff7f0a49afaedfacba69f1aae36e9e79d67` and free container `e137f4e57d0d2490f6263c2a92a816f6154ab2347cf6acaaa08aa6a11af70cee`, both on image `sha256:ed17c0fe9e159834df2dc72a5f8a5d70314e2dcb3f6fd5b2b4a4f3174229e234`; commerce container `be94b86e9febd2621793d800f528ceb5253f8e3aa144dbb38e8abc5456e54663` on image `sha256:028901e0e5e3f9287524573d62f10cdccc22fb9109bd21875a35e5c0709e1d3a`. No production authority changed.
- The third and final browser submission sent exact `https://shun-express.com/`, locale `zh`, and `forceFresh=true`; the protected Preview returned HTTP 202 and created only report `f0133f5b-2eba-4d7f-b05a-a1786b2ea907`, free job `67a5913f-bdf2-4f75-92fe-888887aeffcb`, and regeneration `dccd164a-03ad-4f8a-9d66-028afe1eeb55`. Reports/jobs changed only `26 -> 27` / `65 -> 66`; historical polluted authority hashes and timestamps remained unchanged.
- Two local exact-preview startup attempts had zero side effects. The first failed before entrypoint import with esbuild `spawn EPERM`. The checker-authorized retry reached startup readiness but failed before claim because the npm command's local env sources omitted `OGC_REPORT_V4_MODEL_PROFILE_ID`. Independent snapshots proved zero attempt, transition, error, Worker presence, pre-admission job, or row-hash change after both.
- After explicit scope approval, the sole exact legacy-free Docker one-shot ran from `2026-07-20T08:00:01.5562871Z` to `2026-07-20T08:02:51.3184318Z`, exited `0`, and completed free job `67a5913f-bdf2-4f75-92fe-888887aeffcb`. The report completed at score `76`; the persisted foundation identified `深圳市凌顺国际物流有限公司` / `凌顺国际物流` and contained no SF/顺丰 identity. Trial authority moved to the new report, regeneration cleared, and exactly one V4 pre-admission job `6139c15e-f395-4a76-8ca0-d355357636d5` was created.
- Persisted/type/schema/exact-claim authority required that pre-admission job to use `tier=deep`, correcting the plan's impossible `free` word after explicit user approval. The sole exact V4 Docker one-shot ran from `2026-07-20T08:26:36.1183523Z` to `2026-07-20T08:27:39.4322441Z`, exited `0`, and printed `Exact deep scan job 6139c15e-f395-4a76-8ca0-d355357636d5 completed.`
- Final admission evidence failed: immutable snapshot `report-v4-site-710ad2113d8b2b364bbcb68cbf650bf262de6b2a05ba9ddd2d2134db8e67d9c4` is `unavailable`, with one homepage candidate, zero analyzable pages, and one `deadline_exceeded` exclusion whose content hash is null. Snapshot row hash is `7889e87db2113267f02b8ac70f4728e7fcabfc06169f383e2d5a191f451520fb`; page-identity aggregate hash is `8dc5aefc80bf57aecd924cd5fb057147e5aa655d83e027b59afc8f8f75c29872`. The job is terminal `completed` with no error, credit, lease, retry, repair, or successor job. The state machine cannot exact-claim it again.
- Question rows remain zero because checkout GET normally creates them lazily, but checkout blocks the unavailable snapshot. Orders, payment events, credits, artifacts, access tokens, emails, Core jobs, and diagnosis jobs all remain zero for this report. No payment was attempted.
- Both exact containers were removed by `--rm`. The other 59 containers retained normalized before/after hash `80c5674fe9dfa47e25a3a0d59606bd6406d9e1b996e92c2bf90cdd2d5e338e19`; accepted-image running references returned to zero; recent Worker presence returned to zero. Historical report `8446d645-8db1-45ce-8f4a-8016f7ed1b8f` and job `58f10a1b-25af-4e7c-b7fa-7dee1b4947a4` retained all recorded hashes and timestamps.
- Independent final checker result: `DEVIATION_REVIEW_REQUIRED`. Continuing requires manual replay, a second report, or a product/state-machine change, all forbidden by the approved baseline. The task stopped before checkout/payment/Core/diagnosis/browser-report acceptance, commit, or push.
