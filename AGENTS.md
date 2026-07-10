# Open GEO Console

## Project Shape

- This is a standalone monorepo for the open-source Open GEO Console MVP.
- Use `npm` workspaces. Do not switch to pnpm/yarn unless the project docs are updated.
- Keep the engine self-hostable. There are no user accounts, teams, or subscriptions. One-time report payments, internal report-credit entitlements, and report-specific access tokens are allowed.

## Core Commands

- `npm run dev` starts the web app.
- `npm run worker:free` and `npm run worker:deep` start the two independent AI report lanes; production must service both.
- In the default `FULFILLMENT_MODE=batch_24h`, the lane commands drain PostgreSQL and exit. Use `worker:realtime:free|deep` only on persistent infrastructure.
- `npm run commerce:all` reconciles commercial outcomes, enforces the 24-hour SLA, submits refunds, and sends queued email.
- `npm run worker` is a low-level entry point and requires `OGC_WORKER_TIER=free|deep`.
- `npm run browser:install` installs Chromium for JavaScript-rendered page fallback.
- `npm run db:audit` fails when a terminal commercial job still has a reserved credit.
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
- Cloudflare Queue is notification-only. Payment, job, dispatch, refund, email, and access authority remains in PostgreSQL.
- The web process creates jobs and serves reports. The worker is the only process that crawls pages or calls the configured model.
- Only a verified payment Webhook may mark an order paid and create its exactly-once entitlement/deep job.
- Free reports audit only the submitted homepage plus standard assets. Multi-page technical and AI evidence belongs to the authorized private deep bundle.
- Terminal commercial jobs must use the atomic job-and-credit terminalization boundary; never split a terminal stage write from settlement/refund.
- A report's persisted generation locale is immutable after it is established; interface-route locale changes UI chrome, not stored report prose.
- Client-IP rate limits trust Vercel's `x-vercel-forwarded-for` / overwritten `x-forwarded-for` headers only when `VERCEL=1` or `OGC_TRUST_VERCEL_HEADERS=true`; other proxy headers require an explicitly trusted proxy that overwrites them.
- Never persist or log raw model API keys, report-credit keys, report access tokens, or unhashed client IPs.

## Verification

- For code navigation after scaffold, initialize or sync CodeGraph before relying on graph output.
- Treat live website scans as integration evidence; keep unit tests deterministic with mocked fetches.
