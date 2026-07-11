# Open GEO Console Project State

## Current Goal

Operate a durable, self-hostable report product whose main journey is `free technical report + AI preview → one-time purchase → private deep report by email → optional AI Bot evidence`. The protected staging and production security code is deployed. Production edge controls and isolated staging provider resources are configured; remaining gates are the user-approved shared model-key exception, branch-scoped Preview variables, and end-to-end payment/email/provider drills.

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
- Vercel rate limiting prefers `x-vercel-forwarded-for` and falls back to the platform-overwritten `x-forwarded-for` when `VERCEL=1` or the legacy-project opt-in `OGC_TRUST_VERCEL_HEADERS=true`, instead of collapsing every visitor into the direct-client fallback; rate-limit errors expose localization keys for Chinese and English UI.
- HMAC-only Key/token storage; idempotent credit reservation, settlement and system-failure refund; scanner-safe GET plus human POST report-link redemption.
- Fixed server-side CNY/USD/HKD catalog, Airwallex hosted checkout/Webhooks/refunds, exactly-once paid entitlement/job/outbox creation, encrypted customer email, Resend delivery/Webhooks, one-hour link-reissue limiting, and 20/24-hour SLA automation.
- Cloudflare Queue push/pull adapters, notification-only outbox reconciliation, worker presence, recorded batch drains, Windows Task Scheduler scripts and Netlify monorepo configuration.
- Product-level status, Key unlock, AI analysis, technical, issues, bot evidence and print/PDF report surfaces in English and Chinese; checkpoint retry is no longer delegated to users.
- Scan submission now shows safety/homepage-crawl, slow-site, and extended-wait states, prevents duplicate submission, and uses a full document navigation after success so a transient RSC transition cannot make a completed scan appear inert.
- Legacy SQLite import preserving report UUIDs and sanitized Bot Evidence.
- Historical pre-boundary MiMo acceptance against `me.itheheda.online` proved the model transport and evidence validation. The homepage-only contract was subsequently accepted with a live one-page free job, private deep technical persistence, and browser verification of the free/PDF boundary.
- Non-2xx pages now emit only the HTTP root cause; repeated rule findings are grouped by page template and capped for scoring. The overview rolls template groups into one priority card with at most three representative URLs.
- Free and deep report jobs have independent Worker lanes. The status API/UI shows real queue position, wait reason, and active tier with completion-driven polling.
- Free scans fetch only the submitted homepage and the three standard assets. Free AI planning is deterministic and does not call the model planner; public legacy reports are projected to homepage scope.
- Deep jobs store a separate private technical report beside the deep AI payload. Authorized report routes use it; public routes never replace the homepage report with paid multi-page data.
- Page failures are classified as permanent or transient. The Worker retries only failed pages or AI units, backfills valid candidates, and resumes from content-hash-aware crawl/analysis checkpoints.
- New commerce checkout uses Airwallex PaymentIntent plus Hosted Payment Page instead of Payment Links. HPP success and cancel navigation return to the exact localized originating report; the report-bound status banner polls only PostgreSQL and never treats browser return parameters as payment or entitlement authority.
- Reports persist one generation locale independently from the interface route. Legacy wrong-language deep artifacts have one authorized no-charge correction job.
- Commercial terminalization is atomic: qualified jobs complete and settle; usable low-coverage jobs complete-limited and refund; unusable jobs fail and refund. `npm run db:audit` detects invariant violations.
- Serverless schema bootstrap runs behind a PostgreSQL transaction-scoped advisory lock, preventing concurrent cold starts from racing the constraint refresh statements and returning a transient report-page `500`.
- The anonymous homepage now contains only website analysis, bilingual controls, value-led capability copy and a secondary log-tool link; it does not expose shared recent-report history or a personal-site default.
- Deployment profiles and immutable PostgreSQL environment markers fail closed across Web, Worker, commerce, and cleanup. Only protected Vercel Preview plus the staging profile may raise the distinct-site limit to at most 100; production always remains at two.
- Staging-only forced regeneration creates a new report behind a per-site reservation, preserves the prior reuse mapping on failure, switches it atomically on success, limits active staging free jobs to two, and deduplicates repeated clicks.
- Explicit staging Worker/commerce commands read only `apps/web/.env.staging.local`. Test commerce uses the fixed Airwallex Sandbox endpoint, and all non-production email requires and redirects to `OGC_TEST_EMAIL_RECIPIENT`.
- An independent Preview Neon database is marked `staging`; real PostgreSQL integration tests passed against it. The protected Preview deployment denies anonymous page/API access and authenticated browser acceptance proved three distinct sites, default reuse, a new forced report, and duplicate-click idempotency.
- The existing production PostgreSQL database is marked `production`; the commercial invariant audit passes against both databases before deployment.
- Live regression scan of `shun-express.com` produced a score of 35 with 26 grouped findings instead of the previous score of 0 with 62 repeated findings; the overview correctly summarizes 10 dead links.
- Security implementation commit `0b09288` is deployed to the public production alias `https://open-geo-console.vercel.app`. Fixed staging alias `https://open-geo-console-staging-itheheda.vercel.app` points to the isolated Preview deployment; anonymous page/API checks return `302` to Vercel login and `401`, while an authenticated browser reaches the staging UI. Its automation bypass was rotated without exposing either credential.
- Production is deployed at `https://geo.itheheda.online` through Cloudflare. Turnstile server verification is required for that hostname, Bot Fight Mode is enabled, AI-bot blocking remains off, and `/api/scan` has a Cloudflare 5 requests / 10 seconds / IP burst rule with a 10-second block.
- Preview has separate Neon, HMAC, Airwallex Sandbox, Resend, Cloudflare Queue, test-recipient, and provider-specific Webhook bypass values. Airwallex and Resend Webhooks target the protected fixed alias and still require application signatures.
- The latest Preview build is `https://open-geo-console-9vdz4ivua-itheheda-6857s-projects.vercel.app`, repointed to the fixed protected alias. Authenticated browser acceptance proved the visible crawl state, disabled duplicate submission, automatic full-page navigation, and a successful report render after the schema-bootstrap race fix.
- Browser acceptance reconfirmed authenticated staging access, staging-only forced-regeneration UI, same-site reuse, a new forced report ID, old-report availability after failure, and the two-active-job concurrency cap. The isolated staging database marker fingerprint is `7223dda0037deca3`; a staging Worker drained isolated jobs without touching production.

## Known Boundaries

- There are no user accounts, subscriptions or teams. Manual report Keys remain available for self-hosted/operator use beside one-time orders.
- Official-site identity is inferred from internal site evidence only; external ownership/search verification is not performed.
- Image aesthetics, video, login-only pages and form submission are outside the first AI report version.
- Production always requires persistent PostgreSQL. Initial commercial operation may use scheduled workstation batches with a 24-hour/full-refund promise; instant delivery requires persistent `realtime` Workers.
- Netlify is the intended commercial Web/API host. The existing Vercel Hobby deployment remains useful only for noncommercial acceptance because its terms are not the commercial target.
- Real model behavior depends on the configured provider. CI uses mock clients; `npm run test:ai-live` remains the repeatable paid integration command.
- The Vercel project is not connected to Git because the Vercel GitHub App lacks repository access. The fixed alias must therefore be repointed explicitly after each CLI Preview deployment, and Preview variables cannot yet be restricted to one Git branch.
- At the user's written direction, Preview temporarily reuses the existing Xiaomi MiMo Token Plan API key. This is an explicit exception to the approved independent-model-key requirement; all other credentials remain separated. Replace it with a staging-only model key before claiming full conformance.
- Vercel Sensitive variables cannot be decrypted by `vercel env pull`; local Worker drills must explicitly override empty placeholders with separately held staging values in only that process, without printing them. Loading a second env file without explicit overrides leaves the empty Preview placeholders in effect. The local proxy DNS resolves `shun-express.com` into the reserved `198.18.0.0/15` Fake-IP range, so the Worker correctly fails closed with `UrlSafetyError`; real model acceptance requires a Worker environment with public DNS and remains open.
- Production Turnstile and the Cloudflare burst rule are live. Server-side no-token rejection (`403`) and edge burst rejection (`429`) are proven, but the application-level third-distinct-site browser drill was not completed because the attempted target was not scannable.
- Airwallex Sandbox and Resend resources/Webhooks are configured, but no real signed Sandbox delivery, payment/refund cycle, or application-originated redirected email has been observed yet.
- PaymentIntent/HPP code is deployed to protected staging at `https://open-geo-console-staging-itheheda.vercel.app` through Preview `https://open-geo-console-31v6z9v4t-itheheda-6857s-projects.vercel.app`. Anonymous deployment protection remains `302`/`401`; a real Sandbox PaymentIntent opened HPP with fixed `USD 29.00`, and HPP cancel returned to the exact report with a non-authoritative "payment not completed" banner. The successful-card and signed-Webhook path is paused at Airwallex's interactive puzzle CAPTCHA and is not yet accepted.
- Local `npm run db:audit` and `npm run test:postgres:staging-security` cannot run from the current checkout because `.env.local` points to a database without an initialized deployment marker and `apps/web/.env.staging.local` is absent. The fail-closed marker checks correctly refused both guessed staging and production identities.
- Anonymous users behind the same public IP or carrier/NAT gateway intentionally share the two-site rolling limit; there is no unauthenticated quota-reset endpoint.

## Next Steps

1. Complete the Airwallex Sandbox success path after the interactive CAPTCHA, then verify the signed Webhook changes the same report banner from confirming to queued without browser authority.
2. Replace the shared Preview model key with a staging-only key, then run one successful real-model staging report.
3. Verify the remaining Airwallex refund cycle and application-originated Resend message redirected only to `itheheda@gmail.com`.
4. Complete the production application-rate-limit drill with three scannable distinct sites and a fresh Turnstile token for each; the third must return `429`, including when staging-only inputs are supplied.
5. Authorize the Vercel GitHub App, connect this repository, and scope Preview variables to the staging branch; until then, repoint the fixed staging alias after each CLI Preview deployment.
6. Run duplicate payment/Webhook/Queue, completed/limited/failed report, email bounce/reissue, workstation-offline and full-refund drills before `COMMERCE_MODE=live`.

## Acceptance Commands

```bash
npm run lint
npm test
npm run build
npm run db:audit
npm run test:postgres:staging-security
```
