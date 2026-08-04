# Active Change Scope Lock

Status: `APPROVED`

## Objective

Create an attributable local Git candidate from the complete verified repair,
then deploy that exact candidate to **Protected Staging only** through the
repository's proven manual Vercel Preview plus source-only Worker overlay path.

This scope does not authorize Production, Git push, a real report, provider
calls, commerce execution, email, customer-data mutation, or historical replay.
It becomes executable only after the user explicitly approves this written
allowlist and deployment target.

## Baseline and candidate identity

- Canonical repository: `E:\project\open-geo-console`
- Branch: `main`
- Baseline HEAD: `4af464b8efe8e6ec3d8ae4423a32a76a1843ab4a`
- Remote: `origin=https://github.com/hunger-Eric/open-geo-console.git`
- Current diff: 52 tracked modified paths, 696 additions and 328 deletions;
  no untracked path is part of the candidate.
- Excluding the two scope-control documents, the 50 implementation/test paths
  are frozen by sorted `path<TAB>lowercase-SHA256` UTF-8/LF manifest with
  aggregate SHA-256
  `24adfb77a6d5bcf2138efd2f83644f92aed0f07552e2e1b815b2464d732bff1f`.
- The candidate commit must have parent equal to the baseline HEAD, contain
  exactly the allowlisted paths below, and use commit subject:
  `fix: enforce report access boundaries and stabilize verification`.
- The candidate full SHA is the commit created from that exact tree. No source
  byte may change after the manifest check and before the commit.

## Exact candidate path allowlist

### Product and commercial-boundary implementation

1. `apps/web/src/app/api/reports/[id]/orders/[orderId]/completion-access/route.ts`
2. `apps/web/src/commerce/operations.ts`
3. `apps/web/src/components/payment-return.ts`
4. `apps/web/src/db/commercial-delivery.ts`
5. `apps/web/src/db/public-source-commerce.ts`
6. `apps/web/src/db/report-tokens.ts`
7. `apps/web/src/db/report-v4-enhancement-terminalization.ts`
8. `apps/web/src/db/report-v4-production-jobs.ts`
9. `packages/ai-report-engine/src/synthesis.ts`
10. `packages/public-search-observer/src/business-questions.ts`

### Commercial and report tests

11. `apps/web/src/app/api/reports/[id]/orders/[orderId]/completion-access/route.test.ts`
12. `apps/web/src/commerce/operations.test.ts`
13. `apps/web/src/components/payment-return-banner.test.ts`
14. `apps/web/src/db/artifact-scope.postgres.test.ts`
15. `apps/web/src/db/commercial-orders-reissue.postgres.test.ts`
16. `apps/web/src/db/public-source-commerce.postgres.test.ts`
17. `apps/web/src/db/public-source-commerce.test.ts`
18. `apps/web/src/db/report-v4-enhancement-terminalization.postgres.test.ts`
19. `apps/web/src/db/report-v4-enhancement-terminalization.test.ts`
20. `apps/web/src/db/report-v4-production-jobs.postgres.test.ts`
21. `apps/web/src/db/report-v4-production-jobs.test.ts`
22. `packages/ai-report-engine/src/synthesis.test.ts`
23. `packages/public-search-observer/src/business-questions.test.ts`

### Schema-chain and verification tests

24. `apps/web/src/db/report-v4-acceptance-ledger.test.ts`
25. `apps/web/src/db/schema-v18.postgres.test.ts`
26. `apps/web/src/db/schema-v19.postgres.test.ts`
27. `apps/web/src/db/schema-v20.postgres.test.ts`
28. `apps/web/src/db/schema-v21.postgres.test.ts`
29. `apps/web/src/db/schema-v23.postgres.test.ts`
30. `apps/web/src/db/schema-v25.postgres.test.ts`
31. `apps/web/src/db/schema-v26.postgres.test.ts`
32. `apps/web/src/db/schema-v27.postgres.test.ts`
33. `apps/web/src/db/schema-v28.postgres.test.ts`
34. `apps/web/src/db/schema-v29.postgres.test.ts`
35. `apps/web/src/db/schema-v30.postgres.test.ts`
36. `apps/web/src/db/schema-v31.postgres.test.ts`
37. `apps/web/src/db/schema-v32.postgres.test.ts`
38. `apps/web/src/db/schema-v34.postgres.test.ts`
39. `apps/web/src/db/schema-v35.postgres.test.ts`
40. `apps/web/src/db/schema-v36.postgres.test.ts`
41. `apps/web/src/db/schema-v37.postgres.test.ts`
42. `apps/web/src/db/schema-v38.postgres.test.ts`
43. `apps/web/src/db/schema-v39.postgres.test.ts`
44. `apps/web/src/db/schema-v41.postgres.test.ts`
45. `apps/web/src/db/schema-v42.postgres.test.ts`
46. `apps/web/src/db/schema-v43.postgres.test.ts`
47. `apps/web/src/db/schema-v44.postgres.test.ts`
48. `apps/web/src/scripts/report-v4-staging-preflight.test.ts`
49. `scripts/run-disposable-postgres-tests.mjs`
50. `scripts/run-disposable-postgres-tests.test.ts`

### Scope-control records

51. `docs/ACTIVE-CHANGE-SCOPE.md`
52. `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md`

No other path may be staged or committed. No implementation edit is authorized
under this release scope.

## Git authority

- A `git_operator` must recheck cwd, branch, full HEAD, remote, status,
  worktrees, complete diff, manifest, and `git diff --check` before mutation.
- Stage exactly the 52 allowlisted paths and create exactly one candidate commit
  on local `main` with the fixed subject above.
- Verify the commit parent, complete committed path set, full SHA, clean
  canonical worktree, and reachability from local `main`.
- Reuse the existing detached
  `E:\project\open-geo-console\.data\deploy-worktree-readmode` only after the
  Git operator proves it is clean and has no unique uncommitted state. Detach it
  at the candidate SHA for deployment; do not create or delete a worktree.
- After deployment, one documentation-only closeout commit is allowed solely to
  archive the release receipt and restore a fail-closed no-active-task scope.
- Forbidden Git actions: push, merge, tag, branch creation/deletion, remote
  branch mutation, force operation, history rewrite, worktree creation/deletion,
  or staging any non-allowlisted path.
- Because push is not authorized, remote-main closeout remains pending and must
  not be reported as completed publication.

## Verified candidate gates already satisfied

- One complete `npm test` exited zero: 3,204 passed, zero failed, 210 existing
  environment-gated skips; no timeout or unhandled error.
- `npm run build`, scoped ESLint, runner syntax check, and `git diff --check`
  passed.
- Canonical disposable PostgreSQL receipt
  `.data/test-runs/postgres-disposable/pg-20260804131610-ef972571/receipt.json`
  passed all 43 selected tests with zero failure and zero skip.
- Before committing, the Git operator must verify that these evidence-producing
  bytes still match the frozen manifest. Do not rerun tests unless the bytes or
  relevant environment changed.

## Protected Staging release authority

The release target is exactly:

- Vercel team: `team_PbYYV2K2zBjTeThfavXStTOI`
- Vercel project: `prj_WVpdlJfsEp0YyWM2W54w8oBy985S`
- Fixed alias: `open-geo-console-staging-itheheda.vercel.app`
- Runtime profile: Preview/Staging with test commerce only
- Worker services: `staging-worker-free` and `staging-worker-deep` only

Before any external mutation, a `release_operator` must perform read-only
preflight and record in this scope as an evidence-only amendment:

1. exact candidate SHA and clean detached deployment checkout;
2. Vercel authentication, live project/team identity, current `link` and latest
   `gitSource` release mode;
3. current fixed-alias Web deployment plus one rollback Web deployment;
4. current Free/Deep image IDs plus exactly one rollback Worker image;
5. Staging database marker and zero claimable, running, recoverable, and
   terminalizable work for both tiers;
6. `docker system df`, free target-drive bytes, container image references, and
   at least 20 GiB free before any Worker build; and
7. confirmation that `package.json`, `package-lock.json`, `Dockerfile.worker`,
   base-image digest, and browser/system dependencies are unchanged.

The evidence-only amendment may fill dynamic identities but may not change the
approved target, counts, topology, behavior, or rollback boundary.

## Exact external-action budget

After every preflight gate passes:

1. Create at most one manual Vercel Preview from the clean exact candidate via
   `vercel deploy --yes --meta ogcGitSha=<candidate-full-sha>`.
2. Independently require `READY`, Preview target, exact project/team, and
   `gitCommitSha = ogcGitSha = <candidate-full-sha>`.
3. Because dependency/base inputs are unchanged, build exactly one thin
   source-overlay Worker image from the accepted current exact Worker image.
   A full Worker image build, `npm ci`, browser install, or OS package install
   is forbidden.
4. Preserve the exact original Staging runtime-env bytes; change only the
   deployment-version value in the ignored runtime environment.
5. Recreate exactly the two named Staging Worker services once, with
   `--no-deps --no-build --force-recreate`; do not touch Commerce or Production.
6. Use the unchanged repository 60-second readiness contract. Require exact
   candidate image/revision, correct tier/profile, restart count zero, and zero
   workflow effects.
7. After Web/Free/Deep full-SHA equality, move the fixed Protected Staging alias
   at most once to the candidate Preview.
8. Smoke-test the fixed URL only: `/zh`, catalog HTTP 200 with `mode=test`, SSO
   protection, final identities, restart counts, and zero workflow effects.

Allowed counts: one Preview, one thin image build, two Worker recreations, one
alias movement, and one fixed-site smoke pass. No real-flow acceptance is
authorized.

## Rollback and stop conditions

- On any post-mutation failure, restore the original runtime-env bytes,
  recreate only Free/Deep on the recorded current image, restore the fixed alias
  to the recorded Web deployment if it moved, verify rollback, and stop.
- Rollback is recovery, not retry authority. Do not create another Preview,
  image, deployment, alias movement, or test run.
- Stop before mutation if any identity is ambiguous, Vercel authentication or
  project identity fails, the Staging marker/work queues are unsafe, disk is
  below 20 GiB, dependency inputs changed, the candidate checkout is not clean,
  or the exact rollback line cannot be proven.
- Stop on any request for Production, Git push, provider/model/search/crawl,
  report generation, order/payment/refund/email, database write, historical
  replay, customer-data mutation, or an action count above this scope.

## Acceptance

- Git acceptance: exact candidate commit exists on local `main`, its full SHA
  and path set are verified, and the deployment checkout is clean at that SHA.
- Deployment acceptance: unique Preview is READY and exact, Free/Deep and Web
  share the candidate SHA, the fixed alias moved once, fixed-site smoke passes,
  and zero workflow effects are proven.
- Local commit, Vercel Preview, Worker replacement, alias movement, smoke, and
  remote publication are separate states and must be reported separately.
- Any failure remains a failure or verified rollback; partial success must not
  be called a completed deployment.

Approved by the user on 2026-08-04 with the explicit instruction `批准` after
reviewing this exact Git and Protected Staging release scope. Execution remains
limited to the allowlist, action counts, rollback boundary, and stop conditions
above.
