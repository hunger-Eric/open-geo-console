# Open GEO Console Decisions

## 2026-07-10: Reports are workspaces

The persisted report UUID is the product context. Overview, issues, bot evidence, technical details, and print views are sibling routes under that report. The standalone logs route remains an advanced utility and does not compete with the report journey.

## 2026-07-10: Bot evidence is share-safe and replaceable

PostgreSQL stores exactly one `analysisVersion: 1` summary per report. A new import replaces the summary. The server may return full analysis to the importing session, but persisted JSON excludes raw logs, IPs, full paths, and raw User-Agent strings.

## 2026-07-10: GEO score and log evidence are independent

Only `geo-auditor` determines the GEO score. Imported logs describe observed crawler access and never raise or lower the score. This avoids presenting traffic evidence as website quality.

## 2026-07-10: Simulation is not observation

The simulator uses the current report URL and stays collapsed by default. A simulated request records an attempt; only imported logs with recognizable evidence can mark access as observed.

## 2026-07-10: Option 1 is the visual baseline

The report UI uses a restrained editorial hierarchy, horizontal workspace tabs, warm neutral surfaces, forest text, teal primary actions, red/amber severity labels, Lucide icons, system CJK sans-serif fonts, 8px radii, and no ambient shadows or decorative grid background.

## 2026-07-10: AI reports are evidence pipelines, not free-form completions

Technical evidence and scoring remain deterministic. The model plans representative pages, analyzes extracted content and synthesizes a versioned report, but formal findings survive only when their URL and quoted evidence match the current crawl. Technical and AI dimension scores remain separate.

## 2026-07-10: Free previews prove the homepage; deep reports solve the site

Free previews fetch one homepage plus the standard robots/sitemap/llms assets and expose one verified AI finding while the global budget remains. They may estimate site size from already fetched homepage links and the root sitemap but never fetch those content pages. Deep reports analyze all eligible pages below 50 or select at most 50 pages, reuse eligible evidence and require one report credit. Same-site free requests reuse a report for 30 days; anonymous clients may create two distinct free-site previews per rolling 24 hours.

## 2026-07-10: Paid technical evidence is a private bundle

The public `scan_reports` payload remains a homepage-only technical report. Deep jobs store a separate technical payload beside their private AI report. Authorized routes switch to that bundle; public routes project legacy reports to homepage scope. A paid deep scan never overwrites public storage with multi-page evidence.

## 2026-07-10: Commercial access uses one-time orders, internal credits and report-specific tokens

Airwallex HK is the launch payment adapter for fixed CNY/USD/HKD server prices. A verified paid event atomically creates an internal one-credit entitlement, its deep job, Queue outbox hint and confirmation email; customers never see the internal Key. Resend delivers a seven-day confirmation link whose `GET` cannot consume it; human `POST` redemption establishes 30-day report access. Limited, failed or 24-hour-late reports receive one full cash refund, and late work may continue only as non-billable courtesy work.

Cloudflare Queue is notification-only and PostgreSQL remains the authority for payment, job, refund, email and access state. The initial `batch_24h` mode permits scheduled workstation fulfillment with an explicit 24-hour/full-refund promise; `realtime` later reuses the same state machines on persistent Workers.

## 2026-07-10: PostgreSQL and a separate Worker are production requirements

Long-running crawling/model tasks use PostgreSQL jobs, leases, heartbeats and checkpoints. Browser-local reports and ephemeral SQLite are no longer production authorities. SQLite remains only as a legacy import source.

## 2026-07-10: Root causes and templates control technical finding volume

A non-2xx page emits only its HTTP-status root cause. Other rules run only on successful pages. Repeated findings are grouped by rule, page type and normalized template, with at most three representative URLs; the overview may roll template groups up by rule. Score deductions are capped per rule so site size does not dominate the technical score.

## 2026-07-10: Free and deep jobs use independent FIFO lanes

Workers claim exactly one configured tier with PostgreSQL leases and FIFO ordering inside that tier. The public status contract exposes queue position, a bounded wait-reason enum and active tier, but never exposes another site's URL or job ID.

## 2026-07-10: Recovery is system-owned and terminal outcomes are atomic

Permanent page failures are excluded and replaced without retry; transient pages retry at most three times, and model work retries at the smallest failed unit. Public states are generating, completed, completed-limited and unavailable. A commercial terminal write and its settled/refunded credit transition occur in one transaction, so a terminal job cannot normally retain a reserved ledger entry.

## 2026-07-10: Report language is artifact state, not interface state

Each report persists one generation locale. Interface switching changes UI chrome only. Upgrade jobs must use the persisted locale, private access redirects to it, and an authorized legacy mismatch receives one no-charge correction job.

## 2026-07-10: The anonymous homepage has no shared report history

Without accounts there is no personal report center. The homepage submits a website and links secondarily to the advanced log tool; users return through copied public preview links or authorized private report links.

## 2026-07-10: Anonymous rate-limit identity is platform-scoped

Vercel requests prefer `x-vercel-forwarded-for` and fall back to Vercel's overwritten `x-forwarded-for` only when the `VERCEL=1` system marker or explicit legacy-project opt-in `OGC_TRUST_VERCEL_HEADERS=true` is present; Vercel overwrites the client header to prevent spoofing. Other deployments ignore forwarded headers unless `TRUST_PROXY_HEADERS=true` is set behind an edge that overwrites them. The fallback identity remains intentionally shared and fail-closed rather than trusting caller-controlled headers.

## 2026-07-10: Deployment identity and database identity are fail-closed

Every deployed Web, Worker, and commercial process declares `OGC_DEPLOYMENT_PROFILE=staging|production` and connects only to a PostgreSQL database with the same immutable `deployment_environment` marker. Only `VERCEL_ENV=preview` plus the staging profile may raise the rolling distinct-site limit, expose forced regeneration, redirect all test email, or use Airwallex Sandbox. Production unconditionally retains the two-site rolling limit and rejects test email configuration; request headers, cookies, query parameters, and administrator shortcuts are not policy inputs.

Forced staging regeneration creates a new report behind a per-site reservation. The current reuse mapping switches only after successful terminalization; failure leaves the old report usable, and duplicate clicks return the active regeneration rather than creating another job.

## 2026-07-11: Preview model-key reuse is a temporary explicit exception

The approved design requires an independent staging model credential. The user explicitly directed Preview to reuse the existing Xiaomi MiMo Token Plan key during this rollout. This changes the rollout acceptance boundary but does not weaken any other separation: staging keeps independent PostgreSQL, HMAC, Queue, payment, email, and protection-bypass credentials. The shared model key is tracked as security debt and must be replaced before the deployment is described as fully conforming to the original design.

## 2026-07-11: Production edge controls preserve AI crawler visibility

The canonical production hostname is `geo.itheheda.online`. Cloudflare Bot Fight Mode and a narrow `/api/scan` burst limit are enabled, while the platform setting that blocks AI crawlers remains off. Turnstile is verified server-side for the production hostname. These edge controls supplement rather than replace the database distinct-site limit, Webhook signatures, SSRF checks, and commercial invariant audit.

## 2026-07-11: Hosted checkout return is navigation, never payment authority

New one-time checkout uses Airwallex PaymentIntent plus Hosted Payment Page. The provider intent ID is the durable checkout binding; its temporary client secret is browser-only and never persisted. Success and cancel navigation return to the exact originating localized report, where a report-bound order-status route projects only PostgreSQL lifecycle state. Browser parameters, HPP return type, and provider retrieval may improve navigation or reconstruct a payment session, but only the verified Airwallex Webhook may mark an order paid and create its entitlement, deep job, dispatch hint, and email.

## 2026-07-11: Legacy checkout recovery must prevent double payment

An unpaid legacy Payment Link may move to HPP only after the server retrieves it from Airwallex, verifies its ID, order reference and metadata binding, confirms that it has no successful PaymentIntent, requires its active payment window to be old enough, deactivates it, and rechecks that it is inactive. The same PostgreSQL order then atomically replaces the legacy provider ID with an idempotently created PaymentIntent. A paid legacy link is never deactivated or replaced; the UI waits for a signed Webhook and provider retrieval alone cannot create entitlement. Empty or non-JSON gateway responses are treated as localized retryable checkout failures rather than exposed parser errors.

## 2026-07-11: Runtime requests validate a schema version instead of replaying DDL

The advisory lock remains the single-writer boundary for database bootstrap, but successful bootstrap now records an explicit schema version. Every later serverless cold start reads that marker and the deployment profile without replaying the idempotent migration list. A missing or older marker triggers one locked migration pass with an in-lock recheck; a newer marker fails closed so older application code cannot operate against an unknown schema.

## 2026-07-11: Report admission is fast; report generation is asynchronous

`POST /api/scan` validates the request and Turnstile token, applies reuse/rate policy, and atomically creates the pending report shell, free job, dispatch hint, trial mapping, and budget decision. It does not crawl or call a model. The browser navigates to the stable report UUID immediately, where route loading and pending states expose queue and stage progress. The free Worker is the only process that fetches the homepage and standard assets, persists the technical payload, and optionally continues AI generation. Repeated submissions use HMAC-backed idempotency and return the same admission result.

## 2026-07-11: Human verification is on demand, not a prerequisite UI

Scanner and checkout forms render Turnstile with `appearance: interaction-only` and `execution: execute`. Their primary buttons are enabled by valid local form data and initiate verification on click; no checkbox or fixed empty widget slot appears before interaction. The server still rejects absent, invalid, expired, or reused tokens. This is a presentation and latency decision only: Turnstile remains request authorization, and verified payment Webhooks remain the sole payment and entitlement authority.

## 2026-07-11: Vercel Functions run near the Singapore database

The repository-level Vercel configuration selects `sin1` for Functions so fast-admission database round trips stay near the Singapore Neon database. This does not move long-running crawling into the Web process; Worker placement remains an independent operations concern.

## 2026-07-11: Legacy paid Webhooks may resolve only through an exact checkout binding

Some legacy Airwallex Payment Link events omit `metadata.ogc_order_id` and use a human-readable title as `merchant_order_id`. A verified paid event may therefore resolve an order by `payment_link_id` only when it exactly matches the unique `(provider, provider_checkout_id)` database binding and the signed amount and currency match the immutable order. This compatibility path never accepts a title as an order ID and does not change the rule that only a verified Webhook creates payment and entitlement state.

## 2026-07-11: Public DNS compatibility must preserve IP pinning and SSRF validation

A Worker behind Fake-IP DNS may opt into the fixed Cloudflare DNS-over-HTTPS endpoint. Returned A/AAAA addresses still pass the existing private, reserved, metadata and benchmark-network blocks, and the crawler pins the approved address for the actual request and every redirect. The option is off by default; it is a resolver replacement, not an address allowlist or SSRF bypass.

Protected staging test mode may issue a one-day operator preview cookie only for an exact paid-and-completed order/report pair. Vercel Authentication remains the outer staging boundary and production always returns `404`; normal customer delivery continues to use the one-time emailed access link.
