# Open GEO Console Tasks

## Report workspace rebuild

- [x] Preserve the selected option 1 visual reference in `docs/design/`.
- [x] Add overview, issues, bots, technical, and print report routes.
- [x] Keep report ID and target URL across every workspace section.
- [x] Add versioned, sanitized bot evidence summaries to `log-parser`.
- [x] Add one-to-one PostgreSQL bot-evidence persistence plus PUT/DELETE APIs.
- [x] Reuse compact log analysis in report-scoped and standalone modes.
- [x] Collapse the simulator and technical evidence by default.
- [x] Add pagination, bilingual copy, focus states, live status text, and responsive grouped rows.
- [x] Verify 1440x1024, 1280x720, and 390x844 layouts and the main import/refresh/clear flow.
- [x] Pass lint, unit/integration tests, production build, and final design QA.

## Optional follow-up

- [x] Publish the Web to Vercel and connect the production Neon PostgreSQL database.
- [x] Add recorded workstation batch drains and preserve a configuration-only upgrade path to persistent real-time Workers.
- [x] Run staging free/deep, production free, and production commerce as restartable Docker Desktop services using authoritative PostgreSQL polling.
- [x] Configure an independent production private evidence store, then enable and verify the production deep Docker Worker.
- [ ] Provide locally decryptable staging-only Airwallex/Resend Worker credentials before automating staging commerce.

## Protected staging and production security

- [x] Add fail-closed deployment profiles, immutable PostgreSQL environment markers, explicit staging Worker/commerce commands, and production-refusing cleanup.
- [x] Keep production at two rolling distinct sites while allowing only protected staging Preview to configure up to 100.
- [x] Add staging-only forced regeneration with old-report preservation, per-site idempotency, a two-job safety cap, UI, bilingual copy, and PostgreSQL integration coverage.
- [x] Replace crawl-blocking scan submission with atomic admission, an immediate pending report workspace, Worker-owned technical generation, stable idempotency, and truthful queue/stage polling.
- [x] Make scanner and checkout Turnstile interaction-only and execute on demand, while preserving mandatory server-side verification.
- [x] Verify the instant flow on protected Preview: about 1.77-second navigation, PostgreSQL `pending/queued`, staging Worker completion, empty console errors, and 390x844 responsive layout.
- [x] Version PostgreSQL schema bootstrap so only one advisory-locked deployment pass runs DDL and later serverless cold starts use lightweight checks.
- [x] Fix test commerce to Airwallex Sandbox and force all non-production email to the required test recipient.
- [x] Connect an independent Preview Neon database, initialize its staging marker, configure Preview policy variables, rotate the Vercel automation bypass without exposing it, deploy, and verify authenticated browser flows.
- [x] Assign and verify the fixed protected staging alias `open-geo-console-staging-itheheda.vercel.app` without weakening Vercel Authentication.
- [ ] Authorize the Vercel GitHub App for this repository, connect the project, and scope staging environment variables to one Preview branch; until then, repoint the fixed alias after each CLI deployment.
- [x] Create separate Airwallex Sandbox, Resend/test-recipient, and Cloudflare Queue resources; protect provider Webhooks with dedicated rotated bypass values and application signatures.
- [ ] Replace the user-approved shared MiMo Preview key with an independent staging key; successful real-model report acceptance is complete.
- [x] Configure production Turnstile, Cloudflare Bot Fight Mode, and a narrow `/api/scan` burst rule while leaving AI-bot blocking off.
- [x] Complete a real signed Airwallex Sandbox payment Webhook and prove that only its persisted state changes the original report banner to paid/queued.
- [ ] Complete the remaining refund, redirected-email, and production application-level third-site `429` browser acceptance.
- [x] Replace the no-return Payment Link checkout with a verified PaymentIntent/HPP journey, protected deployment, forged-return rejection, cancel return, successful Sandbox return, and signed-Webhook banner transition.
- [x] Safely recover unpaid legacy Payment Links into HPP, reject paid-link replacement, and replace raw JSON parsing errors with localized checkout states.
- [x] Distinguish a missing free AI preview from deployment-wide AI configuration and keep the completed technical report explicitly available.
- [x] Route provider-paid legacy orders into the report-bound payment-confirmation state and polling loop without granting entitlement from browser/provider retrieval.
- [x] Re-trigger the missing signed Airwallex Sandbox event for the provider-paid legacy report, resolve it safely by Payment Link binding, drain its deep job, and verify the generated private report in the browser.

## Evidence-backed AI report engine

- [x] Add safe site identity, SSRF protection, sitemap/link discovery and representative-page selection.
- [x] Add OpenAI-compatible page planning, batch analysis, structured synthesis and citation verification.
- [x] Add persistent PostgreSQL jobs, leases, retries, seven-day crawl evidence and a separate Worker.
- [x] Add 30-day free-site reuse, two-sites/rolling-24h anonymous limiting, Turnstile, global AI budget and homepage-only free previews.
- [x] Add HMAC access Keys, idempotent credit ledger, failure refunds and private deep-report links.
- [x] Add progressive status, AI analysis, deep unlock and print integration in English and Chinese.
- [x] Validate the OpenAI-compatible transport, structured output and a complete evidence-backed report with MiMo 2.5 Pro.
- [x] Short-circuit downstream checks for non-2xx pages, aggregate repeated findings by template, and cap score deductions per rule.
- [x] Split free/deep Worker lanes and expose truthful queue position, wait reason, and active tier in the status UI.
- [x] Re-scan `shun-express.com` and verify the 10-dead-link rollup in the browser.
- [x] Restrict free technical and AI analysis to the homepage and one verified AI finding.
- [x] Store deep multi-page technical reports privately and project legacy public reports to homepage scope.
- [x] Add permanent/transient page recovery, replacement candidates, smallest-unit AI retries, and content-hash-aware checkpoint resume.
- [x] Replace `partial` with completed-limited/unavailable product states and remove manual checkpoint retry from the report UI.
- [x] Persist immutable report language, validate upgrade locale, and add one authorized no-charge legacy locale correction.
- [x] Atomically terminalize commercial jobs with settled/refunded credit and add `npm run db:audit`.
- [x] Remove personal-site defaults and shared recent reports from the anonymous homepage; label technical and AI scores independently.
- [ ] Rotate the exposed credential before public production deployment.
- [x] Implement Airwallex checkout/refunds, Queue outbox, Resend delivery, safe link redemption/reissue and 24-hour batch SLA.
- [x] Create production Cloudflare Turnstile and staging Queue/Airwallex/Resend resources.
- [ ] Complete sandbox payment/refund/email and signed provider-delivery drills.
- [ ] Measure one, two and four deep Worker processes with representative live workloads before raising the default concurrency.

## HTML-first visual evidence report delivery

- [x] Implement private screenshot evidence capture during Worker analysis.
- [x] Store screenshot asset metadata in PostgreSQL and bytes behind a private storage adapter.
- [x] Render a polished HTML report artifact with graded screenshot evidence cards.
- [x] Generate the customer PDF from the same HTML artifact with print-specific CSS.
- [x] Verify private asset authorization, screenshot fallback states, desktop/mobile HTML browser QA, and PDF export QA.
- [x] Configure Preview-only private staging object storage and visually verify a fresh paid deep report's real issue crop, context thumbnail, compact screenshots, viewport fallback, authorized HTML/PDF reads, and anonymous object-store denial.

## AI recommendation forensic report (approved design, contracts implemented)

- [x] Approve the zero-configuration recommendation-forensic product direction, target buyer, two-audience delivery, evidence grades, and non-service boundary.
- [x] Write and approve an implementation plan for `docs/superpowers/specs/2026-07-12-ai-recommendation-forensic-report-design.md`.
- [x] Add immutable answer-snapshot and citation-evidence contracts with deterministic provider fixtures and private schema-v4 persistence.
- [ ] Certify the first source-bearing answer-engine adapter in protected staging.
- [ ] Certify a second independent adapter and prove qualified/limited/failed commercial coverage outcomes.
- [x] Add citation intelligence, entity ambiguity handling, Grade A-D evidence, source gaps, and opportunity hypotheses.
- [ ] Deliver the executive decision report and separate vendor task package in private HTML/PDF.
- [ ] Add the budgeted one-question free sample only after paid multi-engine staging acceptance.
