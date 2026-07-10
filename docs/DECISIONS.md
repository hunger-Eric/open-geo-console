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
