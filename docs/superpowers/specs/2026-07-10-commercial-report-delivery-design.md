# Commercial Report Delivery and Queue Dispatch Design

**Status:** Approved in product review on 2026-07-10
**Scope:** One-time deep-report purchase, Cloudflare Queue notification, payment, refund, email delivery, private report access, abuse controls, capacity, and commercial rollout

## Context

Open GEO Console already has the durable core needed for a commercial report product:

- PostgreSQL report and job authority;
- independent single-concurrency free and deep Worker lanes;
- leases, heartbeats, resumable checkpoints, and terminal recovery;
- report credits, a credit ledger, HMAC-only access Keys, and report-specific access tokens;
- a free homepage report and a private deep-report bundle;
- atomic commercial job terminalization and credit settlement or refund.

The current Workers poll PostgreSQL while idle. Production acceptance Workers run temporarily on a workstation. Payments, customer email delivery, automated cash refunds, and live commercial readiness do not exist yet.

This design adds those capabilities without moving report authority out of PostgreSQL and without adding accounts or subscriptions.

## Relationship to Earlier Decisions

This specification intentionally supersedes three earlier phase boundaries:

- payment and email are no longer out of scope;
- the anonymous distinct-site limit changes from three sites per day to two sites per rolling 24 hours;
- the earlier choice not to maintain a Worker registry is narrowed: commercial operation adds an ephemeral `worker_presence` heartbeat table solely for availability and checkout safety. Queue order, job state, leases, and recovery remain authoritative in `scan_jobs`, and no Worker identity is exposed publicly.

## Product Positioning

The commercial product is not presented as a technical “Deep Job.” Its customer-facing name and promise are:

- Chinese: **AI 搜索可见性深度诊断**
- English: **AI Search Visibility Audit**
- Promise: identify the site-wide structural and content problems that make a website harder for AI search systems to understand or cite, then provide evidence-backed fixes in priority order and a 90-day roadmap.

The free report proves that a problem exists. The paid report explains:

- where the site-wide problems are;
- why each problem matters;
- what evidence supports it;
- how to fix it;
- what to fix first;
- what to execute over the next 90 days.

AI Bot access evidence remains an advanced report capability. It is not the primary purchase promise and never changes the GEO score.

## Goals

1. Let a customer buy one private deep report from an existing free report without creating an account.
2. Support mainland Chinese and international customers through a Hong Kong merchant setup.
3. Accept cards and relevant local wallets through a provider-neutral payment boundary.
4. Start free and deep jobs without high-frequency idle polling of Neon.
5. Guarantee that a successful payment reaches exactly one report fulfillment flow.
6. Deliver completed reports by secure email link and downloadable PDF.
7. Automatically return cash when a paid report cannot meet the paid coverage standard.
8. Preserve the existing PostgreSQL authority, Worker checkpoints, evidence verification, privacy boundaries, and free/deep lane isolation.
9. Keep the zero-cost validation deployment separate from the live commercial deployment.

## Non-goals

- Accounts, teams, organizations, or a personal report center.
- Subscriptions, recurring billing, credit packs, coupons, discount codes, or dynamic pricing.
- A generic “buy now and choose a website later” purchase flow.
- Moving report payloads, credit state, order state, or refund authority into Cloudflare Queue, KV, or D1.
- Rewriting crawling or model execution for Cloudflare Workers.
- Automatically deciding Hong Kong tax, statutory invoice, or accounting policy. Those policies must be approved with the merchant's Hong Kong accounting adviser before live commerce.

## Experience Contract

The customer journey is:

```text
Submit website
  -> free homepage diagnosis
  -> see the score and one verified AI finding
  -> see the paid scope and refund promise
  -> choose “Unlock full-site analysis”
  -> choose currency and enter email
  -> complete localized hosted checkout
  -> return to a live report progress page
  -> receive the private report by email
  -> open the report and download PDF
```

The purchase surface shows, before asking for payment:

- paid report deliverables;
- estimated page coverage;
- the six AI dimensions;
- evidence citation behavior;
- the 90-day roadmap;
- expected delivery range;
- the full-refund rule;
- “one-time payment, no automatic renewal.”

The UI never exposes Queue, Worker, Neon, Outbox, lease, checkpoint, credit Key, Airwallex routing, or Stripe routing terminology. Customer-visible states remain waiting, generating, completed, completed with refund, unavailable, email sent, and refunded.

## Product and Price Catalog

The initial catalog contains one product:

```text
productCode: deep_report_v1
purchaseType: one_time
reportTier: deep
quantity: 1
boundResource: existing free report and registrable site
```

The server owns a versioned fixed-price catalog for CNY, USD, and HKD. Chinese UI defaults to CNY, English UI defaults to USD, and customers may switch currencies. IP location is never the only currency selector.

Prices are independent fixed local prices, not real-time FX conversions. The server creates an immutable order snapshot containing:

- product code and catalog version;
- currency and amount;
- report ID and site key;
- report locale;
- refund policy version;
- purchase terms version.

The browser never supplies an authoritative amount. Historical orders retain their original price and terms after the catalog changes.

## Payment Provider Boundary

### Provider choice

The launch provider is **Airwallex Hong Kong**. It provides hosted checkout and the required mix of global cards, Apple Pay, Google Pay, UnionPay, Alipay, AlipayHK, and WeChat Pay subject to merchant approval.

Stripe is a reserved second adapter, not a second active launch integration. Adding it later must not change order, credit, report, refund, or email domain models.

Live commerce requires an approved Hong Kong merchant entity and settlement account. A Hong Kong bank card alone is not treated as sufficient merchant readiness.

### Interface

Payment code depends on a narrow `PaymentGateway` contract:

```text
createHostedCheckout(orderSnapshot)
verifyWebhook(rawBody, headers)
parseWebhook(verifiedPayload)
requestRefund(order, amount, reason, idempotencyKey)
getPaymentStatus(providerPaymentId)
getRefundStatus(providerRefundId)
```

Provider-specific objects do not leak into report or credit services.

### Hosted checkout

Open GEO Console never handles card or wallet credentials. It creates a hosted checkout from a server-owned order and redirects the customer. The return URL is a navigation convenience only. It cannot mark an order paid.

Only a verified provider Webhook can move `paymentStatus` to `paid`.

## Commercial Data Model

The implementation adds or extends these PostgreSQL authorities:

### `payment_orders`

- internal order ID;
- provider and provider payment ID;
- report ID and site key;
- encrypted normalized customer email plus an HMAC lookup value;
- product, catalog, terms, and refund-policy versions;
- currency, amount, and optional tax fields;
- independent payment, fulfillment, refund, and delivery states;
- created, paid, fulfilled, refunded, and updated timestamps.

Provider payment ID is unique when present. One report may have at most one active paid order for `deep_report_v1`.

### `payment_events`

- provider event ID as a unique key;
- provider and normalized event type;
- associated order ID when resolved;
- provider creation time and receipt time;
- processing outcome and sanitized error code;
- a payload hash and selected non-secret fields, not an unbounded raw event archive.

### `payment_refunds`

- order ID and provider refund ID;
- reason: `completed_limited`, `report_failed`, or `operator_approved`;
- amount and currency;
- `pending`, `submitted`, `succeeded`, or `failed` state;
- idempotency key, attempts, next retry time, and sanitized failure code.

### `job_dispatch_outbox`

- dispatch ID;
- source job ID and tier;
- schema version;
- `pending`, `published`, or `abandoned` state;
- attempts, next attempt time, and published time.

### `email_deliveries`

- order ID, report ID, template type, locale, and recipient reference;
- provider and provider email ID;
- permanent business idempotency key;
- `queued`, `sent`, `delivered`, `bounced`, or `failed` state;
- attempts, next retry time, and sanitized failure code.

### `worker_presence`

- opaque instance ID, tier, deployment version, and last heartbeat;
- no URLs, emails, model keys, report access tokens, or customer data.

Presence is operational evidence only. It does not become task authority. Public APIs expose at most whether the required tier is available.

## Payment Fulfillment Transaction

The verified successful-payment Webhook runs an idempotent PostgreSQL transaction that:

1. inserts or acknowledges the unique provider event;
2. moves the order to paid exactly once;
3. creates an internal one-credit purchase entitlement linked to the order;
4. immediately reserves that credit for the bound report;
5. creates one deep job in the report's immutable locale;
6. creates a deep `job_dispatch_outbox` row;
7. queues one payment-confirmation email delivery.

The internal access Key is not shown to the customer. It reuses the existing credit ledger and commercial terminalization boundary without introducing an account balance.

Duplicate, delayed, and out-of-order Webhooks cannot create a second credit, job, email, or refund. The browser success page polls server order state and never trusts query-string success markers.

## Payment and Fulfillment States

State dimensions remain independent:

```text
paymentStatus:
created -> pending -> paid | failed | cancelled

fulfillmentStatus:
not_started -> queued -> processing
  -> completed | completed_limited | failed

refundStatus:
not_required -> pending -> submitted -> refunded | failed

deliveryStatus:
not_queued -> queued -> sent -> delivered | bounced | failed
```

Transitions are monotonic except for explicit retry metadata. Provider event order cannot move a terminal state backward.

## Paid Terminal Outcomes and Cash Refunds

### `completed`

- settle the reserved credit;
- retain the payment;
- create private report access;
- queue the completed-report email;
- mark fulfillment completed.

### `completed_limited`

- preserve and deliver the useful limited report;
- refund the internal reserved credit;
- atomically create a full cash-refund request;
- queue a “limited report and full refund” email;
- update final refund state only from provider confirmation.

### `failed`

- refund the internal reserved credit;
- atomically create a full cash-refund request;
- queue a failure and refund-status email;
- retain checkpoints and sanitized failure evidence for operations.

A refund API timeout never becomes `refunded`. It remains pending or failed, retries with the same idempotency key, and raises an operator alert. The provider's refund Webhook is the final cash-refund authority.

Email failure does not refund a successfully generated report. Delivery retries independently, and the payment return page can still grant access.

## Email Delivery

### Provider boundary

Resend is the launch provider behind an `EmailGateway` contract. Postmark or AWS SES may be added later without changing order or delivery state.

The sending domain uses an isolated subdomain with SPF, DKIM, and DMARC. Templates are versioned and localized.

### Email sequence

1. **Payment confirmed:** order reference, site, product, payment status, and expected delivery range.
2. **Report ready:** outcome summary, secure report redemption link, retention notice, and PDF availability.
3. **Limited report and refund:** limited-report link, full-refund initiation, and refund tracking statement.
4. **Report failed and refund:** failure statement without internal diagnostics and refund status.
5. **Refund completed or refund assistance required:** final provider outcome.

Each delivery has a permanent business idempotency key such as `report_ready/<orderId>/<templateVersion>`. Provider idempotency is an additional short-term safeguard, not the permanent authority.

Resend Webhooks are verified and deduplicated by event ID. Delivery events may be duplicated or arrive out of order; state transitions use provider event time and never regress a terminal delivery state.

Temporary failures retry with bounded exponential delays. Permanent bounces stop automatic retries. The payment result page lets the buyer correct the email through an order-bound secret flow.

## Private Report Access and Retention

- Paid reports are retained for 12 months from paid completion.
- The report page offers PDF download; the email does not attach the PDF.
- Email redemption links expire after 7 days.
- A redeemed report cookie lasts 30 days and remains report-specific.
- Customers can request a new link using the order reference and original purchase email.
- Link-reissue responses are generic so the endpoint cannot enumerate customer emails or orders.
- Reissue is protected by Turnstile and rate limits and invalidates earlier unredeemed tokens.

Email scanners must not consume a report token. A link `GET` validates and renders an “Open report” confirmation page without consuming the token. A human-initiated `POST` redeems it, stores the HMAC-backed report cookie, consumes the token, and redirects to a URL without token material.

Raw access tokens are never persisted or logged.

## Cloudflare Queue Notification Design

### Queue role

Cloudflare Queue is a notification and buffering adapter, not task authority. Two queues preserve lane isolation:

- `free-jobs`
- `deep-jobs`

Messages contain only:

```json
{
  "version": 1,
  "dispatchId": "opaque-id",
  "tier": "free"
}
```

They do not contain a URL, email, payment ID, order ID, report content, API key, or access token.

### Transactional Outbox

Every job-creating PostgreSQL transaction also creates a `job_dispatch_outbox` row. After commit, the Web or Webhook process attempts to publish the notification and marks the row published. A timeout after publish may cause a duplicate message; it cannot create a duplicate job.

Workers pull the appropriate Cloudflare Queue at a configurable interval with a 30-second normal-start target. A notification wakes the lane, and the Worker uses the existing PostgreSQL FIFO claim. When no job is eligible, the duplicate or stale notification is acknowledged harmlessly.

### Recovery

- Worker startup performs one PostgreSQL recovery scan before waiting on Queue.
- Existing 90-second leases and 30-second heartbeats remain the processing recovery authority.
- One process per lane acquires an advisory lock and reconciles unpublished, queued, or expired-lease work every 30 minutes.
- A published message that expires can be recreated from PostgreSQL.
- Queue outage leaves durable jobs and Outbox rows intact.
- Queue duplication cannot duplicate credit reservation, crawl work, terminal writes, refunds, or email delivery.

When an ordinary Queue-pull Worker is online, healthy work should start within 30 seconds. Exceptional publish failure may wait up to the 30-minute reconciliation window. In `batch_24h` mode while the workstation is offline, PostgreSQL retains the task until the next scheduled drain instead of pretending that real-time capacity exists.

## Abuse and Cost Controls

Controls execute before any model call and, where possible, before technical network work:

1. Cloudflare WAF and Bot Fight Mode provide broad edge protection.
2. Turnstile is mandatory on anonymous scan and link-reissue forms; tokens are verified server-side.
3. PostgreSQL performs exact quota accounting.
4. Same-site free reports are reused for 30 days.
5. A HMAC client IP may create free previews for at most two distinct sites per rolling 24 hours.
6. The default global free AI budget is 50 new AI previews per UTC day and is configurable.
7. Free and paid queues remain isolated.
8. Checkout is rate-limited by order, email HMAC, IP HMAC, and report.
9. Webhook endpoints use signature verification, event deduplication, and body-size limits rather than Turnstile.

When the global free AI budget is exhausted, Open GEO Console still returns the deterministic homepage technical report and GEO score. It skips the free model call, explains that the daily AI preview quota is exhausted, and keeps the paid deep-report option available. Paid work is never charged against the free budget.

## Capacity and Worker Scaling

Each process continues to run one job at a time. Horizontal replicas provide concurrency safely through PostgreSQL row locking and leases.

Initial low-volume batch deployment:

```text
free Worker replicas: 1
deep Worker replicas: 1
delivery promise: within 24 hours
```

The current i7-11800H, 32 GB workstation is sufficient for the expected one or two paid reports per day. A future higher-performance local machine may run additional single-job deep Worker processes, but process count remains explicit and bounded. CPU capacity does not override model-provider rate limits, local memory pressure, or the per-site crawl safety policy.

Add a second deep replica when any condition persists:

- oldest paid queued job exceeds 10 minutes;
- paid volume exceeds 20 reports per day;
- deep Worker utilization exceeds 60% over 24 hours.

At approximately 50 paid deep reports per day, plan for two to three deep replicas and verify model-provider rate limits and token budget separately.

Worker presence heartbeats support commerce health. Real-time checkout stops accepting new live payments after the deep tier has no healthy heartbeat for 10 minutes. Batch checkout instead uses the most recent successful drain, the next scheduled batch window, and the oldest paid job age. Payment refund or email delivery incidents pause checkout in either mode. Existing paid jobs remain recoverable.

## Deployment Modes

```text
COMMERCE_MODE=disabled | test | live
FULFILLMENT_MODE=batch_24h | realtime
```

### Free validation

- Cloudflare Free for DNS, Turnstile, WAF, and Queue;
- Vercel Hobby for non-commercial validation;
- Neon Free;
- workstation free and deep Workers;
- Airwallex Sandbox;
- email test mode;
- `COMMERCE_MODE=test`.

No real payment is accepted. Workstation downtime may delay tasks.

### Zero-fixed-cost commercial batch launch

`COMMERCE_MODE=live` and `FULFILLMENT_MODE=batch_24h` permit a workstation to fulfill a small number of real orders when the customer-facing purchase surface promises delivery within 24 hours.

The default fixed-cost infrastructure is:

- Cloudflare Free for DNS, Turnstile, WAF, Queue, and an hourly deadline trigger;
- Netlify Free as the commercial-compatible Next.js Web and short-API target, subject to a complete build, route, Webhook, and credit-usage canary before DNS cutover;
- Neon Free while compute and storage remain within measured allowances;
- one local free Worker and one local deep Worker;
- Resend Free while message volume remains within allowance;
- Airwallex Explore with transaction fees but no infrastructure subscription.

Vercel Hobby remains valid only for non-commercial validation. It is not the Web origin for live orders.

The workstation uses a batch supervisor rather than relying on an interactive terminal:

- Windows starts a drain run at two configurable daily windows, initially 10:00 and 20:00 Asia/Shanghai;
- `worker:drain:free` and `worker:drain:deep` recover expired leases, process eligible work until the lane is empty, perform Outbox reconciliation, record a successful drain, and exit;
- when the workstation remains online, the ordinary Queue-pull Workers may continue to provide faster delivery;
- sleep is disabled during a drain, unexpected process exit is restarted, and no inbound port is opened;
- disk encryption, a dedicated restricted OS account, protected local secrets, stable outbound network access, and automatic security updates are commercial requirements.

Cloudflare Queue message expiry does not lose work. Every drain starts from PostgreSQL authority and republishes or directly claims durable jobs whose notification expired while the workstation was offline.

An hourly signed deadline check runs independently of the workstation:

- at 20 hours, an unfinished paid order is marked at risk and alerts the operator;
- at 24 hours, the order receives a full cash-refund request, its internal reservation is refunded, and the job becomes non-billable courtesy work;
- checkout pauses while any paid order is overdue or the most recent successful drain is older than 24 hours;
- if the report completes after the refund, it may still be delivered as a courtesy and cannot settle or charge a second time.

This mode has no uptime or instant-delivery claim. The explicit product promise is “delivered by email within 24 hours or fully refunded.”

Before batch live mode:

- the Hong Kong merchant and settlement setup is approved;
- Airwallex Live and required payment methods are enabled;
- Netlify compatibility and usage canaries pass;
- at least three consecutive scheduled drain rehearsals complete successfully;
- the hourly deadline and automatic-refund drill passes;
- the PostgreSQL, Queue, email, payment, and report-access checks below pass.

### Real-time commercial launch

`FULFILLMENT_MODE=realtime` replaces the batch promise only after:

- the Hong Kong merchant and settlement setup is approved;
- Airwallex Live and required payment methods are enabled;
- the Web runs on a commercial-compatible plan;
- free and deep Workers run on a persistent service such as Railway;
- the PostgreSQL plan has adequate compute, storage, restore, and log retention;
- the Resend domain is verified;
- payment, refund, and email Webhooks are registered and verified;
- one real low-value payment and refund canary succeeds;
- duplicate Webhook, Queue failure, Worker crash, email bounce, and refund-failure drills pass;
- the commercial database audit reports no invariant violations.

The workstation may remain a development or overflow runner in real-time mode, but it is not counted as the required persistent paid capacity.

## Security and Privacy

- Hosted checkout keeps card and wallet credentials outside Open GEO Console.
- Provider secrets are environment-only, least-privilege, and separately scoped for test and live.
- Customer email is encrypted for retrieval and HMAC-indexed for exact lookup; it is never logged. Email encryption, email lookup HMAC, client IP HMAC, payment Webhook, and report-token secrets use separate keys.
- Client IP remains HMAC-only.
- Queue messages and operational logs exclude customer URLs where not operationally required and exclude all payment and access secrets.
- Webhook signatures are verified against the raw request body before JSON is trusted.
- Webhook payloads are bounded and sanitized; only selected fields and a payload hash are retained.
- Payment, refund, email, credit, job, and report terminal writes are idempotent.
- Report locale remains immutable artifact state.
- Private deep payloads never replace or leak into the public free report.

### Trusted edge identity

Anonymous quotas must not trust an arbitrary browser-supplied forwarding header. Cloudflare strips any incoming internal edge header and adds a deployment secret when proxying public application traffic. The Web origin accepts `CF-Connecting-IP` for scan and link-reissue quotas only when that internal edge secret is valid. Direct requests to a Netlify or Vercel origin cannot use anonymous scan, checkout, or link-reissue routes. Provider Webhook routes are exempt from the edge secret but require their own raw-body signatures. The edge secret is never returned to the browser or written to logs.

## Observability and Operational Controls

Track at minimum:

- checkout creation and payment conversion by currency and method;
- verified, duplicate, rejected, and delayed payment Webhooks;
- Queue publish latency, pending Outbox rows, backlog, and oldest message;
- job queue age and job duration by tier;
- model calls, tokens, and estimated cost by free versus paid tier;
- completed, completed-limited, failed, and refund rates;
- pending and failed cash refunds;
- email sent, delivered, bounced, and failed rates;
- report-link redemption and reissue rates;
- healthy Worker presence by tier;
- last successful drain, next scheduled drain, paid SLA age, and overdue paid orders;
- Netlify credit usage in batch mode;
- Neon compute and storage usage.

Immediate alerts:

- any failed cash refund;
- a paid order with no deep job after five minutes;
- a paid terminal job with an inconsistent credit or refund state;
- no healthy deep Worker for ten minutes in real-time mode;
- no successful local drain for 20 hours in batch mode;
- any batch order reaching 20 hours without a terminal report;
- any batch order reaching the 24-hour automatic-refund boundary;
- oldest paid queued job over ten minutes;
- payment or email Webhook signature failure spikes;
- paid email bounce or permanent delivery failure.

An operator may pause checkout, pause free AI, change the free daily budget, republish Outbox work, retry email, request an approved refund, and inspect sanitized order history. Operator actions require explicit audit records.

## Failure Matrix

| Failure | Durable state | Recovery |
|---|---|---|
| Browser closes after payment | Provider plus pending order | Webhook completes fulfillment; email delivers access |
| Return URL claims success without payment | Order remains pending | Server polling shows authoritative state |
| Duplicate payment Webhook | Unique event and order constraints | Acknowledge without duplicate credit or job |
| PostgreSQL commit succeeds but Queue publish fails | Job plus pending Outbox | Retry and 30-minute reconciliation |
| Queue sends duplicates | One PostgreSQL job | Extra signal finds no eligible job and is acknowledged |
| Worker crashes | Lease, checkpoint, and durable job | Startup recovery or lease-expiry reconciliation |
| Queue message expires | PostgreSQL job remains | Republish from Outbox/reconciliation |
| Report completes limited | Limited report plus refund request | Deliver report and confirm full provider refund |
| Refund API times out | Refund remains pending | Retry with same idempotency key |
| Email API times out | Delivery remains queued/sent-unknown | Retry with permanent business idempotency |
| Email scanner opens link | Token remains unused | Human POST performs redemption |
| Buyer loses link | Order and encrypted email remain | Rate-limited link reissue |
| Local workstation is offline at a batch window | Paid work remains in PostgreSQL | Alert, retry the drain, and preserve the 24-hour deadline |
| Batch order reaches 20 hours | Order becomes SLA-at-risk | Alert operator and prioritize the next drain |
| Batch order reaches 24 hours | Order, job, and reserved credit remain durable | Refund cash and internal credit, convert the job to courtesy work, and pause checkout |
| Deep Worker unavailable in real-time mode | Paid work remains queued | Pause new checkout after health threshold; alert and recover |

## Verification

### Deterministic tests

- price catalog selection and immutable order snapshots;
- payment gateway contract fixtures;
- raw-body Webhook signature rejection;
- duplicate and out-of-order payment events;
- exactly-one credit, deep job, Queue Outbox row, and confirmation email per paid order;
- paid return page without a successful Webhook;
- Queue publish timeout and duplicate message handling;
- FIFO preservation and multi-replica row locking;
- Worker crash after notification acknowledgment;
- global free budget and per-IP/site reuse concurrency;
- `completed`, `completed_limited`, and `failed` cash outcomes;
- refund timeout, duplicate refund event, and refund failure alerts;
- email retry, duplicate Webhook, bounce, and out-of-order delivery events;
- GET-does-not-consume and POST-does-consume report-link behavior;
- report retention and link reissue authorization;
- commerce mode, fulfillment mode, scheduled-drain, and Worker-health checkout gates;
- drain-until-empty behavior and expired Queue notification recovery;
- 20-hour SLA warning and exactly-once 24-hour automatic refund;
- SLA-refunded jobs becoming non-billable courtesy work without a second settlement;
- privacy assertions for logs, Queue bodies, and stored hashes.

### Sandbox and live canaries

1. Airwallex Sandbox checkout through representative card and wallet flows available to the approved account.
2. Verified payment Webhook with the browser return intentionally omitted.
3. Duplicate replay of the same provider event.
4. Deep report completion and exactly-one localized email.
5. Forced `completed_limited` and failed outcomes with full refund processing.
6. Queue publish interruption followed by reconciliation.
7. Worker termination during analysis followed by checkpoint recovery.
8. Resend delivered, bounced, and retry fixtures.
9. One controlled live low-value payment and full refund before public launch.
10. Three consecutive scheduled workstation drains followed by one intentionally missed batch and SLA recovery drill.

### Acceptance targets

- real-time mode starts healthy Queue work within 30 seconds;
- exceptional missed notification recovers within 30 minutes;
- batch mode completes paid reports within 24 hours or creates exactly one full refund;
- a successful batch drain processes all eligible work, records its completion, and exits without idle database polling;
- one provider payment creates exactly one paid entitlement and one deep job;
- a paid terminal outcome never leaves a reserved credit;
- limited and failed paid outcomes create exactly one full cash refund;
- a completed paid report queues exactly one report-ready email;
- free work never delays an eligible paid claim;
- no raw payment secret, model key, report token, customer email, or unhashed IP appears in logs;
- `npm run lint`, `npm test`, `npm run build`, and the extended commercial database audit pass.

## Implementation Sequence

This design should be implemented as bounded phases:

1. **Commercial foundation:** product catalog, order schema, provider contracts, event deduplication, commerce mode, and audit invariants.
2. **Queue notification:** Cloudflare Queue adapters, job Outbox, Worker pull mode, startup recovery, and reconciliation.
3. **Abuse controls:** Turnstile, two-sites-per-IP quota, global free AI budget, and technical-only fallback.
4. **Payment Sandbox:** Airwallex hosted checkout, signed Webhooks, internal one-credit entitlement, and paid deep-job creation.
5. **Refunds:** provider refund adapter, refund Outbox/state, limited/failed cash mapping, and operator alerts.
6. **Email and access:** Resend adapter, delivery state, templates, safe link redemption, reissue, retention, and PDF handoff.
7. **Batch commercial operations:** drain commands, Windows scheduling, SLA watchdog, courtesy conversion, Netlify canary, checkout health gates, dashboards, runbooks, and live canary.
8. **Real-time upgrade:** persistent Worker deployment, short-SLA health gates, and replica scaling when revenue justifies fixed hosting.

Each phase receives deterministic tests before the next phase starts. Live payment remains disabled until the selected fulfillment mode's commercial readiness gate passes.
