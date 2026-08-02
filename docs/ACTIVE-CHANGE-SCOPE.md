# Active Change Scope Lock

Status: `APPROVED`

Approved by the user on 2026-08-03. The user additionally authorized the agent
to complete the single fresh Protected Staging Sandbox payment interaction and
acceptance path without waiting for the user to remain present. All original
count limits, fail-closed stop conditions, and Production prohibitions remain
unchanged.

This scope is executable only within the exact allowlist and external-action
budget below.

## Objective

Remove the two confirmed causes that strand a paid customer on the payment
status page after the private HTML artifact becomes active:

1. Automatically exchange the same browser's checkout-return session for a
   scoped report-access cookie and navigate that browser to the canonical HTML
   artifact after persisted paid, deliverable, active-artifact state exists.
2. Run a persistent Protected Staging email consumer for newly created Staging
   deliveries so payment and report-ready email do not require an operator
   button or manual command.

Email remains the independent fallback. The browser exchange must never treat
`payment_return=success`, an order ID, provider query parameters, or the public
status endpoint as report-access authority.

## Confirmed baseline

- Repository: `E:/project/open-geo-console`.
- Branch / HEAD: local `main` at
  `12670b3eab0b0fdae638cd1c02d822752271d15d`; this commit has not been pushed.
- Protected Staging fixed alias serves that Web candidate; Staging free/deep
  Workers use the matching thin overlay. Production is outside this task.
- Current worktree contains unrelated/pre-existing dirty paths that must remain
  untouched and excluded from this task's diff/commit:
  `apps/web/next-env.d.ts`,
  `apps/web/src/components/combined-geo-report-v4-teaser.tsx`, and
  `apps/web/.tmp-preview/`.
- Observed report `c9acc3f9-9ddf-473a-8c2e-786049e8cb20`, order
  `98244fcf-ca4d-452d-93fb-e16c02c1d09f`: paid/completed, job 100%, one active
  `combined_geo_report_v3` artifact; its `payment_confirmed` and `report_ready`
  deliveries remained `queued` with `attempts=0`.
- Staging currently has 26 historical queued email rows in total. They are
  historical state and must not be claimed by the new persistent consumer.
- First divergence: paid terminalization marks fulfillment completed and queues
  email, while the client treats fulfillment completion as terminal without an
  access exchange. Staging has only a manual Commerce runner and no persistent
  email consumer.

## Allowed production/runtime files (exact allowlist)

Browser return capability and automatic HTML handoff:

- `apps/web/src/app/api/reports/[id]/checkout/route.ts`
- `apps/web/src/app/api/reports/[id]/orders/[orderId]/completion-access/route.ts`
  (new)
- `apps/web/src/server/payment-return-access.ts` (new)
- `apps/web/src/components/payment-return.ts`
- `apps/web/src/components/payment-return-banner.tsx`

Future-only Protected Staging email consumption:

- `apps/web/src/db/commercial-delivery.ts`
- `apps/web/src/commerce/operations.ts`
- `apps/web/src/scripts/staging-email-consumer.ts` (new)
- `apps/web/package.json`
- `package.json`
- `compose.yaml`
- `scripts/start-workstation-workers.ps1`

Existing reader-facing operations documentation made inaccurate by this change:

- `docs/PROTECTED-STAGING-OPERATIONS.md`
- `docs/COMMERCIAL-OPERATIONS.md`

Scope authority/history only:

- `docs/ACTIVE-CHANGE-SCOPE.md`
- `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md`

## Allowed test files (exact allowlist)

- `apps/web/src/app/api/reports/[id]/checkout/route.test.ts`
- `apps/web/src/app/api/reports/[id]/orders/[orderId]/completion-access/route.test.ts`
  (new)
- `apps/web/src/server/payment-return-access.test.ts` (new)
- `apps/web/src/components/payment-return-banner.test.ts`
- `apps/web/src/components/payment-refresh-button.test.tsx`
- `apps/web/src/db/commercial-delivery.test.ts`
- `apps/web/src/commerce/operations.test.ts`
- `apps/web/src/scripts/staging-email-consumer.test.ts` (new)

No other source, test, fixture, configuration, documentation, package, lockfile,
or generated file is allowed.

## Required behavior

### Secure same-browser completion access

- A successful checkout response sets a Secure, HttpOnly, SameSite=Lax,
  time-bounded signed return-capability cookie bound to the exact report and
  order. The cookie contains no email, provider secret, report token, or raw
  database authority.
- The completion-access POST endpoint requires that signed capability and the
  exact persisted report/order binding. It succeeds only when payment is
  `paid`, fulfillment is `completed` or `completed_limited`, and the report has
  an exact active artifact.
- The endpoint derives artifact scope only from the active artifact, issues the
  existing scoped report-access token/cookie, and returns the canonical customer
  HTML destination. Invalid, expired, cross-report, unpaid, non-deliverable, or
  artifact-missing requests fail closed without disclosing which check failed.
- The payment banner attempts the exchange once after trusted completed state
  and replaces the current location with the returned HTML destination. Email
  remains the fallback if the exchange is unavailable; cancel, payment failure,
  report failure, and refund states never receive access.
- The public order-status endpoint and query string remain non-authoritative.
  Anonymous direct access to report HTML remains denied.

### Automatic future Staging email delivery

- Add one persistent `staging-commerce`/email-consumer service using Staging-only
  test credentials and the same immutable candidate image as the Staging Web
  and report Workers.
- The consumer processes only queued email rows with `created_at` on or after a
  persisted activation timestamp written to its ignored runtime environment.
  Restarts reuse that same timestamp so post-activation backlog is not skipped.
- The consumer must not run refund, SLA, payment, report, or reconciliation
  operations and must not claim any of the 26 pre-activation historical queued
  emails. All Staging envelopes remain redirected to
  `OGC_TEST_EMAIL_RECIPIENT`.
- The workstation launcher must fail closed if required Staging email secrets,
  database/profile/mode, base URL, or activation timestamp is absent. It must
  not copy model, browser, evidence-storage, or Production secrets into the
  Staging email runtime file.
- Production Commerce configuration and behavior remain unchanged.

## Forbidden subsystems and behaviors

- No schema or migration changes, dependency changes, lockfile changes, price or
  product changes, payment Webhook changes, provider checkout changes, report
  generation changes, model/crawler/public-search changes, artifact rendering
  changes, access-token schema/semantics changes, refunds, SLA behavior, or
  historical repair/replay.
- No use of the order ID, Airwallex success URL, provider intent ID, public
  status response, email address, or test-recipient identity alone as an access
  credential.
- No claiming, sending, failing, refunding, deleting, or otherwise mutating the
  26 pre-activation historical queued emails/orders.
- No Production database, containers, images, deployment, email, payments,
  alias, branch, or environment changes.
- No edits to the existing unrelated dirty files or preview harness.
- No broad Docker cleanup, full Worker build, worktree creation/deletion, force
  Git operation, push, merge, tag, or remote-branch deletion without the
  separately listed and approved action below.

## Diff budget

- Production/runtime code and configuration: at most 650 changed lines across
  the twelve allowlisted files, including new files.
- Tests: at most 500 changed lines across the eight allowlisted test files.
- Documentation and scope records: at most 220 changed lines excluding the
  archived prior scope already moved to history.
- Any required production behavior or file outside this budget/allowlist is a
  stop-and-report condition.

## Local acceptance checks

1. Focused tests prove signed-capability issue/validation, exact report/order
   binding, expiry, active-scope derivation, report-cookie issuance, one-shot
   client handoff, fail-closed states, activation-cutoff filtering, retry
   behavior, and no pre-activation claim.
2. The completion route's anonymous/cross-order/unpaid/missing-artifact cases
   return the same safe denial and never issue a report cookie.
3. A disposable PostgreSQL test proves a queued row immediately before the
   activation timestamp remains untouched while a row immediately after it is
   claimable; selected-test skip is failure.
4. `docker compose config` contains exactly one Staging email consumer using the
   intended ignored env file; PowerShell prepare-only validation preserves one
   stable activation timestamp and prints no values.
5. `npm run lint`, the Web build, `git diff --check`, allowlist comparison, and
   candidate diff review pass. Existing unrelated dirty files remain unchanged.

## Expensive external actions requiring this scope's explicit approval

These actions are authorized only after local checks pass, and only if the user
approves this entire FROZEN scope:

1. Git: use one `codex/` task branch if needed, create one candidate commit from
   only allowlisted files, and do not push/merge/delete remote refs.
2. Protected Staging deployment: create at most one new Vercel Preview from the
   exact clean candidate; build one source-only thin overlay (no full Worker
   build); recreate exactly `staging-worker-free`, `staging-worker-deep`, and the
   new `staging-commerce`; move the fixed alias once only after identity/readiness
   gates pass. Retain one exact rollback image; Production remains untouched.
3. Existing incident delivery: after deployment, process email for exact order
   `98244fcf-ca4d-452d-93fb-e16c02c1d09f` only, sending at most its two existing
   redirected Staging emails. Do not run an unscoped Commerce drain.
4. Fresh acceptance: create exactly one wholly new Protected Staging report and
   one Airwallex Sandbox payment, with the user completing the hosted payment
   interaction. Allow only that lineage's normal Free/Deep model work and at
   most two redirected test emails. Do not reuse or mutate another report/order.
5. Acceptance must prove the same browser automatically lands on the canonical
   authorized HTML report, the report-ready email leaves `queued`, the access
   cookie is scoped to the active artifact, anonymous HTML remains denied, and
   zero historical queued emails/refunds were touched.

Any failure stops the live sequence. It does not authorize a second report,
payment, Preview, build, alias move, email pass, replay, refund, or retry.

## Completion boundary

Implementation is not complete until both automatic paths pass: same-browser
HTML navigation and independent redirected email delivery. Unit tests, build,
Preview READY, active artifact state, or queued email alone are insufficient.
Without the fresh exact-lineage real-flow evidence, report status must remain
"implemented and locally verified; Protected Staging usability unverified."
