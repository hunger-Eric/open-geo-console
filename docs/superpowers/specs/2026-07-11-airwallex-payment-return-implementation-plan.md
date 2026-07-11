# Airwallex Payment Return Implementation Plan

**Design:** `docs/superpowers/specs/2026-07-11-airwallex-payment-return-design.md`  
**Goal:** Ship PaymentIntent/HPP checkout, return to the originating report, and render only PostgreSQL-authoritative payment and fulfillment status.

## Workstream 1: Lock provider and route contracts with tests

1. Update `apps/web/src/payments/gateway.ts` test-facing types from URL-based Payment Link results to HPP launch data: PaymentIntent ID, temporary client secret, currency, and SDK environment.
2. Extend `apps/web/src/payments/airwallex.test.ts` first to require:
   - `POST /api/v1/pa/payment_intents/create`;
   - stable `request_id` and `merchant_order_id`;
   - server-owned amount, currency, return URL, and reconciliation metadata;
   - retrieve-by-ID recovery;
   - lookup-by-merchant-order-ID recovery;
   - Sandbox host enforcement;
   - unchanged signed Webhook parsing.
3. Extend checkout route tests first to require a server-owned absolute return URL and HPP launch response while retaining price, locale, Turnstile, readiness, and order idempotency checks.
4. Replace the generic order-status route test with a report-bound route test that rejects cross-report lookup and projects only customer-safe fields.

## Workstream 2: Implement PaymentIntent/HPP server flow

1. Replace Payment Link create/retrieve/list calls in `apps/web/src/payments/airwallex.ts` with PaymentIntent create/retrieve/list calls.
2. Validate all provider responses, including intent ID, client secret, currency, merchant order ID, status, and metadata. Reject legacy Payment Link IDs before PaymentIntent retrieval.
3. Derive the provider `request_id` deterministically from the Open GEO Console order UUID so ambiguous network retries cannot create a second PaymentIntent.
4. Keep PaymentIntent ID persistence in `provider_checkout_id`; do not add a database column for the client secret.
5. Update `apps/web/src/app/api/reports/[id]/checkout/route.ts` to construct an allowlisted same-origin report return URL from the incoming request and return the HPP launch payload.
6. Preserve existing active-order and provider-recovery behavior while routing legacy Payment Link rows to a safe fresh-checkout error instead of PaymentIntent retrieval.

## Workstream 3: Bind status to report ownership

1. Add a database helper that fetches an order only when both order ID and report ID match.
2. Add `GET /api/reports/[id]/orders/[orderId]/status` with strict ID validation, no-store caching, and the existing safe lifecycle projection.
3. Remove the generic `GET /api/orders/[id]/status` route after all callers and tests move to the report-bound contract.
4. Prove forged order/report combinations return the same generic 404 as missing orders.

## Workstream 4: Implement HPP redirect and return banner

1. Add the official `@airwallex/components-sdk` dependency with npm.
2. In `commercial-checkout.tsx`, dynamically import and initialize the SDK only after a successful checkout API response.
3. Pass `intent_id`, `client_secret`, currency, SDK environment, localized same-report `successUrl`, and `cancelUrl` to `redirectToCheckout()`.
4. Keep checkout errors on the current report and never put the client secret in React state that survives the redirect, local storage, session storage, or logs.
5. Add a focused client payment-return banner that:
   - activates only for a valid-looking order context;
   - queries the report-bound status route;
   - maps persisted payment, fulfillment, refund, and delivery states to customer copy;
   - treats the success/cancel query only as a presentation hint;
   - polls with backoff for about two minutes and pauses while hidden;
   - supports manual refresh after polling stops.
6. Mount the banner once in the localized report workspace so overview and section routes keep the same return context.
7. Add complete Chinese and English dictionary types and copy.

## Workstream 5: Local verification

1. Run focused payment adapter, checkout route, status route, Webhook, database, and i18n tests during implementation.
2. Run `codegraph sync` after code changes and use affected-symbol analysis to catch missed callers.
3. Run the complete acceptance set:

```bash
npm run lint
npm test
npm run build
npm run db:audit
npm run test:postgres:staging-security
```

4. Inspect the final diff for secrets, accidental provider identifiers in public responses, stale Payment Link assumptions, and unrelated user changes.

## Workstream 6: Protected staging and browser acceptance

1. Deploy a Vercel Preview using the existing protected staging configuration.
2. Repoint `open-geo-console-staging-itheheda.vercel.app` to the new Preview deployment.
3. Use the in-app Browser flow:

`localized report -> submit checkout -> Airwallex Sandbox HPP -> cancel or pay -> return to same report -> confirming banner -> signed Webhook-backed queued/generating banner`.

4. Verify page identity, meaningful DOM, no framework overlay, console health, screenshot evidence, desktop and mobile layout, and at least one complete interaction.
5. Separately verify the Sandbox event delivery and PostgreSQL order/job result. A browser return is not accepted as payment proof.
6. Test forged success and cross-report order substitution without exposing another order's state.

## Workstream 7: Publish and close out

1. Update `docs/AI-REPORT-ENGINE.md`, `docs/COMMERCIAL-OPERATIONS.md`, `docs/PROJECT-STATE.md`, `docs/TASKS.md`, and `docs/DECISIONS.md` by editing existing payment-flow facts rather than appending chat history.
2. Run a scoped neat sync across the touched code and documentation.
3. Commit implementation and documentation with a clean worktree.
4. Push the current branch without force.
5. Deploy the accepted code to production without enabling `COMMERCE_MODE=live`.
6. Record any external gate that could not be completed, especially Sandbox payment action, signed provider delivery, or production alias promotion.
