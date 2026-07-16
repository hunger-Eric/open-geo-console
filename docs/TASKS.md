# Open GEO Console Tasks

## Report workspace rebuild

- [x] Preserve the selected option 1 visual reference in `docs/design/`.
- [x] Add overview, issues, bots, and technical report routes; remove the obsolete customer print workspace.
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
- [x] Deploy and invoke the protected Preview `POST /api/staging/commerce/run` endpoint after explicit operator confirmation; prove queued Sandbox refund and redirected test emails leave their pending states. On 2026-07-14 the same runner delivered both emails for the successful V2 paid acceptance order.

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
- [ ] Complete protected-staging real-Worker fault drills for crawl, model, V2 runtime, artifact readiness, and terminalization. The process-only one-shot hook and staging PostgreSQL recovery coverage pass; Preview runtime is enabled and the new free foundation report is complete. Collect protected-browser checkout, live transitions and side-effect evidence next. The user authorizes Preview to reuse the validated production MiMo monthly-plan credential; only the Preview record may be edited, and production configuration/deployments remain untouched.
- [x] Configure production Turnstile, Cloudflare Bot Fight Mode, and a narrow `/api/scan` burst rule while leaving AI-bot blocking off.
- [x] Complete a real signed Airwallex Sandbox payment Webhook and prove that only its persisted state changes the original report banner to paid/queued.
- [ ] Complete the production application-level third-site `429` browser acceptance. The 2026-07-13 staging failure-path refund and redirected-email drill completed through provider submission and three delivered test emails.
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
- [x] Add progressive status, AI analysis, and authorized deep HTML access in English and Chinese.
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
- [x] Complete the V2 failure-path Sandbox settlement and delivery drill: order `558098d6-4fc2-4da0-b2c0-c7083bb76555` reached `paid/failed/refunded/delivered`; its provider refund succeeded and payment-confirmed, report-failed-refund and refund-succeeded redirected test emails were delivered through the protected Preview commerce runner.
- [ ] Measure one, two and four deep Worker processes with representative live workloads before raising the default concurrency.

## HTML-only customer report delivery

- [x] Implement private screenshot evidence capture during Worker analysis.
- [x] Store screenshot asset metadata in PostgreSQL and bytes behind a private storage adapter.
- [x] Render a polished HTML report artifact with graded screenshot evidence cards.
- [x] Retain same-HTML Chromium PDF materialization only as private Worker readiness/storage; remove customer PDF routes, buttons, print workspace, product copy, and email claims.
- [x] Verify private asset authorization, screenshot fallback states, desktop/mobile HTML browser QA, and internal PDF readiness.
- [x] Configure Preview-only private staging object storage and visually verify a fresh paid deep report's evidence images, authorized HTML reads, private internal PDF storage, and anonymous object-store denial.
- [x] Enforce immutable new-report locale and `geo_v1` GEO terminology through model prompts, one bounded correction, a prospective final gate, localized system copy, and `repair_wait` on exhausted validation; preserve stable internal `seo` identifiers and legacy report display.
- [x] Localize deterministic technical findings and machine-readable asset summaries for new combined revisions; detect exact duplicate and dominant-template page titles, present the page-specific title segment compactly with expandable full source evidence, and preserve source-original titles, H1 values, URLs, and historical artifacts unchanged.

## Combined paid report and one-time correction

- [x] Implement the prospective answer-first `combined_geo_report_v3` contract with exactly three canonical question cards, direct-evidence-only sentences, deterministic coverage/diagnosis, immutable engine provenance, HTML-first rendering, and private PDF readiness.
- [x] Fix the live V3 staging recovery faults: source-local timeouts, mixed terminal ledgers, interrupted snapshot takeover, metadata-aware waiters, localized coverage checkpoints, and hostname-safe language correction.
- [x] Complete one real paid Chinese V3 fail-closed run on `https://shun-express.com/`: ready non-active HTML/private-PDF artifact, all three cards honestly insufficient, atomic failed job and refunded credit, and no customer artifact activation.
- [x] Complete the provider refund and three redirected-email deliveries for order `dee37006-7924-4965-8ef3-181d447f27db` through the protected Preview commerce runner.
- [x] Repair the V3 answer boundary so unqualified but safely retrieved Q1 body evidence can produce a limited answer, reject non-entity search titles, separate six coverage counters, and diversify bounded retrieval candidates. The full deterministic suite, lint, build, staging `db:audit`, customer-PDF surface scan and private-PDF readiness checks pass.
- [x] Deploy the repair to protected Preview `dpl_4EQQpkeqyM1v9zuw7NnR5AhXWw6P`, repoint only the fixed staging alias after Ready, and rebuild only the staging free/deep Worker services from the matching source image. Schema remains v21; production was untouched.
- [x] Implement the paid-acceptance remediation with TDD: stage-specific public-search errors, privacy-safe observation filtering, compact source-driven questions, typed provider failures/probes, truthful payment-return state, and private-report `404` coverage. Full deterministic tests, lint, build and staging `db:audit` pass.
- [x] Align protected Preview `dpl_56sV5LHa7Gb9W95VEVCCbvUtAeuj`, fixed staging alias, staging-only Workers and schema v22 to source revision `fa4cdb28dbc9f877a7ac2c124b66d5cc122e46c7`; production and historical reports remained untouched.
- [x] Fix the public-search probe env regression in `7df74bc` and pass all three real MiMo staging cases using the same merged runtime env as the staging Workers.
- [x] Move the Airwallex/Resend preflight into protected Preview runtime, pass Airwallex retrieval plus redirected Resend delivery, deploy `dpl_GbzJtSVVMESqi1eJdBY64WGgDHkW`, and align staging-only Workers to `995351020966ef9413d39ec6d6d0a989f9289c3c`.
- [x] Create one new Chinese free report and one CNY 199 Airwallex Sandbox order after all pre-order gates passed; prove exactly one signed-Webhook credit/deep job and preserve historical order `d738b38f-63cb-4886-bdda-c8f745bf5b81` unchanged.
- [x] Fix the live V3 artifact failure with TDD: downgrade model-requested `verified` to `limited` unless the cited same-subject evidence spans two independent registrable domains, recompute card status/limitation copy without whole-payload regeneration, and persist exhausted model contract failures as `answer_first_v3_model_contract_invalid`. Full tests, lint, build, Preview deployment, aligned staging Workers and pre-order gates pass.
- [ ] Resolve Sandbox refund `6e2dd3e9-0478-4225-a5e8-1ce976351826` through a sanctioned provider reconciliation path. The internal credit is refunded and all three emails are delivered, but the cash refund is terminal `airwallex_authentication_http_401` and must not be represented as complete.
- [x] Fix `public_source_snapshot_snapshot_materialization` by binding snapshot cache identity to the exact ordered query plan, with deterministic mismatch diagnostics and regression coverage.
- [ ] Resolve Sandbox refund `80ebc58e-3140-4d74-b9bd-f8b265088b83` through a sanctioned provider path. The internal credit is refunded and `db:audit` passes, but the cash refund is terminal `airwallex_authentication_invalid_configuration`.
- [x] Deliver the paid report through the audited zero-charge replacement lineage without reopening its failed job: activate V3 artifact `7ba39ac9-906d-49cc-ac1e-0c70b8f11150`, preserve the original order/refund/credit state, and open the authorized canonical HTML in the browser.
- [x] Activate V3 evidence-refresh artifact `bb05669b-99d1-4ac2-a76d-7625063c5f70` for report `0631932e-72b8-4c6f-b492-820e2533e23e`: three nonblank question cards, one limited answer, two explicit unresolved conclusions, four snapshot refs, 22-page private readiness, and real authorized Chrome acceptance.
- [x] Fix the live refresh state-machine failures: complete exhausted supplemental candidate verification, renew long-running snapshot leases, reuse only exact completed snapshots on network refresh failure, and scope historical-foundation language validation to newly generated presentation content.
- [x] Restore Docker Desktop's Linux engine and prune every container-unreferenced image plus all unused build cache without deleting containers or volumes.
- [ ] Rebuild/recreate only the two staging Worker services from the current revision; they currently run `open-geo-console:replacement`.
- [ ] Reconcile the production free/deep Worker deployment with schema v25 only after explicit production authorization. Their preserved image `028901e0e5e3` rejects the newer database schema and restart-loops; production commerce remains running.
- [ ] Complete a fully answered V3 acceptance on a target with independently retrievable direct public evidence for all three questions; the delivered replacement is correctly limited to one grounded answer and two insufficient-evidence cards.
- [ ] Complete the remaining adaptive public-source acquisition plan. Schema v25 acquisition persistence, typed unknown failures, truthful unresolved delivery, candidate exhaustion, lease renewal, and exact stale-if-error recovery are implemented; address failover, decoding/extraction, adaptive replenishment, and safe browser fallback remain.
- [ ] Complete the remaining desktop/mobile and anonymous-404 visual acceptance. Authorized browser acceptance of the active V3 report is complete.

- [ ] Complete protected-staging acceptance for the grounded three-question presentation in `docs/superpowers/plans/2026-07-14-combined-geo-report-question-answer-presentation.md`. The combined-only answer contract, compact renderer, customer HTML/internal-PDF readiness, schema-v19 refresh lineage and guarded operator command are locally implemented and verified; deployment, artifact activation, Chromium screenshots and runtime evidence remain.
- [x] Keep the commercial SKU `recommendation_forensics_v1` while introducing the canonical artifact contract `combined_geo_report_v1`.
- [x] Bind exactly three editable, purpose-fixed business questions before checkout; require explicit low-confidence acknowledgement and lock the final private/public variants after payment.
- [x] Prevent customer identity and private question text from entering shared snapshots, queries, attempts, observations, or `market_source_evidence`.
- [x] Add schema-v18 correction, question-set, combined-payload and artifact-revision persistence with one correction per order and one active artifact per report.
- [x] Render full technical evidence, public-source forensics, scores, roadmap, vendor tasks, method and limitations from one canonical HTML component; materialize its PDF privately for readiness.
- [x] Route customer HTML sections and private evidence through the active combined revision; remove customer PDF handlers and return application-level `404` for unauthorized or retired routes.
- [x] Complete the real protected-staging correction for order `5f999610-17d5-4df9-9aa0-a6cce5e5b741`: three fresh snapshots, 22 source-evidence rows, ten screenshots, a 19-page internal readiness PDF, atomic activation, one delivered correction email, zero new billing/refund effects, and real Chromium acceptance.

## Provider discovery evidence quality V2

- [x] Add generic/logistics policy selection, two-stage bounded query plans, relevant-passage selection, exact-excerpt claim extraction, deterministic Tier A/B qualification, and candidate rejection reasons.
- [x] Add schema v20 snapshot ancestry plus append-only provider passage/claim persistence, and include its disposable PostgreSQL suites in `test:postgres:staging-security`.
- [x] Integrate prospective `combined_geo_report_v2` jobs, four snapshot refs, recoverable checkpoints, artifact revision/access/email dispatch, staging `evidence_refresh`, canonical customer HTML, and private same-HTML PDF readiness.
- [x] Render Q1 strict suppliers and candidates separately; render Q2/Q3 only from directly relevant source evidence; expose exact excerpts and honest query/retrieval metrics without internal IDs.
- [x] Pass the full deterministic suite (`165` files passed, `17` skipped; `988` tests passed, `38` skipped), lint, production build, focused provider tests, and `git diff --check` on 2026-07-14.
- [ ] Restore staging PostgreSQL responsiveness and configure isolated `OGC_TEST_DATABASE_ADMIN_URL`; rerun the full staging security suite and `db:audit` to obtain authoritative database evidence.
- [ ] Deploy and opt in only protected staging, then complete the live paid logistics, empty-strict-list, recovery, browser/access and private-readiness acceptance in `docs/operations/provider-discovery-v2-acceptance.md`. Keep production on V1 until explicit authorization.

## Public-source recommendation forensics V2 (provider-independent adapter framework; live admission blocked)

- [x] Approve `public_search_source_forensics_v1`, its non-model-attribution boundary, canonical buyer questions, shared market snapshots, customer isolation, freshness, evidence and commercial rules.
- [x] Implement provider-neutral public-search contracts, deterministic fixtures, schema-v13 authorities/snapshots/attempts/observations/evidence/leases/report refs, and surface-neutral evidence graphs.
- [x] Implement `RecommendationForensicReportV2`, exact V1/V2 dispatch, prohibited-claim verification, deterministic cost accounting, report builder and immutable V2 repository.
- [x] Implement V2 Worker orchestration, cache reuse, freshness/refresh rules, resume identity, fail-closed artifact dependency and atomic report/ref/job/credit/order/refund/email terminalization.
- [x] Add version-dispatched customer HTML, private same-HTML PDF readiness, customer-safe coverage/freshness fields, vendor task package, website appendix and pre-terminal artifact gate.
- [x] Drain staging V1 work, verify zero non-terminal V1 rows in staging and production, retire OpenAI/Perplexity from active admission/Worker graphs, and preserve historical V1 read/render contracts.
- [x] Add signed public-search certification artifact/path/install framework with an empty compile-time approved adapter registry; fixtures remain non-installable and admission remains closed.
- [x] Add the compile-time approved registry, independent MiMo configuration/normalization, exact schema-v14 authority identity, redacted probe and signed-certification entry points; runtime remains closed without artifact readiness and an active authority.
- [x] Run protected-staging MiMo capability certification, store an independent Preview signing key, and install its re-signed exact authority inactive. Runtime remains false; explicit activation and commercial drills are separate gates.
- [x] Add an exact-authority V2 snapshot lease/attempt/observation resolver. It records only normalized annotations-derived observations and marks un-fetched sources `not_retrieved`; it is not yet a live Worker collaborator.
- [x] Bind the V2 snapshot resolver to job-bound checkpoint persistence, V2 safe source retrieval, canonical customer HTML, and real private-PDF readiness. The Worker defers report persistence to atomic terminalization and remains fail-closed while runtime is disabled, authority inactive, or a collaborator is absent.
- [x] Make V2 public-source safe retrieval abort the per-request dispatcher at `OGC_JOB_HARD_DEADLINE_MS` rather than waiting for graceful close; focused retriever and PostgreSQL recovery regressions pass. Both controlled staging lanes were rebuilt from reviewed revision `1698f04` before the successful fresh paid V2 drill on 2026-07-14.
- [x] Implement schema-v16 recoverable analysis state: phase/state/progress/commercial separation, checkpoint revisions, phase-local retry/backoff, append-only redacted failure/transition events, `repair_wait`, typed V2 runtime failures, safe customer status, and restricted historical pending-refund recovery. The shared revision/CAS checkpoint writer persists the complete V2 pending artifact before real readiness verification, so artifact repair resumes without re-fetching public sources; schema v17 keeps event history immutable while permitting FK cascade cleanup.
- [ ] Run live protected-staging Worker fault injections for crawl/model/V2/artifact/terminalization recovery. PostgreSQL staging integration now proves source/artifact checkpoint continuation, exact phase events, stale rejection, readiness gating, and no refund/email; live external dependency drills must additionally prove no duplicate evidence/artifact effects.
- [x] Accept one real V2 paid report end to end. Order `5f999610-17d5-4df9-9aa0-a6cce5e5b741` reached `paid/completed/delivered`, job `dd2cff0b-ba16-43b0-aded-55fdc767e656` completed at 100%, credit settled with zero refunds, 3 snapshot refs bound 14 available public evidence rows, protected Chrome rendered the substantive private HTML and internal-readiness PDF, and both transactional emails were delivered.
- [x] Recover and accept the paid Chinese V2 limited path for report `6c13e91a-f836-4f04-b426-4b45807234b7`: reuse the persisted public-source artifact during terminalization, bind evidence against the normalized snapshot cutoff, finish `completed_limited`, complete the CNY 199 Sandbox refund, deliver all three emails, and allow protected operator access to the complimentary HTML without exposing a customer PDF.
- [x] Use an isolated disposable PostgreSQL admin URL to run the schema/V2 suites. The 2026-07-13 market-snapshot suite proves a complete second snapshot for the same fanout and replacement claim after an unexhausted expired running lease (`4/4` tests); this does not substitute for live paid acceptance.
- [ ] Add any free sample only after paid V2 staging acceptance; never market public-search order as AI rank or recommendation.
