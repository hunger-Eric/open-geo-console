# Active Change Scope Lock

Status: `APPROVED`

## Objective

Repair the two defects confirmed by report
`fa1d2027-af57-413f-b683-4353f9020157` without mutating or replaying that
historical report:

1. New buyer-question sets must derive the service category from the target
   website's actual products/services and must not reclassify an AI-automation
   business as logistics merely because its summary mentions a freight case.
2. A ready Free Direct teaser with a completed Q1 answer/core receipt and a
   terminal `incomplete` independent-analysis status must still expose the paid
   checkout and truthful upgrade CTAs. The Paid Direct continuation already
   accepts and preserves that terminal incomplete Q1 analysis status.

## Confirmed baseline

- Protected Staging report target: `https://me.itheheda.online/`.
- Its persisted Foundation identifies the business as custom AI-automation
  system design and delivery. The summary also mentions one freight-lead case.
- `compactServiceCategory` currently scans the whole summary for logistics
  words, so that incidental case changes the selected service category to
  `跨境物流服务` and contaminates all three persisted questions.
- The same report has a completed Q1 answer/core and
  `directAnalysisStatus=incomplete`. Page, teaser, and status projections gate
  checkout on `analysisStatus === completed`, while the Paid Direct builder
  explicitly accepts either terminal `completed` or `incomplete` Q1 analysis.
- The report has no payment order. The Direct-analysis catch path records only
  `incomplete`; it does not retain or log the swallowed exception.

## Allowed production files

- `packages/public-search-observer/src/business-questions.ts`
- `apps/web/src/app/[locale]/reports/[id]/page.tsx`
- `apps/web/src/components/combined-geo-report-v4-teaser.tsx`
- `apps/web/src/app/api/reports/[id]/status/route.ts`

## Allowed verification files

- `packages/public-search-observer/src/business-questions.test.ts`
- `apps/web/src/components/combined-geo-report-v4-teaser.test.tsx`
- `apps/web/src/app/api/reports/[id]/status/route.test.ts`

## Scope file

- `docs/ACTIVE-CHANGE-SCOPE.md`

## Forbidden subsystems and actions

- No mutation, repair, replay, clone, or replacement of the named historical
  report or its immutable question set.
- No provider prompt/model-contract change, retry, extra provider call, error
  persistence, Worker orchestration, schema/migration, commerce API, pricing,
  payment, entitlement, refund, email, access-token, or artifact change.
- No database write, model/search call, new report, order, payment, refund,
  email, Docker action, deployment, Production action, Git stage/commit/push,
  branch, tag, merge, or worktree change.
- No adjacent refactor, generalized taxonomy redesign, or compatibility layer.

## Diff budget

- Production files: at most 40 added/deleted lines in total.
- Verification files: at most 120 added/deleted lines in total.
- This scope file is excluded from the code budget.

## Acceptance checks

1. A profile whose real products/services are AI automation but whose summary
   contains a freight case produces AI-automation buyer questions, not
   logistics questions.
2. A genuinely logistics-focused profile still produces the logistics service
   category.
3. A ready Direct teaser with `directAnalysisStatus=incomplete` keeps the
   truthful incomplete-analysis message and shows its upgrade CTA.
4. The report page mounts `CommercialCheckout` for that ready terminal state,
   and the public status projection reports checkout eligible.
5. Existing missing/generating/unavailable Free reports remain unable to mount
   checkout.
6. Focused affected tests, scoped lint, workspace build, and `git diff --check`
   pass. The final diff stays inside the allowlist and budget.

## Local verification receipt

- Focused Vitest: 5 files, 35 tests passed; independent tester rerun matched
  5 files and 35 tests with exit code 0.
- Scoped Web ESLint: exit code 0 with no errors. The two package files also
  passed the shared TypeScript/Next ESLint config with exit code 0; its only
  message was the expected missing root `pages` directory notice.
- Complete `npm run build`: exit code 0; all package TypeScript builds and the
  Next.js production build completed successfully.
- `git diff --check`: exit code 0 in both owner and independent tester runs.
- Allowlist audit: 8 changed paths, zero unexpected or missing paths.
  Production delta 21/40; verification delta 52/120.
- Independent reviewer found no blocking correctness, security, or scope issue.
  It noted non-blocking P3 coverage gaps: no direct page-level test, and the
  status-route parser mock does not duplicate the production parser's complete
  Q1 receipt constraints. The unchanged production parser remains the authority
  for those constraints.
- Local implementation and automated acceptance are complete. Protected
  Staging release and fresh-report/browser acceptance remain unverified and
  unauthorized.

## Expensive external actions

Protected Staging release authority granted by the user's explicit
"提交、推送、部署" instruction on 2026-08-04, limited to:

- One Git commit of the allowlisted diff and one push of `main` to `origin`.
- At most one manual Vercel Preview deployment at the candidate SHA.
- At most one thin source-overlay Worker image build from the accepted current
  Worker image (dependency/base inputs unchanged).
- Recreating only `staging-worker-free` and `staging-worker-deep`.
- Moving the fixed Protected Staging alias once, only after Web/Free/Deep
  full-SHA equality.
- Gates 1-3 of `docs/PROTECTED-STAGING-OPERATIONS.md` only. Gate 4 real-flow
  acceptance, any new report, order, payment, refund, email, Production action,
  or full Worker image build remains unauthorized.

## Stop conditions

- Any fix requires a file outside the allowlist, changes paid-generation
  acceptance, weakens the completed-Q1-core requirement, or changes external
  state.
- Evidence shows the logistics false positive originates upstream of the
  bounded classifier, or the checkout API has a contradictory server-side
  authority not covered here.
- The diff exceeds the production budget or encounters overlapping user edits.

The user explicitly approved this exact allowlist and objective on 2026-08-04.
The same-day "提交、推送、部署" instruction authorizes the commit, push, and
Protected Staging Gates 1-3 recorded above; fresh-report Gate 4 acceptance
still requires separate later authority.
