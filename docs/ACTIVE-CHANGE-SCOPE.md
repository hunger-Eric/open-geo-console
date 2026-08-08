# Active Change Scope Lock

Status: `APPROVED`

Prepared on 2026-08-08 after the user requested that the Protected Staging
checkout availability failure be diagnosed, its Staging configuration be
repaired, safe failure codes be exposed, and the real Chrome flow be verified
through entry into (but not payment in) the Stripe test checkout.

## Objective

For the existing fresh Staging report
`0ffafb23-16f5-47bb-9073-4f924964f1c9`:

1. Identify the first failing catalog admission check behind
   `catalog.enabled = false`.
2. Return and render a bounded, non-sensitive reason code instead of collapsing
   every failure into “online purchasing is not configured”.
3. If and only if the confirmed cause is an allowlisted Protected Staging
   Preview configuration value, correct that value and redeploy Web.
4. In the user's authenticated Chrome session, verify that three paid questions
   appear, confirm them once, create at most one Stripe test Checkout, enter the
   Stripe-hosted test checkout page, and stop before payment.

## Current observed baseline

- Repository: `E:\project\open-geo-console`, branch `main`, HEAD
  `3b732680d0739f9a9e149154ce80b3d720aa893a`.
- Fixed Staging alias serves candidate `3b732680...`.
- Chrome report URL ends in `#checkout`; clicking the CTA scrolls correctly.
- Rendered `#checkout` says `当前部署尚未配置在线购买。`.
- The report is a new prospective report generated after the split-question
  deployment, so historical-report compatibility is not the current cause.
- Vercel Preview lists the commerce/Stripe environment-variable names, but that
  does not prove their values or downstream product admission are valid.
- Exact first failing admission check remains `UNRESOLVED` until a discriminating
  safe-code response is observed on the deployed route.

## Allowed source files

| Path | Allowed change |
|---|---|
| `apps/web/src/app/api/commerce/catalog/route.ts` | Return one bounded safe availability code; never return secrets, raw errors, identifiers, or database data |
| `apps/web/src/app/api/commerce/catalog/route.test.ts` | Red/green coverage for readiness, product, and internal-error codes |
| `apps/web/src/components/commercial-checkout.tsx` | Render distinct safe unavailable states while preserving confirmation-gated checkout |
| `apps/web/src/components/commercial-checkout.test.tsx` | UI regression coverage |
| `apps/web/src/i18n/types.ts` | Typed safe unavailable messages only |
| `apps/web/src/i18n/zh.ts` | Chinese messages for safe codes |
| `apps/web/src/i18n/en.ts` | English messages for safe codes |
| `docs/ACTIVE-CHANGE-SCOPE.md` | Scope and execution receipts |
| `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md` | Archive completed scope record only |

No other production or test source file is authorized. If the cause requires a
different file, dependency, schema, database row, authority record, Worker, or
payment implementation change, stop and request a new scope.

## Safe public reason-code contract

The route may expose only a stable code from this bounded set:

- `commerce_disabled`
- `commerce_configuration`
- `commerce_capacity`
- `commerce_incident`
- `product_disabled`
- `product_environment`
- `product_runtime_incomplete`
- `product_authority_unavailable`
- `product_authority_mismatch`
- `internal_error`

The response must not reveal which secret is missing, secret formats or values,
provider responses, database contents, authority identifiers, stack traces, or
raw exception messages.

## Allowed Protected Staging configuration work

After the safe deployed response confirms the first failing check, inspect
existing Preview configuration without printing secret values. Change at most
one confirmed non-secret value among:

- `COMMERCE_MODE`
- `OGC_REPORT_BASE_URL`
- `OGC_REPLY_TO_EMAIL`
- `OGC_PUBLIC_SEARCH_RUNTIME_ENABLED`
- `OGC_DEPLOYMENT_PROFILE`
- `OGC_PROVIDER_PROFILE`
- `OGC_PUBLIC_SEARCH_LOCALE`
- `OGC_PUBLIC_SEARCH_REGION`
- `OGC_PUBLIC_SEARCH_AUTHORITY_VERSION`

Do not rotate, replace, print, persist, or otherwise change Stripe, Airwallex,
email, Turnstile, database, signing, encryption, token, or provider secrets. If
a secret is absent/invalid, or the failure requires authority/database mutation,
stop and report the exact safe code.

## Deployment and external-action allowance

- Candidate commits on `main`: at most **2** (diagnostic contract, then a
  configuration-follow-up receipt only if needed).
- `git push origin main`: at most **2**, corresponding exactly to those commits.
- Protected Staging Web Preview deployments: at most **2**.
- Fixed Staging alias moves: at most **2**.
- Worker image build/recreate: **0**.
- Production deployment/configuration: **0**.
- Historical report/job/order mutation or replay: **0**.
- New report, crawl, search, or model call: **0**.
- Paid-question confirmation writes: at most **1**, for the named report.
- Test payment orders / Stripe test Checkout Sessions: at most **1**.
- Payment submission, Webhook completion, entitlement/deep job, refund, or
  email delivery: **0**.

The browser test uses a non-personal QA mailbox value and stops immediately once
the `checkout.stripe.com` test page is visibly reached. No card details are
entered and no payment control is activated.

## Diff budget

- Production source: at most **+70/-25** lines across the allowlist.
- Tests: at most **+130/-30** lines.
- Scope/history receipts: as required for authority and evidence.
- No dependency, schema, migration, Worker, model, report-generation, or
  checkout-integrity changes.

## Acceptance checks

1. Focused catalog-route tests are red for the old collapsed response and green
   for every new safe-code branch.
2. Checkout UI tests prove distinct messages and preserve the ready purchase
   controls plus confirm-before-checkout behavior.
3. `npm run lint`, focused tests, `npm run build`, `git diff --check`, and
   `codegraph sync` pass (existing unrelated warnings recorded, not repaired).
4. First deployed Preview returns a safe code that identifies the earliest
   failing admission family without sensitive details.
5. If the cause is within the configuration allowlist, the corrected Preview
   returns `enabled: true` and the fixed alias points to its exact READY SHA.
6. Authenticated Chrome shows exactly three editable paid questions; one
   confirmation succeeds; one checkout action reaches a Stripe-hosted test
   checkout. Stop without payment.
7. Final evidence distinguishes local automation, deployed catalog state, and
   the real browser result. A Stripe page arrival is not claimed as payment or
   paid-report delivery.

## Stop conditions

- A cause outside the named non-secret Preview configuration values.
- Any required secret, database/authority mutation, Worker change, new model
  run, second test order, payment, or Production action.
- Diff outside the file allowlist/budget, deployment identity mismatch, or
  inability to distinguish the first failing check safely.

---

Approved explicitly by the user on 2026-08-08 for code changes, Protected
Staging configuration repair, deployment, and no-payment Chrome acceptance.

## Local implementation receipt

- Old route against new assertions: **13 failed / 1 passed** (expected red).
- Implemented bounded Commerce/Product reason codes and distinct UI states.
- Focused verification: **3 files / 32 tests passed**.
- `npm run lint`: **0 errors / 8 pre-existing warnings**.
- `npm run build`: passed, including Next.js production build.
- `git diff --check`: passed; `codegraph sync`: up to date.
- Production diff: **+65/-8**; tests: **+45/-6**, within budget.
- No configuration, deployment, report, order, Checkout, payment, model, email,
  Worker, or database action has occurred at this checkpoint.
