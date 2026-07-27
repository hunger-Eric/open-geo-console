# V3 Replacement Fulfillment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix provider-discovery snapshot cache identity, then deliver one audited non-billable V3 replacement fulfillment for the already-paid failed Sandbox order.

**Architecture:** Snapshot cache identity becomes a hash of the effective query plan, so a completed snapshot produced under a different provider policy cannot be reused as if its queries matched. A new schema-v23 replacement lineage creates one credit-free deep job and V3 artifact revision tied to the original paid order and failed job; a dedicated terminalizer activates the replacement without rewriting payment, failure, credit, or refund history.

**Tech Stack:** TypeScript, Next.js, npm workspaces, Vitest, PostgreSQL 17, Drizzle schema declarations, Docker staging Workers, Vercel protected Preview, in-app Chromium acceptance.

## Global Constraints

- Do not reopen or mutate terminal job `9f3221a2-1a3b-47c8-9c3e-eda2b8be52dd`.
- Do not create a payment order, payment event, entitlement, credit ledger entry, or provider refund.
- Reuse the original report, paid order, locale, target site, and locked three-question set.
- Permit exactly one replacement fulfillment for the original order.
- The replacement job has no credit reservation and is protected-staging-only.
- Do not delete or rewrite historical market snapshots; make cache identity prospective and exact.
- Activate the new V3 revision only after HTML, private-PDF, evidence, locale, hash, storage, and page-count readiness pass.
- Preserve the truthful unresolved Airwallex refund-assistance state.
- Production code remains read-compatible, but the operator command refuses production and no production deployment or data mutation is authorized.
- Use `npm` workspaces; preserve all unrelated user changes, including the untracked remediation plan.

---

## File Map

- `packages/public-search-observer/src/identity.ts`: derive cache identity from the normalized effective query plan.
- `packages/public-search-observer/src/types.ts`: add the query-plan identity input type.
- `packages/public-search-observer/src/index.test.ts`: prove identical questions with different effective queries do not share cache identity.
- `apps/web/src/worker/public-source-snapshot-resolver.ts`: pass the complete fanout into cache identity and emit typed materialization mismatch detail.
- `apps/web/src/worker/public-source-snapshot-resolver.test.ts`: reproduce the live policy-drift cache collision and verify exact reuse/refresh.
- `apps/web/src/db/market-snapshots.postgres.test.ts`: prove distinct persisted snapshots for distinct effective fanouts.
- `apps/web/src/db/schema.ts`, `apps/web/src/db/migrations.ts`, `apps/web/src/db/index.ts`: schema-v23 replacement lineage and constraints.
- `apps/web/src/db/schema-v23.postgres.test.ts`: isolated PostgreSQL constraint coverage.
- `apps/web/src/db/report-replacement-fulfillments.ts`: prepare, inspect, and load replacement execution context.
- `apps/web/src/db/report-replacement-fulfillments.postgres.test.ts`: eligibility, uniqueness, atomicity, and no-billing coverage.
- `apps/web/src/scripts/staging-report-replacement.ts`, root and web `package.json`: protected-staging operator interface.
- `apps/web/src/worker/processor.ts`: route replacement jobs through the normal V3 pipeline with reusable foundation checks.
- `apps/web/src/worker/processor-contract.test.ts`: job-reason routing and identity coverage.
- `apps/web/src/db/combined-replacement-terminalization.ts`: credit-free atomic V3 activation and replacement-ready email intent.
- `apps/web/src/db/combined-replacement-terminalization.postgres.test.ts`: success, rollback, and historical-state invariants.
- `apps/web/src/db/schema.ts`, `apps/web/src/email/*`, `apps/web/src/commerce/operations.ts`: `replacement_report_ready` email contract.
- `apps/web/src/app/api/reports/[id]/orders/[orderId]/status/route.ts` and `apps/web/src/components/payment-return.ts`: project courtesy-ready and refund-assistance states together.
- `docs/PROJECT-STATE.md`, `docs/TASKS.md`, `docs/PROTECTED-STAGING-OPERATIONS.md`, acceptance evidence: operator and handoff truth.

### Task 1: Make Snapshot Cache Identity Query-Plan Exact

**Files:**
- Modify: `packages/public-search-observer/src/identity.ts`
- Modify: `packages/public-search-observer/src/types.ts`
- Test: `packages/public-search-observer/src/index.test.ts`
- Modify: `apps/web/src/worker/public-source-snapshot-resolver.ts`
- Test: `apps/web/src/worker/public-source-snapshot-resolver.test.ts`
- Test: `apps/web/src/db/market-snapshots.postgres.test.ts`

**Interfaces:**
- Consumes: `CanonicalBuyerQuestion`, `PublicSearchSurface`, and `SearchQueryFanout`.
- Produces: `createMarketSnapshotIdentity({ question, surface, fanout })` where query identity excludes question IDs but includes ordered `exactQuery`, `derivationRuleId`, `resultDepth`, fanout version, and budget.
- Produces: `PublicSourceSnapshotMaterializationMismatchError` detail categories `missing_stored_query`, `missing_runtime_query`, `query_text_mismatch`, and `attempt_incomplete` inside the existing privacy-safe snapshot error envelope.

- [ ] **Step 1: Write the failing identity regression**

```ts
const baseFanout = createSearchQueryFanout({ question, surface });
const logisticsFanout = {
  ...baseFanout,
  queries: baseFanout.queries.map((query, index) => index === 1
    ? { ...query, exactQuery: `${question.normalizedText} 自有车队 固定运力` }
    : query)
};
expect(createMarketSnapshotIdentity({ question, surface, fanout: baseFanout }).id)
  .not.toBe(createMarketSnapshotIdentity({ question, surface, fanout: logisticsFanout }).id);
```

- [ ] **Step 2: Run the package regression and verify RED**

Run: `npm exec vitest run -- packages/public-search-observer/src/index.test.ts`

Expected: TypeScript/test failure because `fanout` is not accepted and current identity collides on `fanoutVersion`.

- [ ] **Step 3: Implement exact query-plan identity**

```ts
export function createMarketSnapshotIdentity(input: {
  question: CanonicalBuyerQuestion;
  surface: PublicSearchSurface;
  fanout: Pick<SearchQueryFanout, "fanoutVersion" | "queries" | "budget">;
}): MarketSnapshotIdentity {
  const planIdentity = JSON.stringify({
    fanoutVersion: input.fanout.fanoutVersion,
    queries: input.fanout.queries.map(({ exactQuery, derivationRuleId, resultDepth }) =>
      ({ exactQuery: exactQuery.normalize("NFKC"), derivationRuleId, resultDepth })),
    budget: input.fanout.budget
  });
  const dimensions = [input.question.normalizedText, input.question.locale, input.question.region,
    input.surface.surfaceId, input.surface.surfaceVersion, input.fanout.fanoutVersion, planIdentity]
    .map((value) => value.trim().normalize("NFKC"));
  return { id: deterministicId("market", dimensions), normalizedQuestion: dimensions[0]!, locale: dimensions[1]!,
    region: dimensions[2]!, surfaceId: dimensions[3]!, surfaceVersion: dimensions[4]!, fanoutVersion: dimensions[5]! };
}
```

Update every call site to pass its actual fanout. Do not retain a fallback that recreates the collision.

- [ ] **Step 4: Add the live resolver regression**

Create one completed generic-policy snapshot, then resolve the same normalized question under a logistics-policy fanout with different exact queries. Assert that the second call creates a different snapshot and never enters `snapshot_materialization`.

```ts
expect(second.snapshotId).not.toBe(first.snapshotId);
expect(second.collectedForThisRun).toBe(true);
expect(search).toHaveBeenCalledTimes(firstFanout.queries.length + secondFanout.queries.length);
```

Also seed a cached snapshot with attempts persisted out of query order and terminal `timeout`/`malformed` siblings; assert exact fanout reuse succeeds.

- [ ] **Step 5: Add mismatch diagnostics without weakening validation**

Replace the compound `toObservations` condition with category-specific checks. Throw the existing safe public error while recording snapshot ID, attempt ID, stored query ID, query order, and mismatch category only; never include query text in the error metadata.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```powershell
npm exec vitest run -- packages/public-search-observer/src/index.test.ts apps/web/src/worker/public-source-snapshot-resolver.test.ts apps/web/src/db/market-snapshots.postgres.test.ts
```

Expected: all selected tests pass; the two fanouts persist different cache identities.

- [ ] **Step 7: Commit**

```powershell
git add packages/public-search-observer/src/identity.ts packages/public-search-observer/src/types.ts packages/public-search-observer/src/index.test.ts apps/web/src/worker/public-source-snapshot-resolver.ts apps/web/src/worker/public-source-snapshot-resolver.test.ts apps/web/src/db/market-snapshots.postgres.test.ts
git commit -m "fix: bind snapshots to exact query plans"
```

### Task 2: Add Schema-v23 Replacement Lineage

**Files:**
- Modify: `apps/web/src/db/schema.ts`
- Modify: `apps/web/src/db/migrations.ts`
- Modify: `apps/web/src/db/index.ts`
- Create: `apps/web/src/db/schema-v23.postgres.test.ts`
- Modify: `apps/web/src/db/index.test.ts`

**Interfaces:**
- Produces: `report_replacement_fulfillments` and `ReportReplacementFulfillmentRow`.
- Produces: `ScanJobReason` member `replacement_fulfillment` and `ArtifactRevisionKind` member `replacement`.
- Produces: nullable `replacement_fulfillment_id` on `scan_jobs` and `report_artifact_revisions`.

- [ ] **Step 1: Write the failing schema-v23 test**

The test migrates an isolated database, inserts a paid failed order fixture, and asserts:

```ts
await sql`INSERT INTO report_replacement_fulfillments
  (id,order_id,report_id,original_failed_job_id,failed_artifact_revision_id,question_set_id,reason_code,state,operator_authorization_ref)
  VALUES('replacement-1','order-1','report-1','failed-job','failed-artifact','questions-1','paid_report_not_delivered','prepared','approval-2026-07-15')`;
await expect(/* same order, second ID */).rejects.toThrow();
```

It also asserts replacement jobs require `credit_reservation_id IS NULL`, exact lineage IDs, deep tier, V3 artifact contract, and `reason='replacement_fulfillment'`.

- [ ] **Step 2: Run the PostgreSQL test and verify RED**

Run: `npm exec vitest run -- apps/web/src/db/schema-v23.postgres.test.ts`

Expected: FAIL because schema version 23 and the replacement table/columns do not exist.

- [ ] **Step 3: Add migration and Drizzle declarations**

Add schema version 23 with table columns and unique indexes:

```sql
CREATE TABLE IF NOT EXISTS report_replacement_fulfillments (
  id text PRIMARY KEY,
  order_id text NOT NULL UNIQUE REFERENCES payment_orders(id) ON DELETE RESTRICT,
  report_id text NOT NULL REFERENCES scan_reports(id) ON DELETE RESTRICT,
  original_failed_job_id text NOT NULL UNIQUE REFERENCES scan_jobs(id) ON DELETE RESTRICT,
  failed_artifact_revision_id text NOT NULL UNIQUE REFERENCES report_artifact_revisions(id) ON DELETE RESTRICT,
  question_set_id text NOT NULL REFERENCES report_business_question_sets(id) ON DELETE RESTRICT,
  replacement_job_id text UNIQUE REFERENCES scan_jobs(id) ON DELETE RESTRICT,
  active_artifact_revision_id text UNIQUE,
  reason_code text NOT NULL CHECK (reason_code='paid_report_not_delivered'),
  state text NOT NULL CHECK (state IN ('prepared','queued','running','repair_wait','completed','failed')),
  operator_authorization_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
```

Add foreign keys for job/artifact lineage after the columns exist, plus checks that `revision_kind='replacement'` rows have replacement lineage and no source artifact.

- [ ] **Step 4: Run schema tests and verify GREEN**

Run:

```powershell
npm exec vitest run -- apps/web/src/db/schema-v23.postgres.test.ts apps/web/src/db/index.test.ts
```

Expected: PASS and `DATABASE_SCHEMA_VERSION` equals 23.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/db/schema.ts apps/web/src/db/migrations.ts apps/web/src/db/index.ts apps/web/src/db/schema-v23.postgres.test.ts apps/web/src/db/index.test.ts
git commit -m "feat: add replacement fulfillment lineage"
```

### Task 3: Implement Protected-Staging Preparation and Inspection

**Files:**
- Create: `apps/web/src/db/report-replacement-fulfillments.ts`
- Create: `apps/web/src/db/report-replacement-fulfillments.postgres.test.ts`
- Create: `apps/web/src/scripts/staging-report-replacement.ts`
- Modify: `apps/web/package.json`
- Modify: `package.json`

**Interfaces:**
- Produces: `prepareApprovedReportReplacement(input: { confirm: boolean; authorizationRef: string })`.
- Produces: `inspectApprovedReportReplacement()`.
- Produces: `getReplacementExecutionContext(jobId: string)`.
- Produces commands `npm run staging:replacement:inspect` and `npm run staging:replacement:prepare -- --confirm --authorization-ref <ref>`.

- [ ] **Step 1: Write failing eligibility and atomicity tests**

Test the exact approved target constants and these rejection cases: wrong environment marker, unpaid order, non-terminal job, existing active artifact, reserved credit, unlocked/wrong question set, competing correction/refresh, duplicate replacement, and missing confirmation.

Assert the successful transaction creates exactly one replacement row, job, revision, transition, and dispatch row while all before/after counts for orders, payment events, refunds, access keys, and credit ledger remain identical.

- [ ] **Step 2: Run the focused PostgreSQL test and verify RED**

Run: `npm exec vitest run -- apps/web/src/db/report-replacement-fulfillments.postgres.test.ts`

Expected: FAIL because the repository functions do not exist.

- [ ] **Step 3: Implement the approved target and inspector**

```ts
export const APPROVED_REPLACEMENT_TARGET = {
  orderId: "98974ea3-369e-43bc-b84b-602d96382b02",
  reportId: "0631932e-72b8-4c6f-b492-820e2533e23e",
  originalFailedJobId: "9f3221a2-1a3b-47c8-9c3e-eda2b8be52dd",
  failedArtifactRevisionId: "cf76433c-c1de-43b6-ba75-cf3fc98500d5",
  questionSetId: "business-question-set-2b296a7e7976b0fc47a48a0c0a9107ac35c7be74ba60fd23f7f9ecea3fe6c265"
} as const;
```

The eligibility query must lock the order, failed job, credit, report, question set, and failed artifact in one transaction before inserting anything.

- [ ] **Step 4: Implement atomic preparation**

Create a deep V3 job with `reason='replacement_fulfillment'`, no credit, the original locked question set, a revision-2 pending artifact, and a dispatch outbox row. Set `payment_orders.courtesy_non_billable=true` only in this transaction; do not alter its payment, fulfillment, refund, or delivery statuses.

- [ ] **Step 5: Add protected operator commands**

The script must call the existing staging guard, refuse absent `--confirm` or authorization reference, and print only IDs/statuses—never secrets or customer email.

- [ ] **Step 6: Run tests and verify GREEN**

Run:

```powershell
npm exec vitest run -- apps/web/src/db/report-replacement-fulfillments.postgres.test.ts
npm run staging:replacement:inspect
```

Expected: tests pass; inspect is read-only and reports the target eligible only after Task 1 readiness is deployed/probed.

- [ ] **Step 7: Commit**

```powershell
git add apps/web/src/db/report-replacement-fulfillments.ts apps/web/src/db/report-replacement-fulfillments.postgres.test.ts apps/web/src/scripts/staging-report-replacement.ts apps/web/package.json package.json
git commit -m "feat: prepare audited report replacements"
```

### Task 4: Route Replacement Jobs Through V3 Without Billing

**Files:**
- Modify: `apps/web/src/worker/processor.ts`
- Test: `apps/web/src/worker/processor-contract.test.ts`
- Modify: `apps/web/src/db/jobs.ts`
- Test: `apps/web/src/db/recovery-state.postgres.test.ts`

**Interfaces:**
- Consumes: `getReplacementExecutionContext(jobId)`.
- Produces: replacement execution using the existing deep foundation/crawl identity checks and V3 pipeline.
- Produces: replacement failure/repair transitions that never invoke paid refund/credit terminalization.

- [ ] **Step 1: Write the failing routing tests**

Assert a replacement job loads its context, executes V3 with `originalPaidJobId` from the original failed job, and selects replacement terminalization. Assert generic failed-job commerce reconciliation is not called.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm exec vitest run -- apps/web/src/worker/processor-contract.test.ts apps/web/src/db/recovery-state.postgres.test.ts`

Expected: FAIL because replacement reason/context is not routed.

- [ ] **Step 3: Implement the replacement branch**

Treat `replacement_fulfillment` like a full deep generation, not a correction renderer refresh. Reuse the original deep technical foundation only when report, target, locale, tier, content identity, and retention checks pass; otherwise use the normal crawl/analysis path.

At every generic failure branch, exclude replacement jobs from `terminalizePaidReportFailure`. Persist replacement state and error events without modifying the original order/credit/refund rows.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm exec vitest run -- apps/web/src/worker/processor-contract.test.ts apps/web/src/db/recovery-state.postgres.test.ts`

Expected: PASS; replacement reason reaches V3 and never paid terminalization.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/worker/processor.ts apps/web/src/worker/processor-contract.test.ts apps/web/src/db/jobs.ts apps/web/src/db/recovery-state.postgres.test.ts
git commit -m "feat: run nonbillable v3 replacements"
```

### Task 5: Atomically Activate the Replacement Artifact

**Files:**
- Create: `apps/web/src/db/combined-replacement-terminalization.ts`
- Create: `apps/web/src/db/combined-replacement-terminalization.postgres.test.ts`
- Modify: `apps/web/src/worker/processor.ts`

**Interfaces:**
- Produces: `terminalizeCombinedReplacement(input)` with the same readiness input shape as `terminalizeCombinedCorrection`.
- Consumes: ready `CombinedGeoReportV3`, replacement context, immutable snapshot refs, and active lease/checkpoint identity.

- [ ] **Step 1: Write failing success and rollback tests**

The success fixture asserts:

```ts
expect(result.report.answerCards).toHaveLength(3);
expect(state.replacement).toBe("completed");
expect(state.job).toBe("completed");
expect(state.artifact).toBe("active");
expect(state.activeArtifactRevisionId).toBe(replacementArtifactId);
expect(state.creditRowsAfter).toBe(state.creditRowsBefore);
expect(state.orderPaymentStatus).toBe("paid");
expect(state.orderRefundStatus).toBe("failed");
```

Inject faults after refs, report, readiness, activation, job, and email; every fault must roll back the whole replacement terminalization.

- [ ] **Step 2: Run the PostgreSQL test and verify RED**

Run: `npm exec vitest run -- apps/web/src/db/combined-replacement-terminalization.postgres.test.ts`

Expected: FAIL because the terminalizer does not exist.

- [ ] **Step 3: Implement the dedicated terminalizer**

Validate exact running lease, replacement ID, no credit reservation, locked question set, V3 artifact contract, original paid/failed order lineage, and checkpoint identity. Bind snapshot refs, insert `combined_geo_reports`, persist readiness, activate the revision, update `scan_reports`, replacement state, and replacement job atomically.

Do not update original `fulfillment_status`, `fulfilled_at`, `refund_status`, credit ledger, access key credits, or payment-refund state.

- [ ] **Step 4: Queue one replacement-ready email intent**

Use business key `replacement_report_ready/<artifactRevisionId>/v1`; on conflict, load and return the existing row.

- [ ] **Step 5: Run the PostgreSQL test and verify GREEN**

Run: `npm exec vitest run -- apps/web/src/db/combined-replacement-terminalization.postgres.test.ts`

Expected: PASS for activation, idempotency, and every rollback boundary.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/db/combined-replacement-terminalization.ts apps/web/src/db/combined-replacement-terminalization.postgres.test.ts apps/web/src/worker/processor.ts
git commit -m "feat: activate replacement v3 reports"
```

### Task 6: Project Courtesy Delivery and Refund Assistance Truthfully

**Files:**
- Modify: `apps/web/src/db/schema.ts`
- Modify: `apps/web/src/db/migrations.ts`
- Modify: `apps/web/src/db/commercial-delivery.ts`
- Modify: `apps/web/src/commerce/operations.ts`
- Modify: `apps/web/src/email/gateway.ts`
- Modify: `apps/web/src/email/templates.ts`
- Test: `apps/web/src/email/resend.test.ts`
- Modify: `apps/web/src/app/api/reports/[id]/orders/[orderId]/status/route.ts`
- Test: `apps/web/src/app/api/reports/[id]/orders/[orderId]/status/route.test.ts`
- Modify: `apps/web/src/components/payment-return.ts`
- Test: `apps/web/src/components/payment-return-banner.test.ts`
- Modify: `apps/web/src/components/payment-return-banner.tsx`

**Interfaces:**
- Produces: `EmailTemplateType = ... | "replacement_report_ready"`.
- Produces order projection fields `replacementStatus` and `replacementReportReady` without changing original commerce states.

- [ ] **Step 1: Write failing email and order-projection tests**

Assert Chinese and English replacement-ready email subjects/body link to authorized HTML only. Assert the order projection can simultaneously report `replacementReportReady=true` and `refundStatus='failed'`.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
npm exec vitest run -- apps/web/src/email/resend.test.ts apps/web/src/app/api/reports/[id]/orders/[orderId]/status/route.test.ts apps/web/src/components/payment-return-banner.test.ts
```

Expected: FAIL because replacement template/projection is absent.

- [ ] **Step 3: Implement email contract and delivery classification**

Add the migration/schema check value, template rendering, gateway type, and final-delivery classification. The email states that a courtesy replacement report is ready and does not claim the Airwallex refund succeeded.

- [ ] **Step 4: Implement the truthful customer banner**

When replacement report is active, show the secure report-ready action and a separate refund-assistance notice. Do not show the checkout button, “waiting for payment,” or “automatic refund completed.”

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
npm exec vitest run -- apps/web/src/email/resend.test.ts apps/web/src/app/api/reports/[id]/orders/[orderId]/status/route.test.ts apps/web/src/components/payment-return-banner.test.ts
npm run lint --workspace apps/web
```

Expected: tests and lint pass.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/db/schema.ts apps/web/src/db/migrations.ts apps/web/src/db/commercial-delivery.ts apps/web/src/commerce/operations.ts apps/web/src/email/gateway.ts apps/web/src/email/templates.ts apps/web/src/email/resend.test.ts apps/web/src/app/api/reports/[id]/orders/[orderId]/status/route.ts apps/web/src/app/api/reports/[id]/orders/[orderId]/status/route.test.ts apps/web/src/components/payment-return.ts apps/web/src/components/payment-return-banner.tsx apps/web/src/components/payment-return-banner.test.ts
git commit -m "feat: surface replacement report delivery"
```

### Task 7: Full Verification and Documentation

**Files:**
- Modify: `docs/PROTECTED-STAGING-OPERATIONS.md`
- Modify: `docs/PROJECT-STATE.md`
- Modify: `docs/TASKS.md`
- Modify: `docs/AI-REPORT-ENGINE.md`

**Interfaces:**
- Consumes all Tasks 1-6.
- Produces a deployable, documented schema-v23 replacement workflow.

- [ ] **Step 1: Run focused replacement and snapshot suites**

```powershell
npm exec vitest run -- packages/public-search-observer/src/index.test.ts apps/web/src/worker/public-source-snapshot-resolver.test.ts apps/web/src/db/market-snapshots.postgres.test.ts apps/web/src/db/schema-v23.postgres.test.ts apps/web/src/db/report-replacement-fulfillments.postgres.test.ts apps/web/src/db/combined-replacement-terminalization.postgres.test.ts apps/web/src/worker/processor-contract.test.ts apps/web/src/email/resend.test.ts apps/web/src/app/api/reports/[id]/orders/[orderId]/status/route.test.ts apps/web/src/components/payment-return-banner.test.ts
```

Expected: all selected tests pass.

- [ ] **Step 2: Run full deterministic verification**

```powershell
npm test
npm run lint
npm run build
codegraph sync
codegraph status
```

Expected: tests, lint, and build pass; CodeGraph is up to date.

- [ ] **Step 3: Update operator and state documentation**

Document the exact inspect/prepare commands, one-time eligibility, no-billing invariants, replacement state, and acceptance commands. Replace stale blockers; do not append a chat transcript.

- [ ] **Step 4: Commit**

```powershell
git add docs/PROTECTED-STAGING-OPERATIONS.md docs/PROJECT-STATE.md docs/TASKS.md docs/AI-REPORT-ENGINE.md
git commit -m "docs: document v3 replacement fulfillment"
```

### Task 8: Deploy, Create the One Replacement, and Deliver the Report

**Files:**
- Modify only runtime evidence/status docs after acceptance.
- Create or update: `docs/operations/evidence/2026-07-15-v3-replacement-fulfillment-acceptance.md`

**Interfaces:**
- Consumes: protected Preview deployment, aligned staging free/deep Workers, provider preflights, and replacement operator commands.
- Produces: one active V3 revision and browser-verified customer report.

- [ ] **Step 1: Deploy and align staging only**

Deploy the exact tested commit to protected Preview, wait for Ready, repoint only the fixed staging alias, rebuild only staging free/deep Workers, and verify the Worker OCI revision/digest matches. Do not touch production.

- [ ] **Step 2: Run every pre-creation gate**

```powershell
npm run public-search:probe -- --adapter mimo --locale zh-CN --region CN
npm run commerce:staging:probe
npm run commerce:staging:all
npm run db:audit --workspace apps/web -- --env-file=.env.staging.local
npm run staging:replacement:inspect
```

Expected: provider/readiness probes and database audit pass; inspector reports eligible with zero existing replacements.

- [ ] **Step 3: Create exactly one replacement**

```powershell
npm run staging:replacement:prepare -- --confirm --authorization-ref user-approved-2026-07-15
```

Expected: one replacement, one credit-free deep job, one pending revision, and no changes to order/payment/refund/credit counts.

- [ ] **Step 4: Monitor the authoritative job and artifact**

Poll PostgreSQL transition/error events and the staging deep Worker. Do not create another replacement or manually advance state. Repair only typed in-scope runtime defects, preserving checkpoints.

- [ ] **Step 5: Drain delivery and audit**

Run staging commerce delivery until the replacement-ready email reaches its terminal provider state, then run `db:audit`. Airwallex refund failure may remain and must be displayed separately.

- [ ] **Step 6: Browser acceptance**

Using the in-app browser, verify the authorized V3 HTML has exactly three cards, sources, GEO diagnosis, limitations, and technical sections. Verify desktop and mobile layouts, secure navigation, and that anonymous/wrong-scope access returns application-level `404`.

- [ ] **Step 7: Persist acceptance evidence and commit**

Record deployment ID, Worker digest, replacement/job/revision IDs, card statuses, artifact readiness, access checks, database invariants, email/refund truth, and screenshots. Update project state from pending to delivered.

```powershell
git add docs/operations/evidence/2026-07-15-v3-replacement-fulfillment-acceptance.md docs/PROJECT-STATE.md docs/TASKS.md
git commit -m "docs: record delivered v3 replacement report"
```

The plan is complete only when the active, authorized V3 report is visible in the browser. A deployment, queued job, or another failure report is not completion.
