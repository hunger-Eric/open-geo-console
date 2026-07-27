# Open GEO Console

Open GEO Console is an open-source AI Search Console for company websites. It combines a free deterministic GEO check with a private recommendation-forensics product that observes source-bearing answer-engine results, explains citation gaps, and turns evidence into an executive decision report plus a vendor task package.

## Product Flow

1. Enter a company website URL.
2. Receive a persisted technical GEO report immediately.
3. The free preview analyzes the submitted homepage and exposes one verified technical/AI foundation finding while capacity remains.
4. The paid product contract asks three evidence-derived, non-brand buyer questions on one exactly certified public-search surface, reuses identity-safe market snapshots, retrieves public evidence, and produces `RecommendationForensicReportV2`. The buyer receives an executive layer; existing website/content/SEO/communications vendors receive a separate task package. Public-search result order is never presented as AI rank or recommendation.
5. Paid reports are delivered as private HTML and same-HTML PDF by secure email link within 24 hours or receive a full refund. Access logs can be imported separately; log evidence never changes the technical GEO score.

The V2 framework remains fail-closed: MiMo is the first compile-time registered public-search adapter, but no signed live artifact or active authority exists, and environment flags cannot open catalog/checkout without an exact non-fixture runtime. Historical V1 reports remain readable, but OpenAI/Perplexity answer-provider code is retired from active admission and Worker wiring.

AI findings must cite URLs from the current crawl and quote text present in retained page evidence. Unsupported findings are rejected rather than shown.

## Capabilities

- Technical checks for `robots.txt`, `sitemap.xml`, `llms.txt`, schema, metadata, headings, canonical URLs, OpenGraph, readable content and HTTP status.
- Homepage-only free analysis plus AI-planned deep page sampling after site-wide URL discovery and page-type/template clustering.
- OpenAI-compatible website-analysis transport with versioned `AiWebsiteReportV1` output retained as technical appendix evidence.
- Versioned `RecommendationForensicReportV2` with canonical buyer questions/fanout, immutable public-search snapshots, public-source evidence graphs, exact freshness/cost provenance, three executive priorities, and a separate vendor task package.
- Fail-closed public-search authority/registry matching, path-confined signed certification artifacts, deterministic cache reuse, completed/limited/failed commercial coverage and atomic settlement/refund/delivery intent.
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

Recommendation forensics uses `packages/public-search-observer` for surface/authority/question/fanout/observation/coverage contracts and `packages/citation-intelligence` for public-source graphs, entity resolution, evidence families, grades and opportunity hypotheses. `packages/answer-engine-observer` remains the frozen historical V1 contract. `apps/web` owns certification/runtime authority, PostgreSQL snapshots, commercial outcomes, scoped access and HTML/PDF delivery. Adapter code and deterministic fixtures are never proof of a live surface.

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

The launcher creates ACL-restricted, ignored runtime env files from the target Vercel/worker files, starts staging free/deep, production free/deep, and production commerce, and uses PostgreSQL polling instead of requiring a locally decryptable Cloudflare Queue token. Production deep is detected and started only when its own private evidence store credentials are present.

Required production variables:

- `DATABASE_URL`
- `OGC_AI_BASE_URL`
- `OGC_AI_API_KEY`
- `OGC_AI_MODEL`
- `OGC_TOKEN_HASH_SECRET`
- `OGC_IP_HASH_SECRET`
- `OGC_DEPLOYMENT_PROFILE` (`staging` or `production`, matching the database marker)
- `OGC_EVIDENCE_STORAGE=vercel-blob` with a connected Vercel Private Blob store, or `s3` plus a private S3-compatible endpoint, region, bucket and credentials; Web and deep Worker processes must share the same store

Public-search credentials use a separate namespace and are intentionally absent from this example: select a compile-time adapter with `OGC_PUBLIC_SEARCH_ADAPTER`, then configure only its provider namespace (MiMo uses `OGC_PUBLIC_SEARCH_MIMO_BASE_URL`, `OGC_PUBLIC_SEARCH_MIMO_API_KEY`, and `OGC_PUBLIC_SEARCH_MIMO_MODEL`). They never fall back to `OGC_AI_*`, so report-model changes do not change search behavior. The generic framework and redacted probe/certification boundary are documented in [Public-search Surface Certification](docs/operations/public-search-surface-certification.md). Keep `OGC_PUBLIC_SEARCH_RUNTIME_ENABLED=false` until the exact adapter has passed live certification, a signed artifact has been installed as an inactive authority, the authority has been explicitly activated in protected staging, and paid failure drills have passed. [Historical V1 certification](docs/operations/recommendation-provider-certification.md) is read-only context.

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

## Public language URLs

Chinese is the default interface and uses unprefixed canonical URLs such as `/`, `/logs`, and `/reports/:id`. English uses `/en`, `/en/logs`, and `/en/reports/:id`. Legacy `/zh/...` links permanently redirect to the equivalent unprefixed path. Interface routing never changes a report's persisted generation language.

## API and Reports

- `POST /api/scan` creates or reuses a free report job.
- `GET /api/reports/:id/status` returns `generating`, `completed`, `completed_limited`, or `unavailable`, plus coverage, queue information while active, and final credit state.
- `POST /api/reports/:id/upgrade` validates the persisted report language, reserves one credit and creates a deep job.
- `POST /api/reports/:id/checkout` creates or recovers an immutable server-priced Airwallex PaymentIntent for Hosted Payment Page; browser amounts are ignored and the temporary client secret is not persisted.
- `GET /api/commerce/catalog` exposes the recommendation product only when the deployment lane, exact V2 public-search runtime registry, protected configuration and persisted authority all agree; otherwise it stays closed.
- `GET /api/reports/:id/orders/:orderId/status` verifies the order belongs to the report, then returns customer-safe payment, fulfillment, refund, and delivery states. Browser return parameters never mark an order paid.
- `POST /api/reports/:id/locale-correction` schedules the one authorized no-charge regeneration when a legacy deep artifact uses the wrong language.
- `POST /api/reports/:id/retry` is deprecated for normal users and returns `410`; recoverable work is automatic.
- `GET /api/reports/:id/access?token=…` validates and renders a confirmation without consuming the token; `POST` redeems it, sets the report cookie, and redirects without token material.
- `POST /api/reports/link-reissue` generically requests a rate-limited replacement link without revealing whether an order/email pair exists.
- `POST /api/webhooks/airwallex` and `POST /api/webhooks/resend` verify raw-body signatures before idempotent processing.
- `PUT|DELETE /api/reports/:id/bot-evidence` replaces or removes sanitized crawler evidence.
- `GET /reports/:id/report.html` serves the product-scoped canonical authorized private report; explicit legacy/recommendation HTML and PDF routes prevent a token for one product contract from opening the other.
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
