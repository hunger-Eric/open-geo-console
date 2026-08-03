# Active Change Scope Lock

Status: `APPROVED`

The user explicitly approved the five-file report-page allowlist on 2026-08-03
and requested that the existing staged and unstaged presentation changes be
organized and committed together.

## Objective

Create one self-contained local commit for the existing customer report
presentation work: Paid V3 read-mode navigation and folding, report metadata
presentation shared with V4, the required styling, the matching V3 component
test, and the exact CSP hash required by the inline read-mode script.

## Baseline

- Repository: `E:/project/open-geo-console`.
- Branch / HEAD before this page commit: `codex/delivery-root-fix` at
  `ae3f43664f62510a72da74b11519bb9b2a0e8136`.
- The five page files contain user/concurrent staged and unstaged changes that
  must be committed as their final working-tree content, not as partial index
  fragments.
- `apps/web/.tmp-preview/` contains generated screenshots, HTML, scripts and
  temporary overlay/build material. It remains untracked and excluded.

## Exact production/test allowlist

- `apps/web/next.config.ts`
- `apps/web/src/components/combined-geo-report-v3-artifact.test.tsx`
- `apps/web/src/components/combined-geo-report-v3-artifact.tsx`
- `apps/web/src/components/combined-geo-report-v4-artifact.tsx`
- `apps/web/src/report/artifact-styles.ts`

Scope authority/history only:

- `docs/ACTIVE-CHANGE-SCOPE.md`
- `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md`

No other source, test, configuration, generated or untracked file is allowed.

## Required behavior and limits

- Preserve the existing final page implementation; make no speculative visual,
  report-data, commerce, access, email, Worker or generation changes.
- The CSP change must correspond exactly to the committed inline read-mode
  script.
- Keep V3/V4 metadata presentation coherent and retain the existing V3 test
  expectation for read-mode controls.
- Production/test diff budget: at most 200 changed lines across the five
  allowlisted page files. Scope/history budget: at most 320 changed lines.
- Do not add dependencies, schemas, migrations, routes, artifacts or files.

## Acceptance

1. Review the combined staged plus unstaged diff against `HEAD` and confirm all
   five paths form one presentation change.
2. The focused V3 artifact test passes.
3. Scoped lint for the five allowlisted files and the web/monorepo build pass
   with no errors. Full lint may remain blocked only by the explicitly excluded
   untracked `.tmp-preview/` material, which must not be edited for this scope.
4. `git diff --check` passes.
5. One local commit contains only the five page files and the two mandatory
   scope records. Existing `.tmp-preview/` remains untracked and excluded.

## External and Git actions

- Authorized: exactly one local commit for this scope.
- Forbidden: push, merge, tag, branch/worktree creation or deletion, Preview,
  alias change, Docker build/recreate, report generation, payment, email,
  Production action, and deletion or cleanup of `.tmp-preview/`.

Any required path or behavior outside this lock is a stop-and-report condition.
