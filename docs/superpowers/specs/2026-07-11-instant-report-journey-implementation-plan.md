# Instant Report Journey Implementation Plan

**Design:** `docs/superpowers/specs/2026-07-11-instant-report-journey-design.md`

**Objective:** Turn scan submission into a fast, durable admission command; render a report shell immediately; move homepage technical work into the free Worker; progressively reveal artifacts; and make Turnstile and route feedback interaction-driven.

## Guardrails

- Verified Turnstile remains mandatory in production and is redeemed before admission.
- PostgreSQL remains the only report/job/quota authority.
- The Web process performs validation and durable writes only; Worker performs URL network access, crawling, auditing, and model calls.
- Production free-site quota stays two distinct submitted registrable sites per rolling 24 hours.
- No raw IP, Turnstile token, idempotency key, model key, or report access token is persisted or logged.
- Existing PaymentIntent/HPP return and verified-Webhook payment authority do not change.
- Keep `npm` workspaces and existing batch/realtime Worker commands.

## Phase 1: Define the persistence lifecycle with failing tests

### Tests first

Add or extend:

- `apps/web/src/db/index.test.ts`
- `apps/web/src/db/reports.test.ts`
- `apps/web/src/db/staging-security.postgres.test.ts`
- a focused PostgreSQL admission integration test under `apps/web/src/db/`

Prove:

1. legacy/completed reports read as `technicalStatus: "completed"`;
2. a pending report may have `score = null` and `payload = null`;
3. completing technical work atomically writes payload, score, final URL and `technicalStatus = "completed"`;
4. a technical failure persists only a safe public error and `technicalStatus = "failed"`;
5. schema version 2 is required after the migration and newer-schema protection remains fail-closed.

### Implementation

Modify:

- `apps/web/src/db/schema.ts`
- `apps/web/src/db/migrations.ts`
- `apps/web/src/db/index.ts`
- `apps/web/src/db/reports.ts`
- `apps/web/src/db/memory.ts`

Changes:

- add `ReportTechnicalStatus = pending | processing | completed | failed`;
- add `scan_reports.technical_status`, `technical_error_code`, and `technical_public_error`;
- make `scan_reports.payload` nullable while keeping completed payloads typed;
- add nullable unique `admission_idempotency_hmac` for durable command recovery;
- migrate existing rows with payloads to `completed`;
- expose `createGeoReportShell`, `markGeoReportTechnicalProcessing`, `completeGeoReportTechnical`, and `failGeoReportTechnical` boundaries;
- bump `DATABASE_SCHEMA_VERSION` to 2.

Run:

```bash
npm test -- --run apps/web/src/db/index.test.ts apps/web/src/db/reports.test.ts
```

## Phase 2: Add atomic free-scan admission

### Tests first

Create `apps/web/src/db/scan-admission.postgres.test.ts` and expand `apps/web/src/app/api/scan/route.test.ts`.

Prove:

1. a new command creates one report shell, one free job, one trial relationship, one budget outcome, and one dispatch outbox row;
2. the same idempotency key returns the same report/job;
3. simultaneous duplicates cannot create two jobs;
4. existing-site reuse returns the existing report without creating a shell;
5. the rolling distinct-site limit and staging forced-regeneration cap remain unchanged;
6. admission failure leaves no orphan shell, job, budget claim, or regeneration reservation;
7. the route does not import or call `auditSite`, `createSafeFetch`, DNS resolution, or the crawler;
8. successful new admission returns `202` with report ID and `status: "queued"` before Worker execution.

### Implementation

Add `apps/web/src/db/scan-admission.ts` and refactor transaction-capable pieces of:

- `apps/web/src/db/trials.ts`
- `apps/web/src/db/commercial-budget.ts`
- `apps/web/src/db/commercial-dispatch.ts`

The admission transaction will:

1. acquire the existing narrow policy/admission locks;
2. recover by the HMACed idempotency key;
3. resolve current reuse or staging regeneration;
4. enforce the distinct-site and active-job limits;
5. insert the pending report shell;
6. consume or record the free-AI budget decision;
7. insert a free job whose checkpoint records `aiEnabled` and a safe skip reason;
8. insert the notification outbox row;
9. attach the trial/regeneration relationship;
10. commit and return a customer-safe result.

Refactor `apps/web/src/app/api/scan/route.ts` to:

- validate JSON, locale, URL syntax, deployment policy, Turnstile, and `Idempotency-Key`;
- derive the submitted registrable site locally;
- call the admission boundary;
- remove homepage fetching and technical audit imports;
- return `200` for reuse and `202` for new/regenerating admission.

Run:

```bash
npm test -- --run apps/web/src/app/api/scan/route.test.ts apps/web/src/db/scan-admission.postgres.test.ts
```

## Phase 3: Move free technical work into the Worker

### Tests first

Extend Worker processor tests to prove:

1. a free pending report enters technical processing before any model client is constructed;
2. the Worker performs safe homepage audit and persists technical payload before AI completion;
3. an exhausted AI budget still yields a completed technical report without a model call;
4. missing AI configuration cannot erase or hide a completed technical report;
5. retry resumes from persisted technical completion and does not repeat completed work unnecessarily;
6. a permanent URL/safety failure terminalizes the pending report with safe public text;
7. deep jobs continue using the existing private multi-page technical boundary and commercial terminalization.

### Implementation

Modify:

- `apps/web/src/worker/processor.ts`
- `apps/web/src/worker/recovery.ts` where resume-stage logic needs the new checkpoint fields
- `apps/web/src/db/jobs.ts` only where terminal/technical coordination must be atomic

Free-job sequence:

1. load the durable report shell;
2. if technical work is pending, mark processing and run `auditSite` with safe fetch and homepage-only limit;
3. persist technical payload immediately;
4. if `aiEnabled` is false, terminalize the non-billable free job without constructing a model client;
5. otherwise continue the existing homepage-only evidence, analysis, verification, and synthesis path;
6. preserve technical payload if AI later fails.

Run:

```bash
npm test -- --run apps/web/src/worker
```

## Phase 4: Render pending reports and progressive artifacts

### Tests first

Add tests for:

- pending report route rendering;
- missing report versus pending report behavior;
- status payload technical lifecycle;
- client refresh when technical payload first becomes available;
- completed report rendering compatibility.

### Implementation

Modify:

- `apps/web/src/app/[locale]/reports/[id]/page.tsx`
- `apps/web/src/app/[locale]/reports/[id]/[section]/page.tsx`
- `apps/web/src/app/api/reports/[id]/status/route.ts`
- `apps/web/src/components/ai-report-status.tsx`
- `apps/web/src/components/report-view.tsx` only where progressive composition requires it

Add:

- `apps/web/src/components/pending-report-view.tsx`
- `apps/web/src/app/[locale]/reports/[id]/loading.tsx`
- a shared report workspace loading component if both overview and section routes need identical structure.

Behavior:

- a real pending row renders site identity and status instead of the unavailable fallback;
- the status API returns `technicalStatus`, `hasTechnicalReport`, and safe technical failure state;
- status polling refreshes the server route when technical data appears and again when AI completes;
- section loading shells match the existing workspace header/navigation geometry;
- terminal technical failure remains on the durable report URL with a clear recovery action.

Run:

```bash
npm test -- --run apps/web/src/app/api/reports apps/web/src/components/ai-report-status.test.ts
```

## Phase 5: Make Turnstile interaction-driven

### Tests first

Add a small pure deferred-execution controller test and focused form tests where the current test environment supports them.

Prove:

1. execution requested before script readiness runs once after widget readiness;
2. repeated clicks while verifying do not execute or submit twice;
3. token callback continues exactly the pending action;
4. expiry/error/consumed-token paths reset the widget and form;
5. no initial token is required to enable an otherwise valid primary action.

### Implementation

Modify:

- `apps/web/src/components/turnstile-widget.tsx`
- `apps/web/src/components/scanner-form.tsx`
- `apps/web/src/components/commercial-checkout.tsx`
- the report link-reissue form if it renders the shared widget
- `apps/web/src/i18n.ts`

The shared adapter will:

- render with `appearance: "interaction-only"` and `execution: "execute"`;
- expose `execute()` and `reset()` through a typed ref;
- queue an execution request while the script is loading;
- remove the initial fixed minimum-height reservation;
- clear tokens on expiry/error and notify the owning form.

Forms will show localized `Verifying…`, `Submitting…`, or `Opening secure checkout…` text immediately and reset Turnstile after any server response that consumed the token.

Run:

```bash
npm test -- --run apps/web/src/components apps/web/src/security/turnstile.test.ts
```

## Phase 6: Global loading and accessibility pass

Modify only existing primary journeys:

- report workspace navigation;
- scan submission;
- checkout redirect;
- report unlock and language correction;
- report status/manual refresh.

Verify:

- action feedback is synchronous with the click;
- `aria-live`, `aria-busy`, progress semantics, focus recovery, and reduced-motion behavior are correct;
- controls disable only for the action they own;
- no new layout shift or empty reserved challenge space appears at desktop or mobile widths.

Do not redesign unrelated typography, cards, navigation, or report content.

## Phase 7: Full verification and rollout

Run locally:

```bash
npm run lint
npm test
npm run build
npm run test:postgres:staging-security
cd apps/web
node --env-file=.env.staging.local --import tsx src/scripts/db-audit.ts
```

Then:

1. sync CodeGraph and confirm the index is current;
2. apply the schema migration once to staging before switching traffic;
3. deploy protected Preview and repoint the fixed staging alias;
4. verify anonymous protection remains `302`/`401`;
5. run desktop and mobile Browser acceptance for homepage, on-demand Turnstile, admission timing, report shell, stage progression, progressive technical render, section navigation, and checkout;
6. confirm runtime logs show fast `POST /api/scan` responses and no crawler/model execution in the Web function;
7. confirm database rows and outbox/job counts prove exactly-once admission;
8. run staging commercial invariant audit;
9. commit and push accepted implementation;
10. pre-migrate production schema, deploy production with commerce still disabled, and verify `/api/commerce/catalog` remains `enabled: false` and `mode: disabled`;
11. update `PROJECT-STATE.md`, `TASKS.md`, and `DECISIONS.md` with measured evidence and remaining risks.

## Acceptance Criteria

- The first click gives visible feedback immediately and never requires a pre-click checkbox.
- Low-risk Turnstile proceeds without a second click; interactive proof appears only when Cloudflare requests it.
- Web admission performs no target-site network request, technical audit, or model call.
- A durable localized report URL is returned immediately after validation and atomic admission.
- Reloading that URL recovers pending, processing, completed, or failed state from PostgreSQL.
- Technical evidence appears before optional AI completion when it becomes available first.
- Existing quota, staging regeneration, access, payment, Webhook, refund, and commercial terminalization boundaries remain intact.
- Automated, PostgreSQL, build, protected-staging, runtime-log, desktop, mobile, and production-disabled-commerce checks pass.
