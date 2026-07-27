# Airwallex PaymentIntent / HPP Post-Payment Return Design

**Status:** Implemented and accepted in protected staging on 2026-07-11, including cancel and successful Sandbox HPP returns, forged-return rejection, verified-Webhook authority, paid/queued browser state, and transient status-request recovery.

**Date:** 2026-07-11  
**Status:** Approved
**Scope:** Replace the no-return Airwallex Payment Link checkout with a safe PaymentIntent and Hosted Payment Page flow that returns shoppers to the originating report.

## Goal

After a shopper pays or leaves Airwallex Hosted Payment Page, return them directly to the originating localized report and show a truthful payment and fulfillment banner. Preserve the existing security boundary: only a verified Airwallex Webhook may mark an order paid or create the exactly-once entitlement, deep job, dispatch hint, and confirmation email.

This change does not add accounts, subscriptions, browser-owned payment state, or direct private-report access from the return URL.

## Chosen Approach

Use Airwallex PaymentIntent plus the Airwallex.js Hosted Payment Page integration.

The server creates a fixed-price PaymentIntent from the existing immutable order snapshot. The browser receives only the HPP launch fields needed by the official SDK and redirects to Airwallex. HPP success and cancel navigation both return to the localized originating report. The report reads the order lifecycle from PostgreSQL and never treats a return query parameter, SDK result, or provider retrieval response as payment or entitlement authority.

Payment Links are not retained for new checkout because they do not provide the required integrated return journey. Embedded payment elements and Native API checkout are outside scope because HPP provides the required return behavior with less payment-UI and PCI surface.

## Architecture and Data Flow

1. The shopper submits email, currency, locale, Turnstile proof, and a browser-generated idempotency key from the report page.
2. The checkout route validates the persisted report locale, server catalog price, trusted client identity, Turnstile, commerce readiness, and existing active order rules.
3. PostgreSQL creates or recovers the immutable payment order.
4. The Airwallex adapter creates a PaymentIntent with:
   - the server-owned amount and currency;
   - the Open GEO Console order UUID as `merchant_order_id`;
   - a stable UUID-compatible `request_id` for provider idempotency;
   - report, order, and site metadata for signed-Webhook reconciliation;
   - a return URL on the originating report for payment-method authentication.
5. The adapter persists only the PaymentIntent ID in `provider_checkout_id`. It never persists or logs the PaymentIntent `client_secret`.
6. The checkout response returns a narrowly scoped HPP launch object containing the order ID, PaymentIntent ID, temporary client secret, currency, and `demo` or `prod` SDK environment.
7. The client initializes `@airwallex/components-sdk` and calls `payments.redirectToCheckout()` with the HPP launch object, a success URL, and a cancel URL. Both URLs target the same localized report.
8. On return, the report renders a payment-status banner and queries a report-bound order-status endpoint.
9. The status endpoint reads PostgreSQL only. It does not retrieve or reconcile a provider status and cannot create access, credits, jobs, email, or refunds.
10. The existing raw-body, HMAC-verified Airwallex Webhook remains the only paid transition. Its existing atomic transaction remains the only path that creates the entitlement, credit reservation, deep job, dispatch outbox row, and payment-confirmation email.

Airwallex documents that PaymentIntent creation requires amount, currency, `merchant_order_id`, and an idempotent `request_id`; the response supplies the PaymentIntent ID and temporary client secret. The HPP SDK accepts the intent ID, client secret, currency, success URL, and cancel URL. Airwallex also states that the client return must not be trusted as the payment result.

Official references:

- <https://www.airwallex.com/docs/payments/get-started/using-payments-intent-api>
- <https://www.airwallex.com/docs/js/payments/hosted-payment-page/>
- <https://www.airwallex.com/docs/developer-tools/webhooks/webhooks-overview>

## Return Context and Authorization

The success and cancel URLs include the originating report ID, opaque order UUID, and a return-reason hint. The reason is presentation context only.

The public status API is report-bound rather than a generic order lookup. It verifies that the requested order belongs to the report in the route before returning any state. It exposes only customer-safe lifecycle fields:

- payment status;
- fulfillment status;
- refund status;
- delivery status;
- delivery deadline;
- fulfillment mode.

It does not expose customer email, site key, PaymentIntent ID, client secret, internal access key, internal credit, job ID, provider event identifiers, or private report token.

An arbitrary `payment=success` value never causes a success message. A success return with a PostgreSQL order still in `created` or `pending` renders only "Confirming payment." A cancel return may render "Payment not completed" as a navigation hint, but "Cancelled" is reserved for a trusted persisted cancellation state.

Private report access continues to require the existing scanner-safe email redemption and report-token flow. Returning from HPP does not establish report access.

## PaymentIntent Creation and Recovery

The provider adapter replaces Payment Link operations with PaymentIntent operations while preserving the provider-neutral checkout boundary.

- New checkout calls `POST /api/v1/pa/payment_intents/create`.
- A retried provider request reuses the original stable `request_id`, preventing duplicate PaymentIntents after ambiguous network failures.
- If the database has an attached PaymentIntent ID, the adapter calls Retrieve PaymentIntent and obtains a current HPP launch response.
- If creation succeeded remotely but failed before the local ID was attached, recovery searches PaymentIntents by `merchant_order_id`, verifies the order metadata, rejects multiple matches, and attaches the single matching intent.
- The temporary client secret is treated as browser-visible payment-session material. It is never written to logs, database fields, monitoring payloads, or errors.

Airwallex documents the client secret as valid for 60 minutes and not refreshable or extendable on an existing PaymentIntent. The application therefore does not silently create a second concurrently payable intent for the same order. An expired payment session shows a restart action. Restart first cancels the stale PaymentIntent through the provider workflow; a replacement order is allowed only after the old order has reached a trusted non-payable state. This avoids two simultaneously payable sessions for one report purchase.

Old Payment Link orders remain compatible with existing Webhook and fulfillment processing. Paid old orders continue normally. Unpaid old Payment Links are not transformed into PaymentIntents or reused as HPP sessions.

## Customer-Visible States

The report status banner maps persisted state to customer language:

| Persisted state | Banner | Behavior |
| --- | --- | --- |
| `created` or `pending` | Confirming payment | Poll with backoff; discourage duplicate payment |
| `paid` plus queued fulfillment | Payment confirmed; deep report queued | Show the 24-hour email promise |
| `paid` plus running fulfillment | Payment confirmed; report generating | Continue status polling |
| fulfilled | Deep report completed | Direct the customer to the delivery email; do not grant access from the return |
| `failed` | Payment was not completed | Permit a safe new checkout when order rules allow |
| `cancelled` | Payment cancelled | Permit a safe new checkout when order rules allow |
| refunded | Payment refunded | Explain the refund and delivery outcome |

The banner polls with increasing delay for approximately two minutes, pauses while the document is hidden, and supports an explicit refresh after active polling stops. It must tolerate the normal race in which the browser returns before the Webhook is delivered.

All status copy is localized in Chinese and English. Neither locale describes a successful browser redirect as proof of payment.

## Failure Handling

- A checkout API or SDK initialization failure leaves the shopper on the report with an actionable error and does not create a second PaymentIntent.
- A provider timeout uses the stable request ID and recovery lookup before any retry can create another provider object.
- A missing, expired, malformed, cross-report, or unknown order context hides the commercial status details and returns a generic not-found response.
- An invalid Webhook signature is rejected before JSON processing. Duplicate event IDs remain idempotent, and event ordering is not trusted.
- A return without a Webhook remains `created` or `pending`; it never triggers provider reconciliation that can grant access.
- Provider retrieval is permitted only to reconstruct an HPP session or support an explicit stale-session cancellation workflow. Retrieval cannot mark an order paid or create an entitlement.
- Payment Link records created before this migration are never passed into PaymentIntent retrieval APIs.

## Code Boundaries

Expected implementation surfaces:

- `apps/web/src/payments/gateway.ts`: provider-neutral HPP launch contract.
- `apps/web/src/payments/airwallex.ts`: PaymentIntent create, retrieve, lookup, and existing Webhook/refund behavior.
- `apps/web/src/app/api/reports/[id]/checkout/route.ts`: server-owned return context and HPP response.
- report-bound order-status API route: order/report ownership validation and customer-safe projection.
- `apps/web/src/components/commercial-checkout.tsx`: SDK initialization and HPP redirect.
- a focused payment-return banner component mounted by localized report routes.
- `apps/web/src/i18n.ts`: Chinese and English status and recovery copy.
- package manifests and lockfile: official Airwallex browser SDK.
- focused payment, route, component, and state-projection tests.
- commercial operations, project state, task, and decision documentation.

No crawler, AI report engine, report scoring, private-token redemption, credit settlement, or Queue authority moves into the browser.

## Test Strategy

### Provider adapter

- Creates a PaymentIntent with the server amount, currency, merchant order ID, stable request ID, return URL, and reconciliation metadata.
- Uses the Sandbox host in test commerce and refuses a production override.
- Retrieves an existing PaymentIntent and recovers a single intent by merchant order ID.
- Rejects malformed, missing, mismatched, or multiple provider results.
- Never logs or persists the client secret.
- Continues to parse only signed paid, failed, cancelled, and refund events.

### Checkout and status routes

- Ignore browser amount tampering and preserve immutable report locale.
- Repeated idempotent checkout returns the same order and PaymentIntent.
- Cross-report order status requests return not found.
- Customer-safe status responses exclude provider, email, site, secret, token, key, and internal job fields.
- A forged success return cannot change payment or fulfillment state.
- Payment Link legacy rows cannot enter the PaymentIntent recovery path.

### Webhook and database invariants

- Only a valid signed `payment_intent.succeeded` event creates the exactly-once paid fulfillment transaction.
- Invalid signatures, duplicate events, reordered events, and payload conflicts do not create duplicate credits, jobs, dispatches, emails, refunds, or access.
- Terminal commercial jobs retain the atomic settlement or refund invariant checked by `npm run db:audit`.

### Rendered browser acceptance

The primary flow is:

`localized report -> submit secure checkout -> Airwallex Sandbox HPP -> return to the same report -> confirming state -> signed Webhook state -> queued/generating banner`.

Acceptance covers:

- Chinese and English report routes;
- desktop and mobile viewports;
- HPP cancel return;
- Sandbox successful-payment return;
- the expected Webhook-delay window;
- a forged success query;
- cross-report order substitution;
- page identity, meaningful DOM, framework overlays, console errors, screenshot evidence, and interaction proof.

## Verification and Deployment

Run the repository acceptance commands:

```bash
npm run lint
npm test
npm run build
npm run db:audit
npm run test:postgres:staging-security
```

Then:

1. Deploy to the protected Vercel Preview environment.
2. Repoint the fixed protected staging alias to the new Preview deployment without weakening Vercel Authentication.
3. Exercise real Airwallex Sandbox HPP cancellation and payment return against the isolated staging database.
4. Verify the delayed-Webhook and final queued/generating states in the browser.
5. Confirm the signed Webhook delivery and database outcome separately from the browser return.
6. Commit and push the implementation after local and staging evidence passes.
7. Deploy the accepted code to production without enabling `COMMERCE_MODE=live`; commercial live mode remains gated by the broader payment, refund, email, worker, and SLA drills.

## Acceptance Criteria

- A shopper returns from HPP to the exact localized originating report.
- The report presents truthful payment and fulfillment status without trusting return parameters.
- Signed Webhooks remain the only payment and entitlement authority.
- New checkout uses PaymentIntent/HPP and cannot create duplicate simultaneously payable intents for one order.
- Browser-visible client secrets are temporary and never persisted or logged.
- Cross-report order status access is denied.
- Old Payment Link orders remain safe and do not enter the new HPP recovery path.
- Unit, integration, build, commercial invariant, protected-staging, deployment, and rendered-browser checks pass.
