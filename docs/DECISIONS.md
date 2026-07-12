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

## 2026-07-11: Paid reports are HTML-first visual evidence artifacts

The private paid report is delivered as a polished HTML artifact plus a PDF exported from the same server-rendered component and print CSS. HTML is the canonical customer reading experience; PDF exists for forwarding and archival circulation, not as a separate report composition. Screenshot evidence is captured during deep Worker analysis beside the verified quote and URL, uses graded cards with issue crops and context thumbnails, follows the private report lifecycle, and inherits the report access boundary. PostgreSQL stores only metadata; local development uses a filesystem adapter, while staging/production require a private object-storage adapter and authorized proxy reads. Protected staging uses a Preview-only Vercel Private Blob store with OIDC for Web and an external-worker token for the workstation; S3-compatible storage remains available for other deployments. Screenshot evidence does not alter the commercial state machine: only a verified Airwallex Webhook may mark an order paid and create paid entitlement, deep job, dispatch hint, and email.

## 2026-07-12: The next paid-report product is recommendation forensics, not a GEO dashboard or implementation service

The approved next direction targets Chinese export companies without internal GEO teams. One URL produces a private, one-time report that begins with observed answer-engine recommendations, identifies owned and third-party citation gaps, and separates evidence-backed association from unknown algorithmic causes. Website crawlability and semantic clarity remain supporting foundations rather than claims that technical fixes cause recommendation rank.

The buyer receives a plain-language executive decision report. The buyer's existing website, content, SEO, or communications vendors receive a separate task package with drafts and acceptance criteria. Open GEO Console does not deploy code, administer websites, perform PR outreach, buy media, or guarantee mentions and rankings. Provider API observations must name the actual collection surface and must never be marketed as consumer-application results without an independently certified contract.

## 2026-07-12: Recommendation evidence is immutable, private, and certified separately from adapters

Each answer-engine observation is stored as an immutable run/cell/source snapshot bound to one report and job. Successful, failed, and no-recommendation states remain distinct; answer text is integrity-bound by hash, provider metadata is allowlisted and bounded, and retained citation excerpts expire while their hashes remain. Citation grades and opportunity hypotheses must point back to stored cells and sources, and opportunity language must not claim algorithmic causation.

The provider-neutral contracts and deterministic fixtures may ship before any live provider is enabled. Implementing an adapter does not certify it, and a developer API observation must not be labeled as a consumer application result. Customer-facing recommendation claims remain disabled until two independent source-bearing surfaces pass protected-staging certification.

Certification artifacts are immutable and authenticated separately from provider credentials. Runtime registration requires two distinct surfaces plus exact agreement among protected environment configuration, the signed certification/source authority and PostgreSQL authority; zero or one valid surface keeps both operator and public product lanes closed. Commercial checkpoints persist provider attempts and their evidence atomically so resume cannot silently mix observations from different provider ledgers.

## 2026-07-12: Transactional email is replyable without becoming an inbound workflow

Resend remains outbound transport, but every order and report-delivery message uses the verified `Open GEO Console <reports@itheheda.online>` sender with `Reply-To: support@itheheda.online`. Reply handling belongs to the support mailbox rather than the application database. Missing or malformed From/Reply-To/Webhook configuration fails commerce readiness, and non-production envelopes still redirect to `OGC_TEST_EMAIL_RECIPIENT` without changing the visible Reply-To identity.

## 2026-07-12: Low-cost persistent Workers poll authoritative PostgreSQL from Docker Desktop

The workstation deployment uses `FULFILLMENT_MODE=realtime` with `OGC_JOB_QUEUE_PROVIDER=postgres`. A bounded idle poll claims jobs through the existing PostgreSQL lease boundary, keeps Worker presence current, and avoids both locally unavailable Vercel Sensitive Queue credentials and repeated empty batch-run records. Cloudflare Queue remains an optional notification hint for hosted deployments; it never becomes job authority.

Docker Desktop starts staging free/deep, production free/deep, and production commerce with `restart: unless-stopped`. Runtime environment files are generated under ignored `.data`, restricted to the current Windows user, and never copied into the image. Each deep lane remains fail-closed unless its environment has independent private evidence storage, and the workstation being powered off remains an availability boundary.

## 2026-07-12: Chinese is the unprefixed canonical interface

The primary customer audience is Chinese export companies, so Chinese interface URLs use the canonical unprefixed paths (`/`, `/logs`, `/reports/:id/...`). English remains explicit under `/en`. Existing `/zh/...` links permanently redirect to the equivalent unprefixed URL with the query preserved, while API, Next.js asset, public-file, and private `report.html` artifact paths stay outside locale rewriting.

The routing layer changes interface chrome and canonical URLs only. A report's persisted generation locale remains immutable, and authorization continues to live in the report routes rather than in the Next.js proxy.

## 2026-07-13: Paid recommendation forensics uses public-source snapshots, not answer-engine claims

`recommendation_forensics_v1` remains the commercial product code, but every new order is report version 2 with methodology `public_search_source_forensics_v1`. Canonical non-brand buyer questions fan out to one accurately labeled public-search surface. Immutable shared market snapshots, retrieved public evidence, source families and website findings support the report; result order is raw context only and cannot be described as AI rank, recommendation, citation probability or causal evidence.

The V2 report, snapshot refs, job terminal state, credit settlement/refund, paid order, refund request and email intent share one PostgreSQL transaction. Customer artifacts expose safe freshness and whether new collection occurred, never internal allocated cost, another customer's reuse or contribution margin. HTML remains canonical and PDF is materialized from the same V2 component before terminalization.

Staging and production reached zero non-terminal V1 recommendation jobs before OpenAI/Perplexity runtime imports, credentials, flags and certification commands were removed from active admission and Worker graphs. Historical V1 rows, parsers, authorities and HTML/PDF rendering remain immutable and readable.

V2 live admission requires one exact active public-search authority plus a non-fixture production registry, builder and artifact gate. The generic signed certification framework ships with an empty compile-time approved adapter registry, so it refuses before network access and the product remains fail-closed until a separately reviewed vendor plan is completed.
