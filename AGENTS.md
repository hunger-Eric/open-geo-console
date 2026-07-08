# Open GEO Console

## Project Shape

- This is a standalone monorepo for the open-source Open GEO Console MVP.
- Use `npm` workspaces. Do not switch to pnpm/yarn unless the project docs are updated.
- Keep v1 self-hostable and unauthenticated: no login, billing, teams, or SaaS-only flows.

## Core Commands

- `npm run dev` starts the web app.
- `npm run lint` checks the Next.js workspace.
- `npm test` runs package and app unit tests.
- `npm run build` builds packages and the web app.

## Architecture Boundaries

- `packages/crawler-rules` owns AI User-Agent classification.
- `packages/log-parser` owns log normalization and aggregation.
- `packages/geo-auditor` owns website audit logic and report JSON shape.
- `apps/web` owns persistence, routes, and UI.

## Verification

- For code navigation after scaffold, initialize or sync CodeGraph before relying on graph output.
- Treat live website scans as integration evidence; keep unit tests deterministic with mocked fetches.
