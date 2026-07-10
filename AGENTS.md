# Open GEO Console

## Project Shape

- This is a standalone monorepo for the open-source Open GEO Console MVP.
- Use `npm` workspaces. Do not switch to pnpm/yarn unless the project docs are updated.
- Keep the engine self-hostable. There are no user accounts, teams, subscriptions, or payment flows yet; report-credit keys and report-specific access tokens are allowed.

## Core Commands

- `npm run dev` starts the web app.
- `npm run worker:free` and `npm run worker:deep` start the two persistent AI report lanes; production must run both.
- `npm run worker` is a low-level entry point and requires `OGC_WORKER_TIER=free|deep`.
- `npm run browser:install` installs Chromium for JavaScript-rendered page fallback.
- `npm run lint` checks the Next.js workspace.
- `npm test` runs package and app unit tests.
- `npm run build` builds packages and the web app.

## Architecture Boundaries

- `packages/crawler-rules` owns AI User-Agent classification.
- `packages/log-parser` owns log normalization and aggregation.
- `packages/geo-auditor` owns website audit logic and report JSON shape.
- `packages/site-crawler` owns safe URL resolution, site identity, discovery, extraction, and representative-page selection.
- `packages/ai-report-engine` owns model transport, prompts, report contracts, structured validation, and evidence verification.
- `apps/web` owns PostgreSQL persistence, task orchestration, routes, access controls, and UI.

## Production Boundaries

- PostgreSQL is the only production report authority; do not restore SQLite or browser-local report persistence.
- The web process creates jobs and serves reports. The worker is the only process that crawls pages or calls the configured model.
- Never persist or log raw model API keys, report-credit keys, report access tokens, or unhashed client IPs.

## Verification

- For code navigation after scaffold, initialize or sync CodeGraph before relying on graph output.
- Treat live website scans as integration evidence; keep unit tests deterministic with mocked fetches.
