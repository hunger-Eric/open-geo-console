# Protected-staging live Worker drills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a process-only, one-shot protected-staging Worker fault hook that exercises five recovery checkpoints without exposing a production or request-controlled injection surface.

**Architecture:** A focused Worker module parses the two drill environment variables, fails closed outside protected Preview test commerce, and throws a typed operator-repairable error once for its exact job and fault. The Worker constructs it once and passes it to the processor, which invokes it only after durable checkpoints; terminalization gains a durable pre-transaction checkpoint so it can resume without commercial duplication.

**Tech Stack:** Next.js workspace, TypeScript, Vitest, PostgreSQL checkpoint state machine.

## Global Constraints

- The hook requires `VERCEL_ENV=preview`, `OGC_DEPLOYMENT_PROFILE=staging`, and `COMMERCE_MODE=test`.
- It accepts both `OGC_STAGING_LIVE_DRILL_JOB_ID` and `OGC_STAGING_LIVE_DRILL_FAULT`, or neither; no request, database, or production configuration enables it.
- Fault errors classify as `operator_repairable` and retain the persisted phase.
- No raw API key, access token, database URL, or client IP may be logged or persisted.

---

### Task 1: Parse and enforce the live-drill configuration

**Files:**
- Create: `apps/web/src/worker/staging-live-drill.ts`
- Create: `apps/web/src/worker/staging-live-drill.test.ts`
- Modify: `apps/web/src/worker/job-errors.ts`

**Interfaces:**
- Produces `StagingLiveDrillFault = "crawl" | "model" | "v2_runtime" | "artifact" | "terminalization"`.
- Produces `createStagingLiveDrill(environment?): StagingLiveDrill | null`.
- `StagingLiveDrill.inject({ jobId, fault }): void` throws the same typed error at most once only for the configured job/fault.

- [ ] **Step 1: Write failing configuration tests**

```ts
expect(createStagingLiveDrill({})).toBeNull();
expect(() => createStagingLiveDrill({ OGC_STAGING_LIVE_DRILL_JOB_ID: "job-1" }))
  .toThrow(/both/i);
expect(() => createStagingLiveDrill({
  OGC_STAGING_LIVE_DRILL_JOB_ID: "job-1", OGC_STAGING_LIVE_DRILL_FAULT: "crawl",
  OGC_DEPLOYMENT_PROFILE: "production", VERCEL_ENV: "production", COMMERCE_MODE: "live"
})).toThrow(/protected staging Preview/i);
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- --run apps/web/src/worker/staging-live-drill.test.ts`  
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement typed, one-shot configuration**

```ts
export function createStagingLiveDrill(environment: NodeJS.ProcessEnv = process.env): StagingLiveDrill | null {
  const jobId = environment.OGC_STAGING_LIVE_DRILL_JOB_ID?.trim() ?? "";
  const fault = environment.OGC_STAGING_LIVE_DRILL_FAULT?.trim() ?? "";
  if (!jobId && !fault) return null;
  if (!jobId || !LIVE_DRILL_FAULTS.includes(fault as StagingLiveDrillFault)) throw new Error("...");
  assertProtectedStagingCommercePreview(environment);
  let consumed = false;
  return { inject(input) {
    if (consumed || input.jobId !== jobId || input.fault !== fault) return;
    consumed = true;
    throw new StagingLiveDrillFaultError(fault);
  }};
}
```

- [ ] **Step 4: Run module tests**

Run: `npm test -- --run apps/web/src/worker/staging-live-drill.test.ts apps/web/src/worker/job-errors.test.ts`  
Expected: PASS; a second exact call does not throw and `normalizeJobError` reports `operator_repairable`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/worker/staging-live-drill.ts apps/web/src/worker/staging-live-drill.test.ts apps/web/src/worker/job-errors.ts
git commit -m "feat: guard staging Worker drill faults"
```

### Task 2: Invoke faults only after durable recovery boundaries

**Files:**
- Modify: `apps/web/src/worker/index.ts`
- Modify: `apps/web/src/worker/processor.ts`
- Modify: `apps/web/src/worker/processor-contract.test.ts`

**Interfaces:**
- `processScanJob(job, workerId, { liveDrill? })` accepts the optional Task 1 interface.
- `finalizeRecommendationJob({ ..., liveDrill? })` invokes `inject` at V2 preflight, artifact verification, and terminalization.

- [ ] **Step 1: Extend the processor contract test**

```ts
const drill = { inject: vi.fn() };
expect(drill.inject).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run processor-contract test to establish its current guard**

Run: `npm test -- --run apps/web/src/worker/processor-contract.test.ts`  
Expected: PASS before the wiring change.

- [ ] **Step 3: Wire one process-scoped hook and exact checkpoint calls**

```ts
const liveDrill = createStagingLiveDrill();
process: async (job, owner) => processScanJob(job, owner, { liveDrill });

await saveCheckpoint("fetching", 35, checkpoint);
options.liveDrill?.inject({ jobId: job.id, fault: "crawl" });
await saveCheckpoint("analyzing", 65, checkpoint, coverage);
options.liveDrill?.inject({ jobId: job.id, fault: "model" });
```

In `finalizeRecommendationJob`, invoke `v2_runtime` after the existing `public_source_preflight` checkpoint, invoke `artifact` after the existing artifact-verification checkpoint, and before terminalization persist the same pending artifact checkpoint with `phase: "terminalization"`, then invoke `terminalization`. Resume accepts either `artifact_verification` or `terminalization` and always re-verifies the existing artifact before the atomic terminalization transaction.

- [ ] **Step 4: Run targeted contracts and recovery suite**

Run: `npm test -- --run apps/web/src/worker/processor-contract.test.ts apps/web/src/worker/recovery.test.ts apps/web/src/worker/public-source-forensics.test.ts`  
Expected: PASS; no test reports changed discovery, crawl, or source-snapshot behavior.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/worker/index.ts apps/web/src/worker/processor.ts apps/web/src/worker/processor-contract.test.ts
git commit -m "feat: checkpoint live worker drill boundaries"
```

### Task 3: Prove recovery invariants and document live operation

**Files:**
- Modify: `apps/web/src/db/recovery-state.postgres.test.ts`
- Modify: `docs/PROJECT-STATE.md`
- Modify: `docs/TASKS.md`

**Interfaces:**
- The PostgreSQL recovery fixture includes `terminalization` and asserts zero refund/email rows before resumed terminalization.

- [ ] **Step 1: Add a terminalization recovery fixture**

```ts
const rows = (["source_retrieval", "artifact_verification", "terminalization"] as const)
  .map((phase) => ({ phase, reportId: `recovery-report-${phase}-${suffix}`, jobId: `recovery-job-${phase}-${suffix}` }));
expect(events).toEqual({ error_phase: row.phase, transition_phase: row.phase, refunds: 0, emails: 0 });
```

- [ ] **Step 2: Run the isolated PostgreSQL recovery suite**

Run: `npm run test:postgres:staging-security -- --run apps/web/src/db/recovery-state.postgres.test.ts`  
Expected: PASS when the staging-test environment is configured; otherwise record the missing disposable PostgreSQL authority without running against production.

- [ ] **Step 3: Update operator state only with actual evidence**

```md
- [ ] Run each named protected-staging Worker drill with a unique paid V2 job and preserve transition, checkpoint, and side-effect counts.
```

- [ ] **Step 4: Run repository checks**

Run: `npm run lint && npm test && npm run build`  
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/db/recovery-state.postgres.test.ts docs/PROJECT-STATE.md docs/TASKS.md
git commit -m "test: cover staging drill recovery"
```
