# Active Change Scope Lock

Status: `APPROVED`

Bug fix directed by user acceptance (2026-08-04): clicking the download bar on
`/reports/[id]/report.html` yields 404.

## Root cause (verified)

`apps/web/src/i18n/routes.ts:9,33-40`: `PUBLIC_FILE_PATTERN = /\/[^/]+\.[^/]+$/`
only exempts paths whose LAST segment contains a dot from locale routing.
`/reports/<id>/report.html` is exempt (page works), but
`/reports/<id>/report.html/download` is not — the proxy middleware
(`apps/web/src/proxy.ts:16-32`) 308-rewrites it to
`/zh/reports/<id>/report.html/download`, which has no route → 404.
Route exists in the deployment (build route table
`ƒ /reports/[id]/report.html/download`); report `5c5b2f00` has a valid
`combined_geo_report_v3` artifact and unexpired access tokens.

## Change

- `apps/web/src/i18n/routes.ts`: treat a pathname as non-localizable when ANY
  segment contains a dot (not only the last one), i.e. adjust
  `PUBLIC_FILE_PATTERN` to `/\/[^/]+\.[^/]+/`. No other behavior change:
  existing dotted-leaf paths (`report.html`, `legacy-report.html`,
  `recommendation-report.html`) are already exempt; `/api` and `/_next`
  prefixes unchanged.
- AMENDMENT (user directive 2026-08-04): reposition the download bar —
  full-width bar at the very top is not noticeable. In
  `apps/web/src/app/reports/[id]/report.html/page.tsx`, move the download
  affordance into the artifact's existing top-right actions styling
  (`artifact-actions` classes from ARTIFACT_CSS), right-aligned above the
  report cover, keeping the same anchor + hint text and `print:hidden`.
- Tests: extend the existing i18n routes test to assert
  `getLocaleRoutingAction("/reports/x/report.html/download")` (and a
  locale-prefixed variant) returns `next`, and that existing cases
  (`/reports/x/report.html`, plain localizable pages) are unchanged; update
  the report.html page test for the new bar placement/classes.
- Deploy: ONE manual Vercel Preview deploy from the resulting `main` HEAD +
  move the fixed Protected Staging alias (rollback: re-alias
  `dpl_DuvzZ4ytt8D8NHF5bap98h5uhzju`).

## Forbidden

- No changes to proxy.ts, the download route/page, artifact code, i18n
  dictionaries, or any worker/commerce/Docker/database state.
- No new orders/reports/refunds, no tag, no production.

## Diff budget

- Production: ≤ 20 lines. Tests: ≤ 25 lines. Docs: this file + closeout entry.

## Acceptance checks

1. Routes tests pass; `npm run build --workspace apps/web` passes.
2. Preview READY with correct `ogcGitSha`; alias moved; SSO intact.
3. User confirms the download bar on staging downloads the file.

## Expensive external actions authorized

- Git commit(s) on `main` and push to origin.
- ONE Vercel Preview deploy + fixed-alias move.
