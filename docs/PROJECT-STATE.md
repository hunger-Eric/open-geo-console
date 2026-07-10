# Open GEO Console Project State

## Current Goal

Operate a durable, self-hostable report product whose main journey is `free technical report + AI preview → one-time purchase → private deep report by email → optional AI Bot evidence`. Code for the low-fixed-cost commercial path is complete; live provider resources and end-to-end sandbox/real-money drills remain external gates.

## Current Architecture

- `apps/web` is a localized Next.js App Router app backed by PostgreSQL. It owns routes, persistence, access controls, report UI, operator scripts and the standalone Worker entry point.
- `packages/geo-auditor` owns deterministic technical evidence and the reproducible GEO score.
- `packages/site-crawler` owns URL/SSRF safety, registrable site identity, robots/sitemap/link discovery, HTML extraction, template clustering and representative-page selection.
- `packages/ai-report-engine` owns OpenAI-compatible transport, page planning, batch analysis, `AiWebsiteReportV1`, synthesis and evidence verification.
- `packages/crawler-rules` and `packages/log-parser` continue to own AI crawler identity and sanitized access-log evidence.

The web process persists a public homepage technical report and enqueues work. Separate free/deep Workers use PostgreSQL leases and resumable checkpoints. The default `batch_24h` mode drains PostgreSQL from a scheduled workstation and exits; `realtime` consumes Cloudflare Queue hints on persistent infrastructure. Free reports analyze one homepage and show one verified AI finding while the global budget remains. Deep AI and technical payloads are private.

## Implemented

- Site-wide URL discovery capped at 50,000, candidate compression capped at 500, AI page planning and deterministic fallback selection.
- DNS-pinned safe HTTP crawling, per-redirect validation, robots enforcement, response limits and Playwright fallback for JavaScript-rendered pages.
- Structured model output, six AI dimensions, organization profile, page-type findings, evidence citations, coverage/provenance and 90-day roadmap.
- Citation verification that removes unsupported model findings before persistence.
- PostgreSQL schema for reports, jobs, AI payloads, seven-day page evidence, free trials, rate buckets, access Keys, credit ledger and private report tokens.
- Thirty-day free preview reuse by registrable site, private-suffix tenant handling, two distinct free sites per HMAC client IP in a rolling 24-hour window, Turnstile, and an exact global AI budget with technical-only fallback.
- Vercel rate limiting uses the platform's anti-spoofing client-IP header instead of collapsing every visitor into the direct-client fallback; rate-limit errors expose localization keys for Chinese and English UI.
- HMAC-only Key/token storage; idempotent credit reservation, settlement and system-failure refund; scanner-safe GET plus human POST report-link redemption.
- Fixed server-side CNY/USD/HKD catalog, Airwallex hosted checkout/Webhooks/refunds, exactly-once paid entitlement/job/outbox creation, encrypted customer email, Resend delivery/Webhooks, one-hour link-reissue limiting, and 20/24-hour SLA automation.
- Cloudflare Queue push/pull adapters, notification-only outbox reconciliation, worker presence, recorded batch drains, Windows Task Scheduler scripts and Netlify monorepo configuration.
- Product-level status, Key unlock, AI analysis, technical, issues, bot evidence and print/PDF report surfaces in English and Chinese; checkpoint retry is no longer delegated to users.
- Legacy SQLite import preserving report UUIDs and sanitized Bot Evidence.
- Historical pre-boundary MiMo acceptance against `me.itheheda.online` proved the model transport and evidence validation. The homepage-only contract was subsequently accepted with a live one-page free job, private deep technical persistence, and browser verification of the free/PDF boundary.
- Non-2xx pages now emit only the HTTP root cause; repeated rule findings are grouped by page template and capped for scoring. The overview rolls template groups into one priority card with at most three representative URLs.
- Free and deep report jobs have independent Worker lanes. The status API/UI shows real queue position, wait reason, and active tier with completion-driven polling.
- Free scans fetch only the submitted homepage and the three standard assets. Free AI planning is deterministic and does not call the model planner; public legacy reports are projected to homepage scope.
- Deep jobs store a separate private technical report beside the deep AI payload. Authorized report routes use it; public routes never replace the homepage report with paid multi-page data.
- Page failures are classified as permanent or transient. The Worker retries only failed pages or AI units, backfills valid candidates, and resumes from content-hash-aware crawl/analysis checkpoints.
- Reports persist one generation locale independently from the interface route. Legacy wrong-language deep artifacts have one authorized no-charge correction job.
- Commercial terminalization is atomic: qualified jobs complete and settle; usable low-coverage jobs complete-limited and refund; unusable jobs fail and refund. `npm run db:audit` detects invariant violations.
- The anonymous homepage now contains only website analysis, bilingual controls, value-led capability copy and a secondary log-tool link; it does not expose shared recent-report history or a personal-site default.
- Live regression scan of `shun-express.com` produced a score of 35 with 26 grouped findings instead of the previous score of 0 with 62 repeated findings; the overview correctly summarizes 10 dead links.
- The public noncommercial acceptance build for commit `1377f24` is deployed at `https://open-geo-console.vercel.app`. `COMMERCE_MODE=disabled` and `TURNSTILE_REQUIRED=false` keep the visual review public without exposing an unconfigured checkout or blocking the free form on a missing Turnstile secret.

## Known Boundaries

- There are no user accounts, subscriptions or teams. Manual report Keys remain available for self-hosted/operator use beside one-time orders.
- Official-site identity is inferred from internal site evidence only; external ownership/search verification is not performed.
- Image aesthetics, video, login-only pages and form submission are outside the first AI report version.
- Production always requires persistent PostgreSQL. Initial commercial operation may use scheduled workstation batches with a 24-hour/full-refund promise; instant delivery requires persistent `realtime` Workers.
- Netlify is the intended commercial Web/API host. The existing Vercel Hobby deployment remains useful only for noncommercial acceptance because its terms are not the commercial target.
- Real model behavior depends on the configured provider. CI uses mock clients; `npm run test:ai-live` remains the repeatable paid integration command.
- Vercel currently lists no project environment variables, so the public acceptance deployment is not evidence of live database, model, payment, email or Queue readiness. Any credential previously exposed in chat must still be rotated before public operation.

## Next Steps

1. Rotate the exposed model credential before public operation.
2. Create Netlify, Cloudflare Turnstile/two Queues, Airwallex Sandbox and Resend domain/Webhook resources using `docs/COMMERCIAL-OPERATIONS.md`.
3. Run duplicate payment/Webhook/Queue, completed/limited/failed report, email bounce/reissue, workstation-offline and full-refund drills before `COMMERCE_MODE=live`.
4. Measure one, two and four deep processes; keep two as the initial workstation default until live evidence supports a change.
5. Move to persistent `realtime` Workers only when order volume or customer expectations require faster starts.

## Acceptance Commands

```bash
npm run lint
npm test
npm run build
```
