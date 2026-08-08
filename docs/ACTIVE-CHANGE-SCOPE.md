# Active Change Scope Lock

Status: `APPROVED`

Prepared on 2026-08-08 after the Stripe Sandbox signing configuration was
corrected and the one authorized original-event replay reached the paid-event
application stage, where a confirmed non-secret model Profile conflict rolled
back the transaction.

## Objective

For report `0ffafb23-16f5-47bb-9073-4f924964f1c9` and its existing paid order
`67f2f110-949f-4f19-b7b6-93306f4455e9` only:

1. Change the Vercel Preview variable `OGC_REPORT_V4_MODEL_PROFILE_ID` from the
   obsolete native-MiMo Profile to
   `report-v4-openai-compatible-mimo-v2.5-pro-v1`, matching the already active
   `OGC_PROVIDER_PROFILE=external_search_synthesis` contract.
2. Deploy the exact clean candidate to Protected Staging Web and move the fixed
   Staging alias only after deployment identity and readiness checks pass.
3. Perform no manual Stripe event replay. Wait for Stripe's normal automatic
   retry and observe whether the existing paid event creates exactly one deep
   job.

## Confirmed baseline

- Repository `E:\project\open-geo-console`, branch `main`, local and remote
  HEAD `b85f719ddf46f37ca894e4fb70b692d02d8b1050`; canonical worktree was clean
  before this scope refresh. CodeGraph is up to date.
- Fixed Protected Staging currently serves deployment
  `dpl_9ACy6Gu2oDgaedX1yYf3B41bm2KK`, whose `ogcGitSha` and
  `githubCommitSha` equal the baseline HEAD.
- The Stripe Sandbox Checkout is already paid. Its signing secret now matches
  the existing enabled endpoint; the authorized replay passed verification and
  order binding, then logged only `stripe_webhook_apply_paid` and returned 400.
- Read-only Vercel inspection confirmed
  `OGC_PROVIDER_PROFILE=external_search_synthesis` while
  `OGC_REPORT_V4_MODEL_PROFILE_ID` equals the obsolete
  `report-v4-mimo-v2.5-pro-v1`. Current code requires the OpenAI-compatible
  MiMo Profile for that provider selector and fails closed on the conflict.
- The order remains `payment_status=pending`,
  `fulfillment_status=not_started`, with zero persisted payment events and zero
  linked deep jobs. The failed paid-event transaction left no partial database
  state.

## Allowed files

| Path | Allowed change |
|---|---|
| `docs/ACTIVE-CHANGE-SCOPE.md` | Current authority only |
| `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md` | Archive the completed prior scope only |

No application, package, test, dependency, schema, migration, Worker, model,
payment, checkout, email, entitlement, database, or report source file may be
changed.

## Allowed Protected Staging configuration action

- Update exactly one Vercel **Preview** variable:
  `OGC_REPORT_V4_MODEL_PROFILE_ID=report-v4-openai-compatible-mimo-v2.5-pro-v1`.
- Preserve `OGC_PROVIDER_PROFILE=external_search_synthesis` and all other
  Preview variables unchanged.
- Do not read, print, rotate, replace, or otherwise change any secret.
- Do not touch Production or Development variables or branch-specific
  overrides.

## Git, deployment, and external-action limits

- One documentation-only commit containing the approved scope/history record,
  and at most one `git push origin main`, solely to restore a clean canonical
  deployment worktree. No runtime source change is allowed.
- Protected Staging Preview deployments: at most **1**.
- Fixed Protected Staging alias moves: at most **1**, only after the unique
  Preview is READY and both `ogcGitSha` and `githubCommitSha` equal the clean
  candidate commit.
- Manual Stripe test event, resend/replay, Checkout, payment, order, refund,
  event fabrication, and direct database mutation: **0**.
- Production deployment/configuration and Worker image/restart actions: **0**.
- Read-only monitoring may inspect Stripe's existing event delivery state,
  Vercel Webhook logs, and the named order's database lineage.
- Stripe's provider-controlled automatic retry may apply the existing event
  exactly once. Its normal exactly-once transaction may create one payment
  event, entitlement, report credit settlement, deep job/dispatch, access
  authority, and ordinary confirmation-email record. The existing Deep Worker
  may claim and begin that one job; this scope does not require report
  completion.

## Monitoring window

- After the fixed alias points to the accepted deployment, monitor the existing
  event/order for up to **60 minutes** without sending any request to the
  Webhook endpoint.
- Stop early on success, any new 400 stage, any duplicate state, or an explicit
  Stripe next-retry time beyond the window.
- If no automatic retry occurs within the window, report `waiting for provider
  retry`; do not convert the wait into a manual replay.

## Acceptance checks

1. Pre-mutation checks reconfirm the exact variable names/current symbolic
   values and zero payment events/jobs; no secret value is read.
2. The one Preview variable is updated to the exact allowlisted Profile and all
   other configuration targets remain untouched.
3. The unique Preview is READY and its `ogcGitSha` and `githubCommitSha` exactly
   match the clean candidate before the fixed alias moves.
4. No manual POST, Stripe resend/test event, second Checkout/order/payment, or
   database write is performed by the operator.
5. On automatic retry success, database evidence shows the existing order paid,
   exactly one persisted payment event, and exactly one linked deep job/dispatch.
6. If the retry has not occurred within the monitoring window, final status is
   explicitly incomplete and records the provider-wait boundary.

## Stop conditions

- The expected Profile value is not available as an existing approved runtime,
  or the current provider selector differs from `external_search_synthesis`.
- Any required source, schema, database, secret, Worker, payment-contract, or
  second configuration change.
- Deployment identity mismatch, non-READY Preview, unexpected Production or
  branch scope, or inability to keep the canonical deployment checkout clean.
- Any payment event/job already exists before the configuration deployment, or
  more than one matching payment event/job/order appears during monitoring.
- Automatic retry again reaches a non-success stage; stop and diagnose without
  another replay or mutation.

---

Approved explicitly by the user on 2026-08-08 for the one named non-secret
Preview Profile update, one Protected Staging deployment/alias move, and
read-only waiting for Stripe's automatic retry. No Profile configuration,
deployment, alias, Stripe event, payment, order, or database state had been
changed under this scope at approval time.
