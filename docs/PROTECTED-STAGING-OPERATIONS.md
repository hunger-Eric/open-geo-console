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
| Model, HMAC, Queue, payment, email, bypass | Independent staging values; current model key reuse is a documented temporary exception | Independent production values |
| Visual evidence storage | Preview-only Vercel Private Blob store in `sin1`, shared only by staging Web/deep Worker | Separate private production object store and credentials |

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

Protected staging uses `OGC_EVIDENCE_STORAGE=vercel-blob` and the Preview-only `open-geo-console-staging-evidence` Private Blob store. Vercel Web Functions use the project connection's rotating OIDC; before a workstation deep-Worker drill, run `npx vercel pull --yes --environment=preview` so `.vercel/.env.preview.local` contains the store's external-worker token. `npm run worker:staging:deep` loads only that ignored file plus `apps/web/.env.staging.local`; required Sensitive model/Queue values still need their existing explicit process-only overrides. Production may use a separate Private Blob or S3-compatible adapter. Filesystem storage remains local-development-only and is rejected for staging/production. Customer reads always pass through the report-authorized evidence route.

Vercel Sensitive values are intentionally not decryptable through `vercel env pull`; the generated file contains empty placeholders for those names. For a local Worker drill, explicitly override each required empty placeholder with the separately held staging value in only that process. Merely loading another env file does not replace variables that already exist as empty placeholders. Never weaken the database marker guard, print values, or copy production secrets into `.env.staging.local`.

### Public-search provider probe environment

Run the protected-staging MiMo capability gate only after the staging Worker runtime environment has been generated:

```powershell
npm run public-search:probe -- --adapter mimo --locale zh-CN --region CN
```

For the V3 generative-answer mainline, also run the secret-safe same-operation answer/citation probe:

```bash
npm run generative-answer:staging:probe
```

The probe must report a nonblank answer and normalized source domains. It reads the merged staging Worker environment, prints no answer prose, credentials, authorization headers, or raw provider response, and does not create a report, order, credit, refund, or email.

The probe intentionally reads `.data/workstation-docker/staging.env`, which is the merged environment consumed by `staging-worker-free` and `staging-worker-deep`. Source files such as `apps/web/.env.staging.local`, `.vercel/.env.preview.local`, and `apps/web/.env.public-search.staging.local` may contain empty Sensitive-value placeholders even when the merged Worker runtime has valid MiMo values. Therefore, inspecting a source placeholder file alone is not evidence that `OGC_PUBLIC_SEARCH_MIMO_BASE_URL`, its API key, or model is missing. Verify the merged file by variable name/non-empty status without printing values, then require the real bounded probe to pass. Never substitute a production env file or copy secrets into tracked files.

If a workstation proxy uses the reserved `198.18.0.0/15` Fake-IP DNS range, the crawler will and must reject the target as an SSRF risk. Do not allowlist the range or disable URL safety. Set `OGC_PUBLIC_DNS_DOH_URL=https://cloudflare-dns.com/dns-query` for that Worker process; both crawl and screenshot-browser validation then use the fixed public resolver while retaining blocked-address checks and safe-fetch IP pinning.

### One-time paid-report correction

The correction CLI is protected-staging only and refuses any non-preview runtime, non-staging deployment profile, or non-staging database marker. Preparation is idempotent and does not create a correction job or perform public search:

```powershell
npm run staging:correction:prepare
```

This approved operator command is intentionally fixed to the order/report/original-job identities in the 2026-07-14 correction design; it is not a general correction endpoint. Present the returned three private candidates and neutral public variants to the customer. After explicit confirmation, create an ignored JSON file containing `questions` as exactly three strings and `acknowledgedLowConfidence` as a boolean, then run:

```powershell
npm run staging:correction:confirm -- --questions-file <ignored-json-path>
```

Confirmation creates the unique non-billable correction job and dispatches it. Never prepare or confirm against production, create a replacement order, or manually alter charge/credit/refund rows.

### Audited paid-report replacement

The replacement command is intentionally bound in code to one approved paid failure lineage. It creates no order, charge or credit reservation and never mutates the original job/refund outcome:

```powershell
npm run staging:replacement:inspect
npm run staging:replacement:prepare -- --confirm --authorization-ref <operator-reference>
npm run staging:replacement:resume -- --confirm --authorization-ref <operator-reference>
```

`prepare` is idempotent. `resume` accepts only the approved failed model-contract checkpoint or its answer-complete language-gate repair state. A successful terminalization activates the replacement revision and queues replacement delivery; a failed attempt leaves the artifact pending and the original commercial state unchanged.

Keep the old active artifact until the new customer HTML, private same-HTML PDF readiness artifact, and private evidence all pass readiness. After completion, audit one correction, one locked question set, three questions, one active revision, one artifact-keyed correction email containing only the secure HTML link, zero new billing/refund side effects, and identity-free shared snapshot/search/evidence payloads. Confirm the internal PDF hash, storage key, and page count from authoritative state; do not request a customer PDF endpoint. The accepted concrete drill and browser checklist are recorded under `docs/operations/evidence/2026-07-14-combined-report-correction-acceptance.md`.

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

- The fixed test URL is `https://open-geo-console-staging-itheheda.vercel.app`. After each CLI Preview deployment, repoint it explicitly with `npx vercel alias set <new-preview-url> open-geo-console-staging-itheheda.vercel.app`, then repeat the anonymous `302`/`401` checks before browser acceptance.
- Keep Vercel Standard Authentication enabled for Preview deployments. Anonymous page requests must redirect to Vercel login, and anonymous `POST /api/scan` must be rejected by deployment protection.
- Keep Airwallex Sandbox and Resend Webhook signature verification enabled in the application. Vercel protection is an outer gate, not a substitute for provider signatures or event idempotency.
- Pass the current automation bypass only in the provider Webhook URL or another provider-supported secret location. Rotate it through Vercel's protection-bypass API or dashboard; never print, log, commit, or paste the value.
- After rotation, verify the previous credential is rejected and update Sandbox providers securely. Do not disable Preview authentication to repair delivery.
- Current production URL: `https://geo.itheheda.online`. Current protected staging URL: `https://open-geo-console-staging-itheheda.vercel.app`.
- The staging Airwallex and Resend Webhooks use separate provider-specific protection-bypass values. Do not reuse the general automation bypass.

## Acceptance

### Report V4 acceptance (local implementation; live run not yet authorized)

The local branch implements schema v40 and the three-scenario V4 acceptance authority. Local readiness is checked with:

```powershell
npm test
npm run lint
npm run build
npm run report:v4:traceability
npm run report:v4:acceptance
```

`report:v4:acceptance` must continue to fail while the 20 registry entries are `implemented` rather than `verified` and requirement-bound protected-staging evidence is absent. Do not create an evidence file or promote statuses to make the command pass.

A live V4 run requires separate explicit user authorization for deployment, schema/database mutation, Airwallex Sandbox payment/refund, redirected email, Git push, and pull-request creation. After authorization, align schema v40 plus the protected-staging Web, free Worker, deep Worker, and commerce code before using `report-v4:acceptance:operator` or `report-v4:acceptance:collect`. Use only exact run-produced session/scenario identities and immutable authorities; this runbook intentionally does not provide reusable payloads or IDs. Production deployment, production database mutation, and production commerce are forbidden for V4 acceptance.

### Combined-report presentation refresh

The approved existing report can be refreshed without creating a charge, credit, correction, refund, email, or production write:

```powershell
npm run staging:combined:refresh -- --report a71d7481-c5dc-4e2a-a042-b9be878feab8
```

The command requires the staging deployment profile and staging database marker. It creates a deep `staging_artifact_refresh` job bound to the active revision and locked question set. The Worker reuses the active technical foundation and screenshots, recollects public sources, and requires one short evidence-constrained answer per question with at least two verified Grade A/B sources from independent domains. The current revision remains active until the customer HTML hash, private same-HTML PDF hash/storage key/page count, screenshot readback, and atomic activation all pass. A failed terminal job marks only the pending revision failed. To intentionally refresh an already refreshed revision, inspect it first and pass `--from-revision <active-artifact-revision-id>`.

Acceptance must record the new revision ID, authorized customer HTML link and hash, internal PDF hash/storage key/page count, source ownership per question, preserved technical citations/screenshots, application-level anonymous `404` for the HTML artifact, and zero commercial side effects. Confirm that completion email contains only the secure HTML link. Do not request, access, or publish a customer PDF endpoint. Never run this command with production environment files or deploy the schema/Worker to production as part of staging acceptance.

### Provider-discovery V2 acceptance

`combined_geo_report_v2` is a prospective opt-in. Deploy schema v20 and matching Web/free/deep Worker code to protected staging first; do not rewrite existing V1 orders or revisions, and do not set the V2 contract in production. The V2 staging refresh lineage is `evidence_refresh`, which must retain the active artifact until the four snapshot refs, exact provider passages/claims, customer HTML, private PDF readiness and atomic revision activation all pass.

Before a live report, run `npm run test:postgres:staging-security` with an isolated disposable `OGC_TEST_DATABASE_ADMIN_URL`, then run the read-only staging `db:audit`. A timeout or conditional skip is not acceptance. The full evidence checklist, empty-strict-list case and recovery drills are in `docs/operations/provider-discovery-v2-acceptance.md`.

Automated acceptance:

```powershell
npm run lint
npm test
npm run build
npm run db:audit
npm run test:postgres:staging-security
```

Browser acceptance must prove anonymous denial, authenticated access, more than two distinct staging sites, same-site reuse, forced-new report identity, duplicate-click idempotency, and separation from production data. Provider acceptance additionally requires a real CodingPlan staging call, an Airwallex Sandbox signed Webhook, and a redirected Resend message. Production acceptance must prove the third distinct site returns `429` and staging variables do not change that result.

For an authenticated operator preview of an exact paid staging order, open `/en/reports/{reportId}/staging-access?order={orderId}` (Chinese is the unprefixed canonical interface, so `/zh` redirects). The route issues a one-day cookie only when the persisted order/report pair is paid and either the original fulfillment is deliverable (`completed`/`completed_limited`) or an audited replacement is completed with an active artifact. It redirects to the exact scoped HTML artifact and remains `404` outside protected staging test mode. It does not create a customer PDF or bypass normal emailed access in production.

## Cloudflare production checklist

Current production configuration:

1. Turnstile uses a Managed widget for `geo.itheheda.online` and `open-geo-console.vercel.app`; `TURNSTILE_EXPECTED_HOSTNAME` is the canonical custom domain.
2. Bot Fight Mode is enabled. The separate setting that blocks AI crawlers is off.
3. Rate rule `protect-open-geo-scan-burst` blocks an IP after 5 `/api/scan` requests in 10 seconds for 10 seconds.
4. The origin database limit, Webhook signatures, SSRF protections, and commercial audit remain mandatory. Do not treat the edge burst rule as the product quota.
