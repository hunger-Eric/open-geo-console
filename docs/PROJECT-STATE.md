# Open GEO Console Project State

The limited V4 validation state below remains authoritative; consolidation does not promote it to complete or verified.

## Current Goal

Deliver a self-hostable, evidence-bound GEO product whose customer artifact is one secure HTML report. The persisted generation locale remains immutable throughout generation and delivery. Report V4 has no PDF generation or customer-PDF surface; V1-V3 retain their historical private-readiness records.

## Active Change Freeze

- `docs/ACTIVE-CHANGE-SCOPE.md` is `FROZEN`. No further production-code edits, live scans, historical recovery, replay, commerce operation, deployment, or other external mutation are authorized until the user approves an exact file allowlist and diff budget.
- The local branch contains a preceding 10-commit, 30-file unapproved broad repair experiment plus the documentation guard that freezes it. The preceding repair commits are not accepted product work, must not be deployed or extended, and remain preserved only for review until the user chooses how to disposition them.
- The intended narrow task is the V4 three-question answer optimization. Existing three-answer behavior must be preserved; unrelated state-machine, recovery, replay, historical-data, commerce, crawler, and infrastructure changes are outside scope by default.
- The authoritative deviation audit and clean-branch continuation procedure are in `docs/handoffs/2026-07-19-v4-answer-optimization-scope-recovery.md`.

## Current Snapshot (2026-07-19)

- Branch `codex/report-v4-implementation` is pushed through `7c3efab`. Protected Preview deployment `dpl_7XWvdMcJups3EjSeMQYe8y1oScHt` is Ready and the fixed staging alias points to it. Production was not deployed, mutated, or exercised.
- PostgreSQL schema authority is v40. V1-V3 runtime and historical artifacts remain readable and unchanged.
- One real CNY 199 Airwallex Sandbox V4 run for `https://mimo.xiaomi.com/zh` completed as `completed_limited`; associated report, order, job, and artifact identifiers are retained only in protected operational records.
- The customer HTML is authorized and live at the protected deployment; exact-route inspection returned HTTP 200 with V4 metadata, three question cards, two answered cards, one unavailable card, and ten public-source links.
- The immutable pre-admission snapshot is `completed_limited`: seven candidates, three analyzable pages, and two exclusions. The paid core reused that snapshot and did not enqueue an enhancement job after its limited terminal result.
- Payment is `paid`; fulfillment is `completed_limited`; the internal credit is refunded. The Airwallex Sandbox cash-refund submission is truthfully `failed`, and 21 queued test emails were retried but not delivered in the final commerce pass.
- The live repairs add bounded page-analysis contract recovery, collision-free legacy page locations, serialized question calls, generic business-question wording, exact pending-core resume identity, standalone-safe V4 rendering, and explicit active-V4 HTML access without broadening the legacy default artifact loader.
- Final source verification: focused access/renderer/report tests pass (30 tests), lint passes, and the production build passes. A prior full `npm test` run passed 2,565 tests but still has five unrelated PostgreSQL schema-drift failures in the V4 acceptance phase-snapshot suite.
- `config/report-contracts/combined-geo-report-v4.requirements.json` remains the machine authority. All 20 requirements remain `implemented`, not `verified`; one successful paid run is not the required three-scenario evidence set.

## Architecture and Product Boundaries

- `apps/web` owns PostgreSQL persistence, job orchestration, routes, access control, commerce, and UI. Workers alone crawl pages, call models, capture evidence, and materialize report artifacts.
- PostgreSQL is the report, job, dispatch, payment, credit, refund, email, and access authority. Cloudflare Queue is notification-only.
- A verified payment Webhook is the only authority that marks an order paid and creates its entitlement/deep job. Terminal commercial outcomes use the atomic job-and-credit boundary.
- Customers receive authorized HTML only. Report V4 has no PDF generation, readiness, storage, route, action, or email claim.
- The production free limit remains two distinct sites per rolling 24 hours. Forced regeneration and operator acceptance controls are protected-staging-only.
- Production is outside the V4 acceptance scope and must remain untouched.

## Durable Evidence

- The full paid-run identity, customer-content inspection, commercial outcome, deployment identity, code repairs, and limitations are recorded in `docs/operations/evidence/2026-07-19-report-v4-paid-deep-report.md`.
- Protected-staging V2/V3 acceptance and correction records remain historical evidence under `docs/operations/evidence/`.
- Historical terminal jobs, orders, credits, refunds, question sets, and artifacts remain immutable. Remediation must use a sanctioned replacement/correction boundary rather than reopening or rewriting them.

## Remaining Work / Blockers

1. Repair the staging Airwallex refund configuration/reconciliation path and redirected email delivery, then rerun commerce without claiming success from the current failed/retried states.
2. Execute the exact V4 diagnosis-failure and question-failure scenarios and collect their immutable scenario/session authorities; the paid core run covers only the customer-delivery scenario.
3. Store requirement-bound evidence for all 20 requirements, review each registry promotion from `implemented` to `verified`, and only then expect `npm run report:v4:acceptance` to pass.
4. Resolve the five PostgreSQL acceptance phase-snapshot schema-drift failures before treating the full deterministic suite as green.
5. Keep live V2/V3 recovery and unresolved historical Sandbox refunds separate from V4 acceptance.

## Verification

The current verification authority is the V4 evidence record and the locked scope above. Focused access/renderer/report tests (30 tests), lint, and production build pass; the prior full `npm test` run passed 2,565 tests but retains five unrelated PostgreSQL schema-drift failures in the V4 acceptance phase-snapshot suite. Traceability remains fail-closed: all 20 V4 requirements are `implemented`, not `verified`, and the diagnosis-failure and question-failure scenarios are still missing. The protected paid run proves only the customer-delivery scenario; it does not authorize promotion to verified or further production work.

Historical architecture and acceptance records remain preserved in `docs/operations/evidence/` and are not current execution authority. Customer delivery remains HTML-only; any private PDF readiness records are historical/internal evidence only.
- `packages/geo-auditor` owns deterministic technical evidence and the reproducible GEO score.
- `packages/site-crawler` owns URL/SSRF safety, registrable site identity, robots/sitemap/link discovery, HTML extraction, template clustering and representative-page selection.
- `packages/ai-report-engine` owns OpenAI-compatible transport, page planning, batch analysis, `AiWebsiteReportV1`, synthesis and evidence verification.
- `packages/public-search-observer` owns V2 public-search surface, authority, canonical buyer-question, fanout, observation, coverage, registry and prohibited-claim contracts.
- `packages/answer-engine-observer` remains the frozen historical V1 answer-snapshot contract.
- `packages/citation-intelligence` owns both frozen V1 citation behavior and V2 public-source evidence graphs, entity resolution, evidence families, source eligibility/readiness and non-causal opportunity hypotheses.
- `packages/crawler-rules` and `packages/log-parser` continue to own AI crawler identity and sanitized access-log evidence.

The web process persists a public homepage technical report and enqueues work. Separate free/deep Workers use PostgreSQL leases and resumable checkpoints. Docker Desktop keeps the authorized workstation lanes alive with bounded PostgreSQL polling; Cloudflare Queue remains optional and notification-only. Free reports analyze one homepage. A V2 order can be admitted only after exact environment-matched public-search authority and non-fixture runtime readiness; the deep Worker is the only process that collects public observations/evidence and builds the private V2 artifact.

## Implemented

- DNS-pinned safe HTTP crawling, per-redirect validation, robots enforcement, response limits and Playwright fallback for JavaScript-rendered pages.
- Structured model output, six AI dimensions, organization profile, page-type findings, evidence citations, coverage/provenance and 90-day roadmap.
- Citation verification that removes unsupported model findings before persistence.
- Immutable question/run/attempt/cell/source contracts with explicit failed/no-recommendation states, bounded provider metadata, sanitized errors, response and retrieved-content hashes, source-local ordering and deterministic fixtures. Developer API observations cannot be labeled as consumer-app results.
- Citation intelligence with clause-bound recommendation extraction, entity ambiguity handling, owned/earned/reference/community source categories, Grade A-D evidence, customer/competitor gaps, homepage/full-site blind spots, evidence-linked priorities and non-causal vendor tasks.
- PostgreSQL schema v14 binds V1 history plus V2 methodology, exact adapter identity, public-search authorities, questions, queries, attempts, observations, source evidence, leases, report snapshot refs and V2 reports to exact jobs. Retained excerpts expire while hashes and cost ledgers remain.
- `RecommendationForensicReportV1` is built only from persisted evidence and renders complete bilingual executive and vendor layers plus the legacy technical appendix. Product-scoped cookies/tokens, explicit legacy/recommendation HTML/PDF routes and private evidence routes prevent cross-product access.
- Historical OpenAI Responses Web Search and Perplexity Sonar adapters remain only as V1 regression sources; checkout, catalog and deployed Worker graphs no longer import them.
- V2 certification validates HMAC-authenticated, path-confined artifacts with exact surface/capability/terms/storage/error/budget review evidence. The compile-time approved adapter registry is empty, so certification refuses before network access and availability remains closed.
- Transactional email now validates the fixed sender and `OGC_REPLY_TO_EMAIL`; staging remains redirected to `OGC_TEST_EMAIL_RECIPIENT` and missing Resend values leave deliveries queued rather than bypassing the transport boundary.
- PostgreSQL schema for reports, jobs, AI payloads, seven-day page evidence, free trials, rate buckets, access Keys, credit ledger and private report tokens.
- Thirty-day free preview reuse by registrable site, private-suffix tenant handling, two distinct free sites per HMAC client IP in a rolling 24-hour window, Turnstile, and an exact global AI budget with technical-only fallback.
- Vercel rate limiting prefers `x-vercel-forwarded-for` and falls back to the platform-overwritten `x-forwarded-for` when `VERCEL=1` or the legacy-project opt-in `OGC_TRUST_VERCEL_HEADERS=true`, instead of collapsing every visitor into the direct-client fallback; rate-limit errors expose localization keys for Chinese and English UI.
- HMAC-only Key/token storage; idempotent credit reservation, settlement and system-failure refund; scanner-safe GET plus human POST report-link redemption.
- Fixed server-side CNY/USD/HKD catalog, Airwallex hosted checkout/Webhooks/refunds, exactly-once paid entitlement/job/outbox creation, encrypted customer email, Resend delivery/Webhooks, one-hour link-reissue limiting, and 20/24-hour SLA automation.
- Cloudflare Queue push/pull adapters, notification-only outbox reconciliation, worker presence, recorded batch drains, Windows Task Scheduler scripts and Netlify monorepo configuration.
- Docker Desktop persistent PostgreSQL polling is active for staging free/deep and production free/deep, with `restart: unless-stopped`, graceful Worker shutdown, ACL-restricted ignored runtime env files, and a five-minute production commerce loop. A fresh staging `shun-express.com` report completed from 0% to 100% in one attempt after automatic claim, proving container DoH, crawl, model, and persistence behavior. Production deep uses the independent private `open-geo-console-production-evidence` Blob store in `sin1`; authenticated container put/get/delete passed and anonymous access returned `403`.
- Product-level status, Key unlock, AI analysis, technical, issues, bot evidence and print/PDF report surfaces in English and Chinese; checkpoint retry is no longer delegated to users.
- Schema-v16 recoverable analysis ledger: explicit phase/state columns, monotonic checkpoint revisions, phase-local retry/backoff, append-only redacted error/transition events, checkpoint/readiness-gated repair resume, and a restricted all-or-nothing pending-refund historical recovery boundary. The shared Worker checkpoint authority covers V2 source/artifact phases with a revision CAS; customer status exposes only safe retry/repair wording.
- Public language routing now treats Chinese as the default without a URL prefix, keeps English under `/en`, and permanently redirects legacy `/zh` links while preserving path and query. Shared link helpers, language switching, canonical/alternate metadata and document `lang` values follow the same contract; stored report generation locale remains immutable.
- Scan submission performs only validation, Turnstile verification, rate/reuse checks, and an atomic PostgreSQL admission transaction. It returns a stable report UUID immediately; the Worker alone crawls the homepage and persists the technical payload. Pending report routes render a real workspace with queue/stage copy and skeleton content instead of holding the homepage button open.
- Turnstile uses explicit `interaction-only` appearance with `execute` execution. Scanner and checkout buttons become actionable from their own form data, then request a token on click; verified server-side tokens remain mandatory and the widget does not reserve blank space before interaction.
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
- Serverless schema bootstrap records `ogc_schema_state.version` after the advisory-locked DDL pass. Later cold starts perform only the lightweight version/profile checks, so report and Webhook requests do not repeat the full migration set; newer database versions fail closed against older code.
- The anonymous homepage now contains only website analysis, bilingual controls, value-led capability copy and a secondary log-tool link; it does not expose shared recent-report history or a personal-site default.
- Deployment profiles and immutable PostgreSQL environment markers fail closed across Web, Worker, commerce, and cleanup. Only protected Vercel Preview plus the staging profile may raise the distinct-site limit to at most 100; production always remains at two.
- Staging-only forced regeneration creates a new report behind a per-site reservation, preserves the prior reuse mapping on failure, switches it atomically on success, limits active staging free jobs to two, and deduplicates repeated clicks.
- Staging Worker configuration is assembled by `scripts/start-workstation-workers.ps1`: it merges protected Preview/staging inputs, then maps missing V2 MiMo values from the operator-controlled local `OGC_AI_*` source only when staging public-search runtime is enabled. Explicit V2 values win and production never receives this fallback. Test commerce uses the fixed Airwallex Sandbox endpoint, and all non-production email requires and redirects to `OGC_TEST_EMAIL_RECIPIENT`.
- An independent Preview Neon database is marked `staging`; real PostgreSQL integration tests passed against it. The protected Preview deployment denies anonymous page/API access and authenticated browser acceptance proved three distinct sites, default reuse, a new forced report, and duplicate-click idempotency.
- The existing production PostgreSQL database is marked `production`; the commercial invariant audit passes against both databases before deployment.
- Live regression scan of `shun-express.com` produced a score of 35 with 26 grouped findings instead of the previous score of 0 with 62 repeated findings; the overview correctly summarizes 10 dead links.
- Accepted payment-return commit `c81ec2e` is deployed to the public production alias and `https://geo.itheheda.online`; the production catalog reports `enabled: false` and `mode: disabled`. Fixed staging alias `https://open-geo-console-staging-itheheda.vercel.app` points to the isolated Preview deployment; anonymous page/API checks return `302` to Vercel login and `401`, while an authenticated browser reaches the staging UI. Its automation bypass was rotated without exposing either credential.
- Production deployment `dpl_9BxaFERejM39nfS8sM6o3vVCHXty` serves `https://geo.itheheda.online` through Cloudflare with Functions in `sin1`. Schema v2 was applied before deployment; the production marker remains `3b271c4714ee8b65` and repeat inspection takes about 6.4 seconds. Production browser smoke proved the on-demand Turnstile layout and immediately enabled scanner button after valid input with no console warnings/errors. Commerce remains intentionally disabled (`enabled: false`, `mode: disabled`). Bot Fight Mode is enabled, AI-bot blocking remains off, and `/api/scan` retains the Cloudflare 5 requests / 10 seconds / IP burst rule with a 10-second block.
- Preview has separate Neon, HMAC, Airwallex Sandbox, Resend, Cloudflare Queue, test-recipient, and provider-specific Webhook bypass values. Airwallex and Resend Webhooks target the protected fixed alias and still require application signatures.
- Preview `https://open-geo-console-3k91cfqtw-itheheda-6857s-projects.vercel.app` (deployment `dpl_Eanrpi8hj1mWnQg6wt38AKiyLQMJ`) is repointed to the fixed protected alias and declares the Singapore `sin1` Function region. Authenticated browser acceptance on 2026-07-11 proved: no pre-rendered Turnstile, an enabled scanner button after valid URL input, a new report route in about 1.77 seconds, a truthful `pending/queued` workspace, background completion after one staging free Worker drain, and responsive 390x844 rendering. Console warnings/errors were empty.
- Browser acceptance reconfirmed authenticated staging access, staging-only forced-regeneration UI, same-site reuse, a new forced report ID, old-report availability after failure, and the two-active-job concurrency cap. The isolated staging database marker fingerprint is `7223dda0037deca3`; a staging Worker drained isolated jobs without touching production.
- Deep Workers now capture private visual evidence only after quote/URL verification. Critical findings request an issue crop plus context thumbnail; lower severities use compact captures, unreliable crops fall back to the viewport, and capture failures persist an explicit unavailable record without discarding the verified citation. Asset metadata and evidence/content hashes live in PostgreSQL schema v3 while bytes stay behind filesystem or S3-compatible adapters.
- Private evidence reads inherit the existing report-access cookie/token boundary and are streamed through a report-and-asset-bound no-store route; storage keys are never exposed as stable public URLs. Unit coverage proves unauthorized reads fail before storage access.
- The canonical customer artifact is now `/reports/:id/report.html`, with editorial summary, scores, priority findings, visual evidence, roadmap, technical appendix, and sources. `/api/reports/:id/artifacts/report.pdf` launches serverless Chromium against that exact authorized HTML route and applies A4 print CSS; the previous independent wide-layout PDF composition is no longer the delivery path.
- Protected staging deployment `dpl_6XH3A4zQarfj9zREkx9C4PLqMXzq` (`https://open-geo-console-h44ppfw2k-itheheda-6857s-projects.vercel.app`) is assigned to the fixed staging alias. Authenticated desktop and 390x844 browser QA passed with both Noto Sans SC weights loaded. The accepted PDF is an 11-page, 200,698-byte `%PDF` document with complete Chinese text, compact roadmap pagination, findings, evidence fallbacks, recommendations, and appendix. Anonymous Preview access still redirects to Vercel Authentication.
- Preview-only Vercel Private Blob store `open-geo-console-staging-evidence` is active in `sin1`. Web reads use the project connection's OIDC; the workstation deep Worker uses the ignored Preview pull token. The adapter was live-probed with put/get/delete, and a direct anonymous Blob request returned `403`.
- Fresh paid staging report completed from a signed Airwallex Sandbox Webhook: 7 pages planned, 5 analyzed, one deep attempt, `paid/completed`, no refund; verified citations had ready private visual evidence and authorized HTML rendered every image.
- The workstation Fake-IP regression is fixed at the resolver boundary: configured Cloudflare DoH now feeds both safe crawling and screenshot-browser URL validation without allowing `198.18.0.0/15`. Critical quote localization no longer leaks the TSX `__name` helper into the browser context, crop geometry is document-clamped, and any unreliable crop degrades to a viewport screenshot.
- Protected staging deployment `dpl_HWe1auqsvmcd8Uzr9aVGwpKtJPp1` (`https://open-geo-console-ofa7b2mkj-itheheda-6857s-projects.vercel.app`) is assigned to the fixed staging alias with the Private Blob, DoH, crop, and fallback fixes.
- Recommendation-forensics contract deployment `dpl_7TDthogkMfANLb3316MXZ9AdeXFq` is Ready and assigned to the protected fixed staging alias. Anonymous page/API checks remain `302`/`401`, the isolated staging database is on schema v4, and all seven real PostgreSQL security/persistence tests pass.
- Production deployment `dpl_8N7VCSk4e5d2FBxNFysExFg7D4nU` is Ready at `https://geo.itheheda.online`. The production database migrated under the advisory lock to schema v4; a dynamic report-status probe returned the expected `404`, the commercial invariant audit passes, recent deployment error logs are empty, and commerce remains intentionally disabled. This release adds contracts and private persistence only; it does not enable live answer-engine adapters, runtime orchestration, or customer-facing recommendation claims.

## Known Boundaries

- There are no user accounts, subscriptions or teams. Manual report Keys remain available for self-hosted/operator use beside one-time orders.
- Official-site identity is inferred from internal site evidence only; external ownership/search verification is not performed.
- Image aesthetics, video, login-only pages and form submission are outside the first AI report version.
- Production always requires persistent PostgreSQL. Initial commercial operation may use scheduled workstation batches with a 24-hour/full-refund promise; instant delivery requires persistent `realtime` Workers.
- Docker Desktop Workers stop when the workstation or Docker Desktop is offline. `restart: unless-stopped` recovers them when Docker starts, but it does not provide hosted availability.
- Netlify is the intended commercial Web/API host. The existing Vercel Hobby deployment remains useful only for noncommercial acceptance because its terms are not the commercial target.
- Real model behavior depends on the configured provider. CI uses mock clients; `npm run test:ai-live` remains the repeatable paid integration command.
- Protected staging uses an active signed MiMo authority. A fresh V2 paid chain completed with snapshot refs, persisted public evidence, private HTML, settled credit, zero refunds, and delivered transactional emails; internal identifiers, client IPs, credentials, and access tokens remain prohibited.
- Schema v14 bootstrap/upgrade plus V2 snapshot, repository and atomic-commerce fault injection passed against a local isolated PostgreSQL 16 disposable admin URL on 2026-07-13. The protected staging PostgreSQL recovery suite also passes for `source_retrieval`, `artifact_verification`, and the new pre-transaction `terminalization` checkpoint. Neither substitutes for live Worker acceptance.
- Legacy checkout retirement is implemented and protected by explicit environment gates, but the operator command has not been run against the real provider resources.
- The Vercel project is not connected to Git because the Vercel GitHub App lacks repository access. The fixed alias must therefore be repointed explicitly after each CLI Preview deployment, and Preview variables cannot yet be restricted to one Git branch.
- At the user's written direction, protected Preview reuses the existing validated Xiaomi MiMo Token Plan API key. This is an explicit credential-sharing exception for the monthly plan: edit only the Preview record for staging work, never production variables or deployments; all other credentials remain separated.
- Vercel Sensitive variables cannot be decrypted by `vercel env pull`; local Worker drills must explicitly override empty placeholders with separately held staging values in only that process, without printing them. Loading a second env file without explicit overrides leaves the empty Preview placeholders in effect. The local proxy DNS resolves public hosts into the reserved `198.18.0.0/15` Fake-IP range; Workers may opt into the fixed Cloudflare HTTPS DNS endpoint, after which the same blocked-network validation and IP-pinned fetch remain mandatory.
- Preview deployment is Ready and the fixed protected staging alias points to it; protected Chrome rendered the report and production was not modified.
- Production Turnstile and the Cloudflare burst rule are live. Server-side no-token rejection (`403`) and edge burst rejection (`429`) are proven, but the application-level third-distinct-site browser drill was not completed because the attempted target was not scannable.
- The 2026-07-12 protected-staging drill completed the legacy deep-report path in one attempt with private evidence stored; authorized HTML/PDF and database-audit checks passed. Delivery acceptance runs through the protected Preview commerce endpoint.
- PaymentIntent/HPP code is deployed to protected staging at `https://open-geo-console-staging-itheheda.vercel.app` through Preview `https://open-geo-console-bqfk9fzei-itheheda-6857s-projects.vercel.app`. Anonymous deployment protection remains `302`/`401`. Browser acceptance used a fixed `USD 29.00` Sandbox PaymentIntent: cancel returned to the exact report without claiming payment, the successful card returned through the success URL, the banner waited for PostgreSQL, and the verified Webhook alone produced `paid + queued` and the exactly-once deep entitlement/job. Empty/non-JSON checkout failures now render localized retry copy. Unpaid legacy Payment Links are order-verified, age-gated, deactivated, rechecked, and atomically replaced by an HPP PaymentIntent; paid legacy links are never replaced or charged again. A provider-paid legacy order now immediately enters the same report-bound payment-confirmation route and starts PostgreSQL polling instead of remaining as a checkout-form error. A missing free AI artifact states that the technical report remains available instead of incorrectly claiming the whole deployment lacks AI configuration.
- Preview is repointed to the fixed protected alias; a signed event passed amount/currency validation, created exactly one paid entitlement and deep job, and the resumable job completed with a private report visible in authenticated browser acceptance. Staging `db:audit` passes.
- Protected staging test mode has a paid-and-completed-order operator access route for browser acceptance when email transport is intentionally unavailable. It issues a one-day private-report cookie only after staging/test profile and exact order/report state checks; production returns `404`.
- The ignored `apps/web/.env.staging.local` now holds the pulled Preview environment for local operator checks. Staging PostgreSQL security tests and the commercial invariant audit pass; `.env.local` still points to a separately uninitialized database and is not accepted as staging or production authority.
- Anonymous users behind the same public IP or carrier/NAT gateway intentionally share the two-site rolling limit; there is no unauthenticated quota-reset endpoint.
- The staging Blob store is connected only to Preview. A workstation deep Worker must refresh `.vercel/.env.preview.local` with `npx vercel pull --yes --environment=preview`; Vercel Sensitive model/Queue placeholders still require the existing process-only overrides. Production has a separate private Blob store connected only to Production, and deployment `dpl_56Jr2dr4ytEqQ9VXdbYartNPG8uS` serves the corresponding authorized reads.

## Next Steps

1. Complete the remaining protected-staging live Worker fault drills for crawl, model, V2 runtime, artifact readiness, and terminalization. For each, prove `checkpoint -> repair_wait -> readiness repair -> queued` resumes the original phase without duplicate evidence, artifacts, refund, or email side effects.
2. Complete the production application-rate-limit drill with three scannable distinct sites and a fresh Turnstile token for each; the third must return `429`, including when staging-only inputs are supplied.
3. Authorize the Vercel GitHub App, connect this repository, and scope Preview variables to the staging branch; until then, repoint the fixed staging alias after each CLI Preview deployment.
4. Run duplicate payment/Webhook/Queue, completed/limited/failed report, email bounce/reissue, workstation-offline and full-refund drills before `COMMERCE_MODE=live`.
5. Run `npm run commerce:retire-legacy` with explicit protected-environment gates and an audited ISO cutoff, then verify the real provider resources are inactive/non-payable without modifying paid orders.

## Acceptance Commands

```powershell
npm run lint
npm test
npm run build
npm run report:v4:traceability
npm run report:v4:acceptance
codegraph status
```

Expected current truth: lint, build, focused V4 tests, traceability, and CodeGraph pass. Full V4 acceptance must remain fail-closed until the two missing scenarios exist and all 20 requirement statuses are explicitly promoted from `implemented` to `verified`.
