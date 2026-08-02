# Active Change Scope Lock

Status: `APPROVED`

The user explicitly approved this exact written allowlist on 2026-08-02 and
additionally authorized, after implementation and local verification pass,
redeploying the changed source to the local Docker staging environment so the
user can manually submit a website and inspect the final report pages. That
deployment must follow the Docker discipline in `AGENTS.md`: this is a
source-only change, so a full Worker image build is forbidden; use a thin
source-overlay image based on the currently accepted exact image, copy only
the required `apps/` and `packages/` source, recreate only the named staging
services, and record `docker system df`, drive free space, and exact image
IDs (candidate / current / one rollback) before and after. If the staging web
entry that serves report pages is not one of the local Docker services, stop
and report instead of improvising a deployment path.

## Objective

Visual/layout refinement ("精修") of the customer-facing HTML report artifacts:
the two free reports (legacy website audit, recommendation forensics including
its public-source v2 variant) and the deep report (combined GEO report V4).
Keep the existing paper/forest/teal design identity; improve typographic
hierarchy, spacing rhythm, card texture, and color/contrast refinement; fix
the evidence-screenshot overflow and stray divider defects visible in current
renders. No functional, data, or copy changes.

## Baseline

- Repository root: `E:/project/open-geo-console`; `main` HEAD is
  `2a85133c3a39aee735c906590d74cca8f7d0f873`; worktree is clean except the
  agent-owned untracked temporary preview harness `apps/web/.tmp-preview/`.
- Current renders captured as before-evidence PNG/HTML under
  `apps/web/.tmp-preview/out/` (4 reports × desktop/mobile).

## Allowed files (exact allowlist)

Production source (styling and presentational markup only):

- `apps/web/src/report/artifact-styles.ts` (shared `ARTIFACT_CSS`; screen and
  print rules)
- `apps/web/src/components/report-artifact.tsx`
- `apps/web/src/components/recommendation-report-artifact.tsx`
- `apps/web/src/components/public-source-forensics-report-artifact.tsx`
- `apps/web/src/components/combined-geo-report-v4-artifact.tsx`

Tests (only where class/structure assertions must follow the markup changes):

- `apps/web/src/components/report-artifact.test.tsx`
- `apps/web/src/components/recommendation-report-artifact.test.tsx`
- `apps/web/src/components/public-source-forensics-report-artifact.test.tsx`
- `apps/web/src/components/combined-geo-report-v4-artifact.test.tsx`
- `apps/web/src/app/reports/[id]/report.html/page.test.tsx`

Temporary, agent-owned, deleted before closeout:

- `apps/web/.tmp-preview/` (preview render/screenshot harness and outputs)

## Behavioral boundary

- Component edits are limited to presentational wrappers, class names, and
  element grouping. No visible copy/text changes, no locale changes, no data
  shape changes, no changes to business logic (including the V4 5-source
  truncation, evidence asset selection, grade/status mapping, severity
  mapping, and all conditional rendering semantics).
- `combined-geo-report-v1/v2/v3` artifacts share `ARTIFACT_CSS` and will
  inherit global stylesheet changes, but their component files must not be
  edited.

## Forbidden subsystems

- No changes under `packages/` (crawler-rules, log-parser, geo-auditor,
  site-crawler, ai-report-engine, public-search-observer,
  answer-engine-observer, citation-intelligence), `apps/web/src/worker/`,
  `apps/web/src/app/api/`, `apps/web/src/db/`, server actions, persistence,
  or any data-collection/crawling/model-calling path.
- No Docker image/container changes, no deployment, no staging/production
  runs, no new reports/orders/payments/emails, no database access or schema
  changes, no dependency or lockfile changes, no git mutations without
  separate explicit authorization.
- `.tmp-preview` must never be committed.

## Diff budget

- Production source: at most ~700 changed lines total across the five
  allowlisted production files (the stylesheet dominates).
- Tests: at most ~200 changed lines, assertion-following edits only.
- Any breach is a stop-and-report condition.

## Acceptance checks

1. Preview harness re-renders all 4 reports at desktop (1440px) and mobile
   (390px) with zero page errors; after-screenshots reviewed against
   before-screenshots for hierarchy, spacing, typography, and color, with no
   layout regressions (overflow, clipped tables, broken grids).
2. The four allowlisted component test files plus
   `app/reports/[id]/report.html/page.test.tsx` pass under `npm test` (or the
   project's vitest invocation for these files).
3. `npm run lint` passes for `apps/web`.
4. `git diff --check` clean; diff contains only allowlisted paths.
5. `apps/web/.tmp-preview/` is removed before closeout; final `git status`
   shows only allowlisted modifications.

## Expensive external actions

None authorized. All verification is local: static rendering via the
temporary harness, unit tests, and lint. No crawling, model calls, database,
network scans, or deployments.

## Execution record (2026-08-02)

Implementation and local verification (complete):

- Changed production files (4): `apps/web/src/report/artifact-styles.ts`
  (+10/-10 giant template lines), `recommendation-report-artifact.tsx` (+1/-1,
  `grade-mark-${grade}` modifier), `public-source-forensics-report-artifact.tsx`
  (+1/-1, same), `combined-geo-report-v4-artifact.tsx` (+2/-2,
  `answer-status-${status}` modifier and plain ordinal for the circular badge).
  No copy, locale, data-shape, or logic changes. `report-artifact.tsx` needed
  no edits; all its fixes are CSS-only.
- Tests: the five allowlisted test files pass 19/19 with zero test-file edits.
  `npm run lint`: 0 errors (6 pre-existing worker warnings, unrelated).
  `git diff --check` clean; diff touches only allowlisted paths.
- Before/after screenshots (desktop 1440px + mobile 390px, 4 reports each)
  reviewed: hierarchy, spacing, typography, color refined; evidence-image
  overflow and stray V4 divider fixed; no mobile overflow or clipped tables.

Staging Docker redeploy (complete, thin source-overlay per AGENTS.md):

- Preflight: E: 53 GiB free; C: only 4.8 GiB free (Docker Desktop VM disk) —
  full builds are off the table, overlay adds only KB-scale layers. Current
  image `open-geo-console:staging-91ef797-overlay-v1` (`sha256:3f436e73...`),
  retained as the current/rollback image; candidate diff verified source-only
  (no `package.json` / lockfile / `Dockerfile.worker` changes).
- Candidate: `open-geo-console:staging-2a85133c-style-overlay-v1`
  (`sha256:26bb8f77...`), built FROM the current image with only the four
  changed `apps/web/src` files copied; revision label
  `2a85133c-report-style-v1`. New code verified inside the image.
- `.data/workstation-docker/staging-head.override.yaml` re-pinned to the
  candidate image and `OGC_DEPLOYMENT_VERSION: 2a85133c-report-style-v1`
  (deployment mechanics only); `staging-worker-free` and
  `staging-worker-deep` recreated, both `running=true`, logs show free/deep
  workers ready. No other services, images, or volumes touched.
- Post-deploy: `docker system df` images 66 total / 32.11 GB (net +1 image,
  shared layers — no meaningful disk increase); C: still 4.8 GiB free.
- Rollback: re-pin the override to
  `open-geo-console:staging-91ef797-overlay-v1` and recreate the same two
  services.

Known boundary for manual browser acceptance:

- The report HTML pages are rendered by the Next.js web app
  (`apps/web`), which is not a local Docker service. The worker overlay
  covers worker-side rendering (private PDF readiness); browser-visible page
  styling is served by whatever web deployment the user tests against.
  Viewing options reported to the user; no web deployment was improvised.

Pending closeout: user manual browser test, then removal of
`apps/web/.tmp-preview/` (contains the harness, before/after screenshots, and
the overlay build context).
