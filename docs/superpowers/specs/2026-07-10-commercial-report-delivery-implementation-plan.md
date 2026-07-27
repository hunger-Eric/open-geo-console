# Commercial Report Delivery Implementation Plan

## Objective

Ship the approved low-fixed-cost commercial path: Netlify serves the Next.js web/API surface, Neon remains the PostgreSQL authority, Cloudflare provides Turnstile and Queue, Airwallex HK accepts one-time payments, Resend delivers secure report links, and the operator workstation drains paid jobs in `batch_24h` mode. Preserve a clean upgrade path to persistent hosted workers through configuration rather than a rewrite.

## Implementation Status

Implemented and locally verified on 2026-07-10. Live readiness still requires external Netlify/Cloudflare/Airwallex/Resend resources, verified DNS, provider credentials, and the manual payment/refund/email drills in `docs/COMMERCIAL-OPERATIONS.md`.

## Guardrails

- Keep PostgreSQL as the sole authority for orders, payment events, jobs, dispatch, refunds, email delivery, and report access.
- Keep crawling and model calls out of the web process. Only the existing Worker runtime may perform them.
- Treat Cloudflare Queue as a notification channel. A lost or duplicated message must not lose or duplicate a paid report.
- Make every external callback and retry idempotent with durable business keys.
- Never persist or log raw model keys, payment secrets, report-credit keys, report tokens, or unhashed client IPs.
- Preserve the existing dirty worktree and add only scoped changes.
- Default to `COMMERCE_MODE=disabled` and `FULFILLMENT_MODE=batch_24h` until the operator deliberately enables them.

## Workstream 1: Commercial persistence and state machines

1. Add additive PostgreSQL tables for payment orders, payment events, refunds, email deliveries, job dispatch outbox records, and worker presence.
2. Define explicit order, payment, refund, email, and dispatch states with database constraints and monotonic transitions.
3. Add unique business keys for checkout idempotency, provider event IDs, one paid fulfillment per order, refund idempotency, and one email purpose per report/order.
4. Add repository methods that wrap state transitions in transactions and never return provider secrets or raw access tokens.
5. Add deterministic migration, transition, duplicate-event, and audit tests.

## Workstream 2: Queue notification and local batch Workers

1. Add a `JobNotificationQueue` interface with Cloudflare Queue HTTP and local/no-op adapters.
2. Insert a dispatch outbox row in the same transaction that creates a paid job; publish only after commit.
3. Add an outbox dispatcher and reconciliation command that safely retries pending notifications.
4. Add pull-consumer support that treats messages as hints and claims the authoritative PostgreSQL job using the existing lease and `FOR UPDATE SKIP LOCKED` path.
5. Add drain-until-empty commands for free and deep lanes, with configurable process counts and small per-process database pools.
6. Add worker-presence heartbeats and a batch run record so the API can truthfully show queued/batch-processing states.
7. Add Windows Task Scheduler runbooks/scripts for default 10:00 and 20:00 Asia/Shanghai drains without embedding secrets.

## Workstream 3: Free-preview abuse controls

1. Verify Cloudflare Turnstile server-side before accepting a new free diagnosis.
2. Trust client IP headers only when the deployment is explicitly configured behind the trusted edge; hash the normalized IP before persistence.
3. Enforce at most two distinct free sites per hashed IP in a rolling 24-hour window while preserving same-site reuse.
4. Add a transactionally exact global daily AI-preview budget with a default of 50.
5. When the AI budget is exhausted, still return the deterministic technical homepage preview and label AI analysis as temporarily unavailable.
6. Add tests for invalid/replayed Turnstile responses, rolling-window boundaries, concurrency, reuse, and budget exhaustion.

## Workstream 4: Product catalog and Airwallex payment flow

1. Add a server-owned fixed price catalog for CNY, USD, and HKD. The browser may select a supported currency but may never submit an amount.
2. Add a provider-neutral payment gateway interface and an Airwallex hosted-checkout adapter with lazy client initialization.
3. Add checkout creation with normalized email, report/site binding, server-selected price, and durable idempotency.
4. Verify Airwallex webhook signatures from the raw request body and persist each provider event before processing it.
5. In one transaction, convert a successful payment into one paid order, one deep report authorization/credit, one deep job, one dispatch outbox row, and one payment-confirmation email intent.
6. Make repeated checkout requests, webhook deliveries, and recovery runs return the same commercial result.
7. Gate live provider calls behind `COMMERCE_MODE=test|live`; disabled mode must fail closed without exposing configuration details.

## Workstream 5: SLA, limited reports, failures, and refunds

1. Record `paid_at`, delivery deadline, completion time, refund eligibility, and non-billable courtesy status.
2. Map `completed_limited`, terminal failure, and missed 24-hour SLA to a full cash refund intent without double-refunding internal credits.
3. Add a 20-hour alert/reconciliation command and a 24-hour watchdog that requests the full refund exactly once.
4. Keep a refunded late job eligible for courtesy completion while preventing a second charge or settlement.
5. Add provider-neutral refund handling, Airwallex refund calls, webhook reconciliation, and operator-visible failure reasons.
6. Test deadline boundaries, crashes between provider and database updates, duplicate refund events, and courtesy completion.

## Workstream 6: Resend delivery and secure report access

1. Add a lazy Resend adapter and React Email templates for payment confirmation, report ready, refund confirmation, and link reissue.
2. Persist a permanent application-level email idempotency record; use Resend's idempotency header only as an additional 24-hour guard.
3. Verify Resend webhooks and track delivered, bounced, complained, and suppressed states with duplicate-event tolerance.
4. Change report email links so `GET` only renders a confirmation page and never consumes the one-time token.
5. Redeem the token only through an explicit human `POST`, then set the report cookie and redirect.
6. Add link-reissue flow with rate limiting and token rotation without changing report ownership.
7. Keep links valid for seven days, report cookies for thirty days, and paid report records for twelve months unless a stricter configured policy applies.

## Workstream 7: Commercial report UX

1. Replace infrastructure language with the customer-facing offer: AI Search Visibility Audit / AI 搜索可见性深度诊断.
2. Show the paid scope beside the free preview: full-site evidence, prioritized fixes, and a 90-day roadmap.
3. Add the “Unlock full-site analysis” checkout flow with email, supported currency, fixed price, and provider-hosted payment redirect.
4. Show distinct states for awaiting payment, queued for the next batch, processing, report ready, refunded, and action required.
5. Display the 24-hour delivery/full-refund promise before payment and in confirmation email copy.
6. Keep Chinese and English copy synchronized and accessible on narrow screens.

## Workstream 8: Deployment and operator controls

1. Add Netlify build/runtime configuration compatible with the existing npm-workspace Next.js app.
2. Document the Netlify, Neon, Cloudflare, Airwallex, and Resend environment-variable ownership without checking in secrets.
3. Add health checks that distinguish web availability, database authority, provider configuration, queue dispatch, and recent worker presence.
4. Add operator commands for outbox reconciliation, batch drain, SLA audit, refund reconciliation, and email retry.
5. Keep `FULFILLMENT_MODE=realtime` compatible with the same job and dispatch records so a future persistent Worker deployment is operational rather than architectural work.

## Integration Sequence

1. Land additive schema/repositories first.
2. Land queue and batch Worker primitives against those repository contracts.
3. Land secure access and email delivery.
4. Land catalog, checkout, payment webhooks, and refund orchestration.
5. Land abuse controls and commercial UI.
6. Add deployment/operator configuration and run full verification.

## Verification

1. Run targeted state-machine, route, provider-adapter, webhook, queue, email, access-token, and SLA tests.
2. Run `codegraph sync`, `npm run lint`, `npm test`, `npm run build`, and `npm run db:audit` against a disposable PostgreSQL database when available.
3. Verify duplicate Airwallex/Resend/Queue events do not create duplicate jobs, refunds, emails, or report access.
4. Verify a stopped workstation leaves paid jobs durable and the next drain resumes them.
5. Verify the public report and status API never expose private deep payloads, raw tokens, provider secrets, emails, or unhashed IPs.
6. Exercise one, two, and four deep Worker processes with representative mocked and live workloads; choose the production default from measured memory, API throttling, database connections, and completion time.
7. Browser-test Chinese and English flows from free preview through checkout return, batch status, email redemption confirmation, report access, refund, and link reissue.
8. Record external manual gates separately: DNS/domain verification, provider sandbox credentials, Airwallex account approval, Cloudflare resources, and a real payment/refund.

## Acceptance Criteria

- A paid checkout amount is selected only from the server catalog and cannot be tampered with from the browser.
- One successful provider payment produces exactly one paid deep job even under repeated webhooks and retries.
- Paid work remains recoverable in PostgreSQL when Cloudflare Queue, Netlify, or the operator workstation is temporarily unavailable.
- The local workstation can drain multiple deep jobs concurrently without duplicate claims or excess database pools.
- The customer receives a secure report link by email and an automated full refund when the report is limited, terminally failed, or not delivered within 24 hours.
- Email security scanners cannot consume report access because `GET` never redeems the token.
- Free usage is protected by Turnstile, rolling IP/site limits, and a global AI budget with deterministic technical fallback.
- `COMMERCE_MODE=disabled` is safe by default, while test/live modes fail closed when required provider configuration is absent.
- Netlify/Neon/Cloudflare/Resend free tiers can operate the initial low-volume path with no mandatory monthly server rental; variable provider/model/payment fees remain usage-based.
- Lint, tests, production build, audits, and scoped browser QA pass; live provider approval and DNS steps are explicitly identified rather than simulated.
