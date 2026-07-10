# Open GEO Console

Open GEO Console is an open-source AI Search Console for company websites. It combines deterministic GEO checks with evidence-backed large-model analysis and optional AI crawler log evidence.

## Product Flow

1. Enter a company website URL.
2. Receive a persisted technical GEO report immediately.
3. A worker discovers the site, asks an OpenAI-compatible model to plan representative pages, fetches real page evidence, and generates a structured AI report.
4. The free preview analyzes the submitted homepage and exposes one verified AI finding. A report-credit key unlocks a private deep report covering every eligible page on small sites or up to 50 representative pages on larger sites.
5. Access logs can be imported separately to show observed AI crawler visits; log evidence never changes the technical GEO score.

AI findings must cite URLs from the current crawl and quote text present in retained page evidence. Unsupported findings are rejected rather than shown.

## Capabilities

- Technical checks for `robots.txt`, `sitemap.xml`, `llms.txt`, schema, metadata, headings, canonical URLs, OpenGraph, readable content and HTTP status.
- Homepage-only free analysis plus AI-planned deep page sampling after site-wide URL discovery and page-type/template clustering.
- OpenAI-compatible model transport with versioned `AiWebsiteReportV1` output and evidence validation.
- HTTP crawling with DNS-pinned SSRF protection and Playwright fallback for JavaScript-rendered pages.
- Progressive report jobs with PostgreSQL leases, checkpoints, retries and seven-day source-evidence retention.
- Thirty-day free preview deduplication per registrable site and three distinct free sites per client IP/day.
- HMAC-only report-credit keys, idempotent credit reservation/settlement/refund, and private report links using HttpOnly cookies.
- Nginx and Cloudflare log analysis plus a clearly separated external AI crawler simulator.

## Workspaces

- `apps/web` — Next.js UI/API, PostgreSQL persistence, Worker and operator scripts.
- `packages/geo-auditor` — deterministic technical audit and score.
- `packages/site-crawler` — URL safety, site identity, discovery, extraction and page selection.
- `packages/ai-report-engine` — model client, planning, analysis, synthesis and evidence validation.
- `packages/crawler-rules` — AI crawler identity rules.
- `packages/log-parser` — access-log parsing and sanitized bot evidence.

## Local Setup

```bash
npm install
docker compose up -d postgres
Copy-Item .env.example apps/web/.env.local
npm run browser:install
npm run dev
```

Run the two independent worker lanes in separate processes:

```bash
npm run worker:free
npm run worker:deep
```

The free lane handles preview jobs and the deep lane handles paid-credit jobs, so a long preview backlog cannot hide a deep report. `npm run worker` is the low-level entry point and requires an explicit `OGC_WORKER_TIER=free|deep`; normal operators should use the two lane commands above. The optional Compose worker profile also requires an application image supplied through `OGC_APP_IMAGE`.

Required production variables:

- `DATABASE_URL`
- `OGC_AI_BASE_URL`
- `OGC_AI_API_KEY`
- `OGC_AI_MODEL`
- `OGC_TOKEN_HASH_SECRET`
- `OGC_IP_HASH_SECRET`

Vercel can host the Next.js web process and a connected Neon PostgreSQL database, but it does not run the continuously polling Worker entry point. Deploy `worker:free` and `worker:deep` as separate long-running services against the same `DATABASE_URL`; a workstation process is suitable only for temporary acceptance testing.

Set `TRUST_PROXY_HEADERS=true` only behind a proxy that overwrites forwarded-client-IP headers. Set `OGC_AI_JSON_RESPONSE_FORMAT=true` only if the configured model endpoint supports OpenAI JSON response mode.
`OGC_AI_TIMEOUT_MS` controls the per-call model timeout; long structured reports typically need `180000` milliseconds.
`OGC_ALLOW_BENCHMARK_NETWORK` exists only for sandboxed local networks that proxy public DNS through `198.18.0.0/15`; keep it `false` in production.

Validate a newly configured model without creating report data:

```bash
npm run ai:probe
```

Create a report-credit key; the raw key is printed once:

```bash
npm run access-key:create -- --credits 3 --expires-at 2026-12-31
```

Import legacy SQLite reports into PostgreSQL:

```bash
npm run db:migrate:sqlite -- --source .data/open-geo-console.sqlite
```

## API and Reports

- `POST /api/scan` creates or reuses a free report job.
- `GET /api/reports/:id/status` returns public job progress, queue position, wait reason, and the currently active tier without exposing queued sites or job IDs.
- `POST /api/reports/:id/upgrade` reserves one credit and creates a deep job.
- `POST /api/reports/:id/retry` resumes a failed or partial authorized job.
- `GET /api/reports/:id/access?token=…` exchanges a private link token for an HttpOnly report cookie.
- `PUT|DELETE /api/reports/:id/bot-evidence` replaces or removes sanitized crawler evidence.

See [AI Report Engine](docs/AI-REPORT-ENGINE.md) and [Report Workspace](docs/REPORT-WORKSPACE.md) for data and route contracts.

## Verification

```bash
npm run lint
npm test
npm run build
```

With a deliberately configured test model:

```bash
npm run test:ai-live
```

The first public fixture remains `https://me.itheheda.online`. Never put provider keys, report-credit keys, view tokens or raw client IPs in the repository or report payloads.
