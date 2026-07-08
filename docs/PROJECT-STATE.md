# Open GEO Console Project State

## Current Goal

Build the MVP for a self-hostable open-source AI Search Console for company websites. The first workflow is URL -> GEO report. The second workflow is sample or uploaded access logs -> AI Bot Visibility Report.

## Current Architecture

- `apps/web` is a Next.js App Router app with SQLite/Drizzle persistence.
- Local self-hosted SQLite defaults to `.data/open-geo-console.sqlite`; `OPEN_GEO_DB_PATH` overrides it. Vercel/serverless defaults to `/tmp/open-geo-console.sqlite`, which is ephemeral and for demos/smoke tests unless a durable path is configured.
- Public UI routes are locale-prefixed: `/en`, `/zh`, `/en/reports/[id]`, `/zh/reports/[id]`, `/en/logs`, and `/zh/logs`; `/` redirects to `/en`.
- User-visible product copy, report copy, severity labels, actions, empty states, and finding messages live in typed dictionaries under `apps/web/src/i18n`.
- `packages/geo-auditor` fetches homepage, `robots.txt`, `sitemap.xml`, `llms.txt`, representative pages, and emits stable GEO report JSON.
- `packages/crawler-rules` owns the AI Bot Registry, including log-detectable bots, robots-token-only policy entries, and suspected/community entries.
- `packages/log-parser` parses Nginx combined/access logs and Cloudflare JSONL, then produces aggregates, bot coverage, operator summaries, and policy hints.

## Implemented

- npm workspace monorepo with Git and CodeGraph initialized.
- Scanner page, `/api/scan`, persisted reports, `/reports/[id]`, sample log analyzer, and `/api/logs/sample`.
- Vercel production deployment is linked to `open-geo-console.vercel.app`; project settings use the Next.js preset, `npm run build`, and output directory `apps/web/.next`.
- Bilingual I18n/L10n baseline with `docs/I18N-SPEC.md`, `docs/L10N-SPEC.md`, typed EN/ZH dictionaries, locale helpers, route preservation, dictionary parity tests, and localized finding rendering.
- Public case report redesign with executive summary, score meaning, priority fixes, evidence sections, technical appendix, share/copy/print actions, and print-friendly CSS.
- Stable `GeoFinding.messageKey + params` model with literal persisted finding text preserved only as legacy fallback.
- AI Bot Visibility direction: v1 marks identifiable AI bots from access-log User-Agent values and keeps robots.txt-only controls separate from detected visits.
- Unit coverage for crawler matching, log parsing, GEO audit findings, and report persistence.
- README, Apache-2.0 license, project `AGENTS.md`, and sample crawler log fixture.

## Known Boundaries

- v1 has no auth, billing, teams, multi-tenant SaaS backend, or agency batch scanning.
- Live scans depend on target site availability and network access; deterministic tests mock fetch.
- Vercel demo persistence is ephemeral because it uses serverless `/tmp`; use `OPEN_GEO_DB_PATH` or a future durable database adapter for production-grade hosted persistence.
- Log upload is implemented as paste/sample analysis in the app, not file upload storage.
- v1 does not do IP/ASN verification for crawler identity; bot visibility is based on User-Agent registry matching.
- PDF export is browser print/PDF first; there is no server-side PDF generator.

## Acceptance Commands

```bash
npm run lint
npm test
npm run build
```
