# Active Change Scope Lock

Status: `APPROVED`

## Objective

Implement Stripe Sandbox refund submission so pending Stripe refund rows can
be submitted by the Commerce refund consumer:

1. `StripeGateway.requestRefund` creates a Stripe Refund against the order's
   PaymentIntent with the persisted idempotency key, mapping Stripe refund
   statuses onto the existing `RefundResult` contract.
2. `processPendingCommercialRefunds` dispatches each claimed refund to the
   gateway matching its order's provider (`stripe` or `airwallex`) instead of
   the hard-bound Airwallex gateway.

## Confirmed baseline

- `apps/web/src/payments/stripe.ts:131` throws `invalid_configuration` by
  design; the sandbox-only cutover documented refunds as unimplemented.
- `apps/web/src/commerce/operations.ts:115` constructs one `AirwallexGateway`
  and `submitRefund` (line 134) throws `commercial_refund_payment_unavailable`
  for any non-airwallex order.
- Stripe SDK `refunds.create` accepts `payment_intent`, `amount`, `reason`
  (enum: `duplicate` / `fraudulent` / `requested_by_customer`), `metadata`,
  and a request `idempotencyKey`; refund `status` is one of `succeeded`,
  `pending`, `failed`, `canceled`.
- `RefundResult.status` contract: `pending | submitted | succeeded | failed`;
  `submitRefund` throws on `failed`, marks succeeded on `succeeded`, and
  leaves the row submitted otherwise.
- `requiredStripeTestKey` already fails closed for missing, non-`sk_test_`,
  or non-test-commerce keys; `assertCommerceEnabled` gates the mode.
- Stripe test card refunds normally return `succeeded` immediately; a
  `pending` response maps to `submitted`.
- Staging refund row `69202f81-e7cb-4d2b-a5c6-89ef44a3318a` (order
  `7234ce15-...`, provider `stripe`, state `pending`) exists and will be
  picked up by the consumer only after this code is deployed; this scope does
  not touch it.

## Allowed production files

- `apps/web/src/payments/stripe.ts`
- `apps/web/src/commerce/operations.ts`

## Allowed verification files

- `apps/web/src/payments/stripe.test.ts`
- `apps/web/src/commerce/operations.test.ts`

## Scope file

- `docs/ACTIVE-CHANGE-SCOPE.md`

## Forbidden subsystems and actions

- No live Stripe key, live refund, or production action; test-mode fail-closed
  behavior (`sk_test_` only) must be preserved.
- No deployment, Vercel/env/Docker change, staging.env or staging-commerce.env
  edit, or Worker/consumer recreation (deployment needs separate authority).
- No mutation, repair, replay, or manual submission of any historical refund,
  order, payment, or job row; no Stripe API call from the agent.
- No change to checkout, webhook, email, entitlement, SLA, pricing, schema,
  or the Airwallex gateway; no provider-agnostic refund redesign beyond the
  per-order provider dispatch above.
- No Git stage/commit/push, branch, merge, or worktree change.

## Diff budget

- Production files: at most 60 added/deleted lines in total.
- Verification files: at most 160 added/deleted lines in total.
- This scope file is excluded from the code budget.

## Acceptance checks

1. A Stripe refund request calls `refunds.create` with the order's
   PaymentIntent, exact minor-unit amount, `requested_by_customer` reason,
   order metadata, and the persisted idempotency key.
2. Status mapping: `succeeded`→`succeeded`, `pending`→`submitted`,
   `failed`/`canceled`→`failed`, anything else→`pending`.
3. Missing/non-test/disabled Stripe configuration still throws
   `invalid_configuration`; SDK HTTP errors normalize to `http` with status.
4. The consumer submits a stripe-provider refund via `StripeGateway` and an
   airwallex-provider refund via `AirwallexGateway`; an unknown provider still
   fails with `commercial_refund_payment_unavailable`; lease/idempotency
   semantics (`markRefundSubmitted`/`markRefundSucceeded`, retry/permanent
   classification) are unchanged.
5. Focused Vitest for the two test files, scoped ESLint, `npm run build`,
   and `git diff --check` pass; the final diff stays inside the allowlist
   and budget.

## Local verification receipt

- Focused Vitest: stripe.test.ts + operations.test.ts, 35 tests passed; wider
  payments/commerce/report-route suites: 21 files, 132 tests passed.
- Scoped ESLint on the four changed files: exit 0.
- Complete npm run build: exit 0 (Next.js production build; the
  Stripe.Refund["status"] type form was required by SDK v22).
- git diff --check: exit 0.
- Allowlist audit: production stripe.ts 34+4 and operations.ts 12+4 = 54/60;
  verification stripe.test.ts 77 and operations.test.ts 44 = 121/160. The
  remaining working-tree docs delta is this scope file plus the previously
  recorded 6bf7f12 deployment receipt, both uncommitted pending authority.
- One scoped production adjustment beyond the literal baseline: the disabled
  commerce mode now throws invalid_configuration from requiredStripeTestKey
  (matching acceptance check 3) instead of a plain error normalized as a
  transient network failure; checkout/retrieve share this fail-closed path
  and their existing tests pass unchanged.

## Expensive external actions

Protected Staging release authority granted by the user's explicit
"提交+部署" instruction on 2026-08-05, limited to:

- One Git commit of the allowlisted diff plus this scope file and the pending
  6bf7f12 deployment receipt in "docs/ACTIVE-CHANGE-SCOPE-HISTORY.md", and
  one push of "main" to "origin".
- At most one manual Vercel Preview at the candidate SHA (Preview already has
  both "STRIPE_*" Sensitive variables from the 6bf7f12 release).
- One thin source-overlay Worker image FROM the accepted current image
  "open-geo-console:staging-6bf7f12-stripe-sandbox-v1" (dependency/base
  inputs unchanged by this diff); rollback line: that same image.
- staging.env: original-bytes backup, "OGC_DEPLOYMENT_VERSION" set to the
  candidate, and exactly one added "STRIPE_SECRET_KEY" line using the
  user-supplied Sandbox key from "apps/web/.env.local" (never printed or
  committed). staging-commerce.env projection is NOT touched.
- Recreating exactly "staging-worker-free", "staging-worker-deep", and
  "staging-commerce-reconcile" on the candidate image. The email-only
  "staging-commerce" consumer, Production services, and historical rows
  stay untouched.
- Moving the fixed Protected Staging alias once, only after Web/Free/Deep
  full-SHA equality.
- Gates 1-3 only. The reconcile consumer's next scheduled cycle may submit
  the existing pending Stripe Sandbox refund "69202f81-" (provider side
  effect: one Sandbox refund, no real funds); the agent itself makes no
  Stripe API call and creates no new report, order, payment, refund, or
  email. Gate 4 real-flow acceptance remains unauthorized.


Authorized count: zero.

## Stop conditions

- The Stripe SDK surface differs from the baseline above in a way that
  requires touching files outside the allowlist.
- Correct dispatch requires changes to email, SLA, schema, or deployment
  configuration.
- The diff exceeds budget or encounters overlapping user edits.

Implementation starts only after the user explicitly approves this allowlist.
