# Homepage-Only Free Preview Implementation Plan

## Objective

Change the free report from an eight-page/site-wide experience to a truthful homepage-only preview while preserving a private, complete deep report of all eligible pages up to 50.

## Workstream 1: Tier-aware technical reports

1. Extend `geo-auditor` so callers can request one homepage or provide an explicit planned URL set.
2. Reuse the already fetched homepage response instead of fetching it twice.
3. Add a pure homepage projection for legacy public reports and recalculate findings/score from the homepage plus standard assets.
4. Add tests proving homepage mode never fetches sitemap-listed content URLs and explicit deep URLs respect the 50-page bound supplied by the caller.

## Workstream 2: Homepage-only free AI pipeline

1. Set the free AI page limit to one.
2. Make `planPages` return the homepage deterministically for free jobs without calling the model planner.
3. Add a tier-aware discovery mode: free fetches the homepage, robots, and the root sitemap only; deep retains nested sitemap discovery.
4. Use direct sitemap entries and homepage links only as a page-count estimate; do not fetch their content.
5. Persist one verified free AI finding and coverage copy that explicitly says only the homepage was analyzed.

## Workstream 3: Private deep technical bundle

1. Add nullable `technical_payload jsonb` to `ai_reports` and its idempotent migration.
2. During a deep job, run deterministic technical auditing against the selected deep page URLs and save it beside the deep AI report.
3. Add database read/write tests for the private technical payload.
4. Preserve current lease, coverage, settlement, retry, and refund behavior.

## Workstream 4: Server-side visibility projection

1. Replace the AI-only visibility helper with a server-side report bundle selector.
2. Unauthorized/public requests receive the homepage technical projection and the free AI report.
3. Authorized requests receive the deep technical payload and deep AI report only when the deep bundle exists.
4. Never pass deep payloads through client components or public status APIs.
5. Project pre-change free reports to homepage-only output without rewriting stored rows.

## Workstream 5: Report UX

1. Label the free score and coverage as homepage-only in English and Chinese.
2. Free AI analysis renders the organization summary, exactly one full AI finding, and locked summaries for deep dimensions/page types/roadmap.
3. Free issues and technical pages show only deterministic homepage/standard-asset data.
4. Disable free print/PDF with an upgrade explanation; authorized deep reports retain print/PDF.
5. Use detected-page estimates only as an upsell and never describe them as analyzed pages.

## Workstream 6: Verification and documentation

1. Add deterministic unit/integration tests for request counts, planner bypass, legacy projection, authorization, deep storage, and one-page sites.
2. Run `codegraph sync`, `npm run lint`, `npm test`, and `npm run build`.
3. Run PostgreSQL migration/storage checks.
4. Browser-test a new free report and an authorized deep report, including print access.
5. Update README, AI report architecture, project state, tasks, decisions, and design QA.

## Acceptance Criteria

- A new free scan fetches no content page other than the submitted homepage.
- Free AI coverage reports exactly one planned/analyzed page.
- The free page-planning model is never called.
- Public report HTML contains no non-homepage technical URL or deep AI evidence.
- Deep reports audit all eligible planned pages below 50 and never exceed 50.
- Deep technical data is stored privately and shown only with a valid report cookie.
- Free print/PDF is unavailable; authorized deep print remains complete.
- Existing public reports are projected to homepage-only scope without destructive migration.
- Lint, all tests, production build, PostgreSQL checks, and browser QA pass.
