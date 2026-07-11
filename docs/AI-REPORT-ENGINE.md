# AI Report Engine

## Architecture

The deterministic and model-generated report dimensions are deliberately separate:

1. `geo-auditor` fetches technical evidence and calculates the reproducible GEO score.
2. The web API verifies Turnstile, normalizes a registrable `siteKey`, enforces the rolling free-trial and global AI-budget policies, persists the technical report, and enqueues a job when AI budget is available.
3. `site-crawler` safely resolves public destinations, discovers up to 50,000 URLs, clusters at most 500 candidates, and extracts page evidence.
4. Free jobs deterministically analyze only the homepage without a model planning call. Deep jobs ask the configured OpenAI-compatible model to plan every eligible page on small sites or up to 50 representative pages, then analyze batches and synthesize `AiWebsiteReportV1`.
5. The engine verifies every formal citation against fetched URL/text evidence. Unsupported findings are discarded.
6. The Worker persists the final report, stores only required evidence excerpts long-term, and atomically terminalizes the job and its credit.

The Worker owns crawling and model calls. Web requests never run deep analysis inline.

## Job State Machine

`queued → discovering → planning → fetching → analyzing → synthesizing → completed|completed_limited|failed`

- Jobs use PostgreSQL row locking, leases and heartbeats so multiple workers cannot process the same job.
- Free and deep jobs are claimed by independent worker lanes. Claims are FIFO within a tier and skip queued rows that still have a live lease.
- Checkpoints persist the ranked/effective plan, page attempts, completed crawl URLs, content-hash-matched analyses, and synthesis input hash.
- Permanent page failures are not retried and are replaced from the untried candidate pool. Transient page failures retry up to three times before replacement; successful pages are not fetched again.
- Planning retries or falls back deterministically, analysis retries only the failed batch, and synthesis reuses stored analyses.
- `completed` requires homepage success, validated evidence and at least 70% effective coverage. `completed_limited` delivers usable lower-coverage evidence and refunds the credit; `failed` produces no usable report and refunds it.
- Job terminalization, lease clearing, coverage counts and credit settlement/refund occur in one PostgreSQL transaction.

## Report Contract

`AiWebsiteReportV1` contains:

- inferred organization profile with `ownershipVerification: "not-performed"`;
- executive summary;
- separate organization clarity, information architecture, citability, trust, entity consistency and GEO understandability scores;
- page-type analyses;
- evidence-backed findings;
- immediate, next-phase and ongoing roadmap;
- discovery/planning/analysis coverage and limitations;
- model, prompt, language, generation-time and content-hash provenance.

The free tier returns one verified homepage finding. Its technical score covers only the homepage and the standard robots/sitemap/llms assets. The deep AI and technical payloads are private and are returned only when the report-specific HttpOnly cookie validates.

## Persistence

PostgreSQL tables:

- `deployment_environment` — immutable `staging|production` database identity checked by every deployed process.
- `scan_reports`, `report_bot_evidence` — technical report and sanitized log evidence.
- `scan_jobs` — leased task state and checkpoints.
- `ai_reports` — one current free and one current deep AI report per technical report; deep rows may include a private full technical payload.
- `crawl_evidence` — normalized page content, hashes and excerpts; full normalized content expires after seven days.
- `free_site_trials`, `staging_free_regenerations`, `anonymous_rate_buckets`, `free_ai_daily_budgets`, `free_ai_budget_reservations` — 30-day site reuse, staging-only regeneration reservations, rolling anonymous limiting and an exact global AI budget.
- `access_keys`, `credit_ledger` — HMAC-only keys and idempotent credit transactions.
- `report_access_tokens` — HMAC-only private report links.
- `payment_orders`, `payment_events`, `payment_refunds` — immutable one-time purchases, verified provider events and cash refunds.
- `job_dispatch_outbox`, `worker_presence`, `batch_runs` — Queue hints, operational presence and recorded batch drains; none replace job authority.
- `email_deliveries`, `email_delivery_events` — durable email intents, provider IDs and monotonic delivery state.

PostgreSQL is the only production authority. `better-sqlite3` remains solely for the legacy import command.

## API

### `POST /api/scan`

Request: `{ "url": "https://company.example", "locale": "en|zh", "turnstileToken": "…" }`. Protected staging may additionally send `forceFresh: true`; production rejects it regardless of headers, cookies, or query parameters. Production verifies Turnstile server-side. The locale is validated strictly and persisted as the immutable report-generation language.

Returns `202 { reportId, jobId, tier: "free", status: "queued" }`, an existing report with `status: "reused"`, an active staging regeneration with `status: "regenerating"`, `200 status: "technical_only"` after the daily AI budget is exhausted, or `429` after the applicable rolling limit.

### `GET /api/reports/:id/status`

Returns the product state (`generating`, `completed`, `completed_limited`, or `unavailable`), progress, coverage counts, final credit state, and queue information while active. Wait reasons are `jobs_ahead`, `active_jobs_in_pool`, or `awaiting_claim`; internal stages, checkpoints, queued site URLs and job identifiers are not exposed. A valid report cookie switches the visible task from free to deep.

### `POST /api/reports/:id/upgrade`

Requires `{ accessKey, locale }` and an `Idempotency-Key` header. The locale must match the report's persisted generation language. For a legacy report whose language could not be backfilled, the first successfully authorized upgrade binds this locale. The endpoint reserves one credit, enqueues the deep job in that language and returns a one-time report access URL. Reusing the same idempotency key does not consume another credit.

### `POST /api/reports/:id/locale-correction`

Requires the report-specific access cookie. When the persisted report language conflicts with the current private AI artifact, atomically consumes the report's one-time correction allowance and enqueues a `locale_correction` deep job without reserving or consuming another credit.

### `POST /api/reports/:id/retry`

Deprecated for normal users and returns `410`. The Worker owns recoverable retry and checkpoint resume; a final unavailable result may start a new analysis instead.

### `GET|POST /api/reports/:id/access`

`GET ?token=…` validates and renders a confirmation page without consuming the link, so email security scanners cannot redeem it. A human `POST` consumes the seven-day link, writes a report-specific HttpOnly, SameSite=Lax cookie valid for the token's 30-day access lifetime, and redirects to a clean URL in the persisted report language.

### Commercial routes

- `POST /api/reports/:id/checkout` selects CNY/USD/HKD only from the server catalog, verifies Turnstile, protects the email with encryption plus a separate lookup HMAC, and creates or recovers an Airwallex PaymentIntent for Hosted Payment Page. The temporary client secret is returned only to the browser and is never persisted.
- The signed Airwallex Webhook is the only paid transition. Its transaction creates exactly one entitlement, reservation, deep job, dispatch outbox record, and payment-confirmation email.
- `GET /api/reports/:id/orders/:orderId/status` first binds the order to the report, then exposes only customer-safe lifecycle states. HPP success and cancel parameters are navigation hints and cannot mark an order paid or grant access.
- `POST /api/reports/link-reissue` queues at most one replacement link per rolling hour for a matching order/email HMAC and always returns a generic result.
- Airwallex and Resend Webhooks verify the raw body and deduplicate stable provider event IDs.

## Operations

Run web and both Worker lanes against the same `DATABASE_URL`. The default `batch_24h` mode drains and exits; `realtime` performs a recovery drain and then consumes Queue hints on persistent infrastructure. Run `npm run commerce:all` to reconcile terminal paid jobs, enforce 20/24-hour SLA boundaries, submit refunds, and send queued email. Cloudflare Queue is notification-only; PostgreSQL remains authoritative. See `docs/COMMERCIAL-OPERATIONS.md`.

The free deterministic auditor fetches the homepage plus `/robots.txt`, `/sitemap.xml`, and `/llms.txt`; it does not fetch sitemap entries or homepage link targets. A deep job runs a separate private technical audit over its planned pages. The auditor treats a non-2xx response as the root cause for that page and does not run downstream H1, Schema, canonical, metadata, or readability checks. Findings are grouped by rule, page type, and normalized template, with at most three representative URLs. The overview rolls template groups into one rule-level priority card. Score deductions are capped per rule so repeated pages cannot erase the complete score by themselves.

- `OGC_AI_TIMEOUT_MS` is the per-model-call timeout. Long structured synthesis should normally use `180000` milliseconds.
- `OGC_ALLOW_BENCHMARK_NETWORK=true` permits only `198.18.0.0/15` for sandbox environments that route public DNS through that benchmark range. It is a local escape hatch and must remain false in production; all other private, metadata and reserved ranges stay blocked.
- Safe HTTP crawling uses the same installed `undici` implementation for `fetch` and its DNS-pinned dispatcher so the pinning contract is consistent across Node versions.
- Models may represent optional `pageElement` or `rewriteExample` fields as null and may repeat finding IDs. The engine normalizes only those optional values and deterministic IDs before strict report/evidence validation.

Useful commands:

```bash
npm run ai:probe
npm run worker:free
npm run worker:deep
npm run access-key:create -- --credits 1
npm run db:audit
npm run db:migrate:sqlite -- --source <legacy-file>
npm run test:ai-live
```

If a task remains queued, use the status endpoint to distinguish jobs ahead, an active task in that lane, and a task waiting to be claimed. Then confirm the matching free/deep Worker is running and sees the same database. If AI calls fail, run `npm run ai:probe` and verify the provider's exact model identifier. If dynamic pages fail, install Chromium and inspect Worker browser-launch errors. Do not log provider responses that may contain sensitive customer content.

Before the homepage-only commercial boundary was introduced, the 2026-07-10 live acceptance used `mimo-v2.5-pro` against `me.itheheda.online`: 8 pages were planned, 7 analyzed, and one failed. That record is historical runtime evidence, not the current free-tier contract.
