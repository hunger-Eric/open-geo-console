# Protected Staging and Production Operations

This runbook is the operator contract for the protected Vercel Preview and the public production deployment. PostgreSQL environment markers and deployment profiles are fail-closed; never work around them with request headers, cookies, query parameters, or a shared secret.

## Canonical Vercel release mode - read before every deployment

The current Open GEO Console Web release path is a manual Vercel Preview from
the exact candidate checkout. It is not a Git-triggered Vercel deployment.
Keep Git publication and Vercel deployment as two separately authorized
actions: pushing a branch does not create a Preview for this project.

Do not confuse the two Vercel links:

- `.vercel/project.json` proves only that the local directory is linked to the
  intended Vercel project and team.
- A Vercel Git-provider integration is a separate project-level `link`. Read
  the live project `link` and the latest deployment `gitSource` before choosing
  any Git-specific command.
- Under the current `link=null` / `gitSource=null` mode, Git branch-scoped
  environment variables are unavailable. Do not use a Git branch argument for
  `vercel env`, and do not infer that a push will deploy.
- `link=null` does not mean that the project has never been deployed. It means
  only that current Git-specific Vercel operations are unavailable; manual CLI
  Preview deployments remain valid.

Unless an active scope explicitly authorizes a different topology, deploy from
the clean canonical worktree at the exact candidate SHA. References later in
this runbook to a clean detached worktree mean an exact clean candidate
checkout; they do not authorize creating or using another worktree when the
active scope requires the canonical worktree only.

After the active release scope has prepared and verified the complete
deployment environment, the proven manual command shape is:

```powershell
vercel deploy --yes --meta ogcGitSha=<candidate-full-sha>
```

Run it at most once when the approved release budget allows one new Preview.
Do not replace it with branch-scoped variables, a Git-triggered Preview, or a
project Git connect/disconnect operation as an inferred repair. Connecting or
disconnecting Git is a persistent platform change and requires a separately
approved scope.

Upload success and `READY` are transport evidence only. Before accepting the
unique Preview, independently inspect it and require both `gitCommitSha` and
`ogcGitSha` to equal the full candidate SHA. Then follow the gates below:
Web, Free Worker, and Deep Worker must share that SHA before moving the fixed
Protected Staging alias. A manual metadata value is identity evidence only and
never substitutes for the independent checks or a real-flow acceptance.

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

The workstation launcher additionally starts `staging-commerce`, a persistent
email-only consumer. Its ignored `.data/workstation-docker/staging-commerce.env`
contains an allowlisted secret set and a stable
`OGC_STAGING_EMAIL_ACTIVATION_AT`. On the first authorized installation only,
prepare with `-InitializeStagingEmailActivation`; all later prepares omit that
switch and fail if both activation authorities are lost. Prepare twice before first start and verify
the timestamp is unchanged in both the runtime file and the separate activation
authority; an invalid/disagreeing timestamp or required Staging email setting
fails closed. Only the named test-email fields from the merged Staging Worker
runtime are projected into the consumer file, and `[SENSITIVE]` placeholders
are rejected. The SQL claim boundary excludes every earlier row, so this
service must not be used to repair or replay historical email.

Protected staging uses `OGC_EVIDENCE_STORAGE=vercel-blob` and the Preview-only `open-geo-console-staging-evidence` Private Blob store. Vercel Web Functions use the project connection's rotating OIDC; before a workstation deep-Worker drill, run `npx vercel pull --yes --environment=preview` so `.vercel/.env.preview.local` contains the store's external-worker token. `npm run worker:staging:deep` loads only that ignored file plus `apps/web/.env.staging.local`; required Sensitive model/Queue values still need their existing explicit process-only overrides. Production may use a separate Private Blob or S3-compatible adapter. Filesystem storage remains local-development-only and is rejected for staging/production. Customer reads always pass through the report-authorized evidence route.

Vercel Sensitive values are intentionally not decryptable through `vercel env pull`; the generated file contains empty placeholders for those names. For a local Worker drill, explicitly override each required empty placeholder with the separately held staging value in only that process. Merely loading another env file does not replace variables that already exist as empty placeholders. Never weaken the database marker guard, print values, or copy production secrets into `.env.staging.local`.

### Public-search provider probe environment

Run the protected-staging capability gate only after the staging Worker runtime environment has been generated. The explicit adapter must match the canonical profile:

```powershell
# OGC_PROVIDER_PROFILE=mimo_native
npm run public-search:probe -- --adapter mimo --locale zh-CN --region CN
# OGC_PROVIDER_PROFILE=sensenova_anysearch
npm run public-search:probe -- --adapter anysearch --locale zh-CN --region CN
```

For the V3 generative-answer mainline, also run the secret-safe same-operation answer/citation probe:

```bash
npm run generative-answer:staging:probe
```

The probe must report a nonblank answer and normalized source domains. It reads the merged staging Worker environment, prints no answer prose, credentials, authorization headers, or raw provider response, and does not create a report, order, credit, refund, or email.

The probe intentionally reads `.data/workstation-docker/staging.env`, which is the merged environment consumed by `staging-worker-free` and `staging-worker-deep`. Source files may contain empty Sensitive-value placeholders even when the merged Worker runtime has valid selected-profile values. Inspecting a source placeholder alone is therefore not evidence that MiMo, SenseNova or AnySearch data is missing. Verify `OGC_PROVIDER_PROFILE` and only its required variable names/non-empty status without printing values, then require the matching bounded probe to pass. Never substitute a production env file or copy secrets into tracked files.

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

Keep the old active artifact until the new customer HTML, private same-HTML PDF readiness artifact, and private evidence all pass readiness. After completion, audit one correction, one locked question set, three questions, one active revision, one artifact-keyed correction email containing only the secure HTML link, zero new billing/refund side effects, and identity-free shared snapshot/search/evidence payloads. Confirm the internal PDF hash, storage key, and page count from authoritative state; do not request a customer PDF endpoint.

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

## Protected staging deployment and real-flow acceptance

This section is the current operator authority for Protected Staging deployment
and complete-flow acceptance. Dated plans, prompts, evidence, old report IDs,
and later specialized commands are context only; they cannot change this order
or substitute for a new end-to-end result.

### Four separate gates

| Gate | What it proves | What it does not prove |
| --- | --- | --- |
| 1. Candidate packaging | Local checks pass and one immutable candidate SHA identifies the Web and Worker source | Nothing has been deployed |
| 2. Staging deployment | The Web Preview and both Staging Workers run the same SHA | The customer flow works |
| 3. Fixed-site smoke | The fixed test site serves the candidate and exposes test commerce | A new report or payment succeeds |
| 4. Real-flow acceptance | One wholly new report completes every persisted stage through accessible Paid V3 HTML | Nothing beyond that exact lineage |

A later gate cannot be inferred from an earlier one. A passing test/build,
`READY` deployment, healthy Worker, HTTP 200, or intermediate report stage is
only a stage result.

### URL roles

- The only business test entry is the fixed Protected Staging URL:
  `https://open-geo-console-staging-itheheda.vercel.app`.
- A unique Vercel Preview URL identifies an artifact; it is not the customer
  acceptance site.
- Before the fixed alias moves, the fixed site represents the old Web revision
  and cannot prove the candidate.
- Direct Vercel Authentication on a unique Preview is not a product failure.
  Do not rebuild it, create a share link, disable protection, or ask the user
  to troubleshoot merely to make that URL browsable.

### Gate 1: package one candidate

1. Perform read-only preflight for Git, linked Vercel project/team, Staging
   database marker/schema, Docker, disk, and current/rollback identities.
2. Run approved tests, lint, build, and diff checks; these prove readiness only.
3. Create one candidate commit and use a clean detached worktree at that SHA.
4. Create a new Preview only when no existing `READY` Preview already matches
   the candidate. Candidate identity requires:
   - state `READY`;
   - target Preview, never Production;
   - the linked project and team;
   - `gitCommitSha` equal to the full candidate SHA;
   - `ogcGitSha` equal to the same SHA; and
   - the clean detached worktree HEAD equal to the same SHA.
5. `githubCommitSha` is optional when Vercel/Git supplies it independently.
   CLI-injected metadata is not independent proof or a reason to redeploy.

Stop if identity is ambiguous. Do not move the fixed alias during this gate.

### Gate 2: deploy the same SHA

1. Record candidate, current, and one rollback image before changing containers.
2. Follow the Docker/disk rules below and in `AGENTS.md`; source-only changes use
   the approved thin overlay, never an unnecessary dependency/browser rebuild.
3. Build from the clean detached worktree and label it with the Web Preview SHA.
4. Before replacement, require the expected Staging marker/schema and zero
   claimable, running, expired-recoverable, or exhausted-terminalizable jobs.
5. Recreate only the named Staging Free and Deep Workers. Verify both use the
   candidate image/SHA, have the correct tiers and Staging runtime identity,
   remain healthy with restart count zero, and have not claimed work.
6. Only after both Workers pass, move the fixed Protected Staging alias once
   to the already accepted candidate Preview.

If a post-change check fails, restore both Workers and the fixed alias to the
recorded rollback identities. A rollback does not authorize a rebuild or retry.
Do not touch Production, the commerce Worker, historical jobs, reports, orders,
payments, or artifacts.

### Gate 3: smoke-test the fixed site

Use the existing authenticated Protected Staging browser session against the
fixed URL, not the unique Preview URL:

1. Confirm `/zh` is reachable through the expected locale redirect and renders
   the candidate site.
2. Confirm `/api/commerce/catalog` returns HTTP 200, reports `mode=test`, and
   contains the products required for the authorized test.
3. Confirm the Web, Free Worker, and Deep Worker still report the same full
   candidate SHA and Staging identity.
4. Confirm no report, crawl, model call, order, payment, refund, email, or
   customer artifact was created by deployment smoke testing.

Anonymous `302`/`401` results remain useful protection checks, but they are not
business acceptance. If this gate fails after cutover, perform the recorded
rollback and stop. If it passes, report exactly: **Protected Staging deployment
completed; real flow not yet accepted.** Then stop before creating a report or
payment.

### Human-readable deployment acceptance card

An independent read-only checker verifies the technical evidence before and
after a high-risk deployment. The user receives this plain-language card;
technical IDs and commands belong in an appendix and are not prerequisites for
the user's decision.

| User-facing question | Allowed answer |
| --- | --- |
| Was another Preview created? | Yes/no, with the concrete reason |
| Did the fixed test site change? | Not switched / switched / rolled back |
| Were a report or payment created? | No, unless Gate 4 was separately authorized |
| Was Production touched? | No |
| Do Web, Free Worker, and Deep Worker run one version? | Yes/no |
| What is the current result? | Not run / deployment complete but not real-flow accepted / safely rolled back |

### Gate 4: accept one wholly new real flow

Gate 4 requires a separate `FROZEN` scope and explicit authorization for
exactly one new report and one Sandbox payment. The acceptance lineage is:

`submitted URL -> Foundation -> Free V4 -> Q1 answer/diagnosis -> semantic receipt -> Sandbox payment -> Paid V3 -> accessible complete HTML`

For that lineage, verify every model, transition, checkpoint, and persistence
boundary:

| Stage | Required persisted evidence |
| --- | --- |
| URL submission | A new report identity and immutable generation locale; no historical identity is reused |
| Foundation | The Foundation checkpoint and artifact complete for that report |
| Free V4 | The Free V4 revision is persisted and bound to the same Foundation |
| Q1 answer/diagnosis | Model-produced answer and diagnosis are persisted for the same report/revision |
| Semantic review | The constrained model judgment and semantic receipt are persisted; deterministic code may enforce schema/evidence contracts but keyword or length heuristics cannot replace semantic judgment |
| Language/correction | Language-gate result and any contract-bounded model correction are recorded in the same run; terminal failure cannot be operator-retried |
| Sandbox payment | One user-authorized payment, verified Webhook, and exactly-once entitlement/Paid V3 job share the lineage |
| Paid V3 | The Paid V3 revision completes and is the active deliverable |
| HTML delivery | The report-specific authorized link opens the complete customer HTML |

A bounded model correction inside the authorized generation contract is an
internal stage of the same run. Once the report or an acceptance gate has
terminally failed, operators must not retry, resume, repair, replay, clone, pay,
or reuse that report.

Only success at all seven checks permits the statement that the complete flow
is fixed. If any check fails:

1. stop without retrying or changing the failed report;
2. report the actual failed stage and root cause;
3. create a new precise `FROZEN` repair scope;
4. repair only after that scope is approved; and
5. request authorization for another wholly new report after the repair.

Local checks, deployment health, prior reports, or partial success can never
replace this evidence.

### Preview protection and Webhooks

- Keep Vercel Standard Authentication enabled for Preview deployments.
  Anonymous page requests must redirect to Vercel login, and anonymous
  `POST /api/scan` must be rejected by deployment protection.
- Keep Airwallex Sandbox and Resend Webhook signature verification enabled in
  the application. Vercel protection is an outer gate, not a substitute for
  provider signatures or event idempotency.
- Pass the current automation bypass only in the provider Webhook URL or another
  provider-supported secret location. Rotate it through Vercel's
  protection-bypass API or dashboard; never print, log, commit, or paste it.
- After rotation, verify the previous credential is rejected and update Sandbox
  providers securely. Do not disable Preview authentication to repair delivery.
- Current production URL: `https://geo.itheheda.online`. Current protected
  staging URL: `https://open-geo-console-staging-itheheda.vercel.app`.
- The staging Airwallex and Resend Webhooks use separate provider-specific
  protection-bypass values. Do not reuse the general automation bypass.

## Specialized acceptance and maintenance references

The workflows below have narrower historical or maintenance purposes. They do
not authorize deployment, a report, payment, repair, or reuse, and they cannot
replace the four-gate current authority above.

### Historical Report V4 three-scenario conformance

The following schema-v40 commands document the historical three-scenario V4
conformance authority. They are local readiness checks, not current full-flow
acceptance:

```powershell
npm test
npm run lint
npm run build
npm run report:v4:traceability
npm run report:v4:acceptance
```

`report:v4:acceptance` must continue to fail while any registry entry remains `implemented` rather than `verified` or the exact three-scenario protected-staging evidence set is incomplete. Do not manufacture evidence or promote statuses to make the command pass.

A live historical V4 conformance run still requires a separate explicit scope
for deployment, schema/database mutation, Airwallex Sandbox payment/refund,
redirected email, Git push, and pull-request creation. Use only exact
run-produced session/scenario identities and immutable authorities; do not
reuse IDs from a prior drill. Production deployment, production database
mutation, and production commerce remain forbidden.

The 2026-07-19 paid core run proves one authorized `combined_geo_report_v4` customer HTML can reach `completed_limited`; it does not complete the three-scenario conformance authority. Its remaining acceptance work is unchanged.

### Specialized combined-report presentation refresh

The approved existing report can be refreshed without creating a charge, credit, correction, refund, email, or production write:

```powershell
npm run staging:combined:refresh -- --report a71d7481-c5dc-4e2a-a042-b9be878feab8
```

The command requires the staging deployment profile and staging database marker. It creates a deep `staging_artifact_refresh` job bound to the active revision and locked question set. The Worker reuses the active technical foundation and screenshots, recollects public sources, and requires one short evidence-constrained answer per question with at least two verified Grade A/B sources from independent domains. The current revision remains active until the customer HTML hash, private same-HTML PDF hash/storage key/page count, screenshot readback, and atomic activation all pass. A failed terminal job marks only the pending revision failed. To intentionally refresh an already refreshed revision, inspect it first and pass `--from-revision <active-artifact-revision-id>`.

Acceptance must record the new revision ID, authorized customer HTML link and hash, internal PDF hash/storage key/page count, source ownership per question, preserved technical citations/screenshots, application-level anonymous `404` for the HTML artifact, and zero commercial side effects. Confirm that completion email contains only the secure HTML link. Do not request, access, or publish a customer PDF endpoint. Never run this command with production environment files or deploy the schema/Worker to production as part of staging acceptance.

### Historical provider-discovery V2 acceptance

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

Paid-return acceptance must also prove that the same browser automatically
lands on `/reports/{reportId}/report.html` only after the exact paid,
deliverable, active-artifact state exists; a fresh redirected report-ready
email leaves `queued`; and an anonymous request to that HTML remains denied.

For an authenticated operator preview of an exact paid staging order, open `/en/reports/{reportId}/staging-access?order={orderId}` (Chinese is the unprefixed canonical interface, so `/zh` redirects). The route issues a one-day cookie only when the persisted order/report pair is paid and either the original fulfillment is deliverable (`completed`/`completed_limited`) or an audited replacement is completed with an active artifact. It redirects to the exact scoped HTML artifact and remains `404` outside protected staging test mode. It does not create a customer PDF or bypass normal emailed access in production.

## Cloudflare production checklist

Current production configuration:

1. Turnstile uses a Managed widget for `geo.itheheda.online` and `open-geo-console.vercel.app`; `TURNSTILE_EXPECTED_HOSTNAME` is the canonical custom domain.
2. Bot Fight Mode is enabled. The separate setting that blocks AI crawlers is off.
3. Rate rule `protect-open-geo-scan-burst` blocks an IP after 5 `/api/scan` requests in 10 seconds for 10 seconds.
4. The origin database limit, Webhook signatures, SSRF protections, and commercial audit remain mandatory. Do not treat the edge burst rule as the product quota.
