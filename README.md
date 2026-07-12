# Open GEO Console

Open GEO Console is an open-source AI Search Console for company websites. It combines deterministic GEO checks with evidence-backed large-model analysis and optional AI crawler log evidence.

## Product Flow

1. Enter a company website URL.
2. Receive a persisted technical GEO report immediately.
3. A worker discovers the site, fetches real page evidence, and generates a structured AI report. Recoverable page and model failures are retried automatically at the smallest failed unit.
4. The free preview analyzes the submitted homepage and exposes one verified AI finding while capacity remains. A one-time purchase or operator report-credit key unlocks a private deep report covering every eligible page on small sites or up to 50 representative pages on larger sites.
5. Paid reports are delivered by secure email link within 24 hours or receive a full refund. Access logs can be imported separately; log evidence never changes the technical GEO score.

AI findings must cite URLs from the current crawl and quote text present in retained page evidence. Unsupported findings are rejected rather than shown.

## Capabilities

- Technical checks for `robots.txt`, `sitemap.xml`, `llms.txt`, schema, metadata, headings, canonical URLs, OpenGraph, readable content and HTTP status.
- Homepage-only free analysis plus AI-planned deep page sampling after site-wide URL discovery and page-type/template clustering.
- OpenAI-compatible model transport with versioned `AiWebsiteReportV1` output and evidence validation.
- HTTP crawling with DNS-pinned SSRF protection and Playwright fallback for JavaScript-rendered pages.
- HTML-first private deep reports with Worker-captured visual evidence and PDF export from the same canonical HTML.
- Progressive report jobs with PostgreSQL leases, page-level recovery, resumable checkpoints and seven-day source-evidence retention.
- Thirty-day free preview deduplication per registrable site, two distinct free sites per HMAC client IP in a rolling 24-hour window, Turnstile, and a configurable global AI-preview budget with technical-only fallback.
- HMAC-only report-credit keys, idempotent credit reservation/settlement/refund, and private report links using HttpOnly cookies.
- One-time Airwallex checkout, PostgreSQL payment/refund/email state machines, Cloudflare Queue notification, Resend delivery, and workstation-friendly `batch_24h` fulfillment.
- Nginx and Cloudflare log analysis plus a clearly separated external AI crawler simulator.

## Workspaces

- `apps/web` — Next.js UI/API, PostgreSQL persistence, Worker and operator scripts.
- `packages/geo-auditor` — deterministic technical audit and score.
- `packages/site-crawler` — URL safety, site identity, discovery, extraction and page selection.
- `packages/ai-report-engine` — model client, planning, analysis, synthesis and evidence validation.
- `packages/crawler-rules` — AI crawler identity rules.
- `packages/log-parser` — access-log parsing and sanitized bot evidence.

The recommendation-forensics foundation is split into two additional workspaces: `packages/answer-engine-observer` owns provider-neutral answer-snapshot contracts, validation and deterministic fixtures; `packages/citation-intelligence` owns recommendation/entity analysis, source categories, evidence grades and opportunity hypotheses. These packages do not enable a live provider or customer-facing recommendation claim by themselves.

## Local Setup

```bash
npm install
docker compose up -d postgres
Copy-Item .env.example apps/web/.env.local
npm run browser:install
npm run dev
```

The default initial commercial mode drains both lanes and exits, so it can run from Windows Task Scheduler without an always-on report server:

```bash
npm run worker:free
npm run worker:deep
```

The free lane handles preview jobs and the deep lane handles paid jobs. In `FULFILLMENT_MODE=batch_24h` these commands drain and exit; on persistent infrastructure use `worker:realtime:free` and `worker:realtime:deep`. Run `npm run commerce:all` after a batch to reconcile outcomes, enforce the SLA, submit refunds, and send email. See [Commercial Operations](docs/COMMERCIAL-OPERATIONS.md).

For the low-cost Windows deployment, Docker Desktop can keep the authorized lanes alive and restart them automatically:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-workstation-workers.ps1
```

The launcher creates ACL-restricted, ignored runtime env files from the target Vercel/worker files, starts staging free/deep, production free, and production commerce, and uses PostgreSQL polling instead of requiring a locally decryptable Cloudflare Queue token. Production deep is not started until its own private evidence store is configured.

Required production variables:

- `DATABASE_URL`
- `OGC_AI_BASE_URL`
- `OGC_AI_API_KEY`
- `OGC_AI_MODEL`
- `OGC_TOKEN_HASH_SECRET`
- `OGC_IP_HASH_SECRET`
- `OGC_DEPLOYMENT_PROFILE` (`staging` or `production`, matching the database marker)
- `OGC_EVIDENCE_STORAGE=vercel-blob` with a connected Vercel Private Blob store, or `s3` plus a private S3-compatible endpoint, region, bucket and credentials; Web and deep Worker processes must share the same store

The low-cost commercial target is Vercel/Netlify plus Neon, Cloudflare Turnstile/Queue, Airwallex, Resend, and persistent Docker Desktop Workers. This avoids mandatory server rent at low order volume while keeping every task durable in PostgreSQL. The workstation still must remain online; hosted Workers can later use the same leases and state machines without a rewrite.

On Vercel, anonymous rate limits prefer `x-vercel-forwarded-for` and fall back to Vercel's overwritten `x-forwarded-for` when `VERCEL=1`; legacy projects that do not expose system variables must set `OGC_TRUST_VERCEL_HEADERS=true`. Elsewhere, set `TRUST_PROXY_HEADERS=true` only behind a proxy that overwrites forwarded-client-IP headers; direct deployments deliberately collapse to a fail-closed anonymous identity. Set `OGC_AI_JSON_RESPONSE_FORMAT=true` only if the configured model endpoint supports OpenAI JSON response mode.
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

Audit the terminal job/credit invariant without changing report state:

```bash
npm run db:audit
```

Protected staging uses a separate marked PostgreSQL database, independent provider credentials, Vercel Preview Authentication, a staging-only limit of at most 100 distinct sites per rolling 24 hours, and explicit staging Worker commands. Production always remains at two sites and cannot be changed by staging variables or request input. See [Protected Staging and Production Operations](docs/PROTECTED-STAGING-OPERATIONS.md).

## API and Reports

- `POST /api/scan` creates or reuses a free report job.
- `GET /api/reports/:id/status` returns `generating`, `completed`, `completed_limited`, or `unavailable`, plus coverage, queue information while active, and final credit state.
- `POST /api/reports/:id/upgrade` validates the persisted report language, reserves one credit and creates a deep job.
- `POST /api/reports/:id/checkout` creates or recovers an immutable server-priced Airwallex PaymentIntent for Hosted Payment Page; browser amounts are ignored and the temporary client secret is not persisted.
- `GET /api/reports/:id/orders/:orderId/status` verifies the order belongs to the report, then returns customer-safe payment, fulfillment, refund, and delivery states. Browser return parameters never mark an order paid.
- `POST /api/reports/:id/locale-correction` schedules the one authorized no-charge regeneration when a legacy deep artifact uses the wrong language.
- `POST /api/reports/:id/retry` is deprecated for normal users and returns `410`; recoverable work is automatic.
- `GET /api/reports/:id/access?token=…` validates and renders a confirmation without consuming the token; `POST` redeems it, sets the report cookie, and redirects without token material.
- `POST /api/reports/link-reissue` generically requests a rate-limited replacement link without revealing whether an order/email pair exists.
- `POST /api/webhooks/airwallex` and `POST /api/webhooks/resend` verify raw-body signatures before idempotent processing.
- `PUT|DELETE /api/reports/:id/bot-evidence` replaces or removes sanitized crawler evidence.
- `GET /reports/:id/report.html` serves the canonical authorized private report; `GET /api/reports/:id/artifacts/report.pdf` exports that same HTML with print CSS.
- `GET /api/reports/:id/evidence/:assetId` streams a report-bound private screenshot after the existing access-cookie check; it never returns an object-store URL.

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

Never put provider keys, report-credit keys, view tokens or raw client IPs in the repository or report payloads.
