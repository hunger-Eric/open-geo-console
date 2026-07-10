# Protected Staging and Production Operations

This runbook is the operator contract for the protected Vercel Preview and the public production deployment. PostgreSQL environment markers and deployment profiles are fail-closed; never work around them with request headers, cookies, query parameters, or a shared secret.

## Environment matrix

| Boundary | Protected staging Preview | Production |
| --- | --- | --- |
| Deployment identity | `VERCEL_ENV=preview`, `OGC_DEPLOYMENT_PROFILE=staging` | `VERCEL_ENV=production`, `OGC_DEPLOYMENT_PROFILE=production` |
| PostgreSQL | Independent Neon staging database marked `staging` | Independent production database marked `production` |
| Anonymous site limit | `OGC_STAGING_FREE_SITE_LIMIT`, integer 1-100, default 100 | Always 2 distinct sites per rolling 24 hours |
| Commerce | `COMMERCE_MODE=test`, fixed Airwallex Sandbox host | `disabled` until live gates pass, then `live` |
| Email | All envelopes redirected to `OGC_TEST_EMAIL_RECIPIENT`; missing recipient fails before Resend | Actual order recipient; test recipient must be absent |
| Model, HMAC, Queue, payment, email, bypass | Independent staging values | Independent production values |

Production always uses the two-site policy even if a staging variable, header, cookie, or query parameter is present. Forced regeneration is accepted only for the protected staging identity.

## Database marker

Initialize a new database once from a local environment file that contains only that environment's credentials:

```powershell
npm run db:environment:init -- staging
npm run db:environment:inspect
```

Use `production` for the production database. Initialization refuses to change an existing marker. Web instrumentation, Workers, commercial operations, and cleanup compare the marker with `OGC_DEPLOYMENT_PROFILE` before serving or mutating state. Inspection prints only the profile and a non-secret fingerprint.

## Staging Workers and commercial reconciliation

Create `apps/web/.env.staging.local` outside Git, then run the explicit staging commands:

```powershell
npm run worker:staging:free
npm run worker:staging:deep
npm run commerce:staging:all
```

These commands do not fall back to `.env.local`; they refuse a non-staging profile, a production database marker, or live commerce. Both Worker lanes must be scheduled in production, but must never share model, Queue, HMAC, payment, or email credentials with staging.

## Local staging cleanup

There is no HTTP quota reset or administrator bypass. To clear isolated staging free-site reuse and rolling-limit rows:

```powershell
npm run staging:free:cleanup -- --confirm
```

For a test environment whose independent model credentials are not yet configured, the operator may terminalize only active free test jobs before repeating browser acceptance:

```powershell
npm run staging:free:cleanup -- --confirm --active-jobs-only
```

Both modes verify the deployment profile and database marker and refuse production.

## Protected Preview and Webhooks

- Keep Vercel Standard Authentication enabled for Preview deployments. Anonymous page requests must redirect to Vercel login, and anonymous `POST /api/scan` must be rejected by deployment protection.
- Keep Airwallex Sandbox and Resend Webhook signature verification enabled in the application. Vercel protection is an outer gate, not a substitute for provider signatures or event idempotency.
- Pass the current automation bypass only in the provider Webhook URL or another provider-supported secret location. Rotate it through Vercel's protection-bypass API or dashboard; never print, log, commit, or paste the value.
- After rotation, verify the previous credential is rejected and update Sandbox providers securely. Do not disable Preview authentication to repair delivery.

## Acceptance

Automated acceptance:

```powershell
npm run lint
npm test
npm run build
npm run db:audit
npm run test:postgres:staging-security
```

Browser acceptance must prove anonymous denial, authenticated access, more than two distinct staging sites, same-site reuse, forced-new report identity, duplicate-click idempotency, and separation from production data. Provider acceptance additionally requires a real CodingPlan staging call, an Airwallex Sandbox signed Webhook, and a redirected Resend message. Production acceptance must prove the third distinct site returns `429` and staging variables do not change that result.

## Cloudflare production checklist

When account access and a production domain are available:

1. Create production Turnstile keys, set the expected hostname, and enable server-side verification.
2. Enable Bot Fight Mode and narrowly scoped WAF/short-window rate-limit rules for abusive scan and Webhook traffic.
3. Keep the origin's database rate limit, Webhook signatures, SSRF protections, and commercial audit active.
4. Do not enable the setting that blocks AI crawlers; crawler visibility is part of the product being measured.
