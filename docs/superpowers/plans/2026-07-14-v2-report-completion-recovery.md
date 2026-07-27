# V2 Report Completion Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one protected-staging paid V2 order deterministically produce persisted public-source evidence, a readable private HTML/PDF report, settled credit, and delivered email within the Worker deadline.

**Architecture:** Preserve the PostgreSQL-authoritative Worker pipeline while adding strict cancellation, remaining-time budgets, deterministic source selection, globally bounded retrieval, incremental idempotent writes, and resumable refreshing snapshots. Keep the existing artifact checkpoint so HTML/PDF repair never repeats search or retrieval.

**Tech Stack:** TypeScript, Node.js 24, Undici, PostgreSQL, Vitest, Next.js 16, Docker Compose, Airwallex Sandbox, Resend staging delivery.

## Global Constraints

- `OGC_JOB_HARD_DEADLINE_MS` remains the absolute Worker-attempt boundary; default is 15 minutes.
- Reserve at least three minutes for report/artifact/terminalization and one minute for cleanup.
- Public search and source retrieval each receive at most three minutes wall time per resumed attempt.
- Keep three canonical questions and six query variants; run at most two queries per fanout and four retrievals globally.
- Cap results at three per query, twelve URLs per question, and two URLs per registrable domain.
- Stop scheduling after three available sources per question; one available source per question is the absolute report minimum.
- Robots plus document retrieval share one 15-second per-source deadline.
- Preserve SSRF, DoH, IP pinning, redirect, robots, byte/content-type, authority, locale, access, and commercial boundaries.
- Do not modify production public-search configuration or deployment.
- Do not open customer admission before the real protected-staging report passes every gate.

---

### Task 1: Make cancellation immediate and lossless

**Files:**
- Modify: `apps/web/src/server/safe-fetch.ts`
- Modify: `apps/web/src/server/safe-fetch.test.ts`
- Modify: `apps/web/src/worker/public-source-retriever.ts`
- Modify: `apps/web/src/worker/public-source-retriever.test.ts`

**Interfaces:**
- Consumes: caller `AbortSignal`, per-request timeout, pinned Undici dispatcher.
- Produces: requests that preserve the original abort reason and retrievers that never normalize Worker/phase cancellation to `inaccessible`.

- [ ] **Step 1: Write failing safe-fetch tests**

Add exact cases for pre-aborted input and abort during body streaming:

```ts
const controller = new AbortController();
const reason = new Error("job deadline");
controller.abort(reason);
await expect(createSafeFetch({ resolver, fetchImpl })("https://example.com", { signal: controller.signal }))
  .rejects.toBe(reason);
expect(resolver).not.toHaveBeenCalled();
expect(fetchImpl).not.toHaveBeenCalled();
```

For body streaming, return a never-ending `ReadableStream`, abort after fetch starts, and assert `dispatcher.destroy` is called once, `close` is not called, and the original reason rejects the promise.

- [ ] **Step 2: Verify the tests fail**

Run:

```powershell
node node_modules/vitest/vitest.mjs run apps/web/src/server/safe-fetch.test.ts
```

Expected: the already-aborted signal reaches resolution or the body abort does not preserve the reason.

- [ ] **Step 3: Implement strict signal checks**

At the returned fetch boundary and before every redirect iteration:

```ts
const inheritedSignal = init.signal;
inheritedSignal?.throwIfAborted();
let resolved = await resolveSafeUrl(current, { resolver, allowBenchmarkNetwork });

for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
  inheritedSignal?.throwIfAborted();
  // existing pinned request
}
```

Propagate `inheritedSignal.reason` into the internal controller. Destroy the dispatcher on any aborted request and close it only after normal completion.

- [ ] **Step 4: Write failing retriever tests**

Cover abort before retrieval, during robots, and during source-body reading. Each case must reject with the exact caller reason and must not return an evidence fact.

- [ ] **Step 5: Implement retriever abort propagation**

Before the existing normalization branches:

```ts
if (options.signal?.aborted) throw options.signal.reason;
if (error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError")) throw error;
```

Continue normalizing robots denial, URL safety, HTTP barriers, unsupported content, and ordinary publisher failure.

- [ ] **Step 6: Verify and commit**

```powershell
node node_modules/vitest/vitest.mjs run apps/web/src/server/safe-fetch.test.ts apps/web/src/worker/public-source-retriever.test.ts
npm run lint --workspace apps/web
git add apps/web/src/server/safe-fetch.ts apps/web/src/server/safe-fetch.test.ts apps/web/src/worker/public-source-retriever.ts apps/web/src/worker/public-source-retriever.test.ts
git commit -m "fix: propagate public source cancellation"
```

### Task 2: Add remaining-time and phase-budget authority

**Files:**
- Create: `apps/web/src/worker/public-source-execution-budget.ts`
- Create: `apps/web/src/worker/public-source-execution-budget.test.ts`
- Modify: `apps/web/src/worker/job-execution.ts`
- Modify: `apps/web/src/worker/job-execution.test.ts`
- Modify: `apps/web/src/worker/processor.ts`
- Modify: `apps/web/src/worker/processor-contract.test.ts`
- Modify: `apps/web/src/worker/job-errors.ts`

**Interfaces:**
- Produces: `JobExecutionLease.elapsedMs()`, `remainingMs()`, `createPublicSourceAttemptBudget(remainingMs)`, and `PublicSourceAttemptDeferredError`.

- [ ] **Step 1: Write failing budget tests**

```ts
expect(lease.elapsedMs()).toBe(120_000);
expect(lease.remainingMs()).toBe(780_000);
expect(createPublicSourceAttemptBudget(700_000)).toEqual({
  searchMs: 180_000,
  retrievalMs: 180_000,
  artifactReserveMs: 180_000,
  cleanupMarginMs: 60_000
});
expect(() => createPublicSourceAttemptBudget(599_999)).toThrow(PublicSourceAttemptDeferredError);
```

- [ ] **Step 2: Verify missing interfaces fail**

```powershell
node node_modules/vitest/vitest.mjs run apps/web/src/worker/job-execution.test.ts apps/web/src/worker/public-source-execution-budget.test.ts
```

- [ ] **Step 3: Implement attempt timing and budget**

Capture `startedAt` from the injected clock:

```ts
elapsedMs(): number { return Math.max(0, this.now() - this.startedAt); }
remainingMs(): number { return Math.max(0, this.options.hardDeadlineMs - this.elapsedMs()); }
```

Return the four fixed budget values above only when `remainingMs >= 600_000`. Otherwise throw `PublicSourceAttemptDeferredError` with transient code `public_source_attempt_deferred`.

- [ ] **Step 4: Wire preflight deferral**

Pass `execution.remainingMs()` to V2 finalization. When the website foundation is persisted but time is insufficient, use the existing phase-local `retry_wait` path. Preserve the foundation checkpoint so the next attempt enters `public_source_preflight` without repeating discovery, crawl, analysis, or synthesis.

- [ ] **Step 5: Verify resume and commit**

Extend `processor-contract.test.ts` with collaborator spies proving website work is not repeated.

```powershell
node node_modules/vitest/vitest.mjs run apps/web/src/worker/job-execution.test.ts apps/web/src/worker/public-source-execution-budget.test.ts apps/web/src/worker/processor-contract.test.ts
git add apps/web/src/worker/job-execution.ts apps/web/src/worker/job-execution.test.ts apps/web/src/worker/public-source-execution-budget.ts apps/web/src/worker/public-source-execution-budget.test.ts apps/web/src/worker/processor.ts apps/web/src/worker/processor-contract.test.ts apps/web/src/worker/job-errors.ts
git commit -m "feat: budget public source Worker attempts"
```

### Task 3: Build deterministic plans and bounded schedulers

**Files:**
- Create: `apps/web/src/worker/public-source-plan.ts`
- Create: `apps/web/src/worker/public-source-plan.test.ts`
- Create: `apps/web/src/worker/bounded-scheduler.ts`
- Create: `apps/web/src/worker/bounded-scheduler.test.ts`
- Modify: `apps/web/src/worker/public-source-forensics.ts`
- Modify: `apps/web/src/worker/public-source-forensics.test.ts`
- Modify: `apps/web/src/worker/public-source-snapshot-resolver.ts`
- Modify: `apps/web/src/worker/public-source-snapshot-resolver.test.ts`

**Interfaces:**
- Produces: `createPublicSourcePlan(observations)` and `runBoundedSchedule(items, options, worker)`.
- Plan item: `{ id, questionId, observationId, queryId, resultUrl, registrableDomain, surfaceResultOrder }`.
- Skip reason: `duplicate | domain_cap | question_cap | evidence_target_reached`.

- [ ] **Step 1: Write source-plan tests**

Prove canonical URL dedupe, two-per-domain, twelve-per-question, stable provenance ordering, deterministic IDs, and deterministic skip reasons even when input array order changes.

- [ ] **Step 2: Write scheduler tests**

Use deferred promises to prove maximum active work is exactly four, an already-aborted signal starts zero work, no work starts after mid-flight abort, and the original abort reason is preserved.

- [ ] **Step 3: Verify tests fail**

```powershell
node node_modules/vitest/vitest.mjs run apps/web/src/worker/public-source-plan.test.ts apps/web/src/worker/bounded-scheduler.test.ts
```

- [ ] **Step 4: Implement deterministic planning**

Canonicalize and sort by question, query provenance, and surface order. Enforce domain/question caps and return separate `scheduled` and `skipped` arrays without I/O.

- [ ] **Step 5: Implement the bounded worker loop**

```ts
export async function runBoundedSchedule<T, R>(
  items: readonly T[],
  options: { concurrency: number; signal: AbortSignal; shouldStart?: (item: T) => boolean },
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  options.signal.throwIfAborted();
  let cursor = 0;
  const results: R[] = [];
  await Promise.all(Array.from({ length: Math.min(options.concurrency, items.length) }, async () => {
    while (true) {
      options.signal.throwIfAborted();
      const index = cursor++;
      if (index >= items.length) return;
      const item = items[index]!;
      if (options.shouldStart && !options.shouldStart(item)) continue;
      results[index] = await worker(item);
    }
  }));
  return results.filter((value) => value !== undefined);
}
```

- [ ] **Step 6: Bound search execution**

Create fanouts with `resultDepth: 3` and `maxResults: 3`. Use concurrency two for the six queries inside a snapshot while preserving one terminal attempt row per query. Keep the three question fanouts concurrent.

- [ ] **Step 7: Verify and commit**

```powershell
node node_modules/vitest/vitest.mjs run apps/web/src/worker/public-source-plan.test.ts apps/web/src/worker/bounded-scheduler.test.ts apps/web/src/worker/public-source-forensics.test.ts apps/web/src/worker/public-source-snapshot-resolver.test.ts
git add apps/web/src/worker/public-source-plan.ts apps/web/src/worker/public-source-plan.test.ts apps/web/src/worker/bounded-scheduler.ts apps/web/src/worker/bounded-scheduler.test.ts apps/web/src/worker/public-source-forensics.ts apps/web/src/worker/public-source-forensics.test.ts apps/web/src/worker/public-source-snapshot-resolver.ts apps/web/src/worker/public-source-snapshot-resolver.test.ts
git commit -m "feat: bound public source collection"
```

### Task 4: Persist incrementally and resume refreshing snapshots

**Files:**
- Modify: `apps/web/src/db/market-snapshots.ts`
- Modify: `apps/web/src/db/market-snapshots.test.ts`
- Modify: `apps/web/src/db/market-snapshots.postgres.test.ts`
- Modify: `apps/web/src/worker/public-source-snapshot-resolver.ts`
- Modify: `apps/web/src/worker/public-source-snapshot-resolver.test.ts`

**Interfaces:**
- Produces: `findResumableMarketSnapshot`, `pauseMarketSnapshotLease`, idempotent `appendMarketSourceEvidence`, and exact resolver takeover behavior.

- [ ] **Step 1: Write database failure-first tests**

Prove identical evidence append is idempotent, conflicting content under the same ID fails, pause leaves the snapshot `refreshing`, takeover finds only the exact identity, and stored queries/sources are not duplicated.

- [ ] **Step 2: Verify memory and PostgreSQL tests fail**

```powershell
$env:OGC_TEST_DATABASE_ADMIN_URL='postgres://open_geo:open_geo@127.0.0.1:55432/open_geo_console'
$env:OGC_DEPLOYMENT_PROFILE='staging'
$env:VERCEL_ENV='preview'
node node_modules/vitest/vitest.mjs run --no-file-parallelism apps/web/src/db/market-snapshots.test.ts apps/web/src/db/market-snapshots.postgres.test.ts
```

- [ ] **Step 3: Implement idempotent evidence insertion**

Use `ON CONFLICT (id) DO NOTHING`, reload the persisted row, and compare every immutable normalized field. Return the existing row only when it exactly matches the request.

- [ ] **Step 4: Implement pause and takeover**

`pauseMarketSnapshotLease` changes the active lease to `failed` but leaves the exact snapshot `refreshing`. After acquiring the takeover lease, `findResumableMarketSnapshot` returns the newest refreshing snapshot matching cache identity and authority dimensions. Permanent authority/identity errors continue to mark the snapshot failed.

- [ ] **Step 5: Resume only missing work**

Load the resumable bundle, skip terminal query IDs, reconstruct successful observations, create the deterministic plan, skip persisted source IDs, retrieve remaining sources at global concurrency four, and call `appendMarketSourceEvidence` immediately after each normalized result.

- [ ] **Step 6: Preserve progress on phase abort**

After bounded cleanup, pause the snapshot lease and rethrow the original phase/Worker reason. Do not return an empty snapshot and do not create a new generation on retry.

- [ ] **Step 7: Add the decisive PostgreSQL regression**

Persist source one, abort source two, take over the lease, and assert the resumed resolver fetches only source two. Require one row per source and one completed snapshot generation.

- [ ] **Step 8: Verify and commit**

```powershell
$env:OGC_TEST_DATABASE_ADMIN_URL='postgres://open_geo:open_geo@127.0.0.1:55432/open_geo_console'
$env:OGC_DEPLOYMENT_PROFILE='staging'
$env:VERCEL_ENV='preview'
node node_modules/vitest/vitest.mjs run --no-file-parallelism apps/web/src/db/market-snapshots.test.ts apps/web/src/db/market-snapshots.postgres.test.ts apps/web/src/worker/public-source-snapshot-resolver.test.ts
git add apps/web/src/db/market-snapshots.ts apps/web/src/db/market-snapshots.test.ts apps/web/src/db/market-snapshots.postgres.test.ts apps/web/src/worker/public-source-snapshot-resolver.ts apps/web/src/worker/public-source-snapshot-resolver.test.ts
git commit -m "feat: resume incremental public source evidence"
```

### Task 5: Require persisted evidence and complete artifacts

**Files:**
- Modify: `apps/web/src/public-source-forensics/coverage.ts`
- Modify: `apps/web/src/public-source-forensics/coverage.test.ts`
- Modify: `apps/web/src/worker/public-source-forensics.ts`
- Modify: `apps/web/src/worker/public-source-forensics.test.ts`
- Modify: `apps/web/src/worker/processor.ts`
- Modify: `apps/web/src/worker/processor-contract.test.ts`
- Modify: `apps/web/src/db/recovery-state.postgres.test.ts`
- Modify: `apps/web/src/db/public-source-commerce.postgres.test.ts`

**Interfaces:**
- Consumes: reloaded completed snapshot bundles and available-source count per question.
- Produces: full completion only with at least three persisted available sources per question; limited refunded report with at least one per question; failure when any question has zero.

- [ ] **Step 1: Write failing coverage tests**

```ts
expect(decidePublicSourceCommercialCoverage(withAvailableCounts([1, 1, 1])).outcome).toBe("completed_limited");
expect(decidePublicSourceCommercialCoverage(withAvailableCounts([3, 3, 3])).outcome).toBe("completed");
expect(decidePublicSourceCommercialCoverage(withAvailableCounts([3, 0, 3])).outcome).toBe("failed");
```

- [ ] **Step 2: Reload persisted evidence before report construction**

Build observations, retrievals, evidence graph, and report only from completed PostgreSQL snapshot bundles. Reject an in-memory fact whose deterministic source identity is absent from storage.

- [ ] **Step 3: Preserve artifact-only resume**

Checkpoint the complete pending report and snapshot refs before HTML/PDF verification. Add a test proving artifact retry invokes neither search nor retrieval.

- [ ] **Step 4: Extend commercial atomicity tests**

Full coverage must atomically produce the V2 report, snapshot refs, completed job, settled credit, completed order fulfillment, and delivery intent. Insufficient evidence or artifact failure must not settle credit.

- [ ] **Step 5: Verify and commit**

```powershell
$env:OGC_TEST_DATABASE_ADMIN_URL='postgres://open_geo:open_geo@127.0.0.1:55432/open_geo_console'
$env:OGC_DEPLOYMENT_PROFILE='staging'
$env:VERCEL_ENV='preview'
node node_modules/vitest/vitest.mjs run --no-file-parallelism apps/web/src/public-source-forensics/coverage.test.ts apps/web/src/worker/public-source-forensics.test.ts apps/web/src/worker/processor-contract.test.ts apps/web/src/db/recovery-state.postgres.test.ts apps/web/src/db/public-source-commerce.postgres.test.ts
git add apps/web/src/public-source-forensics/coverage.ts apps/web/src/public-source-forensics/coverage.test.ts apps/web/src/worker/public-source-forensics.ts apps/web/src/worker/public-source-forensics.test.ts apps/web/src/worker/processor.ts apps/web/src/worker/processor-contract.test.ts apps/web/src/db/recovery-state.postgres.test.ts apps/web/src/db/public-source-commerce.postgres.test.ts
git commit -m "fix: require persisted evidence for V2 reports"
```

### Task 6: Validate, rebuild, and produce the real report

**Files:**
- Modify: `docs/PROJECT-STATE.md`
- Modify: `docs/TASKS.md`
- Modify: `docs/operations/evidence/2026-07-13-v2-paid-acceptance.md`

**Interfaces:**
- Consumes: reviewed Git revision, protected staging, Airwallex Sandbox, staging PostgreSQL, private artifact routes, Resend events.
- Produces: one recorded completed V2 paid report.

- [ ] **Step 1: Run repository verification**

```powershell
npm run lint
npm test
npm run build
npm run db:audit
npm run test:postgres:staging-security
git diff --check
```

Every locally runnable command must exit zero. Fixture evidence cannot replace protected external evidence.

- [ ] **Step 2: Review and commit the revision**

Inspect the full diff, confirm no production configuration or secrets changed, sync CodeGraph, and commit the reviewed implementation.

- [ ] **Step 3: Build and recreate revision-labeled staging Workers**

```powershell
$revision = git rev-parse HEAD
docker build --label "org.opencontainers.image.revision=$revision" --tag open-geo-console:local --file Dockerfile.worker .
docker compose --profile workstation up -d --force-recreate staging-worker-free staging-worker-deep
```

Verify both containers share the image ID, declare `OGC_DEPLOYMENT_PROFILE=staging`, and log `is ready`.

- [ ] **Step 4: Create exactly one fresh Sandbox order**

Use the protected staging checkout and verified Airwallex Sandbox Webhook. Record non-secret order/report/job IDs, initial Worker owner, image ID, and revision.

- [ ] **Step 5: Monitor PostgreSQL authority**

Track phase transitions, heartbeat/lease continuity, search attempts, incremental `market_source_evidence` counts, completed snapshot refs, artifact checkpoint, and atomic terminalization. If it stops, repair that exact boundary before any replacement order.

- [ ] **Step 6: Inspect the real report**

Open authorized HTML and verify substantive report sections and real public-source cards. Verify the same-HTML PDF begins with `%PDF` and contains substantive pages. Verify anonymous HTML/PDF access returns `404`.

- [ ] **Step 7: Verify settlement and delivery**

Require `paid / completed / settled`, no refund, settled credit, report delivery sent, processed Resend `email.delivered`, and a clean staging `npm run db:audit`.

- [ ] **Step 8: Record and commit acceptance**

Update the three documentation files with non-secret timestamps, IDs, evidence counts, artifact checks, anonymous `404`, settlement, and delivery evidence. Mark acceptance complete only when all outcomes pass.

```powershell
git add docs/PROJECT-STATE.md docs/TASKS.md docs/operations/evidence/2026-07-13-v2-paid-acceptance.md
git commit -m "docs: record completed V2 staging report"
```
