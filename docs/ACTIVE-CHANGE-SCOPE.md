# Active Change Scope Lock

Status: `APPROVED`

Approved by the user on 2026-08-03 for the exact 14-file local commit and
local-commit-only boundary below. The same message requested deployment next;
deployment remains outside this scope and requires its own target-specific
FROZEN authority after this commit succeeds.

## Objective

Create exactly one local Git commit containing the already completed and
verified Paid V3 template restoration, customer-content focus, Direct/GEO
prompt corrections, deterministic tests and closeout records.

No production behavior may be edited under this scope. No push, merge, rebase,
deployment or remote mutation is authorized.

## Baseline

- Repository: `E:/project/open-geo-console`.
- Branch: `codex/delivery-root-fix`.
- HEAD: `be3c032e0a73b6a13b80b6901617a4203e7881c6`.
- Remote: `origin=https://github.com/hunger-Eric/open-geo-console.git`.
- Current tracked diff: exactly the 14 files listed below.
- User-owned untracked `apps/web/.tmp-preview/**` must remain untouched and
  uncommitted.
- Ignored `.data/**`, including local diagnostic HTML, receipts and screenshots,
  must remain uncommitted.
- Detached worktrees `.data/candidate-worktree` and
  `.data/deploy-worktree-readmode` must remain untouched.
- Current branch and `main` are not in a safe fast-forward relationship; this
  scope forbids merge, rebase, branch cleanup or main advancement.

## Exact commit allowlist

- `apps/web/src/components/combined-artifact-fixtures.ts`
- `apps/web/src/components/combined-geo-report-v3-artifact.test.tsx`
- `apps/web/src/components/combined-geo-report-v3-artifact.tsx`
- `apps/web/src/components/source-selection-diagnosis-section.test.tsx`
- `apps/web/src/components/source-selection-diagnosis-section.tsx`
- `apps/web/src/report/artifact-styles.ts`
- `apps/web/src/report/combined-artifact-readiness.test.tsx`
- `apps/web/src/worker/geo-article-example.test.ts`
- `apps/web/src/worker/geo-article-example.ts`
- `apps/web/src/worker/report-v4-free-teaser.test.ts`
- `apps/web/src/worker/report-v4-free-teaser.ts`
- `design-qa.md`
- `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md`
- `docs/ACTIVE-CHANGE-SCOPE.md`

No other tracked or untracked path may be staged.

## Authorized Git actions after explicit approval

1. Re-read cwd, branch, full HEAD, remote, worktrees and status.
2. Fail closed if HEAD, branch, tracked path set or ownership changed.
3. Stage only the exact 14-file allowlist using explicit literal paths.
4. Verify `git diff --cached --name-status`, `git diff --cached --check` and
   confirm `apps/web/.tmp-preview/**` plus `.data/**` are absent.
5. Create exactly one local commit with message:
   `feat: restore paid report template and content focus`.
6. Re-read commit identity and status. The only permitted remaining status is
   the preserved untracked `apps/web/.tmp-preview/`.

## Existing verification accepted for this commit

- Focused tests: 5 files, 54/54 passed, 0 skipped.
- Scoped lint: passed with zero warnings and errors.
- Full workspace build: passed; 18/18 static pages generated.
- `git diff --check`: passed.
- Codex in-app-browser QA passed at 1440x1024 and 390x844 with 9/9 TOC
  anchors, two loaded evidence images, no overflow, no console errors and no
  P0/P1/P2 findings.
- No code changed after those checks; only the scope authority changes here.

## Forbidden actions

- No production/test refactor, formatting pass or content adjustment.
- No staging of `apps/web/.tmp-preview/**`, `.data/**` or any non-allowlisted
  file.
- No amend, reset, stash, checkout, clean, cherry-pick, merge or rebase.
- No branch/worktree creation, deletion, detachment or cleanup.
- No push, pull, fetch, tag, PR, remote branch mutation, deployment, Docker,
  model/search/crawl/database/payment/email call or customer-data mutation.

## Acceptance

- Exactly one new local commit exists on `codex/delivery-root-fix` with parent
  `be3c032e0a73b6a13b80b6901617a4203e7881c6`.
- The commit contains exactly the 14 allowlisted paths and passes cached diff
  checks.
- `apps/web/.tmp-preview/**`, `.data/**`, detached worktrees, main and all
  remotes remain unchanged.
- The final response reports the full commit SHA and makes clear that the live
  website is not updated until a separately approved push/deployment.

Implementation is authorized only for the exact Git actions above.
