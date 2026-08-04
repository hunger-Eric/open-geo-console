# Active Change Scope Lock

Status: `APPROVED`

## Phase 1 Objective

Create one local `main` commit containing exactly the accepted Paid V3
date-reference and presentation changes plus their scope archive. Push that
single commit to `origin/main` once, then stop and replace this scope with a
separate exact-SHA Protected Staging release scope before any deployment or
Docker mutation.

The user requested “整理提交吧，然后部署，我自己来真实测试一下” on
2026-08-04 and explicitly approved Phase 1 after reviewing this written Git
allowlist. Git actions may proceed only inside this boundary.

## Baseline And Repository Identity

- Canonical repository/worktree: `E:\project\open-geo-console`
- Branch: `main`
- Local HEAD: `3ab11f0b1219873579a366617957413a206e6815`
- `origin/main`: `3ab11f0b1219873579a366617957413a206e6815`
- Remote: `https://github.com/hunger-Eric/open-geo-console.git`
- Existing detached worktrees are read-only/out of scope and must not be
  removed, reset, cleaned, or used for this commit.

## Exact Commit Allowlist

Stage and commit exactly these eight tracked paths:

1. `apps/web/src/components/combined-geo-report-v3-artifact.tsx`
2. `apps/web/src/components/combined-geo-report-v3-artifact.test.tsx`
3. `apps/web/src/report/artifact-styles.ts`
4. `packages/ai-report-engine/src/synthesis.ts`
5. `packages/ai-report-engine/src/synthesis.test.ts`
6. `packages/ai-report-engine/src/types.ts`
7. `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md`
8. `docs/ACTIVE-CHANGE-SCOPE.md`

Any other modified, staged, untracked, generated, ignored, or worktree path is
forbidden and must remain untouched.

## Authorized Git Actions

1. Re-run `git diff --check`, the 50 focused tests, scoped lint, and the full
   workspace build if the diff changed after the last receipt.
2. Have the Git operator verify cwd, branch, full HEAD, remote, status,
   worktrees, staged diff, allowlist, and production/test budgets.
3. Stage the eight allowlisted paths explicitly; never use `git add -A` or
   broad staging.
4. Create one non-amended commit on `main` with message:
   `feat: improve paid report decision flow and date context`
5. Verify the commit tree contains no path outside the allowlist and is a
   direct child of baseline HEAD.
6. Push `main` to `origin/main` once without force.
7. Verify local/remote `main` equality, cleanliness, full SHA, branch refs, and
   worktree list.

No branch, tag, merge, rebase, reset, stash, amend, force push, worktree
creation/deletion, or remote configuration change is authorized.

## Phase 1 Acceptance

- One clean commit contains only the eight allowlisted paths.
- Local `main` and `origin/main` equal the new full candidate SHA.
- The candidate is a direct descendant of
  `3ab11f0b1219873579a366617957413a206e6815`.
- The focused Paid V3/synthesis/readiness/report-scope tests pass, scoped lint
  passes, full build passes, and `git diff --check` passes.
- Record the candidate SHA and terminal Git receipt in this file, archive this
  phase, then create a new `FROZEN` Staging release scope naming that exact SHA.

## Explicitly Forbidden In Phase 1

- Vercel deployment, alias movement, Docker build/image/container mutation,
  Staging/Production database or environment mutation, browser smoke against a
  new candidate, report generation, crawl, model/provider call, payment, order,
  refund, email, cleanup, replay, or historical report mutation.
- Production deployment or Production Worker/container changes under any
  circumstance.

## Planned Phase 2 Boundary (Context Only, Not Authority)

After Phase 1 yields an exact candidate SHA, the next frozen scope will name:

- fixed business-test URL:
  `https://open-geo-console-staging-itheheda.vercel.app`;
- one manual Vercel Preview with `ogcGitSha=<candidate-full-sha>`;
- current Staging Worker image
  `sha256:1a82ee00f646dbb15a214290d2c7821f9137c5fa438040b1f4b8bd40ff22289f`
  (`staging-a7ce1af-retry-overlay-v1`);
- rollback image
  `sha256:ab4f795c9bf7c4a3f81adf326249e090c4a11992d727b0bf5088b9efe2791d76`
  (`staging-0dd8206-output-cap-overlay-v1`);
- one source-only thin overlay built from the current exact Worker image;
- recreation of only `staging-worker-free` and `staging-worker-deep`, followed
  by one fixed-alias move after Web/Worker SHA identity checks;
- fixed-site technical smoke only. The user, not the operator, will create and
  evaluate the new real report.

Current preflight context: E drive free space is approximately 50.6 GiB;
current Free/Deep containers run the same image, revision
`a7ce1af1f3c217955c5aef2c80393ea780de55fb`, status running, restart count 0.
These observations do not authorize Phase 2 actions.
