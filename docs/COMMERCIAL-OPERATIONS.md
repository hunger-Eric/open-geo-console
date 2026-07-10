# Commercial Operations

## Initial operating model

The initial commercial deployment has no always-on report server. Netlify serves the Next.js web/API surface, Neon is the PostgreSQL authority, Cloudflare Turnstile protects anonymous forms, Cloudflare Queue carries non-sensitive job notifications, and the operator workstation drains report jobs in `batch_24h` mode.

Customer promise: a paid report is delivered by email within 24 hours of confirmed payment or receives a full refund. Do not describe this mode as instant or real-time processing.

## Netlify setup

1. Import the repository as a monorepo.
2. Leave Base directory unset so dependency installation runs from the repository root.
3. Set Package directory to `apps/web`.
4. Confirm build command `npm run build --workspace apps/web` and publish directory `apps/web/.next`.
5. Add production environment variables in Netlify, never in Git.

## Required secret ownership

| System | Variables |
| --- | --- |
| Neon | `DATABASE_URL`, `OGC_DATABASE_POOL_SIZE` |
| Model provider | `OGC_AI_BASE_URL`, `OGC_AI_API_KEY`, `OGC_AI_MODEL` |
| Application HMAC | `OGC_TOKEN_HASH_SECRET`, `OGC_IP_HASH_SECRET`, `OGC_PAYMENT_IDEMPOTENCY_SECRET` |
| Customer email protection | `OGC_EMAIL_ENCRYPTION_SECRET`, `OGC_EMAIL_LOOKUP_SECRET` |
| Cloudflare Turnstile | `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_EXPECTED_HOSTNAME` |
| Cloudflare Queue | `CLOUDFLARE_ACCOUNT_ID`, Queue names, Queue API token |
| Airwallex | `AIRWALLEX_CLIENT_ID`, `AIRWALLEX_API_KEY`, `AIRWALLEX_WEBHOOK_SECRET` |
| Resend | `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SECRET` |

Use distinct random values for every secret family. The email-encryption secret must remain available for as long as its key version is used by retained orders.

## Safe launch modes

- `COMMERCE_MODE=disabled`: default; checkout fails closed.
- `COMMERCE_MODE=test`: Airwallex Sandbox and non-live email testing.
- `COMMERCE_MODE=live`: accepts real orders only when all live checks pass.
- `FULFILLMENT_MODE=batch_24h`: workstation drains and exits.
- `FULFILLMENT_MODE=realtime`: a future persistent Worker drains recovery work, then waits for Queue notifications.

Live mode also requires explicit server-side `OGC_PRICE_CNY_MINOR`, `OGC_PRICE_USD_MINOR`, and `OGC_PRICE_HKD_MINOR` values. Browser requests never supply an authoritative amount.

## Workstation batch schedule

Run a manual drain from the repository root. The script always follows Worker drains with Queue reconciliation and `commerce:all`, so SLA checks, refunds and email are not skipped when a lane fails:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-commercial-batch.ps1 -DeepProcesses 2
```

Install the 10:00 and 20:00 local-time Windows schedule after `.env.local` has been configured and a manual drain succeeds:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-commercial-batch-schedule.ps1 -DeepProcesses 2
```

Start with two deep processes on the current 8-core/16-thread, 32 GB workstation. Measure one, two, and four processes with representative sites before changing the default. Keep the per-process PostgreSQL pool small enough that all web and Worker processes remain below the Neon connection allowance.

## Manual launch gates

Code and mocked provider tests are not proof of live readiness. Before `COMMERCE_MODE=live`:

1. Verify the sending subdomain with SPF, DKIM, and DMARC in Resend.
2. Complete Airwallex Hong Kong merchant approval and enable the required payment methods.
3. Register and verify Airwallex and Resend Webhooks.
4. Create Cloudflare Turnstile and Queue resources and restrict tokens to the minimum permissions.
5. Run one real low-value payment, duplicate Webhook replay, report completion, secure email redemption, full refund, bounce, workstation-offline, and 24-hour watchdog drill.
6. Confirm sanitized logs contain no email address, report token, payment secret, model key, or unhashed IP.

## Failure handling

- Queue outage: PostgreSQL outbox reconciliation republishes notification hints; the next batch can still claim jobs directly.
- Workstation offline: paid jobs remain queued in PostgreSQL; restore the next drain before the 20-hour warning.
- 24-hour deadline: request one full cash refund, refund the internal reservation, mark work non-billable, and pause new checkout until healthy.
- Limited or failed report: request a full refund and send the appropriate customer email; a later courtesy report must never settle a second charge.
- Email bounce/suppression: stop automatic retries and use the order-bound correction/reissue flow.
