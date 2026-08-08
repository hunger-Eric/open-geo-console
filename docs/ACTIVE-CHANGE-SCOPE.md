# Active Change Scope Lock

Status: `APPROVED`

## Objective

Package the already verified local V4 changes as one immutable candidate,
push that candidate to `origin/main`, and deploy the same full SHA to the
Protected Staging Web, Free Worker, and Deep Worker. Move the fixed Protected
Staging alias only after all three runtimes prove exact SHA equality.

This scope ends at technical deployment handoff. The user will perform website
and customer-path testing. This scope creates no report, crawl, model run,
order, Sandbox payment, refund, email, or customer artifact.

## Baseline

- Repository: `E:\project\open-geo-console`
- Branch: `main`
- Current pre-candidate HEAD:
  `23c5e3a85362a7bf97db55cc136f1f0a6b3590ea`
- Remote: `origin` = `https://github.com/hunger-Eric/open-geo-console.git`
- Candidate source: the exact current allowlisted worktree diff below, plus
  this scope-lock update; no further production/source edits are permitted.
- Verified local evidence already completed for this diff:
  - full unit suite: 3358 passed, 213 skipped;
  - disposable PostgreSQL suite: 282 passed, zero skipped;
  - build passed;
  - lint passed with zero errors and eight pre-existing warnings;
  - `git diff --check` passed;
  - CodeGraph is synced.
- Protected Staging database marker/schema: `staging` / `47`.
- Gate-2 work baseline: claimable `0`, running `0`, expired-recoverable `0`,
  exhausted-terminalizable `0`, expired repair deadline `0`.
- Existing historical state is preserved: five `repair_wait` jobs, eight old
  non-closed orders, and zero queued/sending email deliveries.
- Current Web rollback deployment:
  `dpl_C7x4rmBPtUNkRDznKLhVFuPqTp5P` at
  `open-geo-console-gr1ou91w3-itheheda-6857s-projects.vercel.app`.
- Current Worker image:
  `sha256:1b93aece9f997ae991a9f07477659c15e2535ef36b2b8ed668376fb29de93a64`
  at revision `23c5e3a85362a7bf97db55cc136f1f0a6b3590ea`.
- Worker rollback image:
  `sha256:1ba445594c50ed638b9bb02caf6e2d19c53e6adf57c874ef4c6b7ec00fb25666`
  at revision `c05151bf48384bc40e6403457eb978bf2700bda0`.
- E-drive free space before build: 41,867,890,688 bytes.

## Exact allowed repository paths

The candidate commit may contain only these paths:

1. `apps/web/src/app/reports/[id]/report.html/page.test.tsx`
2. `apps/web/src/commerce/operations.test.ts`
3. `apps/web/src/commerce/operations.ts`
4. `apps/web/src/components/combined-geo-report-v4-artifact.test.tsx`
5. `apps/web/src/components/combined-geo-report-v4-artifact.tsx`
6. `apps/web/src/components/payment-return-banner.test.ts`
7. `apps/web/src/components/payment-return.ts`
8. `apps/web/src/db/combined-replacement-terminalization.test.ts`
9. `apps/web/src/db/combined-reports.test.ts`
10. `apps/web/src/db/combined-reports.ts`
11. `apps/web/src/db/public-source-commerce.postgres.test.ts`
12. `apps/web/src/db/public-source-commerce.test.ts`
13. `apps/web/src/db/public-source-commerce.ts`
14. `apps/web/src/db/report-v4-acceptance-authority-phase-snapshot.postgres.test.ts`
15. `apps/web/src/db/report-v4-acceptance-ledger.postgres.test.ts`
16. `apps/web/src/db/report-v4-artifact-authority.postgres.test.ts`
17. `apps/web/src/db/report-v4-artifact-authority.test.ts`
18. `apps/web/src/db/report-v4-artifact-persistence.test.ts`
19. `apps/web/src/db/report-v4-enhancement-terminalization.postgres.test.ts`
20. `apps/web/src/db/report-v4-enhancement-terminalization.test.ts`
21. `apps/web/src/db/report-v4-page-summaries.postgres.test.ts`
22. `apps/web/src/db/report-v4-page-summaries.test.ts`
23. `apps/web/src/db/report-v4-page-summaries.ts`
24. `apps/web/src/db/schema-v26.postgres.test.ts`
25. `apps/web/src/report-v4/mimo-site-synthesis-provider.test.ts`
26. `apps/web/src/report-v4/mimo-site-synthesis-provider.ts`
27. `apps/web/src/report/artifact-model.test.ts`
28. `apps/web/src/report/artifact-model.ts`
29. `apps/web/src/report/report-v4-html.test.tsx`
30. `apps/web/src/scripts/probe-free-v4-direct-semantics.test.ts`
31. `apps/web/src/scripts/probe-free-v4-direct-semantics.ts`
32. `apps/web/src/worker/paid-v3-semantic-review.test.ts`
33. `apps/web/src/worker/report-v4-core-production.postgres.test.ts`
34. `apps/web/src/worker/report-v4-core-production.test.ts`
35. `apps/web/src/worker/report-v4-core-production.ts`
36. `apps/web/src/worker/report-v4-enhancement-production.postgres.test.ts`
37. `apps/web/src/worker/report-v4-independent-claims.postgres.test.ts`
38. `apps/web/src/worker/report-v4-orchestrator.test.ts`
39. `apps/web/src/worker/report-v4-orchestrator.ts`
40. `apps/web/src/worker/report-v4-page-analysis-production.test.ts`
41. `apps/web/src/worker/report-v4-page-analysis-production.ts`
42. `apps/web/src/worker/report-v4-question-answerer.ts`
43. `apps/web/src/worker/report-v4-website-synthesis-production.test.ts`
44. `apps/web/src/worker/report-v4-website-synthesis-production.ts`
45. `packages/ai-report-engine/src/combined-geo-report-v4.test.ts`
46. `packages/ai-report-engine/src/combined-geo-report-v4.ts`
47. `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md`
48. `docs/ACTIVE-CHANGE-SCOPE.md`
49. `docs/superpowers/plans/2026-08-08-report-v4-page-outcomes.md`

No source file may be edited during packaging or deployment. Only
`docs/ACTIVE-CHANGE-SCOPE.md` may change again to record approval/completion.

## Diff budget

- Production/test source budget is fixed at the measured 46-file diff:
  1,577 insertions and 311 deletions. It may not increase.
- The existing plan is 357 lines.
- Scope/history documentation may change only to record this authority and its
  final evidence; it may not grant new behavior.

## Authorized Git actions after approval

1. Recheck cwd, branch, full HEAD, remote, worktrees, complete diff, and remote
   `main`; stop if remote history conflicts or any unallowlisted path appears.
2. Stage exactly the 49 allowlisted paths.
3. Create exactly one non-amended, non-squashed local commit on `main`.
4. Push that exact commit once to `origin/main` without force.
5. Do not create a branch, worktree, tag, PR, merge, or additional commit.

## Authorized deployment actions after approval

1. Use the clean committed candidate SHA as the sole Web/Worker identity.
2. Create at most one Vercel Preview with `ogcGitSha=<candidate-full-sha>` only
   if no READY Preview already matches it.
3. Require READY/Preview/project/team identity and independent candidate-SHA
   evidence before continuing.
4. Build exactly one source-only thin Worker overlay from the recorded current
   Worker image. No `npm ci`, browser/system dependency install, or full image
   build is authorized.
5. Preserve staging runtime-env bytes and recreate exactly these two services
   once: `staging-worker-free`, `staging-worker-deep`.
6. Require the canonical 60-second readiness boundary, exact image/SHA/tier,
   Staging/Preview identity, restart count zero, and zero Gate-2 work.
7. Move `open-geo-console-staging-itheheda.vercel.app` to the accepted Preview
   exactly once after Web/Free/Deep SHA equality.
8. Perform read-only technical postchecks only: deployment identity, Worker
   identity/health, anonymous protection response, and zero workflow-effect
   delta. Website/customer-path acceptance remains the user's responsibility.

If a post-change check fails, restore only the two Workers and fixed alias to
the recorded rollback identities, verify rollback, and stop. Rollback does not
authorize a second build, Preview, alias attempt, or push.

## Forbidden

- Production Web, Workers, database, commerce, aliases, data, or credentials.
- Any report, crawl, model call, order, payment, refund, email, access token, or
  customer artifact.
- Mutation, cleanup, replay, resume, repair, terminalization, reuse, or deletion
  of any historical job/report/order/payment/artifact.
- Database migrations or schema/data writes.
- Full Worker build, dependency/base-image change, image pruning, broad Docker
  cleanup, or deletion of any existing image.
- Source fixes, test changes, refactors, retries after a failed deployment gate,
  additional Preview, or customer acceptance performed by the assistant.

## Completion evidence

- Candidate commit contains exactly the allowlisted diff and is reachable from
  local and remote `main`.
- One READY Preview and both Staging Workers report the same full candidate SHA.
- The fixed Protected Staging alias resolves to that Preview.
- Both Workers are healthy with restart count zero and exact candidate image.
- Gate-2 work counts remain zero and workflow-effect counts have zero delta.
- Production was untouched; no report/payment/customer flow was created.
- Final status must say: deployment handed off for user website testing; customer
  path is not accepted by the assistant.

## Approval required

The user explicitly approved this exact scope on 2026-08-08. Git and deployment
steps may execute only within the limits above.
