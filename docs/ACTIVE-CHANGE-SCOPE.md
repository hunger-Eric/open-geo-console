# Active Change Scope Lock

Status: `APPROVED`

## Objective

Publish the completed Open GEO public relationship and usage-boundary repair
to `origin/main`, create exactly one isolated manual Vercel Preview from the
exact clean candidate commit, and verify that Preview without moving any
production or fixed-Staging alias.

## Baseline and identities

- Repository: `E:\project\open-geo-console`
- Branch: `main`
- Local and remote baseline HEAD:
  `d0465c91374d59d6d6eb439f55a3bf035f18848b`
- Remote: `origin=https://github.com/hunger-Eric/open-geo-console.git`
- Vercel team: `team_PbYYV2K2zBjTeThfavXStTOI`
- Vercel project: `prj_WVpdlJfsEp0YyWM2W54w8oBy985S`
  (`open-geo-console`)
- Production URL and all production aliases remain unchanged:
  `https://geo.itheheda.online`.
- Fixed protected-Staging alias and Workers remain unchanged:
  `https://open-geo-console-staging-itheheda.vercel.app`.

## Exact tracked-file allowlist

Candidate source and verification:

- `apps/web/src/app/[locale]/page.tsx`
- `apps/web/src/i18n/en.ts`
- `apps/web/src/i18n/i18n.test.ts`
- `apps/web/src/i18n/types.ts`
- `apps/web/src/i18n/zh.ts`
- `apps/web/src/product/config.ts`

Release governance only:

- `docs/ACTIVE-CHANGE-SCOPE.md`
- `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md`

No other tracked or untracked path may be staged, committed, pushed, uploaded,
or used as deployment source.

## Diff and external-action budget

- Production source: at most 120 added/changed lines across the production
  allowlist; measured candidate budget is 89 changed lines.
- Verification source: at most 40 added/changed lines; measured candidate is
  8 added lines.
- Scope/history documentation is excluded from the code budget.
- Git: at most two commits on `main` and two pushes to `origin/main`:
  1. one candidate commit containing the exact approved repair and release
     scope;
  2. one documentation-only closeout commit after Preview verification.
- Vercel: exactly one new manual Preview deployment. No retry, second Preview,
  promotion, rollback deployment, or alias movement.
- Browser: read-only desktop/mobile checks of the unique Preview; zero scanner
  submissions and zero external-link clicks.

## Required execution sequence

1. Recheck branch, full HEAD, `origin/main`, worktrees, status, complete diff,
   allowlist, budgets, and `git diff --check`. Any drift or unexpected path is
   a stop condition.
2. Reuse the already-passed targeted tests, lint, production build, and local
   desktop/mobile evidence only if the candidate source bytes are unchanged;
   otherwise rerun the affected check before commit.
3. Create one candidate commit on `main` with message
   `feat: clarify Open GEO product relationship`; push it once to
   `origin/main`, then require exact remote SHA equality.
4. From the clean canonical checkout at that exact candidate SHA, verify the
   existing Vercel authentication/project binding and run exactly once:

   `npx vercel deploy --yes --meta ogcGitSha=<candidate-full-sha>`

5. Independently inspect the deployment and require `READY`, target `preview`,
   the exact project/team, and candidate identity metadata matching the full
   SHA. Do not move an alias.
6. On the unique Preview URL, verify Chinese and English relationship copy,
   provider link destination, usage steps, public-input/result boundaries,
   responsive desktop/mobile layout, no horizontal overflow, and no browser
   console errors. Do not submit or activate the scanner.
7. Archive the terminal release receipt, return this file to `Status: NONE`,
   create one documentation-only closeout commit, push it once, and verify
   clean local `main`, exact `origin/main`, refs, and worktrees.

## Forbidden actions and systems

- No `--prod`, `vercel promote`, `vercel alias`, production alias mutation,
  fixed-Staging alias mutation, Git-provider connection, branch-scoped Vercel
  environment action, or environment-variable change.
- No Worker/Docker build, image/container mutation, database/schema/data
  operation, report/scan creation, model/provider call, queue, payment, refund,
  email, authentication, access-token, rate-limit, Cloudflare, or DNS action.
- No dependency, lockfile, configuration, migration, branch, tag, PR, merge,
  worktree creation/removal, history rewrite, force push, cleanup, or deletion.
- The unresolved production credential-rotation task remains outside this
  Preview-only scope and does not become satisfied by this deployment.

## Stop conditions

- Any unexpected diff, remote drift, dirty candidate after commit, failed
  validation, authentication/project mismatch, missing or mismatched SHA
  metadata, non-Preview target, deployment failure, unavailable Preview, UI
  regression, horizontal overflow, or browser console error stops the task.
- A failed Git push or Vercel deployment is not retried under this scope.
- No failure authorizes an alias move, production action, data mutation, or
  alternate deployment path.

## Approval gate

Approved by the user with `执行 1` on 2026-08-06 after being shown that this
path means commit and push of the current repair plus one isolated Vercel
Preview, with no production deployment or alias change. Execution may proceed
only within this exact allowlist and external-action budget.
