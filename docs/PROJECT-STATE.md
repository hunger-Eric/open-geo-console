# Open GEO Console Project State

## Current Goal

Ship a self-hostable, unauthenticated Open GEO Console MVP whose primary journey is `scan -> report workspace -> optional AI Bot evidence`. The report is the durable product object; the standalone log analyzer remains an advanced tool.

## Current Architecture

- `apps/web` is a localized Next.js App Router app with SQLite/Drizzle persistence.
- A report workspace is split into `/[locale]/reports/[id]`, `/issues`, `/bots`, `/technical`, and `/print`. Every workspace route carries the report UUID and target URL.
- `packages/geo-auditor` owns the GEO scan and score. Log evidence never changes that score.
- `packages/crawler-rules` owns AI crawler classification.
- `packages/log-parser` parses Nginx combined logs and Cloudflare JSONL, returns full session analysis, and builds the versioned, share-safe `BotEvidenceSummary`.
- `apps/web` persists one current evidence summary per report in `report_bot_evidence`. Raw logs, IPs, full paths, and raw User-Agent values are never persisted.
- Local self-hosted SQLite defaults to `.data/open-geo-console.sqlite`; `OPEN_GEO_DB_PATH` overrides it. The browser fallback is a current-browser continuity copy, not cross-device shared storage.

## Implemented

- Compact scan homepage with recent reports and an explicitly labeled advanced log tool.
- Report-centered overview, issues, bot evidence, technical appendix, and print/PDF routes.
- Overview limited to the score explanation, top three fixes, asset/scan summary, and sanitized bot evidence summary.
- Issues and technical data paginated at 20 rows; the complete bot registry is separately paginated and hidden by default.
- Report-scoped log import through `PUT /api/reports/[id]/bot-evidence`, evidence removal through `DELETE`, and SQLite upsert/delete helpers.
- `BotEvidenceSummary` with `analysisVersion: 1`, deterministic aggregation, sanitized bot/operator rows, and no raw request material.
- Report-aware simulator target URL; the advanced simulator is collapsed and remains semantically separate from observed log evidence.
- Compact standalone `/[locale]/logs` mode with an explicit target URL and shared analysis components.
- Bilingual typed dictionaries, stable locale switching, `aria-current`, `aria-live`, keyboard focus treatment, and mobile grouped-row tables without horizontal page scrolling.
- Warm neutral/forest/teal visual system based on `docs/design/report-workspace-reference.png`; fixed 8px radii, no page grid, and no ambient card shadows.
- Deterministic Nginx timestamp parsing, including numeric timezone offsets, so SSR and browser hydration produce identical evidence dates.
- Design QA artifacts and verdict in the project-root `design-qa.md`.

## Known Boundaries

- v1 has no auth, billing, teams, or multi-tenant SaaS permissions.
- Live scans depend on target availability and network access; deterministic tests mock fetch.
- Vercel `/tmp` SQLite is ephemeral. Browser fallback supports the current browser only and must not be described as shared persistence.
- Bot identity is User-Agent registry matching; v1 does not verify IP/ASN ownership.
- Simulator requests are attempts, not evidence. Only imported logs can establish observed access.
- PDF export uses the browser print dialog; there is no server-side PDF generator.

## Acceptance Commands

```bash
npm run lint
npm test
npm run build
```
