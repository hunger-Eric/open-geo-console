# Active Change Scope Lock

Status: `APPROVED` (user approved 2026-08-04)

Bug fix from user acceptance (2026-08-04): the downloaded standalone report
HTML loses all evidence screenshots when opened locally.

## Root cause (verified)

Artifact components render evidence images as site-relative API paths, e.g.
`apps/web/src/components/combined-geo-report-v3-artifact.tsx:109` and
`report-artifact.tsx:196-197`:
`<img src="/api/reports/<id>/evidence/<assetId>">` (recommendation variant:
`/api/reports/<id>/evidence/recommendation/<assetId>`).
`apps/web/src/app/reports/[id]/report.html/download/route.ts` inlines only the
CSS (`buildStandaloneReportDocument`, report-scope.tsx:44-46), so the saved
file resolves those paths against `file://` and every screenshot is broken.

## Change

- Make the downloaded document self-contained: in the download route, after
  `renderToStaticMarkup`, replace each ready evidence asset's API `src` with a
  `data:<contentType>;base64,...` URL read via the existing
  `createEvidenceStorage().get(asset.storageKey)` (same source as
  `api/reports/[id]/evidence/[assetId]/route.ts`). Assets that are not
  `ready`, lack a `storageKey`, or fail storage read keep their API src
  (page behavior unchanged; download degrades to today's state for that
  image, never fails the whole download).
- Implementation shape: one new pure-ish helper
  (`inlineEvidenceImages(markup, reportId, assets, storage)`) called only
  from the download route; no change to the online page, artifact
  components, evidence API routes, or storage layer.
- Tests: unit-test the helper (both src patterns, base64 content, missing
  asset passthrough) with a mocked storage; extend the download route test
  to assert a `data:` src appears. All mocks, no external fetches.
- Deploy: ONE manual Vercel Preview deploy from the resulting `main` HEAD +
  move the fixed Protected Staging alias (rollback: re-alias
  `dpl_BaEQNVbv2GtaSd7GTzHsVYBKZXaN`).

## Allowed files

- `apps/web/src/app/reports/[id]/report.html/download/route.ts`
- `apps/web/src/app/reports/[id]/report.html/report-scope.tsx`
- their test files (`report-scope.test.ts`, plus the download route test if
  present/new), and this scope file + closeout entry.

## Forbidden

- No changes to the evidence API routes, artifact components, online
  report.html page, dictionaries, storage layer, or any
  worker/commerce/Docker/database state.
- No new orders/reports/refunds, no tag, no production.
- Do not touch the unrelated uncommitted commerce/client-ip dirty files.

## Diff budget

- Production: ≤ 45 lines. Tests: ≤ 70 lines. Docs: this file + closeout entry.

## Acceptance checks

1. Helper + route tests pass; `npm run build --workspace apps/web` passes.
2. Preview READY with correct `ogcGitSha`; alias moved; SSO intact.
3. User confirms a freshly downloaded HTML shows screenshots offline.

## Expensive external actions authorized

- Git commit(s) on `main` and push to origin.
- ONE Vercel Preview deploy + fixed-alias move.
