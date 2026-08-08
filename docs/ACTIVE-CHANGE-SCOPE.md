# Active Change Scope Lock

Status: `APPROVED`

Prepared on 2026-08-08 after the existing named Stripe Sandbox payment was
confirmed paid at Stripe but its Webhook was rejected twice by Protected
Staging, leaving the order pending and creating no deep job.

## Objective

For report `0ffafb23-16f5-47bb-9073-4f924964f1c9` and its existing paid order
`67f2f110-949f-4f19-b7b6-93306f4455e9` only:

1. Add bounded, non-sensitive Webhook failure-stage logging.
2. Identify whether the current failure is Stripe signature verification,
   order binding, or paid-event application.
3. Correct the Protected Staging Stripe Webhook signing configuration without
   printing or persisting the secret locally.
4. Deploy the exact candidate to Protected Staging Web and move the fixed
   Staging alias only after identity and readiness checks pass.
5. Replay the original `checkout.session.completed` event exactly once.
6. Verify the existing order becomes paid and creates exactly one deep job,
   without another payment, order, or Checkout Session.

## Confirmed baseline

- Repository `E:\project\open-geo-console`, branch `main`, HEAD
  `c1f7d98ae57778bad71b98c26d13a715db8d65a1`; primary worktree is clean.
- CodeGraph is up to date.
- Stripe Sandbox Checkout is `complete / paid`, amount `USD 99.00`, and its
  client reference, metadata order reference, amount, and currency match the
  named database order.
- Stripe generated `checkout.session.completed` at 2026-08-08T00:53:36Z and
  reports one pending Webhook delivery.
- Protected Staging received two `POST /api/webhooks/stripe` requests and
  returned HTTP 400 to both.
- The order remains `payment_status=pending`,
  `fulfillment_status=not_started`; `payment_events`, linked `scan_jobs`, and
  dispatch outbox rows are empty.
- The named order has one completed V4 site snapshot and one locked set of
  exactly three paid questions bound to the same order.
- The route currently collapses all verification, binding, and application
  exceptions into the same public `Invalid webhook.` response, so the exact
  internal stage is unresolved.

## Allowed files

| Path | Allowed change |
|---|---|
| `apps/web/src/app/api/webhooks/stripe/route.ts` | Track and emit one safe internal failure-stage code; preserve the existing generic public 400 response and never log raw errors, payloads, signatures, secrets, customer data, event IDs, order IDs, or provider identifiers |
| `apps/web/src/app/api/webhooks/stripe/route.test.ts` | Prove safe stage classification, successful handling, and absence of sensitive/raw error logging |
| `docs/ACTIVE-CHANGE-SCOPE.md` | Current authority and execution receipts |
| `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md` | Archive the completed prior scope and this scope after completion |

No payment gateway, database, schema, migration, checkout UI, catalog,
question-generation, Worker, model, crawler, email, entitlement, fulfillment,
or report-rendering source file is authorized. A required source change outside
this allowlist is a stop condition.

## Safe logging contract

The server may log only a constant message plus one of these stage codes:

- `stripe_webhook_read`
- `stripe_webhook_verify`
- `stripe_webhook_bind`
- `stripe_webhook_apply_paid`
- `stripe_webhook_apply_unsuccessful`
- `stripe_webhook_record_ignored`

The customer response remains exactly `{ "error": "Invalid webhook." }` with
HTTP 400. No exception object, stack, raw message, request body, header,
signature, secret, customer value, event/order/session/payment identifier, or
database value may be logged or returned.

## Allowed Protected Staging configuration action

- Inspect the existing enabled Stripe Sandbox Webhook endpoint and its signing
  secret through the authenticated Stripe control surface without displaying,
  copying into chat/log output, or writing it to a repository/local file.
- Update exactly one Vercel Preview variable: `STRIPE_WEBHOOK_SECRET`.
- Do not rotate or recreate the Stripe endpoint unless the existing endpoint's
  secret cannot be recovered; that condition stops execution for a new user
  decision.
- Do not change `STRIPE_SECRET_KEY`, product/catalog variables, database URLs,
  provider/model secrets, Production variables, or any other environment value.

## Deployment and external-action limits

- Local candidate commits: at most **1**.
- `git push origin main`: at most **1**.
- Protected Staging Preview deployments: at most **1**.
- Fixed Protected Staging alias moves: at most **1**.
- Stripe Sandbox endpoint secret reads: at most **1**.
- Vercel Preview secret updates: at most **1**.
- Replay of the already existing original Stripe event: exactly **1** after
  deployed diagnostics and signing configuration are verified.
- New payment, order, Checkout Session, report, question set, or manual job:
  **0**.
- Production actions, refunds, event fabrication, direct database mutation,
  manual entitlement/credit creation, and manual task insertion: **0**.
- The normal exactly-once application of the named paid event may create one
  entitlement, one report credit settlement, one deep job/dispatch, one access
  authority, and the ordinary confirmation-email record for this order. The
  existing deep Worker may claim and begin that one job; paid-report completion
  is not required by this scope.
- If automatic Stripe retry succeeds before the authorized manual replay, do
  not replay: treat the replay allowance as consumed by the successful event
  application and verify exactly-once state.

## Diff budget

- Production source: at most **+45/-10** lines.
- Tests: at most **+110/-20** lines.
- Scope/history receipts: as required.
- No dependency, schema, migration, payment-contract, or database-semantic
  change.

## Acceptance checks

1. Focused route tests show the old catch-all has no stage evidence, then pass
   for verification, binding, paid-application, and ignored-event failures.
2. Tests prove the public response remains generic and captured logs contain
   only an allowlisted stage code, not raw exception or sensitive values.
3. `npm run lint`, focused tests, `npm run build`, `git diff --check`, and
   `codegraph sync` pass, with unrelated pre-existing warnings recorded.
4. Candidate SHA, Vercel deployment metadata, READY state, and fixed alias all
   identify the same deployed candidate before event replay.
5. A diagnostic delivery, automatic retry, or the single authorized replay
   returns HTTP 2xx; logs do not expose protected values.
6. Database evidence shows the named order paid, exactly one payment event,
   exactly one entitlement/credit settlement as applicable, and exactly one
   linked deep job/dispatch. No second order, Checkout Session, or payment is
   created.
7. Final evidence states whether the deep Worker has only queued, claimed, or
   begun the job; it does not claim paid-report completion unless independently
   observed.

## Stop conditions

- The existing Stripe endpoint secret cannot be revealed without rotation or
  endpoint recreation.
- The safe stage proves a source defect outside the allowed route file, a
  database/schema defect, or a Worker/payment-contract change is required.
- The order has already produced a payment event or deep job before replay, or
  more than one matching job/order/payment appears.
- Deployment identity mismatch, non-READY candidate, unexpected external
  mutation, secret exposure risk, or any requested second replay/payment/order.

---

Approved explicitly by the user on 2026-08-08 for the named code changes,
Protected Staging signing-secret correction, deployment, and at most one replay
of the existing original Stripe event. No runtime source, secret, deployment,
Stripe event, payment, order, or database state had been changed under this
scope at approval time.

## Local implementation receipt

- Added constant-only failure-stage logging to the Stripe Webhook route; the
  public HTTP 400 response remains unchanged.
- New assertions against the old catch-all: **5 failed / 5 passed** (expected
  red). After implementation: **10/10 focused tests passed**.
- `npm run lint`: **0 errors / 8 pre-existing warnings**.
- `npm run build`: passed, including the Next.js production build.
- `git diff --check`: passed; `codegraph sync`: up to date.
- Production diff: **+17/-0**; tests: **+27/-1**, within budget.
- No secret/configuration, deployment, Stripe replay, order, payment, database,
  entitlement, email, or Worker action has occurred at this checkpoint.
