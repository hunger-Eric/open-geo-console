# Open GEO Console Project State

## Current Goal

Build the MVP for a self-hostable open-source AI Search Console for company websites. The first workflow is URL -> GEO report. The second workflow is sample or uploaded access logs -> AI crawler access report.

## Current Architecture

- `apps/web` is a Next.js App Router app with SQLite/Drizzle persistence.
- Public UI routes are locale-prefixed: `/en`, `/zh`, `/en/reports/[id]`, `/zh/reports/[id]`, `/en/logs`, and `/zh/logs`; `/` redirects to `/en`.
- User-visible product copy, report copy, severity labels, actions, empty states, and finding messages live in typed dictionaries under `apps/web/src/i18n`.
- `packages/geo-auditor` fetches homepage, `robots.txt`, `sitemap.xml`, `llms.txt`, representative pages, and emits stable GEO report JSON.
- `packages/crawler-rules` classifies AI crawler User-Agent strings.
- `packages/log-parser` parses Nginx combined/access logs and Cloudflare JSONL, then aggregates AI crawler visits.

## Implemented

- npm workspace monorepo with Git and CodeGraph initialized.
- Scanner page, `/api/scan`, persisted reports, `/reports/[id]`, sample log analyzer, and `/api/logs/sample`.
- Bilingual I18n/L10n baseline with `docs/I18N-SPEC.md`, `docs/L10N-SPEC.md`, typed EN/ZH dictionaries, locale helpers, route preservation, dictionary parity tests, and localized finding rendering.
- Public case report redesign with executive summary, score meaning, priority fixes, evidence sections, technical appendix, share/copy/print actions, and print-friendly CSS.
- Stable `GeoFinding.messageKey + params` model with literal persisted finding text preserved only as legacy fallback.
- Unit coverage for crawler matching, log parsing, GEO audit findings, and report persistence.
- README, Apache-2.0 license, project `AGENTS.md`, and sample crawler log fixture.

## Known Boundaries

- v1 has no auth, billing, teams, multi-tenant SaaS backend, or agency batch scanning.
- Live scans depend on target site availability and network access; deterministic tests mock fetch.
- Log upload is implemented as paste/sample analysis in the app, not file upload storage.
- PDF export is browser print/PDF first; there is no server-side PDF generator.

## Acceptance Commands

```bash
npm run lint
npm test
npm run build
```
