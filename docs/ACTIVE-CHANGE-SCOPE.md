# Active Change Scope Lock

Status: `APPROVED`

## Objective

Publish the already implemented and locally verified free-checkout/buyer-
question change to `origin/main`, then deploy that one exact commit to the
existing Protected Staging Web plus Free/Deep Workers by the repository's
proven manual release path.

The user explicitly requested all three actions: commit, push, and deploy.
This scope separates Git publication from runtime release; neither action may
be inferred from the other, and deployment begins only after the Git phase
produces and verifies one exact candidate SHA.

## Baseline and repository identity

- Canonical repository/worktree: `E:\project\open-geo-console`
- Branch: `main`
- Local HEAD and expected `origin/main` baseline:
  `d8c938511682b3dcb12ca4b66adaeaeb25d08e6e`
- Remote: `https://github.com/hunger-Eric/open-geo-console.git`
- Seven tracked paths are modified; nothing is staged.
- Existing detached worktrees are out of scope and must not be removed,
  cleaned, or used as release substitutes. Do not create another worktree.
- Focused tests passed 16/16, scoped Web lint passed, the full workspace build
  passed, and `git diff --check` passed. Full lint retains 17 unrelated errors
  in `apps/web/.tmp-preview/debug-readiness.ts`; that ignored file is forbidden.

## Phase 1 - exact Git publication

### Exact seven-path commit allowlist

1. `apps/web/src/components/ai-report-status.tsx`
2. `apps/web/src/components/ai-report-status.test.ts`
3. `packages/public-search-observer/src/business-questions.ts`
4. `packages/public-search-observer/src/business-questions.test.ts`
5. `docs/ACTIVE-CHANGE-SCOPE.md`
6. `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md`
7. `docs/PROTECTED-STAGING-OPERATIONS.md`

The two history/runbook files contain the already requested receipt and proven
manual release instructions from the immediately preceding Protected Staging
release. Before staging, append a concise local-implementation record for this
change to the existing history file. No other document is allowed.

### Authorized Git actions

1. Re-run the two focused test files, scoped Web lint, full workspace build,
   and `git diff --check`.
2. Verify cwd, `main`, full baseline HEAD, remote, status, worktrees, complete
   diff, allowlist, and budgets.
3. Stage the seven paths explicitly; never use a broad add.
4. Create exactly one non-amended commit on `main` with message:
   `feat: gate free checkout and personalize buyer questions`
5. Require the commit to be a direct child of the baseline and contain no path
   outside the seven-file allowlist.
6. Push `main` to `origin/main` once, without force, and verify local/remote
   full-SHA equality.

No branch, tag, merge, rebase, reset, stash, amend, force push, worktree
creation/deletion, or remote configuration change is authorized.

The resulting full commit SHA is the sole Phase 2 candidate. Stop before
deployment if the worktree is not clean, the candidate is not the verified
direct child, or local and remote `main` differ.

## Phase 2 - exact-candidate Protected Staging release

### Fixed targets and current identities

- Vercel project/team: existing linked Open GEO Console project under
  `team_PbYYV2K2zBjTeThfavXStTOI` / `prj_WVpdlJfsEp0YyWM2W54w8oBy985S`.
- Fixed business-test alias:
  `https://open-geo-console-staging-itheheda.vercel.app`
- Current fixed Web deployment/rollback target:
  `dpl_A53XPfWHjkS5oCesn6mJQqLEGmJG` at candidate
  `d8c938511682b3dcb12ca4b66adaeaeb25d08e6e`.
- Current Worker image, which becomes the one rollback image after success:
  `sha256:a707736c7a9c3024283ee270e89bd107a218f50e2636e41bf2dfcc32b109705c`
  (`open-geo-console:staging-d8c9385-paid-report-overlay-v1`).
- Older rollback image, removable only after candidate success and only when
  unreferenced:
  `sha256:1a82ee00f646dbb15a214290d2c7821f9137c5fa438040b1f4b8bd40ff22289f`
  (`open-geo-console:staging-a7ce1af-retry-overlay-v1`).
- Both current Staging Workers are running the current image with restart count
  zero. Read-only preflight observed about 54.3 GB free on `E:` and Docker
  images at 30.39 GB.

### Authorized release actions

1. Reverify the exact candidate SHA, clean canonical worktree, Vercel identity,
   Staging database/deployment markers, disk/Docker baseline, current/rollback
   identities, and zero claimable/running/recoverable/terminalizable Staging
   jobs. Do not print environment values or secrets.
2. Create at most one manual Vercel Preview from the clean canonical candidate:
   `vercel deploy --yes --meta ogcGitSha=<candidate-full-sha>`.
3. Independently require `READY`, Preview target, exact project/team, and
   `gitCommitSha = ogcGitSha = <candidate-full-sha>`.
4. Because no dependency/base input changed, build exactly one source-only
   thin Worker overlay from the current exact Worker image. No `npm ci`, OS
   package, Playwright/Chromium, dependency, or full Worker rebuild is allowed.
5. Preserve original Staging runtime-env bytes, replace only the single
   `OGC_DEPLOYMENT_VERSION` value with the candidate SHA, and create only the
   transient tier overlay needed to recreate `staging-worker-free` and
   `staging-worker-deep` with `--no-deps --no-build --force-recreate`.
6. Use the unchanged repository `Wait-WorkerReadiness` 60-second contract.
   Require exact image/revision, tier, Staging/Preview identity, running state,
   restart count zero, readiness log, and zero claimed/claimable recovery work.
7. After Web/Free/Deep full-SHA equality, move the fixed alias exactly once.
8. Perform only fixed-site technical smoke: protection behavior, `/zh` reach-
   ability when credentials permit, and commerce catalog HTTP 200/test mode.
   An independent read-only reviewer checks the technical receipt.
9. After successful replacement, retain the candidate image plus current
   `a707...` rollback. Remove only the exact older `1a82...` image if no
   container references it; otherwise leave it and report the reference.
10. Record before/after disk, Docker, container/image IDs, restart counts,
    candidate SHA equality, fixed alias result, and smoke boundary.

On any post-mutation failure, restore original runtime-env bytes, recreate only
Free/Deep on `a707...`, restore the alias to `dpl_A53...` if it moved, verify
rollback, and stop. Rollback does not authorize a second Preview, rebuild,
retry, report, or payment.

## Forbidden actions

- No Production deployment, Production/commerce Worker mutation, database
  schema or data mutation, report generation, crawl, model/search call, order,
  payment, refund, email, artifact, historical repair/replay, or customer-data
  action.
- No real-flow acceptance. The user will test through the fixed Protected
  Staging URL after technical deployment; this release may be reported only as
  “deployment complete, real flow not yet accepted.”
- No change outside the exact Git paths and necessary ignored transient release
  files. No cleanup beyond the one exact older image rule above.

## Stop conditions

- Any diff or staged path outside the allowlist.
- Test/build regression attributable to this change.
- Candidate identity, Vercel project/team, database marker, Worker image,
  rollback, disk, readiness, or idle-job preflight is ambiguous or fails.
- The fixed alias or either Worker cannot be proven to match the same candidate
  SHA.

Approved by the user on 2026-08-04 for both the exact Git publication phase and
the bounded Protected Staging release phase. Execution remains limited to this
allowlist, action budget, gate order, and rollback boundary.
