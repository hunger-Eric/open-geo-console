# AI Report Engine

## Architecture

The deterministic and model-generated report dimensions are deliberately separate:

1. `geo-auditor` fetches technical evidence and calculates the reproducible GEO score.
2. The web API normalizes a registrable `siteKey`, enforces the free-trial policy, persists the technical report, and enqueues a job.
3. `site-crawler` safely resolves public destinations, discovers up to 50,000 URLs, clusters at most 500 candidates, and extracts page evidence.
4. `ai-report-engine` asks the configured OpenAI-compatible model to plan up to 8 free or 50 deep pages, analyze page batches, and synthesize `AiWebsiteReportV1`.
5. The engine verifies every formal citation against fetched URL/text evidence. Unsupported findings are discarded.
6. The Worker persists the final report, stores only required evidence excerpts long-term, and completes or refunds the credit transaction.

The Worker owns crawling and model calls. Web requests never run deep analysis inline.

## Job State Machine

`queued → discovering → planning → fetching → analyzing → synthesizing → completed|partial|failed`

- Jobs use PostgreSQL row locking, leases and heartbeats so multiple workers cannot process the same job.
- Free and deep jobs are claimed by independent worker lanes. Claims are FIFO within a tier and skip queued rows that still have a live lease.
- Page evidence and checkpoints make retries idempotent. Deep upgrades reuse unexpired evidence from the free report.
- A report completes only when the homepage and at least 70% of planned pages succeeded and the final report contains validated evidence.
- Retryable platform/model failures are attempted up to three times. Terminal system failures refund reserved credits.
- Partial jobs keep their reservation pending and can be retried without a second charge.

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

The free tier returns at most three verified findings. The deep payload is private and is returned only when the report-specific HttpOnly cookie validates.

## Persistence

PostgreSQL tables:

- `scan_reports`, `report_bot_evidence` — technical report and sanitized log evidence.
- `scan_jobs` — leased task state and checkpoints.
- `ai_reports` — one current free and one current deep AI report per technical report.
- `crawl_evidence` — normalized page content, hashes and excerpts; full normalized content expires after seven days.
- `free_site_trials`, `anonymous_rate_buckets` — 30-day site dedupe and three-sites/day anonymous limit.
- `access_keys`, `credit_ledger` — HMAC-only keys and idempotent credit transactions.
- `report_access_tokens` — HMAC-only private report links.

PostgreSQL is the only production authority. `better-sqlite3` remains solely for the legacy import command.

## API

### `POST /api/scan`

Request: `{ "url": "https://company.example", "locale": "en|zh" }`

Returns `202 { reportId, jobId, tier: "free", status: "queued" }`, an existing report with `status: "reused"`, or `429` after the daily distinct-site limit.

### `GET /api/reports/:id/status`

Returns stage, progress, public error, coverage counts, queue position, wait reason, and active tier. Wait reasons are `jobs_ahead`, `active_jobs_in_pool`, or `awaiting_claim`; no queued site URL or job identifier is exposed. A valid report cookie switches the visible task from free to deep.

### `POST /api/reports/:id/upgrade`

Requires `{ accessKey }` and an `Idempotency-Key` header. Reserves one credit, enqueues the deep job and returns a one-time report access URL. Reusing the same idempotency key does not consume another credit.

### `POST /api/reports/:id/retry`

Retries a failed/partial free task or an authorized deep task. No new ledger row is created.

### `GET /api/reports/:id/access?token=…`

Validates the report-specific token, writes an HttpOnly, SameSite=Lax cookie, and redirects to the clean localized analysis URL.

## Operations

Run web and both Worker lanes as separate processes sharing `DATABASE_URL`. For local development, copy `.env.example` to `apps/web/.env.local`; Next.js and the Node operator/Worker scripts read that file. Install Chromium with `npm run browser:install`. Only trust proxy IP headers when the deployment proxy overwrites them.

The deterministic auditor treats a non-2xx response as the root cause for that page and does not run downstream H1, Schema, canonical, metadata, or readability checks. Findings are grouped by rule, page type, and normalized template, with at most three representative URLs. The overview rolls template groups into one rule-level priority card. Score deductions are capped per rule so repeated pages cannot erase the complete score by themselves.

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
npm run db:migrate:sqlite -- --source <legacy-file>
npm run test:ai-live
```

If a task remains queued, use the status endpoint to distinguish jobs ahead, an active task in that lane, and a task waiting to be claimed. Then confirm the matching free/deep Worker is running and sees the same database. If AI calls fail, run `npm run ai:probe` and verify the provider's exact model identifier. If dynamic pages fail, install Chromium and inspect Worker browser-launch errors. Do not log provider responses that may contain sensitive customer content.

The 2026-07-10 live acceptance used `mimo-v2.5-pro` against `me.itheheda.online`: 8 pages were planned, 7 analyzed, one failed, and the Chinese free report completed with three verified findings. This is runtime evidence, not a fixture or mock result.
