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

## 2026-07-10: Free previews and deep reports share one engine

Free previews analyze up to 8 pages and expose three verified findings. Deep reports analyze up to 50 pages, reuse unexpired evidence and require one report credit. Same-site free requests reuse a report for 30 days; anonymous clients may create three distinct free-site previews per day.

## 2026-07-10: Commercial access uses credits and report-specific tokens

High-entropy purchase Keys and report links are stored only as HMAC values. Deep jobs reserve one credit idempotently, settle only after valid coverage, and refund terminal system failures. A separate report token becomes an HttpOnly cookie so share links never expose a reusable purchase Key.

## 2026-07-10: PostgreSQL and a separate Worker are production requirements

Long-running crawling/model tasks use PostgreSQL jobs, leases, heartbeats and checkpoints. Browser-local reports and ephemeral SQLite are no longer production authorities. SQLite remains only as a legacy import source.

## 2026-07-10: Root causes and templates control technical finding volume

A non-2xx page emits only its HTTP-status root cause. Other rules run only on successful pages. Repeated findings are grouped by rule, page type and normalized template, with at most three representative URLs; the overview may roll template groups up by rule. Score deductions are capped per rule so site size does not dominate the technical score.

## 2026-07-10: Free and deep jobs use independent FIFO lanes

Workers claim exactly one configured tier with PostgreSQL leases and FIFO ordering inside that tier. The public status contract exposes queue position, a bounded wait-reason enum and active tier, but never exposes another site's URL or job ID.
