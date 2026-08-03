# Archived Change Scope History

This file preserves completed and failed scope records for context only. It is
never executable authority; `docs/ACTIVE-CHANGE-SCOPE.md` is the sole current lock.

Archived source: the exact pre-migration working-tree snapshot, 4,239 lines and
239,873 UTF-8 bytes before this header. It intentionally contains uncommitted
scope history beyond the older 4,068-line HEAD version; do not replace it from
HEAD or treat it as current authority.

---

# Active Change Scope Lock

Status: `FROZEN`

This file records historical scopes and the **current** executable authority.
**Current executable authority:** section
`Current authority: evidence-persisted PostgreSQL acceptance and main delivery (APPROVED — failed closed)`.
All earlier sections are context only.

---

## Current authority: evidence-persisted PostgreSQL acceptance and main delivery (APPROVED — failed closed)

**Status:** `APPROVED` — the user explicitly approved this one final evidence-preserving database run and conditional main delivery on 2026-07-31. The run stopped at container preflight and is exhausted; no further action is authorized.

### Execution outcome

- Identity, branch, image, modified-file, and port-isolation preflight passed. The exact container `7b9bae3c6b5eaee009662e8e9df3317d22662abb29daf43db8a6fddb55142143` was created on `127.0.0.1:51978`.
- Before readiness or tests, inspect found that the image-declared PostgreSQL data `VOLUME` had created anonymous volume `231847a1e2a4738d8c0bddff07c107a36a65a318abf2b4906bf5d232ca59f404`, violating this scope's no-volume contract. No `SELECT 1`, Vitest, JSON output, retry, commit, or push occurred.
- The exact container was force-removed. The anonymous volume was proven local, run-created, and unreferenced, then only that exact volume was removed; both final lookups are empty. Freight PostgreSQL remains untouched on port `5432`.
- Acceptance remains unestablished. Any future disposable container must explicitly mount `--tmpfs /var/lib/postgresql/data` (or equivalent no-volume tmpfs) in a newly frozen and approved scope before another run.

### Baseline and objective

- Local `main` and `origin/main` remain `fbdd41155d3c0495d2422d1b177ba91cb61812dd`; exactly six allowlisted files are modified and no files are untracked.
- Validate the completed U+0000 fix and Paid V3 fixture migration once against an isolated PostgreSQL instance. Deliver the six files only if authoritative persisted evidence proves `67 passed`, `0 failed`, `0 skipped`.
- The previous run is invalid evidence because its supervising process lost the captured Vitest result; it authorizes no inference about pass or failure.

### One final disposable database run (exact)

- Create exactly one container named `ogc-v4-unicode-pg-final-20260731` from existing `postgres:16-alpine` image `sha256:e013e867e712fec275706a6c51c966f0bb0c93cfa8f51000f85a15f9865a28cb`, with no volume and one newly allocated `127.0.0.1` port other than `5432`.
- Do not touch `freight_lead_agent-postgres-1`, any existing volume, image, cache, Staging service, or historical data.
- Before the test, require readiness and `SELECT 1`. Set `OGC_TEST_DATABASE_ADMIN_URL` only for the test process.
- Run the same exact five focused Vitest files once with JSON reporter output written to `C:\Users\fengc\AppData\Local\Temp\ogc-v4-unicode-pg-final-20260731-vitest.json`; record the process exit code separately before any cleanup.
- Read and validate the persisted JSON and exit code before container cleanup. Acceptance requires exit `0`, exactly `67 passed`, `0 failed`, `0 skipped`, and both PostgreSQL files executed.
- Only after the result has been read, resolve the exact container name and ID and force-remove that one disposable container. Never attempt an earlier non-forced cleanup. Verify the fixed name is absent and freight PostgreSQL remains healthy.
- Remove only the exact run-owned temporary JSON after its counts and exit code are recorded in this scope file. No retry is authorized on test, evidence, or cleanup failure.

### File and delivery boundary

- No code, test, dependency, schema, or configuration edit is authorized. Only `docs/ACTIVE-CHANGE-SCOPE.md` may receive the final execution record before delivery.
- Re-run `git diff --check` and verify exactly these six files: `packages/site-crawler/src/html.ts`, `packages/site-crawler/src/html.test.ts`, `apps/web/src/worker/report-v4-admission-runtime.ts`, `apps/web/src/worker/report-v4-admission-runtime.test.ts`, `apps/web/src/db/recovery-state.postgres.test.ts`, `docs/ACTIVE-CHANGE-SCOPE.md`.
- Verify production `+16/-6`, tests no more than `+55/-5`, scope no more than `+220/-10`, dependencies/schema/new files `0`.
- If every gate is green, route Git mutation through `git_operator`: stage exactly the six files, commit on `main` as `fix: canonicalize V4 admission null text`, push non-force to `origin main`, then verify local HEAD and `refs/remotes/origin/main` match and the worktree is clean.
- Stop without commit/push on any test failure/skip, missing or malformed JSON, nonzero exit, container/port/image ambiguity, cleanup failure, diff drift, budget breach, or branch/remote movement. Staging remains forbidden and requires a later separate frozen scope.

---

## Previous authority: stale Paid V3 fixture repair and PostgreSQL acceptance rerun (APPROVED — failed closed)

**Status:** `APPROVED` — the user explicitly approved this exact verification-only repair and one replacement database run on 2026-07-31. That one run is exhausted and failed closed; no further action is authorized.

### Execution outcome

- The fixture-only repair was applied within budget (`+10/-4` incremental) and no production behavior changed.
- The single replacement container passed identity, readiness, and `SELECT 1` preflight and invoked the exact test command once.
- The supervising PowerShell process lost its captured Vitest JSON when its initial non-forced cleanup failed against the still-running container. The test exit code and pass/fail/skip counts are therefore not authoritatively recoverable; no retry occurred.
- The exact replacement container was subsequently resolved by name and force-removed. Final lookup is empty; `freight_lead_agent-postgres-1` remains healthy on port `5432`.
- Acceptance is not established. No commit or push occurred; local `main` and `origin/main` remain `fbdd41155d3c0495d2422d1b177ba91cb61812dd`. A new frozen scope and explicit approval are required for any further run or delivery.

### Failed-run authority

- The approved first disposable PostgreSQL run used container `052e1f440466b30e7dcfd2d34ce372fc355124b09db217f76a5ee938f19a2ed1` on `127.0.0.1:64199`; readiness and `SELECT 1` passed.
- Result: `66 passed`, `1 failed`, `0 skipped`. The U+0000 PostgreSQL checkpoint regression passed; the unrelated failure was `Canonical review input re-copies source body across sources[0] and evidence[0]` in `recovery-state.postgres.test.ts`.
- That exact container was removed; the foreign `freight_lead_agent-postgres-1` on port `5432` remained healthy. No commit or push occurred.

### Verification-only repair allowlist (exact)

- Edit only `apps/web/src/db/recovery-state.postgres.test.ts`, following the accepted fixture pattern in `paid-v3-semantic-review.test.ts` and `paid-v3-compact-review-input.test.ts` introduced by `f879808b5a0a1021683087df208feccb794c22cd`.
- `sources`: replace the broad serialized source body with role-tagged `{ role: "source", sourceId, title }` fixture text, recompute `originalTextHash`, and set `eligible: true`.
- `evidence`: replace the copied source body/hash with role-tagged `{ role: "evidence", sourceId }` fixture text, recompute `originalTextHash`, and set `eligible: true`.
- `observationResults`: replace the copied source body/hash with role-tagged `{ role: "observation", sourceId, index }` fixture text and recompute `originalTextHash`.
- Do not change production/runtime behavior, assertions, schemas, dependencies, semantic rules, retry behavior, or any other test file.
- Incremental fixture budget: `+40/-5`. Existing six-file total and production budgets remain in force; no new files.

### One replacement PostgreSQL run (exact)

- Create exactly one replacement container named `ogc-v4-unicode-pg-20260731` from existing image `postgres:16-alpine` at `sha256:e013e867e712fec275706a6c51c966f0bb0c93cfa8f51000f85a15f9865a28cb`, with no volume and one newly allocated `127.0.0.1` port other than `5432`.
- Wait for readiness and `SELECT 1`; run the same exact five focused Vitest files with the isolated `OGC_TEST_DATABASE_ADMIN_URL`. Required result: `67 passed`, `0 failed`, `0 skipped`.
- On success or failure, verify and remove only the exact replacement container. Do not touch images, volumes, caches, other containers, historical data, or Staging.

### Delivery and stop conditions

- Only after the replacement run is fully green: re-run diff/allowlist/budget checks; route staging of exactly the six modified files, commit `fix: canonicalize V4 admission null text`, and non-force push to `origin/main` through `git_operator`; verify clean local/remote identity.
- Stop without commit/push on any failure/skip, identity drift, unexpected diff, or cleanup ambiguity. No further retry is authorized.
- Staging remains forbidden and requires a later separate `FROZEN` scope naming the delivered SHA and exact candidate/current/rollback images.

---

## Previous authority: disposable PostgreSQL acceptance and main delivery (APPROVED — failed closed)

**Status:** `APPROVED` — the user explicitly approved this exact execution boundary on 2026-07-31.

### Objective and baseline

- Validate the already implemented U+0000/U+FFFD boundary against one isolated disposable PostgreSQL instance, then deliver exactly the six approved files to `origin/main` only if every required gate passes.
- Baseline: local `main` and `origin/main` at `fbdd41155d3c0495d2422d1b177ba91cb61812dd`; six allowlisted modified files; no untracked files.
- Existing `freight_lead_agent-postgres-1` on host port `5432` is foreign/shared authority and must not be read, written, restarted, or reused.

### File allowlist and budgets (exact)

- Production: `packages/site-crawler/src/html.ts`, `apps/web/src/worker/report-v4-admission-runtime.ts`; budget `+80/-20`.
- Tests: `packages/site-crawler/src/html.test.ts`, `apps/web/src/worker/report-v4-admission-runtime.test.ts`, `apps/web/src/db/recovery-state.postgres.test.ts`; budget `+260/-30`.
- Scope: `docs/ACTIVE-CHANGE-SCOPE.md`; budget `+260/-10`.
- No new files. Dependencies and schema budget: `0`.

### Disposable database authority (exact)

- Create exactly one container named `ogc-v4-unicode-pg-20260731` from already-local image `postgres:16-alpine` (`sha256:e013e867e712fec275706a6c51c966f0bb0c93cfa8f51000f85a15f9865a28cb`).
- No volume; bind PostgreSQL only to `127.0.0.1` on one newly allocated free host port other than `5432`; use the disposable test-only admin URL `postgres://postgres:postgres@127.0.0.1:<allocated-port>/postgres` only through the test process environment.
- Wait for `SELECT 1`, then run exactly `packages/site-crawler/src/html.test.ts`, `apps/web/src/worker/report-v4-admission-runtime.test.ts`, `apps/web/src/worker/report-v4-admission-production.test.ts`, `apps/web/src/db/recovery-state.postgres.test.ts`, and `apps/web/src/db/report-v4-site-snapshots.postgres.test.ts` with `OGC_TEST_DATABASE_ADMIN_URL` set. Required result: all 67 tests pass and neither PostgreSQL suite skips.
- On success or failure, remove only the exact disposable container after resolving its name and ID. Do not remove images, volumes, other containers, or Docker cache.

### Delivery authority after green gates (exact)

- Re-run `git diff --check`; verify only the existing six allowlisted files and the recorded budgets.
- Route Git mutation through `git_operator`: stage exactly those six files, commit on `main` with message `fix: canonicalize V4 admission null text`, then push non-force to `origin main`.
- Verify local HEAD, `refs/remotes/origin/main`, and GitHub remote identity all match the new commit; require a clean worktree after push.

### Forbidden and stop conditions

- No source/test changes, retry logic, schema/migration/dependency changes, historical job/report mutation, live crawl/model/payment/refund/email, Docker build, image deletion, deployment, or Staging run.
- Stop without commit/push if the container identity is ambiguous, the selected port is not isolated, any focused test fails/skips, the diff leaves the allowlist/budget, or `main`/`origin/main` moves from the recorded baseline before commit.
- After a successful push, write a separate Phase 2 `FROZEN` scope naming the new commit, candidate/current/rollback images and one bounded Staging lineage. Do not execute Phase 2 under this authority.

---

## Previous authority: PostgreSQL-safe V4 admission text boundary (APPROVED)

**Status:** `APPROVED` — the user explicitly approved this exact Phase 1 allowlist on 2026-07-31. External actions remain zero.

### Objective

Establish one canonical external-text invariant with minimal change: map HTML numeric reference `&#0;` and raw U+0000 deterministically to U+FFFD before `retainedText`/hash/checkpoint; preserve legal Unicode and existing whitespace behavior; reject injected/custom collector text that still contains U+0000 at the runtime authority boundary; derive hash, summary, checkpoint, and snapshot from the same normalized text; add real PostgreSQL JSONB regression proving checkpoints no longer contain unsupported Unicode escapes.

### Baseline

- `main`/HEAD: `fbdd41155d3c0495d2422d1b177ba91cb61812dd`.
- Latest Staging candidate: `f879808b5a0a1021683087df208feccb794c22cd`.
- Frozen historical report `df79...` / job `1368...` are never retried or repaired.
- Current scope records an unsupported Unicode escape at admission; the exact bad field is not proven by the original payload, so implementation must falsify it with deterministic tests.

### Production allowlist (exact)

- `packages/site-crawler/src/html.ts` — canonicalize once.
- `apps/web/src/worker/report-v4-admission-runtime.ts` — validate the invariant only; no second transformation.
- `docs/ACTIVE-CHANGE-SCOPE.md`.

### Test allowlist (exact)

- `packages/site-crawler/src/html.test.ts`
- `apps/web/src/worker/report-v4-admission-runtime.test.ts`
- `apps/web/src/worker/report-v4-admission-production.test.ts`
- `apps/web/src/db/recovery-state.postgres.test.ts`
- `apps/web/src/db/report-v4-site-snapshots.postgres.test.ts`

### Forbidden and budgets

- Forbidden: prompts/model/semantic-review/Paid V3/`processor.ts` (except the named runtime file); schema/migrations/dependencies; retry/resume/degrade behavior; historical data/jobs; Docker/Vercel/deploy/real crawl/model/payment/refund/email; new files.
- Diff budget: production `+80/-20`; tests `+260/-30`; scope `+180/-10`; dependencies/schema `0`.

### Acceptance and external-action boundary

- Red-before/green-after tests for raw U+0000 and `&#0;`; runtime rejects residual NUL; focused Vitest on exactly the five test files.
- PostgreSQL tests must actually run with `OGC_TEST_DATABASE_ADMIN_URL` and must not skip.
- Run `npm run lint`, `npm test`, `npm run build`, `git diff --check`; verify exact allowlist/budget. Make no live claim.
- All expensive external actions are `0` in Phase 1. After a local candidate passes, a separate Phase 2 `FROZEN` scope must name exact SHA/image/rollback and authorize one bounded Staging site lineage; Cloudflare and historical lineage remain forbidden.

### Verification record (2026-07-31)

- Red evidence: the two new focused cases failed before the production change (`2 failed`, `45 passed`), exposing raw U+0000 retention and the missing runtime rejection.
- Green focused evidence: the five allowlisted files completed with `60 passed`, `7 skipped`; the skips are the two PostgreSQL suites because `OGC_TEST_DATABASE_ADMIN_URL` is unset.
- Repository checks: lint passed with six warnings; build passed; `git diff --check` passed. The full test run recorded `3003 passed`, `205 skipped`, and two Windows PowerShell five-second timeouts in `report-v4-staging-preflight.test.ts`; that file then passed independently (`23/23`).
- Scope audit: six allowlisted files changed; production `+16/-6`, tests `+45/-0`, scope within budget; dependencies/schema/external actions remain zero.
- Current outcome: implementation and non-PostgreSQL regression checks pass, but Phase 1 acceptance remains blocked until both real PostgreSQL suites run without skip against an explicitly configured disposable test database.

### Stop conditions

Stop if DB serialization/schema, prompt/model contract, processor orchestration, or sanitization at multiple layers is needed. If the PostgreSQL admin URL is unavailable, implementation may be complete but acceptance is blocked, not passed.

---

## Previous authority: Staging deploy + new Paid V3 lineage for f879808 (APPROVED — completed fail-closed)

**Status: `APPROVED`** — written 2026-07-31 FROZEN; **user approved 2026-07-31**
(“批准”) for Gates 1–4: thin Staging deploy of
`f879808b5a0a1021683087df208feccb794c22cd` plus one wholly new free→paid
lineage. Touch only the written allowlist and expensive-action caps.

**Execution outcome:** Gates **1–3 PASS** (candidate Workers + alias live).
Gate **4 FAIL-CLOSED** on Free V4 pre-admission (`PostgresError: unsupported
Unicode escape sequence` for `cloudflare.com`); Paid V3 path not exercised.
See completion record below. No further mutation under this scope without a
new approval.

### Objective

1. Deploy **one** Staging candidate built from
   `f879808b5a0a1021683087df208feccb794c22cd` (Paid V3 compact + one-call
   model steps; no packet retry/resume SM).
2. After Gates 1–3 pass, run **exactly one wholly new** free→paid Staging
   report lineage (Gate 4) and record:
   - wall-clock total duration (job start → paid terminal / HTML ready)
   - Paid V3 model step call counts (Q1 diagnosis = 0; Q2 diagnosis ≤1;
     Q3 diagnosis ≤1; final websiteSynthesis ≤1; no packet-layer retry)
   - compact transport token metrics (`paidV3Review.transportMetrics` /
     estimate under `websiteSynthesis` 131072 input lock)
   - final customer HTML accessibility and completeness for that report

Target band for healthy wall time remains **3–6 minutes** for the Paid V3
deep phase when evidence is normal; measure and report actuals either way.

### Baseline (recorded at FROZEN write)

| Item | Value |
|---|---|
| Candidate commit (exact) | `f879808b5a0a1021683087df208feccb794c22cd` |
| Branch | `codex/staging-runtime-evidence-4112c2e` |
| Current Staging Worker image | `open-geo-console:staging-b597f96-overlay-v1` (`5ce966c9029b`) |
| Current Staging containers | `open-geo-console-staging-worker-free-1`, `…-deep-1` on above image |
| Rollback Worker image | **same current** `staging-b597f96-overlay-v1` (`5ce966c9029b`) until candidate verified |
| Full Worker base (overlay FROM) | `open-geo-console:staging-330b27a74c5c3d9d56c71bc8e6ade1859499e92e-full-v1` (`748e2675f280`) |
| Disk at FROZEN | E: **~85.6 GiB free**; Docker images 60 / ~34.2GB |
| package-lock / Dockerfile.worker / base digest | **unchanged** vs full base → **full Worker rebuild forbidden** |
| Historical frozen identities (never replay) | reports/jobs `55770e59`, `d6a98e5e`, `6704ad4f`, `7373d419`, `7aaf726c` |

### Allowed actions (only after APPROVED)

**Gate 1 — preflight (read-only first, then deploy prep):**

- Confirm Staging DB marker / env; zero claimable or running Staging jobs
  before cutover (or wait/drain only; no force-fail historical jobs).
- Re-record disk free space and `docker system df`.
- Push candidate SHA if not on origin; clean detached worktree at
  `f879808…` under `.data/staging-release-f879808/`.
- One Staging Preview for the candidate (git integration or CLI deploy from
  that worktree only).

**Gate 2 — thin overlay only:**

- Build **one** thin source-overlay image:
  - path: `.data/staging-release-f879808/Dockerfile.overlay`
  - `FROM open-geo-console:staging-330b27a74c5c3d9d56c71bc8e6ade1859499e92e-full-v1`
  - `COPY apps/ packages/` only; label revision = full `f879808…` SHA
  - tag: `open-geo-console:staging-f879808-overlay-v1`
- Set `.data/workstation-docker/staging.env` `OGC_DEPLOYMENT_VERSION` to full
  candidate SHA.
- Recreate **only** `staging-worker-free` and `staging-worker-deep`.
- Roles after verify: candidate = new overlay image ID; current retained as
  rollback = `5ce966c9029b` (`staging-b597f96-overlay-v1`); no other image
  deletion unless this scope later records exact unreferenced IDs.
- Move fixed Protected Staging alias **once** to the candidate Preview.

**Gate 3 — protection smoke only:**

- Anonymous `/zh` protection, `POST /api/scan` rejected, catalog protection
  as per `docs/PROTECTED-STAGING-OPERATIONS.md`.
- **No** report/crawl/model/order/payment/refund/email from smoke.

**Gate 4 — one wholly new lineage (only after Gate 3 pass + explicit user
OK if user wants a second confirmation; otherwise APPROVED of this whole
scope authorizes Gate 4):**

- One new Staging free report on a **new** site/URL (not historical IDs).
- One Sandbox payment → exactly-once Paid V3 deep job for that report only.
- Capture evidence:
  - job/report IDs, stage timestamps, `paidV3DiagnosisStageTimings`,
    `paidV3Review.stageTimings` / `transportMetrics`
  - packet `providerAttempts` (Q1=0, Q2≤1, Q3≤1)
  - token estimate vs 131072 lock
  - authorized customer HTML fetch success
- On any terminal failure: **stop**; no retry/resume/repair of that lineage;
  write a new FROZEN repair scope.

### File allowlist (this scope)

| Path | Purpose |
|---|---|
| `docs/ACTIVE-CHANGE-SCOPE.md` | Status / completion records |
| `.data/staging-release-f879808/**` | Detached worktree + Dockerfile.overlay (ephemeral deploy artifact; not committed) |
| `.data/workstation-docker/staging.env` | `OGC_DEPLOYMENT_VERSION` only |
| `.data/workstation-docker/staging-head.override.yaml` | Image tag for the two staging workers only |

**No production application source edits.** Candidate code is already at
`f879808`. Any required code fix is a **new** scope.

### Forbidden

- Production Web/Workers/data/commerce.
- Full Worker image rebuild (`npm ci`, Playwright, base OS packages).
- Broad Docker prune / image mass delete.
- Historical report/job/order replay, resume, refund, or clone.
- Second Staging report/payment without a new approved scope.
- Changing `websiteSynthesis.maxInputTokens` (remains 131072).
- Code/test changes outside this scope’s file allowlist.

### Diff budget

- Application production/test: **0** (already committed at `f879808`).
- Scope doc edits only for status transitions and evidence tables.

### Expensive external actions (cap)

| Action | Max count |
|---|---|
| `git push` of candidate (if needed) | 1 |
| Staging Preview deploy | 1 |
| Thin overlay Docker build | 1 |
| Staging free+deep container recreate | 1 pair |
| Fixed alias move | 1 |
| Free report submission | 1 (new lineage) |
| Sandbox payment / Paid deep job | 1 |
| Customer HTML open/fetch | as needed for that one report only |

### Acceptance checks

1. Both Staging workers image ID = candidate overlay; `OGC_DEPLOYMENT_VERSION`
   = full `f879808…`; restart count 0; ready; no unexpected claimed work at
   cutover end.
2. Gate 3 smoke green; no smoke-created commercial artifacts.
3. One new free→paid lineage reaches Paid V3 terminal with accessible HTML
   **or** fail-closed with recorded root cause and no silent retry.
4. Evidence table filled: wall time, call counts, token metrics, HTML status.
5. Production never touched; historical IDs untouched.

### Rollback

If Gate 2/3 fails after cutover: restore workers to
`open-geo-console:staging-b597f96-overlay-v1` (`5ce966c9029b`), restore
`OGC_DEPLOYMENT_VERSION` / alias to pre-cutover values, stop. No second
overlay build without re-approval.

### Completion record (2026-07-31): Gates 1–3 PASS; Gate 4 FAIL-CLOSED

**Gates 1–3 — Protected Staging deployment of `f879808` completed**

| Item | Value |
|---|---|
| Candidate code SHA | `f879808b5a0a1021683087df208feccb794c22cd` |
| Scope-status commits | `0707e86` (FROZEN), `c3eca1f` (APPROVED) — pushed |
| Thin overlay tag | `open-geo-console:staging-f879808-overlay-v1` |
| Candidate image ID | `sha256:9b6eec90a89381e6a2fad3f62c00d9f72fa709933ea321c1c07d2c4f3189882f` |
| Rollback image | `staging-b597f96-overlay-v1` (`5ce966c9029b`) retained |
| Workers | free+deep only recreated; image ID above; `OGC_DEPLOYMENT_VERSION=f879808…`; restart **0**; ready |
| Preview | `open-geo-console-mwyub64q7-itheheda-6857s-projects.vercel.app` READY (~2m) |
| Fixed alias | `open-geo-console-staging-itheheda.vercel.app` → candidate Preview (once) |
| Gate 3 smoke | `/zh` 302 SSO; `POST /api/scan` **401**; catalog 302 SSO |
| Production | not started (pre-existing exited containers untouched) |
| Disk after | E: **~85.5 GiB** free; images 61 / ~34.21GB |

Status after Gate 3: **Protected Staging deployment completed; real flow not yet accepted.**

**Gate 4 — one new lineage FAIL-CLOSED (no retry)**

| Item | Value |
|---|---|
| URL | `https://www.cloudflare.com` (agent-submitted via `vercel curl` + protection bypass; `forceFresh=true`, locale `zh`) |
| Report | `df79ebe5-0bce-4b85-b24a-f3795cc3169e` |
| Free job | `47d63516-3fd7-4be9-832d-1b8c35c070d9` — **completed** (~2m49s wall: 08:15:37Z→08:18:26Z); product `legacy_website_audit_v1`; technical completed; `hasTechnicalReport=true` |
| Free V4 / deep pre-admission job | `1368e5b8-0b3f-462d-956c-c190808b8c1e` — reason `v4_pre_admission`; contract `combined_geo_report_v4` / `two_stage_geo_report_v4`; **failed** permanent |
| Orders / credits | **0** (no Sandbox payment; deep job is free-lane V4 pre-admission, not Paid V3) |
| Fail phase | `admission` |
| Root error | `PostgresError: unsupported Unicode escape sequence` (fingerprint `41022e40…`); two events (transient then permanent recurrence) 08:19:30Z / 08:19:54Z |
| Site scale evidence | planned_pages **1813**, successful 17 / failed 1765 — Cloudflare is a pathological Free V4 admission target |
| Paid V3 steps | **never reached** (no Q1 Free-reuse packets, no compact token gate, no websiteSynthesis on this lineage) |
| Call counts / token / Paid HTML | **N/A** — out of reach on this lineage |
| Customer HTML | `/reports/{id}/report.html` → 404 without access token; status API shows `hasAiReport=false`, technical completed, active deep preview failed |
| Stop rule | **observed** — no retry/resume/repair of `df79ebe5` / `1368e5b8`; historical IDs still frozen |

**Gate 4 acceptance: NOT met.** Deployment of the Paid V3 candidate workers is live, but this lineage did not exercise the compact one-call Paid V3 path.

**Recommended next scope (requires new user approval):**

1. One wholly new free→paid lineage on a **small** Staging site (not Cloudflare-scale).
2. Optional: investigate Free V4 admission unicode-escape fail-closed for large page texts (separate allowlist if production code changes needed).
3. Do **not** replay `df79ebe5` / `1368e5b8`.

---

## Previous authority: Paid V3 linear orchestration (AnswerPacket + compact review) (APPROVED — implementation complete)

**Status was `APPROVED`** — implementation committed at
`f879808b5a0a1021683087df208feccb794c22cd`. Superseded as **current** by the
Staging deploy FROZEN scope above. Code contract remains binding for that
SHA.

### Implementation progress (closed for this code candidate)

**User amendment 2026-07-31 (binding for this candidate):** remove AnswerPacket
retry/resume state machine; **each Paid V3 model step at most one call**;
keep compact dictionary, dedupe, token gate, and Q2/Q3 parallel diagnosis.

Implemented:

- Q1 Free reuse: `providerAttempts = 0` (no model call)
- Q2/Q3 diagnosis: exactly one `enhanceReportV4QuestionDiagnosis` call each,
  via `Promise.allSettled` (parallel); no packet resume skip, no packet-layer
  retry loop; `shouldRetryPaidV3PacketAttempt` always returns `false`;
  `attemptCountMax = 1`
- Final websiteSynthesis: exactly one reviewer.review after compact token gate
- Compact: sourceDictionary + hash shells; no 4× body re-copy
- Token gate: distinct max_input / max_output / context_window; fail-close
  metrics via `onTransportMetrics(breakdown)` before rethrow
- Stage timings co-persist with packets (including on Q3 fail)
- Packets remain checkpoint snapshots only (not a resume SM)

**Verification (candidate commit f879808):**

- Allowlisted vitest (4 files): **76 PASS**
- `npm run build`: **PASS**
- Independent no-auto-retry/resume/defer check on model-step surface (see
  progress notes above)
- Budget vs `b597f96`: production **1167** / 1200; tests **931** / 1800

### Objective (historical — code work)

Modify **only** Staging Paid V3 `combined_geo_report_v3` so that:

1. **Q1 is reused** from the already-reviewed Free checkpoint (zero new model
   calls for Q1 answer/diagnosis).
2. **Q2 and Q3** run independent parallel paths (answer already parallel;
   diagnosis becomes parallel).
3. Each question produces a bounded **`PaidV3AnswerPacketV1`**, checkpointed
   per question on completion.
4. Final **websiteSynthesis** receives only: three AnswerPackets + one
   deduped `sourceDictionary` + necessary target/evidence refs + reviewable
   prose fields + authority hashes — **not** four catalogs that re-copy the
   same source body text (root cause of estimate **174024 > 131072** on
   historical failed job `d6a98e5e`, report `55770e59` — frozen forever).
5. Model output still applies onto the existing canonical review input,
   receipt, applied fields, and **unchanged** `CombinedGeoReportV3` /
   customer HTML contracts.
6. Paid V3 model steps are **strictly at most one call each** (Q1 diagnosis =
   Free reuse / 0 calls; Q2 diagnosis ≤1; Q3 diagnosis ≤1; final synthesis ≤1).
   **No** packet-layer automatic retry, defer-for-retry, or resume-of-unfinished
   packets. Failures classify for metadata only (`shouldRetry` always false).
   Healthy path must not whole-phase re-enter solely because of a 600s stage
   budget. (Job-level PostgreSQL worker recovery remains out of this scope’s
   model-step contract.)

**Out of this implementation scope (require separate later authorization):**

- Staging deployment of a new candidate image.
- One wholly new Staging report/order/payment lineage for Gate 4 acceptance.
- Production anything.
- Replay/resume/repair of any historical report/job/order (including
  `55770e59`, `d6a98e5e`, `6704ad4f`, `7373d419`, `7aaf726c`).

### Baseline

| Item | Value |
|---|---|
| Baseline HEAD (exact) | `b597f968c16842d39a154493cdff3f5b9911c22f` |
| Branch (working) | `codex/staging-runtime-evidence-4112c2e` |
| Staging Worker image (current) | `staging-b597f96-overlay-v1` |
| Locked final review operation budget | `websiteSynthesis.maxInputTokens = 131072` (do **not** raise) |
| Known failure evidence (context only) | report `55770e59`, paid job `d6a98e5e`, estimate 174024 > 131072 |

Confirmed product facts (do not regress):

- Q1 already reuses Free results and must not re-call the provider.
- Q2/Q3 answer generation is already parallel; keep that.
- Q2/Q3 diagnosis is currently serial (`processor.ts` ~2514 region) — make parallel.
- Do **not** modify diagnosis `semanticProjection` (not the 174024 main path).
- Final review currently re-expands source bodies across sources/evidence/
  observations/entities + bloated `sourceSelectionCatalog`.

### Production file allowlist

**5 existing + 2 new** (tightened 2026-07-31: `public-source-execution-budget.ts`
removed — see § defer localization).

Existing (edit only as required by the objective):

- `apps/web/src/worker/processor.ts`
- `apps/web/src/worker/answer-first-v3.ts`
- `apps/web/src/worker/paid-v3-semantic-review.ts`
- `packages/ai-report-engine/src/report-semantic-review-manifests.ts`
- `packages/ai-report-engine/src/report-semantic-review.ts`

New narrow modules (create only these two unless contract forces a stop-and-report):

- `apps/web/src/worker/paid-v3-answer-packet.ts`
- `apps/web/src/worker/paid-v3-compact-review-input.ts`

Scope-document only (not counted in production/test budgets):

- `docs/ACTIVE-CHANGE-SCOPE.md` (status transitions and completion records)

**Not on allowlist (must not change under this scope):**

- `apps/web/src/worker/public-source-execution-budget.ts` — shared 600s budget
  module. Paid V3 defer localization is done **only** by adjusting Paid V3
  gate **call sites** in `processor.ts` (persist completed packets first;
  only unfinished public-source work may defer). Default 600s behavior for
  Free/V2/other workers must remain unchanged. If an implementer later
  proves the budget module itself must change: **stop**, request scope
  expansion that names (1) Paid-V3-only new API, (2) unique call site,
  (3) Free/V2 regression tests, (4) no default-600s behavior change.

**Expand only on stop-and-report:** if a required call contract cannot be
completed inside the files above, stop and request allowlist expansion.
Do not pre-add unrelated files.

### Test file allowlist

Exact paths only (verified present on tree 2026-07-31 unless marked **new**).
No globs, no “siblings”, no “and/or”, no “related tests”.

**New (must create with these exact names):**

- `apps/web/src/worker/paid-v3-answer-packet.test.ts`
- `apps/web/src/worker/paid-v3-compact-review-input.test.ts`

**Existing (may edit only these):**

- `apps/web/src/worker/paid-v3-semantic-review.test.ts`
- `apps/web/src/worker/answer-first-v3.test.ts`
- `apps/web/src/worker/processor-contract.test.ts`
- `apps/web/src/worker/processor.test.ts`
- `packages/ai-report-engine/src/report-semantic-review-manifests.test.ts`
- `packages/ai-report-engine/src/report-semantic-review.test.ts`

Any other test path is out of scope. Adding a different test file requires
a written allowlist amendment and user re-approval.

### Diff budgets (auditable)

| Surface | Hard / tracking | Cap |
|---|---|---|
| Production source | **Hard** | **≤ 1 200** lines |
| Tests | Tracking (Agents.md test-only amendment allowed) | **≤ 1 800** lines |
| `docs/ACTIVE-CHANGE-SCOPE.md` | Excluded | not counted |
| Non-allowlisted paths | Forbidden | any change → fail closed |

**Counting rules (mandatory, independent reviewer must re-run):**

1. **Baseline commit:** `b597f968c16842d39a154493cdff3f5b9911c22f`
2. **Metric (tracked/index):** `git diff --numstat <baseline>...HEAD` and
   uncommitted `git diff --numstat` / `git diff --numstat --cached` against
   the same baseline tree — sum **added + deleted** for each path.
3. **Production total** = sum of numstat (added+deleted) over the **seven**
   production allowlist paths only (5 existing + 2 new), **plus** full line
   counts of any **new untracked** allowlisted new production files (rule 9).
4. **Test total** = sum of numstat (added+deleted) over the **eight** test
   allowlist paths only (2 new + 6 existing), **plus** full line counts of
   any **new untracked** allowlisted new test files (rule 9).
5. Scope doc, pre-existing user/runtime trees (rule 10), and any
   non-allowlisted path **must not** be mixed into either total.
6. Production total **> 1 200** → **stop immediately; do not commit**.
7. Test total **> 1 800** → stop unless a verification-only budget amendment
   is recorded first under Agents.md (measured + ≤20% headroom); production
   budget may never use that escape hatch.
8. Vague phrases such as “changed lines total” without numstat + untracked
   audit evidence are non-compliant.
9. **Untracked-file audit (mandatory before every budget audit and every
   commit attempt):**
   - Re-run `git ls-files --others --exclude-standard`.
   - Compare against the **pre-implementation untracked baseline** recorded
     below.
   - Paths present in the baseline → **leave untouched**; do not treat as
     candidate work; do not delete/edit as part of this scope; do not count
     into production/test budgets or candidate diff.
   - Paths **new relative to baseline**:
     - Allowed **only** if the exact path is an allowlisted **new**
       production or test file named in this scope
       (`paid-v3-answer-packet.ts`, `paid-v3-compact-review-input.ts`,
       `paid-v3-answer-packet.test.ts`,
       `paid-v3-compact-review-input.test.ts`).
     - Each such allowed new untracked file counts **all lines in the file**
       (full file line count) into the corresponding production or test
       budget (in addition to any later numstat once staged/committed).
     - **Any other newly appeared untracked path** is **out-of-scope** →
       **stop immediately; do not commit**.
10. **User/runtime baseline trees (do not touch, do not count):**
    `.codex/` and `.tmp/` and every path under them that appears in the
    pre-implementation untracked baseline. They are user/runtime files, not
    candidate diff.

### Pre-implementation untracked baseline (recorded 2026-07-31, pre-code)

Command: `git ls-files --others --exclude-standard`  
Working tree at baseline commit `b597f968c16842d39a154493cdff3f5b9911c22f`
with only `docs/ACTIVE-CHANGE-SCOPE.md` dirty (scope lock; excluded from
prod/test budgets).

```text
.codex/config.toml
.tmp/check-staging-jobs.mjs
.tmp/compare-174k.mjs
.tmp/free-teaser-keys.json
.tmp/gate4-evidence.mjs
.tmp/inspect-allowed-ids.mjs
.tmp/inspect-detailed-refs.mjs
.tmp/inspect-evidence-size.mjs
.tmp/inspect-free-review-original.mjs
.tmp/inspect-paid-token.mjs
.tmp/job-d6-sizes.json
.tmp/job-detail.mjs
.tmp/measure-admission-and-draft.mjs
.tmp/measure-ai-foundation.mjs
.tmp/measure-audit-excerpts.mjs
.tmp/measure-checkpoint.mjs
.tmp/measure-free-teaser.mjs
.tmp/measure-snapshot-excerpts.mjs
.tmp/paid-deep.mjs
.tmp/paid-job-detail.mjs
.tmp/preview-env-pull.env
.tmp/rebuild-review-input-size.mjs
.tmp/rebuild-review-size.json
.tmp/schema-cols.mjs
.tmp/semantic-size-estimate.json
.tmp/watch-staging-latest.mjs
```

**Interpretation:** every path above is baseline-present. Relative to this
list, the **only** untracked paths that may appear later without being
out-of-scope are the four allowlisted **new** files:

- `apps/web/src/worker/paid-v3-answer-packet.ts`
- `apps/web/src/worker/paid-v3-compact-review-input.ts`
- `apps/web/src/worker/paid-v3-answer-packet.test.ts`
- `apps/web/src/worker/paid-v3-compact-review-input.test.ts`

### Forbidden subsystems / behaviors

- PostgreSQL schema and migrations.
- Payment, refund, order, email, entitlement.
- API routes and customer UI.
- HTML / artifact **output contract** changes (structure of
  `CombinedGeoReportV3` and customer HTML must remain).
- Free V4 behavior changes.
- V2 Worker paths.
- Production Workers / production deployment / production data.
- Model, provider, or context-window **configuration** changes (including
  raising `websiteSynthesis` 131072).
- Diagnosis `semanticProjection`.
- Generic workflow frameworks unrelated to Paid V3 packet orchestration.
- Historical reports, jobs, orders, artifacts (no replay/resume/repair/clone;
  especially `55770e59` / `d6a98e5e` and earlier frozen lineages).
- Global deletion of `public_source_attempt_deferred` semantics.
- Dockerfile, dependency, or base-image changes.
- Commerce Worker changes.
- Any Staging deploy, alias move, image build, report submission, order, or
  payment under **this** scope (those need a **separate** later scope after
  local acceptance).

### Compact transport vs canonical review authority (contract lock)

This is a hard product contract for the compact final reducer. Solving tokens
must **not** quietly change receipt/hash authority.

| Concept | Role |
|---|---|
| **`canonicalReviewInput`** | Sole authority for artifact materialization, receipt binding, apply validation, and customer-facing review application. Existing **`canonicalInputHash` / `inputHash` semantics stay**. |
| **`compactTransportInput`** | WebsiteSynthesis **transport only** — three AnswerPackets + deduped `sourceDictionary` + necessary refs + reviewable prose + authority hashes. Has its own **`transportInputHash`**. |
| Model echo | Model **must echo `canonicalInputHash`**. **`transportInputHash` must never replace** canonical hash in receipts, applied fields, or persistence. |
| Pre-call bind | Before the provider call, every compact source/evidence/entity/observation **ref must resolve** into the canonical manifest (fail closed on foreign/missing). |
| Model source IDs | Every source ID returned by the model **must be a member of the compact `sourceDictionary`** (and thus of the canonical source set). |
| Post-return | Parse/validate/apply **only** against **`canonicalReviewInput`**. Compact transport is discarded as authority after the call. |
| Unchanged | CombinedGeoReportV3 schema, receipt field set (except carrying the same canonical hashes), applied-field contract, customer HTML. |

### Checkpoint paths (exact JSONB shapes)

No new DB columns / migrations. All state lives on existing
`scan_jobs.checkpoint`.

**Per-question packets** (map keyed by real `questionId`, not q1/q2/q3 labels):

```text
checkpoint.answerFirstV3.packetsByQuestion.<questionId>
```

Each packet object **must** bind at least:

| Field | Required |
|---|---|
| `version` | yes (`PaidV3AnswerPacketV1`) |
| `questionId` | yes |
| `authorityHash` | yes |
| `inputHash` | yes |
| `outputHash` | yes when status is terminal success |
| `status` | yes (`pending` \| `completed` \| `failed`) |
| `attemptCount` | yes (provider attempts for this packet; max 2) |
| `startedAt` | yes when work begins |
| `completedAt` | yes when terminal |
| plus packet body | `question`, `answer`, `claims`, `sourceIds`, `shortEvidenceRefs`, `diagnosis`, `caveats` per AnswerPacket contract |

**Paid V3 review / metrics** (sibling under checkpoint root or under
answerFirstV3 only if version-guarded; prefer explicit root path):

```text
checkpoint.paidV3Review.transportMetrics
checkpoint.paidV3Review.stageTimings
```

`transportMetrics` **must** include (when final synthesis is attempted):

- `packetTokensByQuestion` (map questionId → estimate)
- `sourceDictionaryTokens`
- `proseTokens`
- `systemTokens`
- `reservedOutputTokens`
- `safetyMarginTokens`
- `totalEstimatedTokens`
- `transportInputHash`
- `canonicalInputHash` (the authority hash, not a substitute for transport)

`stageTimings` **must** include ISO timestamps and/or duration ms for:

- `sourceCollectionStartedAt` / `sourceCollectionCompletedAt`
- `q2AnswerStartedAt` / `q2AnswerCompletedAt`
- `q3AnswerStartedAt` / `q3AnswerCompletedAt`
- `q2DiagnosisStartedAt` / `q2DiagnosisCompletedAt`
- `q3DiagnosisStartedAt` / `q3DiagnosisCompletedAt`
- `finalSynthesisStartedAt` / `finalSynthesisCompletedAt`
- `stageDurationMs` as applicable
- per-packet / aggregate `providerAttemptCount`

Never persist: API keys, full access tokens, raw customer secrets, full model
prompt bodies.

**Concurrency / resume rules:**

- Keep legacy `answerResults` / `diagnosisByQuestion` temporarily for existing
  artifact contracts while packets are the resume authority.
- Per-question write on completion; **no parallel whole-checkpoint clobber**
  (serial merge or existing CAS/identity guard).
- Crash/resume runs **only** unfinished `packetsByQuestion` entries.

### Implementation checklist (authorized only after APPROVED)

1. **`PaidV3AnswerPacketV1`** — see checkpoint packet fields above. No
   duplicated source bodies; source IDs resolve to the shared dictionary;
   foreign/missing/duplicate refs fail closed; deterministic serialization;
   explicit per-field bounds; Q1 projected from reviewed Free checkpoint
   (no model call).
2. **Persist packets** at
   `checkpoint.answerFirstV3.packetsByQuestion.<questionId>` with the
   required bindings; metrics/timings at `checkpoint.paidV3Review.*`.
3. **Keep Q2/Q3 answer parallelism**; prove Q1 zero new provider calls;
   simultaneous Q2/Q3 start; stable order by question identity; Q2 success
   survives Q3 failure; resume runs only unfinished packets.
4. **Parallelize Q2/Q3 diagnosis**; per-question bounded inputs; per-question
   timeout; merge packet on each completion; Q1 diagnosis remains reused.
5. **Deduped `sourceDictionary`** — each source body at most once
   (`url`, `title`, `boundedExcerpt`, `hashes`); all other structures use
   refs only; assert one sourceId → one canonical source; no four-catalog
   body re-copy; missing ID / authority hash mismatch fail closed.
6. **Compact final reducer** for websiteSynthesis **transport** only; honor
   the compact-vs-canonical contract table above in full.
7. **Aggregate token budget preflight** before final model call using compact
   transport size: system + compact input + reserved output + safety margin.
   Fixture 3×20 unique sources must stay under locked 131072; over-limit →
   structured error, **provider callback must not run**; write
   `checkpoint.paidV3Review.transportMetrics` before/at the fail-closed.
8. **Paid V3 packet retry contract** — network / 429 / 5xx / explicit
   timeout: at most one retry; token/contract/parse/identity/hash/
   permanent: zero retry; lease wait may re-claim; max two provider
   attempts per packet; persist `attemptCount`, classification, retry reason
   on the packet and/or `paidV3Review`.
9. **Localize 600s defer without editing
   `public-source-execution-budget.ts`** — only Paid V3 gate placement in
   `processor.ts`: completed packets always saved first; only unfinished
   public-source/provider work may defer; resume unfinished packets only;
   healthy path must not discard progress solely because the whole stage has
   <600s remaining. Free/V2/other workers unchanged. Touching the shared
   budget module → stop and request expanded scope as noted in the
   production allowlist.
10. **Stage timing** written to `checkpoint.paidV3Review.stageTimings` as
    specified above.

### Local acceptance (this scope, after APPROVED implementation)

**Commands (minimum) — exact targeted paths first, then full suite:**

```text
npx vitest run apps/web/src/worker/paid-v3-answer-packet.test.ts apps/web/src/worker/paid-v3-compact-review-input.test.ts apps/web/src/worker/paid-v3-semantic-review.test.ts apps/web/src/worker/answer-first-v3.test.ts apps/web/src/worker/processor-contract.test.ts apps/web/src/worker/processor.test.ts packages/ai-report-engine/src/report-semantic-review-manifests.test.ts packages/ai-report-engine/src/report-semantic-review.test.ts
npm test
npm run lint
npm run build
```

**Budget audit commands (independent reviewer; also required before any
commit attempt):**

```text
git ls-files --others --exclude-standard
git diff --numstat b597f968c16842d39a154493cdff3f5b9911c22f
git diff --numstat
git diff --numstat --cached
```

1. Diff untracked list against the pre-implementation baseline above.
2. Any untracked path not in baseline and not one of the four allowlisted
   **new** files → **stop; do not commit**.
3. For each allowlisted new untracked file, add **full file line count** to
   production or test budget as applicable.
4. Sum numstat added+deleted for the seven production and eight test
   allowlist paths. Scope doc and baseline `.codex/` / `.tmp/` excluded.
5. Production total >1200 → **no commit**.

**Process gates (mandatory):**

| Gate | Owner | Rule |
|---|---|---|
| Diff ↔ allowlist | Implementer + independent reviewer | Every changed path must be an exact allowlisted production or test path; out-of-scope → fail closed, do not commit |
| Untracked ↔ baseline | Implementer + independent reviewer | Re-run `git ls-files --others --exclude-standard` vs pre-implementation baseline; only the four allowlisted **new** paths may newly appear; any other new untracked path → stop, no commit; baseline `.codex/` / `.tmp/` untouched and uncounted |
| Production budget | Independent reviewer | numstat production allowlist + full line counts of new untracked production allowlist files ≤ 1 200 |
| Test budget | Independent reviewer | numstat test allowlist + full line counts of new untracked test allowlist files ≤ 1 800 (or amended per Agents.md test-only rule) |
| Read-only design/contract review | **Independent reviewer** (not the implementer) | AnswerPacket bounds; compact-vs-canonical authority; checkpoint paths; retry contract; no Free/V2/commerce/schema drift; no 131072 raise; budget module untouched |
| Test execution | **Independent tester** (not the implementer) | Runs the local acceptance commands and reports pass/fail evidence |
| Self-acceptance | Forbidden | Implementer must **not** declare full acceptance complete |

**Required automated coverage (must be proven in allowlisted tests):**

- AnswerPacket deterministic serialization and field bounds
- source ID resolve; missing/foreign/duplicate refs fail closed
- compact `sourceDictionary` dedupe; same originalText body not repeated
  across four catalogs
- aggregate token budget; over-limit path: structured error and
  **provider callback not invoked**
- permanent / token / contract / identity errors: **zero** retry
- transient network/429/5xx: **exactly one** retry; `attemptCount` persisted
- Q2/Q3 answer time overlap; Q2/Q3 diagnosis time overlap
- Q2 success + Q3 failure: Q2 packet retained; resume runs only Q3
- checkpoint **lost-update** injection does not drop a completed packet
- **identity/hash drift** fail closed
- `canonicalInputHash` remains authority; `transportInputHash` distinct and
  never substitutes in receipt/apply
- timing and token breakdown **written** to
  `checkpoint.paidV3Review.stageTimings` /
  `checkpoint.paidV3Review.transportMetrics`
- CombinedGeoReportV3 / receipt / applied fields contracts hold
- Free V4 and commerce surfaces show **no** behavior change in covered tests
- capacity fixture 3 questions × 20 unique sources under locked 131072
  **without** raising the model limit
- healthy path: no whole-phase re-claim solely from stage-budget remainder

### Staging acceptance (NOT authorized by this scope)

Requires a **separate** later scope with explicit user approval for:

- Exactly **one** new Staging candidate (commit + thin overlay or
  justified full build per Docker discipline).
- Exactly **one** new report lineage (no historical reuse).
- Exactly **one** new sandbox order/payment.
- **No** Production touch.
- **No** restore/replay of historical failed reports (including `55770e59`).

**Acceptance card (required fields when that scope runs):**

- exact branch / HEAD
- candidate image ID
- Worker `OGC_DEPLOYMENT_VERSION`
- report ID, job IDs, order ID
- Q1 zero new provider calls (evidence)
- Q2/Q3 answer time-overlap evidence
- Q2/Q3 diagnosis time-overlap evidence
- per-question `providerAttempts`
- compact input token breakdown (the persisted components above)
- final total estimated tokens
- end-to-end wall time
- job completed 100%
- `active_artifact_revision_id` non-null
- customer HTML accessible
- fulfillment / refund status correct

**Performance targets (Staging acceptance scope):**

- Healthy path under normal provider conditions: **3–6 minutes** target.
- Healthy path must **not** take a whole-phase 600s defer.
- If wall time **> 6 minutes**, report **per-stage durations** (not total only).

### Expensive external actions (this FROZEN→APPROVED implementation scope)

- Local unit/integration tests and lint/build only.
- **Zero** Staging deploy, **zero** new report/order/payment, **zero**
  live crawl/model spend beyond what existing local mocks use.
- Staging candidate + one live lineage: **later scope only**.

### Approval phrase

User must explicitly approve this written allowlist (e.g. 「批准」 referring
to this section). Until then: **FROZEN** — scope-doc edits only; no
production or test implementation edits.

### Estimated effort (planning only, non-binding)

- Implementation + local verification: 7–10 engineering days
- Staging deploy + one new acceptance lineage: 1–2 days (separate scope)
- Total: ~8–12 engineering days

---

## Previous authority: Replacement Gate 4 paid real-flow acceptance on b597f96 (APPROVED — superseded as current)

**Status was `APPROVED`** for monitoring one user-submitted free→paid lineage
on `b597f96`. That monitoring authority is **no longer current**. Historical
failed lineages from that period remain frozen (no retry/resume/repair).
Superseded 2026-07-31 by Paid V3 linear orchestration FROZEN scope above.

## Previous authority: Protected Staging deployment of the duplicate-sourceId fix (APPROVED)

**Status: `APPROVED`** — user replied "批准" and quoted the three-step plan
on 2026-07-30. Same four-gate shape as the previous deployment scope;
`docs/PROTECTED-STAGING-OPERATIONS.md` remains the operator contract.

### Objective

Deploy the duplicate-sourceId fix (3-line change in
`apps/web/src/public-search-adapters/mimo/generative-answer.ts`, full suite
2984 green) to Protected Staging as one new candidate commit: commit + push,
thin source-overlay Worker image, recreate only `staging-worker-free` /
`staging-worker-deep`, move the fixed alias, Gate 3 protection smoke.
A replacement Gate 4 acceptance and the `7373d419` refund/SLA are SEPARATE
later scopes, not this one.

### Allowed actions

- Commit the fix files (`generative-answer.ts`, its test, this scope doc)
  on branch `codex/staging-runtime-evidence-4112c2e`; push to origin.
- Gate 1: read-only preflight (staging marker, zero claimable/running jobs,
  disk/`docker system df` record, current/rollback image identities);
  clean detached worktree at the new candidate SHA; candidate Preview —
  git-integration if it registers, otherwise CLI deploy from the worktree
  (justified by the 2026-07-30 ~35-min integration silence).
- Gate 2: ONE thin overlay image `.data/staging-release-<short>/Dockerfile.overlay`
  on base full `748e2675f280`, tag `open-geo-console:staging-<short>-overlay-v1`,
  revision label = full candidate SHA; set
  `.data/workstation-docker/staging.env` `OGC_DEPLOYMENT_VERSION` to the full
  candidate SHA; recreate ONLY the two staging workers; verify image ID /
  SHA / restart count 0 / ready / no claimed work; move the fixed alias once.
- Gate 3: anonymous protection smoke only (`/zh` 302 SSO, `POST /api/scan`
  401, catalog 302 SSO). No report/crawl/model call/order/payment/refund/
  email created by smoke.
- Scope-document bookkeeping edits only.

### Forbidden

- Production anything; commerce Worker; historical jobs/reports/orders
  (incl. `7aaf726c`, `7373d419` refund handling — deferred to its scope);
  any new report/payment from the agent side; any code/test edit beyond the
  already-finished fix (zero new diff); full Worker rebuild; broad Docker
  cleanup; removing any image except a superseded unreferenced staging
  overlay whose exact ID this scope records at that time.

### Acceptance checks

- Web Preview READY + both staging workers report the full candidate SHA,
  restart count 0, no claimed work; fixed alias moved once.
- Rollback identities recorded before mutation (current
  `staging-cd5053d-overlay-v1` `49ce21595b61` becomes the rollback).
- If any gate fails: restore workers + alias to recorded rollback identities
  and stop; no rebuild/retry without new approval.

### Expensive external actions

One commit + push, one Preview build, one thin overlay build, two container
recreations, one alias move. Nothing else.

### Completion record (2026-07-31): Gates 1–3 passed for `b597f96`

- Candidate commit `b597f968c16842d39a154493cdff3f5b9911c22f` pushed; clean
  detached worktree `.data/staging-release-b597f96/worktree`; candidate
  Preview `open-geo-console-70qal2yyx-...vercel.app` READY in 2m via CLI
  deploy from the worktree (git integration again silent).
- Thin overlay `open-geo-console:staging-b597f96-overlay-v1`
  (`5ce966c9029b`, revision label full SHA) on base full `748e2675f280`;
  `staging.env` `OGC_DEPLOYMENT_VERSION` = full candidate SHA.
- Recreated ONLY staging free/deep workers: image `5ce966c9029b`, version
  `b597f968...`, restart 0, `ready`, no claimed work. Fixed alias moved
  once to the candidate Preview.
- Roles: candidate `5ce966c9029b`; rollback `staging-cd5053d-overlay-v1`
  (`49ce21595b61`, retained). Disk: E: 87 GiB free; images 59→60.
- Gate 3 anonymous smoke: `/zh` 302, `POST /api/scan` 401, catalog 302.
  No report/payment created by smoke.
- Status: **Protected Staging deployment completed; real flow not yet
  accepted.** Replacement Gate 4 attempt is the next scope.

## Previous authority: Paid V3 review-input duplicate sourceId repair (APPROVED)

**Status: `APPROVED`** — written 2026-07-30 FROZEN; user replied "批准，退款
修复好了在处理" on 2026-07-30. Refund/SLA for order `7373d419` is deferred
until after the fix, per the same reply.

### Completion record (2026-07-30): 3-line fix, full suite green

- `apps/web/src/public-search-adapters/mimo/generative-answer.ts` (3 changed
  lines): `extractAnnotationSources` takes `request.questionId` (already
  threaded via `answer-first-v3.ts:353`, no call-site change needed) and the
  id scheme is now `mimo-annotation-<questionId>-<index+1>`. Question ids are
  deterministic and unique per question, so per-question id namespaces are
  disjoint; the uniqueness contract holds untouched.
- Test: new flatten-style test proves 3 per-question answers × 2 annotation
  sources yield 6 unique question-namespaced ids (8 added lines).
- Full `npx vitest run`: 2984 passed, 0 failed (baseline 2983).
- No commits; no evidence the model-JSON id path collides in practice.

### Objective

Fix the root cause that killed Paid V3 job `7aaf726c` (and earlier
`24451085`) with `$reviewInput.sources sourceId must be unique`:
the MiMo citation-annotation path generates index-based source ids
(`mimo-annotation-${index+1}`) independently for each per-question answer
call, so Q1/Q2/Q3 (including the seeded free-lane Q1 card) collide when the
Paid V3 manifest flattens all cards' sources
(`apps/web/src/worker/processor.ts:2680-2708`). Namespace the generated
annotation ids with the owning question identity at generation time so the
uniqueness contract holds across question-owned source sets.

### Allowed files

- `apps/web/src/public-search-adapters/mimo/generative-answer.ts`
  (id generation, ~line 88; thread the question identity in if needed)
- `apps/web/src/worker/answer-first-v3.ts` (call-site threading only)
- Their direct test files.

### Forbidden

- Deduping or dropping rows at the manifest flatMap site (silently loses
  question source ownership — the wrong fix).
- Weakening the uniqueness contract in `report-semantic-review.ts`.
- Changes to retry/resume/fingerprint logic, business gates, model prompts,
  or the semantic-review parser.
- Any deployment/container/alias/payment/refund/email action; any repair or
  replay of failed jobs `7aaf726c`/`24451085`; any other file.
- If implementation reveals the model-JSON path also emits colliding ids
  (not just the annotation path), STOP and report instead of expanding.

### Notes

- Id-scheme change alters `generativeSearchSourceHash`/`generativeSearchAnswerHash`;
  in-flight jobs resuming across this change would fail closed by design.
  Currently zero in-flight staging jobs, so the window is clean.
- Deploying this fix (thin overlay + alias) and a replacement Gate 4 attempt
  each need their own scopes afterward.

### Diff budget

Production ≤ 120 changed lines; tests ≤ 250 changed lines.

### Acceptance checks

- New tests: three per-question answers each producing annotation-derived
  ids no longer collide in the flattened Paid V3 manifest; the full
  `grounded_answer_synthesis` review-input validation accepts the manifest.
- Full `npx vitest run` green.

## Previous authority: Gate 4 paid deep-report real-flow acceptance (APPROVED)

**Status: `APPROVED`** — written 2026-07-30 FROZEN; user confirmed by
action on 2026-07-30 ("看一下我新提交的付费订单"), submitting exactly the one
Sandbox payment this scope authorizes. All remaining agent actions are
read-only monitoring.

### Objective

Accept the complete paid lineage on Protected Staging on the fix build
`cd5053d`, continuing the fresh lineage created in the previous scope:
`submitted URL -> Foundation -> Free V4 -> Q1 answer/diagnosis -> semantic
receipt -> Sandbox payment -> Paid V3 -> accessible complete HTML`.

The first five stages are already persisted for report
`6704ad4f-4a83-4fa8-82fa-06717632ddd7` (verification record above). This
scope authorizes exactly the remaining stages: ONE user-initiated Sandbox
payment on that report, its webhook/entitlement/Paid V3 job, and delivery
verification.

### Allowed actions

- Pre-payment read-only checks plus the bounded MiMo capability probe
  (`npm run public-search:probe -- --adapter mimo --locale zh-CN --region CN`)
  which creates no report/order/credit/refund/email.
- The user completes exactly ONE Airwallex Sandbox payment for report
  `6704ad4f` through the normal staging checkout UI. The agent never touches
  the payment itself.
- The user may submit ONE additional free report only if report `6704ad4f`'s
  checkout is technically impossible; that requires a chat confirmation
  first and remains one report total.
- Agent: read-only monitoring of the order/webhook/entitlement/Paid V3 job/
  revision/artifact state; verification of the seven Gate 4 stage checks
  from persisted state; reporting. If the deep job is not claimed because a
  worker lane is down, the agent may `docker start` the existing staging
  worker containers only (they already run the candidate image).
- Scope-document bookkeeping edits only.

### Forbidden

- A second payment, a second order, or any new report beyond the one named
  above without new approval.
- Retry, resume, repair, replay, clone, or reuse of any failed report/job/
  order, including the historical paid failures `24451085`/`345503d9`.
- Manual alteration of charge/credit/refund rows; any refund action
  (commercial reconciliation/SLA is a separate future scope).
- Any code or test edit (zero diff budget); any deployment, alias move,
  container recreation, or image build; production anything.
- Agent-side report/job creation, payment, refund, or email sending.

### Acceptance checks (all seven, from persisted state)

1. Payment: one user-authorized Sandbox payment, verified webhook, and an
   exactly-once entitlement/Paid V3 job sharing the lineage.
2. Paid V3 revision completes and becomes the active deliverable.
3. The report-specific authorized link opens the complete customer HTML.
4. Every model/transition/checkpoint/persistence boundary of the lineage
   verified; zero error events or explicitly explained transient events on
   the Paid V3 job.
5. If any check fails: stop without retrying or changing the failed report;
   report the actual failed stage and root cause; a repair needs a new
   FROZEN scope; another wholly new attempt needs new authorization.

### Expensive external actions

Exactly one user-initiated Sandbox payment and its downstream Paid V3 model
calls. Nothing else.

### Failure record (2026-07-30): Gate 4 attempt failed at Paid V3 — root cause identified

- Order `7373d419-1d62-4f62-83ba-9eb657efaf00`: payment `paid` via verified
  webhook; exactly-once fulfillment job `7aaf726c-5147-4872-8083-53aba9555887`
  created 15:21:02Z. Per Gate 4 stop rules the job was NOT retried/repaired.
- Job progression: website_synthesis → public_source_preflight (2 transient
  network errors "fetch failed"/"terminated", self-recovered on attempt 2) →
  grounded_answer_synthesis: `$reviewInput.sources sourceId must be unique.`
  transient 15:43:31Z → recurred 15:44:48Z → fingerprint recurrence →
  **permanent, job failed** at terminalization (23:46 local).
- Root cause (code-traced): `apps/web/src/worker/processor.ts:2680-2708`
  flattens all answer cards' sources without namespacing; the MiMo
  citation-annotation path (`apps/web/src/public-search-adapters/mimo/generative-answer.ts:88`)
  assigns index-based ids `mimo-annotation-N` per per-question answer call,
  so Q1 (seeded free-lane card)/Q2/Q3 collide; the uniqueness contract at
  `packages/ai-report-engine/src/report-semantic-review.ts:1040` correctly
  rejects. Same error as historical paid job `24451085` — a standing Paid V3
  defect, unrelated to the C3/C7 parser fix (output side), and triggered
  when MiMo returns annotation citations for ≥2 questions.
- Commercial state: order paid, fulfillment failed, refund not initiated;
  SLA deadline 2026-07-31 15:21Z. Any refund/SLA action awaits user
  direction (separate scope).
- Repair scope written above (FROZEN, awaiting approval).

## Previous authority: Protected Staging deployment of the C3+C7 parser fix (APPROVED)

**Status: `APPROVED`** — written 2026-07-30 FROZEN; user replied "批准" on
2026-07-30 to the exact allowlist below.

### Objective

Deploy commit `cd5053d` (C3 envelope tolerance + C7 echoed-identity
anchoring, full suite 2983 green) to Protected Staging only — Web Preview,
Staging Free/Deep Workers, then the fixed alias — so the user can verify the
fix themselves in the browser with one wholly new free report.

### Baseline

- Candidate commit `cd5053d` on branch `codex/staging-runtime-evidence-4112c2e`
  (already created; nothing else to commit for this scope).
- Source-only change: `package.json`, `package-lock.json`,
  `Dockerfile.worker`, base-image digest, and browser/system dependencies are
  unchanged versus the currently accepted Staging Worker image (verified in
  Gate 1 preflight before any build).
- Fixed staging URL `https://open-geo-console-staging-itheheda.vercel.app`;
  staging DB marker verified read-only in Gate 1.

### Allowed actions

- **Gate 1**: read-only preflight (git, Vercel link, staging DB
  marker/schema, Docker/disk incl. `docker system df` and free-space record,
  current/rollback image identities); `npm run lint`, `npm run build`,
  `npx vitest run` (already green, rerun allowed); clean detached worktree at
  `cd5053d`; `git push` of branch `codex/staging-runtime-evidence-4112c2e`
  to origin so Vercel builds the candidate Preview (or reuse an existing
  READY Preview whose gitCommitSha/ogcGitSha equal `cd5053d`).
- **Gate 2**: build ONE thin source-overlay Worker image from the detached
  worktree on top of the currently accepted exact Staging Worker image (copy
  only `apps/` + `packages/` source, candidate revision label; no `npm ci`,
  no Playwright/Chromium/OS installs); pre-replacement check of staging
  marker/schema and zero claimable/running jobs; recreate ONLY
  `staging-worker-free` and `staging-worker-deep`; verify image/SHA/tier/
  identity/health/restart-count-zero/no-claimed-work; then move the fixed
  Protected Staging alias once to the accepted candidate Preview. After
  verification, remove only the superseded unreferenced test/staging overlay
  image whose exact ID this scope records at that time; retain current + one
  rollback.
- **Gate 3**: read-only smoke from the agent side (candidate SHA/identity
  reported by Web + both Workers, commerce catalog mode=test where reachable
  without authentication). No report, crawl, model call, order, payment,
  refund, or email created by smoke.
- **User browser verification**: the user submits exactly ONE new free report
  (`forceFresh`, `https://shun-express.com/`, zh-CN) on the fixed staging URL.
  The agent performs only read-only status queries (job checkpoints, error
  events, semantic-review stage outcome) and reports: whether the
  `inputHash`-class death is gone, whether any identity corruption was
  rejected transiently, and the measured semantic-review wall time.
- Scope-document bookkeeping edits only.

### Forbidden

- Production anything (deploy, DB, commerce, images, cleanup).
- The commerce Worker; historical jobs/reports/orders/payments/artifacts.
- Creating any report/order/payment/refund/email from the agent side.
- A second report submission without new approval; no replay/repair/retry of
  any failed job — a failure is evidence, handled per Gate 4 stop rules.
- Any production-code or test edit (zero diff budget; this scope deploys
  `cd5053d` exactly as committed).
- Full Worker image rebuild, `docker cp`, in-container edits, broad Docker
  cleanup commands, `docker system/image/builder prune`.
- Sandbox payment / Gate 4 full paid lineage (deferred; needs its own scope).

### Acceptance checks

- Gates 1-3 pass per the runbook; Web + Free Worker + Deep Worker all report
  SHA `cd5053d` with staging identity.
- User's single new free report reaches a terminal state; agent reports the
  three verification findings above from persisted state only.
- If any gate fails: execute the recorded rollback (Workers + alias) and
  stop; a rollback does not authorize rebuild or retry.

### Expensive external actions

- One `git push` of the candidate branch; one Vercel Preview build; one fixed
  alias move; one thin-overlay Worker image build + two container recreations;
  one user-initiated free report (its crawl + model calls). Nothing else.

### Completion record (2026-07-30): Gates 1–3 passed, awaiting user browser verification

- Gate 1: preflight green (staging DB marker `staging`, 5 inert historical
  `repair_wait` jobs, no claimable/running work; E: 87 GiB free). lint 0
  errors, build OK, vitest 2983 green at `cd5053d`. Clean detached worktree
  `.data/staging-release-cd5053d/worktree` at
  `cd5053d2db5d0515f0e1e1fedfa49f313580ddff`. Branch pushed; the git
  integration did not register a build after ~35 min (matching a previous
  ~35 min lag), so the candidate Preview was created via CLI from the
  detached worktree: `open-geo-console-p4l5yqcv5-...vercel.app`, READY in
  2m. CLI-deploy metadata is not treated as independent proof; the worktree
  HEAD is the identity anchor.
- Gate 2: thin overlay `open-geo-console:staging-cd5053d-overlay-v1`
  (`49ce21595b61`, revision label full SHA) built on base full `748e2675f280`;
  `.data/workstation-docker/staging.env` `OGC_DEPLOYMENT_VERSION` set to the
  full candidate SHA. Recreated ONLY `staging-worker-free` /
  `staging-worker-deep`: both on image `49ce21595b61`, restart count 0,
  report `ready`, claimed no work. Fixed alias moved once to the candidate.
  Roles: candidate `49ce21595b61`; rollback `staging-b41cc232-overlay-v1`
  (`77b8d11d7a75`, retained). No older unreferenced staging overlays removed
  (exact-ID listing not in this scope). Disk: images 58→59, 34.17→34.19 GB;
  E: 87 GiB free before/after.
- Gate 3: anonymous `/zh` → 302 Vercel SSO; anonymous `POST /api/scan` →
  401; anonymous catalog → 302 SSO. No report/crawl/model call/order/
  payment/refund/email created by smoke. Authenticated smoke (locale render,
  catalog mode=test) deferred to the user's browser session.
- Status: **Protected Staging deployment completed; real flow not yet
  accepted.** User browser verification (one new free report) is next.

### Verification record (2026-07-30): one user-submitted free report, full lineage green

- User submitted exactly one free report via the fixed staging URL
  (`forceFresh`, shun-express.com, zh-CN): report
  `6704ad4f-4a83-4fa8-82fa-06717632ddd7`, free job
  `36886cac-88be-44cf-b876-b71300fe1781` (completed ~4 min), deep
  `v4_pre_admission` job `01330f02-4c8e-4fa3-b540-11cb8d1b86d4`
  (15:08:48Z → completed by 15:16:49Z, ≤8 min wall incl. question
  generation, snapshot resolution, answer synthesis, semantic review,
  terminalization).
- **Zero error events** on the deep job: no transient retries, no
  `unknown key`/`inputHash` death, no identity-rejection events. The
  `freeTeaser` stage reached `ready` with the semantic review
  input/output/applied persisted.
- Honest caveat: this live sample was clean, so C3/C7 failure-mode
  handling is proven by the unit/contract tests, not stress-tested by this
  run; the run proves the fixed build completes the real flow end-to-end.
- No repair/replay/second submission; read-only monitoring only.

## Previous authority: Free semantic-review parser correctness fix (APPROVED)

**Status: `APPROVED`** — written 2026-07-30 FROZEN; user replied "批准" on
2026-07-30 to the exact allowlist below.

### Completion record (2026-07-30): C3 + C7 fixed, full suite green

- `report-semantic-review.ts` (77 changed lines): `extractBatchFields` /
  `extractNamedArray` now tolerate keys outside the declared batch envelope
  (C3); new `anchorFreeBatchRows` anchors `B_obs` (`observationId:resultId`),
  `B_answers` (`questionId`), and `B_evidence_use` (`path`) rows by echoed
  identity, failing closed with TypeError on missing/unknown/duplicate/
  corrupted identities (C7). `B_fields_*` verified already path-anchored.
- Tests: three `it.todo` converted and passing; new clean-vs-`inputHash`
  envelope equivalence test; four old positional-behavior tests and the
  adapter C3 characterization test flipped to the new contract.
- Acceptance: `npx vitest run` from repo root — 2983 passed, 0 failed
  (baseline 2978). No commits/pushes/external actions.

### Approved amendment (2026-07-30): adapter C3 characterization test flip

The user approved adding
`packages/ai-report-engine/src/report-semantic-review-provider-adapter.test.ts`
to the allowed test files, solely to update its test at line ~126
("characterizes the untyped post-assembly failure for a batch payload with an
extra top-level key (C3)") which asserted the OLD C3 defect behavior (extra
envelope key rejects with /unknown key/). The test is flipped to assert the
new approved behavior: the extra envelope key is stripped, the batched run
succeeds, and per-batch evidence keeps `errorClass: null`. No other edit in
that file; no production/runtime behavior change.

### Objective

Fix the two correctness defects at the Free V4 semantic-review parser
boundary proven by the 2026-07-30 real-data evidence runs:

1. **C3 — batch envelope tolerance.** The model repeatedly adds extra keys
   (evidence: `inputHash` on `$B_obs`, twice in run 3, fingerprint-escalated
   to permanent and killed job `61e9e270`). Batch payload extraction must
   tolerate/strip keys outside the declared envelope instead of throwing
   `contains unknown key`, so a benign model habit can never kill a job.
2. **C7 — echoed-identity anchoring.** Batch rows are currently consumed
   positionally; run 2 proved the model corrupts echoed identities
   (`B_obs` row 11: `...0180404924c4a` → `...018040404924c4a`) with zero
   visibility. Row anchoring for `B_answers` (echoed `questionId`), `B_obs`
   (echoed `observationId`/`resultId`), and `B_evidence_use` (echoed `path`)
   must match by identity and degrade-or-reject positional mismatches,
   converting the three existing `it.todo` entries in
   `report-semantic-review.test.ts` (lines 1216, 1235, 1258) into passing
   acceptance tests.

### Baseline

- Working tree as of 2026-07-30, including the uncommitted evidence-sink
  changes from the previous scope; full suite green (2978 passed).
- Evidence: `output/semantic-review-evidence-run{1,2,3}.jsonl` and the
  completion record in the previous scope section below.

### Allowed files

- `packages/ai-report-engine/src/report-semantic-review.ts` (envelope
  extraction + identity anchoring only)
- `packages/ai-report-engine/src/report-semantic-review.test.ts`

### Forbidden

- Retry, degradation, or fingerprint-escalation mechanism changes.
- Business gates (Q1 entity-semantics gate / C11 stays untouched; it is an
  observation item, not a defect to fix in this scope).
- Model input construction: prompts, batch payloads, batch blueprint,
  batch sizing/splitting.
- Provider adapter transport and orchestration
  (`report-semantic-review-provider-adapter.ts`): no per-batch isolation
  (C2), no parallelism — both are deferred timing work for a later scope.
- The Paid V3 review path.
- Any external action: no staging drains, no report/job creation, no
  commits/pushes/deployments, no payment/refund/email actions.
- Any other file.

### Diff budget

- Production source: ≤ 300 changed lines in `report-semantic-review.ts`.
- Tests: ≤ 500 changed lines in `report-semantic-review.test.ts`.

### Acceptance checks

- The three `it.todo` entries are converted to real tests and pass.
- New tests prove an envelope carrying an extra key (e.g. `inputHash`)
  parses to the same result as the clean envelope.
- Existing tests covering the current positional-mismatch recording
  behavior are updated only insofar as the new anchoring contract requires,
  without weakening any acceptance gate.
- Full `npx vitest run` from the repository root passes.

### Expensive external actions

None authorized.

## Previous authority: Staging real-data per-batch evidence run (APPROVED)

**Status: `APPROVED`** — user replied “确认” on 2026-07-30 to the complete
written allowlist below. Only the allowlisted files, behaviors, and external
actions may be executed.

### Completion record (2026-07-30): 3 evidence sets collected, workers restored

- Run 1 (job `55d5b9d2`, report `34edfec4`): 10 records = 2 passes. Pass 1
  `B_evidence_use` failed `mimo_invalid_response` after 4 batches succeeded
  (~325s model time discarded); pass 2 clean. C2 confirmed live.
- Run 2 (job `be862ed3`, report `5f2e80d0`): 5 records, 1 pass, job
  completed. `B_obs` index 11: model echoed `search-attempt` id with an
  inserted `40` (`...0180404924c4a` → `...018040404924c4a`) — identity-echo
  corruption invisible to index-only anchoring. C7-class risk confirmed live.
- Run 3 (job `61e9e270`, report `d9bcfdf8`): 20 records = 4 passes, ALL
  batches identity-clean, yet the job FAILED. Error chain: Q1 contradictory
  entity semantics (C11, transient) → `$B_obs contains unknown key
  inputHash` (C3, transient) → Q1 degraded fallback (C11, transient) →
  `$B_obs contains unknown key inputHash` again (fingerprint recurrence →
  permanent). The `inputHash` envelope habit killed the job.
- Paid lane (out of scope, reported as-is): job `24451085` failed with
  `$reviewInput.sources sourceId must be unique` after a deadline resume;
  job `345503d9` failed with `The correction screenshot foundation failed
  completeness or retention validation` (product vs local-Chromium
  environment undetermined).
- Docker staging free/deep workers restored via `docker start` (12:5x);
  frozen historical objects never touched; no commits/pushes/deployments.
- Evidence artifacts (local, uncommitted): `output/semantic-review-evidence-run{1,2,3}.jsonl`.

### Approved amendment (2026-07-30): local drain may complete the user's new paid deep job

After the scope's "paid deep job is never drained by the local hooked
worker" line was written, the user made a NEW sandbox payment (order
`13a2b0ed-c34d-42d6-89c1-778e726ff682`, deep job
`345503d9-91a8-4d70-a60a-5892a97cc3b1`, queued since 11:44). With both
Docker workers stopped, the dual-tier evidence drain claimed it. The user
explicitly approved letting the local worker complete this paid job (the
evidence sink does not touch the paid V3 path; the drain environment is the
verified one). Its outcome is reported as-is; if it fails, no repair or
replay — the failure is evidence, not a task to fix.

### Approved amendment (2026-07-30): teaser runs on the deep lane — dual-tier drains

Architecture finding (verified against live checkpoints): the free teaser
and its semantic review execute inside the deep-tier `v4_pre_admission`
job, not the free-tier job. Evidence run 1's free job completed without a
`freeTeaser` checkpoint; the `v4_pre_admission` job `0f202661` holds
`freeTeaser.stage="ready"` plus the semantic-review data — it was claimed
by the running Docker deep worker (no evidence hook), so no evidence was
captured. No replay of that job.

The user approved: (1) wait for the sandbox-paid deep job
`24451085-fb77-4b2f-8819-4e1ce1e7b7df` to reach a terminal state on the
Docker deep worker without interference, then `docker stop
open-geo-console-staging-worker-deep-1` (restored with `docker start` after
the evidence runs); (2) exactly 3 further submissions (total 6: 2 env-void,
1 architecture-void, 3 evidence runs), each confirmed by the user in chat;
(3) local drains run BOTH `staging-worker.ts free` and `staging-worker.ts
deep` with `FULFILLMENT_MODE=batch_24h` overridden via process env so each
invocation drains and exits, and with `OGC_SEMANTIC_REVIEW_EVIDENCE_PATH`
set per run. The paid deep job is never drained by the local hooked worker.

### Approved amendment (2026-07-30): host drain network path + second void job

Root cause of both void jobs: the workstation requires a proxy for
international traffic, but importing the `undici` npm package (done by
`safe-fetch.ts`) replaces the env-proxy dispatcher, so the Cloudflare DoH
lookup cannot work from the host; the first void job additionally lost DoH
config via broken bash sourcing, and an orphaned worker process from that
first drain (created 09:03, killed 09:5x) claimed and killed the second job
`d648d2cc-0a7c-4bb5-8dd5-cbd479acb2ee` with the same broken environment.
Both failed jobs remain frozen; the orphan was killed; zero staging-worker
node processes remain.

Host drains therefore run with `OGC_PUBLIC_DNS_DOH_URL` overridden to empty
(process env wins over `--env-file`), falling back to system DNS — allowed
by `docs/PROTECTED-STAGING-OPERATIONS.md:64` outside Fake-IP proxy ranges,
and verified from the host: the worker's exact `resolveSafeUrl` path
resolves the target to `120.76.156.213` (real public IP, not 198.18/15),
the target site answers direct HTTP 200, and the MiMo API host is reachable
direct. This is a drain-environment configuration only; no file changes.

Evidence runs still target 3 collected evidence sets; total submissions may
reach 5 (2 void + 3 runs). Each subsequent submission is confirmed by the
user in chat before the drain starts.

### Approved amendment (2026-07-30): one replacement run after agent-caused env failure

Run 1 (job `69180314-2c79-4863-b185-04258d94f60c`) failed in discovery with
`UrlSafetyError` because the agent's first drain sourced `staging.env`
through bash (BOM/quoted values) and lost `OGC_PUBLIC_DNS_DOH_URL`; the
transient DNS error escalated to permanent on fingerprint recurrence. The
failed job remains frozen: no repair, replay, retry, or reuse. The user
approved exactly one replacement submission, so total report creations are
4 (1 void + 3 evidence runs). Worker environment loading is corrected to
`node --env-file=.env.staging.local --env-file=../../.data/workstation-docker/staging.env`
(staging.env last so real values override empty placeholders), matching the
Docker staging worker runtime; DNS and DoH resolution of the target were
verified from the host before the replacement run.

### Approved amendment (2026-07-30): report creation path

The fixed staging URL is behind Vercel authentication and no automation
bypass credential exists locally. The user chose to create the 3 new free
reports themselves via the staging web UI (`forceFresh`, `zh-CN`,
`https://shun-express.com/`), one at a time. The agent's external actions
reduce to: local worker drains against the staging database and the model
calls of the 3 free-teaser generations. No `POST /api/scan` by the agent.

### Approved amendment (2026-07-30): staging free worker stop/start

Preflight found `open-geo-console-staging-worker-free-1`
(image `staging-b41cc232-overlay-v1`) running; it lacks the evidence hook
and would race the local worker. The user explicitly approved: `docker stop`
on that container before the evidence runs and `docker start` to restore it
afterwards. No other container is touched; no image is built or removed;
the deep worker keeps running (it cannot claim free-tier jobs).

Objective (user, 2026-07-30): 先把 Phase A 的逐 batch 证据钩跑一遍真实数据，
验证它能否捕获真实的模型身份错位，之后再决定修复是否有效、修哪个 batch。

Baseline: HEAD `b41cc232b8dbf1b198ad262124cbacebd49da930` plus the
uncommitted Phase A changes (the five files listed in the completed Phase A
section below). Untracked `.codex/` and `.tmp/` remain user-owned, untouched.

Decisions recorded with the user: exactly **3** runs; target
`https://shun-express.com/` (each run a NEW free report, locale `zh-CN`);
reports created by the agent via the staging admission path.

Design (lightweight, no deployment):

1. Evidence sink wiring (new, env-gated): a small module
   `apps/web/src/worker/semantic-review-evidence-sink.ts` that, only when
   `OGC_SEMANTIC_REVIEW_EVIDENCE_PATH` is set, returns an
   `onSemanticReviewBatchEvidence` callback appending each
   `FreeV4SemanticReviewBatchEvidence` record as one redacted JSON line to
   that local file. `apps/web/src/worker/processor.ts` passes the sink into
   the existing `generateFreeTeaser` call site (:699) only when the env var
   is set. Env var unset = zero behavior change; the variable is never added
   to any staging/production env file — it is set only on the local worker
   invocation for this evidence run. Records carry the Phase A redacted
   shape only (ids/hashes/counts/timings/errorClass); a unit test re-asserts
   redaction and the env gate.
2. Execution: create the 3 new free reports by `POST /api/scan` with
   `forceFresh: true`, locale `zh-CN`, to the fixed protected staging URL
   `https://open-geo-console-staging-itheheda.vercel.app` using the
   established automation-bypass mechanism from the previous approved
   staging run (never printing, logging, or committing any bypass or secret
   value). Drain each job to a terminal state by running
   `npm run worker:staging:free` **from this working tree** (local process,
   `.env.staging.local`, staging DB marker enforced) with
   `OGC_SEMANTIC_REVIEW_EVIDENCE_PATH` pointed at a fresh local evidence
   file under `output/`. At most 20 worker invocations per run; bounded
   same-job automatic retry only — no manual retry, no 4th lineage, no
   repair/replay of any historical object. Run 1 first and verify evidence
   capture before runs 2 and 3.
3. Analysis: from the 3 evidence files, compare per batch the
   `inputIdentities` order vs `responseIdentities` order/overlap,
   `responseRowCount` vs expected slot count, and `errorClass`; report
   whether the real staging model exhibits C7-class omission/reorder
   misattribution and whether the hook attributes failures to the correct
   batch. The fix decision comes after this report and is NOT in this scope.

Pre-mutation read-only preflight (stop-and-report on any violation):

- Staging DB marker/schema verified; the frozen historical objects (1
  pending report, 5 pending/not-started orders, 5 `repair_wait`, 4
  historical `running` batch jobs) remain untouched; any live active lease
  or reserved credit = immediate stop.
- No Docker staging free worker is running that could race the local worker
  for the same jobs (`docker ps` check); if one is running, stop and report
  instead of racing it.
- Staging free quota for `shun-express.com` admits the 3 sequential
  forceFresh regenerations; if quota rows block, stop and report — the only
  cleanup path is `npm run staging:free:cleanup -- --confirm`, which
  requires its own explicit user instruction.

Allowed files:

- `docs/ACTIVE-CHANGE-SCOPE.md`
- `apps/web/src/worker/semantic-review-evidence-sink.ts` (new)
- `apps/web/src/worker/semantic-review-evidence-sink.test.ts` (new)
- `apps/web/src/worker/processor.ts` (env-gated sink pass-through only)
- `apps/web/src/worker/processor.test.ts` or `processor-contract.test.ts`
  (added test for the gate only; no existing assertion changes)
- `output/` evidence JSONL files (new, local artifacts, not committed)

Forbidden:

- Retry/backoff/fingerprint logic, parser/sanitize/apply/anchoring,
  business gates/thresholds, model inputs/prompts/manifests,
  `mimo-provider.ts` transport, paid lane, DB schema.
- Any commit, push, branch, Vercel/Docker deployment or image build, any
  production touch, any payment/refund/email action, any modification of
  historical jobs/reports/orders, any 4th report/lineage.
- Committing evidence files or any secret value anywhere.

Diff budget: production source at most 120 added/changed lines; tests at
most 120 added lines; zero edits or deletions of existing assertions.

Acceptance checks:

- `npx vitest run apps/web/src/worker/semantic-review-evidence-sink.test.ts`
  plus the touched processor test file green; `npm test` green overall.
- `git diff --stat` touches only allowlisted paths.
- Evidence files exist for all completed runs; each line parses as JSON and
  matches the redacted `FreeV4SemanticReviewBatchEvidence` shape (no prose,
  no secrets — verified by inspection of the actual files).
- Final evidence report states, with per-run per-batch tables, whether
  identity order/count mismatches or unattributed errors occurred on real
  model output.

Expensive external actions (exactly these, no more): 3 `POST /api/scan`
report creations against protected staging, 3 crawls of
`shun-express.com`, the model calls of 3 free-teaser generations (diagnosis
+ at most 5 semantic-review batch calls each), and local worker drains
against the staging database. No deployment, no payment, no email.

## Historical authority: Free semantic-review provider per-batch causal identity evidence (APPROVED, completed 2026-07-30)

Completed: redacted per-batch evidence hook added at the Free V4 batched
adapter boundary (+132/-7 production, +304 tests, budget kept); 4
characterization tests + 3 `it.todo` recorded the C7/C9 index-only
anchoring misattribution for `B_obs`/`B_answers`/`B_evidence_use`;
`npm test` 2974 passed; forbidden-file diffs verified empty. The evidence
hook is the instrument this new scope takes to real staging data.

(Original approved Phase A text follows unchanged.)

**Status: `APPROVED`** — user replied “批准” on 2026-07-30 to the complete
written allowlist below. Only the allowlisted files and behaviors may be
touched. The previously APPROVED Protected Staging authority below remains
on record but is not executable alongside this task.

Objective (user, 2026-07-30, verbatim): 在 Free semantic-review provider
边界加入 test-first、脱敏、逐 batch 的因果身份证据；不改变重试、parser、
业务门槛或模型输入。拿到证据后，再决定真正需要修改哪个 batch。

Baseline: HEAD `b41cc232b8dbf1b198ad262124cbacebd49da930`. Working tree has
no tracked modifications; untracked `.codex/` and `.tmp/` are user-owned and
stay untouched.

Boundary facts established by read-only exploration (baseline):

- Free V4 batches are the five structural ids in
  `FREE_V4_SEMANTIC_REVIEW_BATCH_IDS`
  (`packages/ai-report-engine/src/report-semantic-review.ts:97-104`):
  `B_fields_readonly`, `B_fields_mutable`, `B_obs`, `B_answers`,
  `B_evidence_use`.
- `runOfflineReportSemanticReviewBatched`
  (`packages/ai-report-engine/src/report-semantic-review-provider-adapter.ts:47-73`)
  invokes batches sequentially and merges raw payloads; per-batch raw
  payloads are not persisted anywhere and the returned `batchIds` are
  discarded by the caller.
- `parseFreeAnnotations` (`report-semantic-review.ts:1652-1662`) anchors
  `B_obs`/`B_answers`/`B_evidence_use` rows purely by positional index and
  never compares model-echoed identity ids — the identity-loss suspect.
- No logging or persistence of model I/O exists at this boundary; the only
  redaction infrastructure is `redactDiagnostic`
  (`apps/web/src/worker/job-errors.ts:118-134`), used for error diagnostics.

Conflict inventory (read-only git+code diagnosis, 2026-07-30; user asked
"判断代码和 AI 在审批环节打架的所有位置"). Verdict classes:
PATCHED (sound) / BOOMERANG (patched but recurrent kill) / WORKED-AROUND
(silent, evidence destroyed) / OPEN.

- C2 OPEN: any single batch's truncation/malformed JSON aborts all 5 batches
  unattributed — the structured invoker maps no errors
  (`mimo-provider.ts:159-168`), the adapter loop discards collected payloads
  (`report-semantic-review-provider-adapter.ts:59-65`), the error carries no
  batchId.
- C3 OPEN: batch envelope shape (extra keys from the full base prompt still
  embedded in every batch prompt, `report-semantic-review.ts:132-135`) throws
  untyped TypeError (`:2126-2131`) — transient by message-regex luck, then
  fingerprint-escalated to permanent.
- C4/C5/C6/C13/C18/C19 WORKED-AROUND: envelope identity fabricated at
  assembly (`:211-224`); field-row first-wins dedup + synthesized pass
  (`:176-187`); index-first field anchoring destroys wrong-position model
  corrections (`:732`, `:1246`); model `overallDecision` discarded
  (`:748-752`); model evidence refs overwritten by code-mounted refs
  (`:1322-1329`, `:1375`); out-of-catalog refs silently filtered
  (`:1379-1382`).
- C7 OPEN (highest value): `parseFreeAnnotations` index-only anchoring for
  `B_obs`/`B_answers`/`B_evidence_use` (`:1652-1662`); middle-row omission or
  reorder shifts valid-looking verdicts onto wrong identities with NO
  degraded marker; codified by test `report-semantic-review.test.ts:818-843`.
  Feeds Q1 gate (`report-v4-free-teaser.ts:942`, C9) and persisted metrics
  (`:979-983`, C20).
- C11/C12 BOOMERANG: Q1 incomplete/contradictory gates and language gate are
  transient (`4112c2e`, `b75b750`), but fingerprint recurrence
  (`job-errors.ts:162-181`) makes a persistent model habit fatal on the
  second attempt — with the offending model output never recorded.
- C14/C15/C17 OPEN: TypeError catch-all masks code bugs as model violations
  (`:1348-1360`); post-assembly errors classified by message regex
  (`job-errors.ts:374-380`); diagnosis boundary classifies similar failures
  oppositely (`report-v4-free-teaser.ts:108-117`).
- C20/C21 OPEN: observation/evidenceUse degradations have no structured
  flag and are ungated; receipt/checkpoint verification re-derives only from
  the sanitized projection (`:837-906`), so every silent degradation
  verifies cleanly — integrity is proved over content the model may never
  have produced.

Evidence-loss points (why the fight cannot be localized today): adapter
`batchPayloads` discarded on throw + returned `batchIds` ignored by the only
caller (`report-v4-free-teaser.ts:933-941`); checkpoint stores only merged
`{input,output,applied}` (`:983`); provider errors carry no batch context;
post-assembly parser errors use the merged namespace; degraded rows keep no
copy of the offending model row; job error records store only redacted
message + fingerprint; the `4f0fb1f` boundary trace covers the deep lane
only.

Phase A evidence targets map to: adapter tests → C2/C3; characterization
tests → C7/C9 (+C5/C6 field-side contrast); redacted per-batch hook → all
evidence-loss points above.

Phase A (this scope — evidence only, no fix):

1. Test-first adapter-level coverage of `runOfflineReportSemanticReviewBatched`
   with a mocked invoker (no network/model): per-batch invocation order and
   batch identity, `batchIds` propagation, merged-raw assembly, transport
   failure attribution to a specific batch.
2. Characterization evidence tests for causal-identity anchoring in
   `B_obs`, `B_answers`, and `B_evidence_use` under middle-row omission and
   row reordering: each test records which input identity every output row
   landed on, making silent index-only identity migration visible. These
   tests characterize current behavior and must pass without any parser
   change; desired-behavior expectations are recorded as skipped/todo
   markers, not failing gates.
3. Redacted per-batch evidence hook at the provider boundary: an optional
   evidence callback on `runOfflineReportSemanticReviewBatched`, passed
   through the Free-teaser wiring, recording per batch: `batchId`; input
   identity digests (the sorted identity ids the batch is responsible for —
   field `path`/`originalTextHash`, `observationId`/`resultId`,
   `questionId`, `evidenceId` as applicable per batch type); request payload
   SHA-256 and byte size; response row counts and echoed identity digests;
   duration; error class on failure. The hook never records raw prompt or
   response prose, never records secrets; when no callback is supplied the
   behavior is unchanged.
4. Evidence report to the user naming which batch(es) demonstrably lose
   causal identity. Choosing and implementing the batch fix is NOT in this
   scope and requires a new scope entry.

Allowed files:

- `docs/ACTIVE-CHANGE-SCOPE.md`
- `packages/ai-report-engine/src/report-semantic-review-provider-adapter.ts`
  (optional evidence callback only; no change to batching, merge, parse,
  or apply behavior)
- `packages/ai-report-engine/src/report-semantic-review-provider-adapter.test.ts`
- `packages/ai-report-engine/src/report-semantic-review.test.ts`
  (added evidence tests only; no existing assertions edited or deleted)
- `apps/web/src/worker/report-v4-free-teaser.ts` (optional sink pass-through
  only; no behavioral change when the sink is absent)
- `apps/web/src/worker/report-v4-free-teaser.test.ts` (wiring test only)

Forbidden:

- Retry/backoff/fingerprint/escalation logic
  (`apps/web/src/worker/job-errors.ts`).
- Parser, sanitize, apply, anchoring, and degradation logic in
  `packages/ai-report-engine/src/report-semantic-review.ts`.
- Business gates and thresholds: Q1 annotation checks, degradation policy,
  admission, metrics, readiness.
- Model inputs: any change to systemText/inputText content, manifest
  builders, blueprints, prompts, or model parameters; `mimo-provider.ts`
  transport.
- Paid lane (`paid-v3-*`), answer-engine-observer, DB schema or persistence
  shape, staging/production deployments, real model/network calls, and any
  historical job/report/order/payment object.

Diff budget: production source at most 150 added/changed lines across the
two allowed production files; tests at most 450 added lines; zero edits or
deletions of existing test assertions.

Acceptance checks:

- `npx vitest run packages/ai-report-engine/src/report-semantic-review-provider-adapter.test.ts packages/ai-report-engine/src/report-semantic-review.test.ts apps/web/src/worker/report-v4-free-teaser.test.ts` green.
- `npm test` green.
- `git diff --stat` touches only allowlisted paths; diff on
  `report-semantic-review.ts`, `report-semantic-review-manifests.ts`, and
  `mimo-provider.ts` is empty (model input provably unchanged).
- A unit test asserts the captured per-batch evidence contains only
  ids/hashes/counts/timings — no prose bodies, no Authorization or secret
  material.

Expensive external actions: none. No model calls, no crawls, no payments,
no deployments, no email.

## Historical authority: Protected Staging exactly-one Deep runtime evidence (APPROVED)

**Status: `APPROVED`** — user replied “批准” to the complete approval phrase
on 2026-07-29. Authorization is bound to exactly one candidate branch/commit
and push, one same-SHA Web+Free+Deep deployment, one new report/lineage, one
Sandbox payment, and one Deep job; failure stops immediately, with no retry and
no Production touch.

### Approved amendment (2026-07-30)

- Exactly-one target: `https://shun-express.com/`, locale `zh-CN`.
- The existing 1 pending report and 5 pending/not-started orders are frozen
  historical objects: ignore only; do not modify, reuse, claim, replay, repair,
  reopen, or clone them. If a live active lease or reserved credit appears,
  stop immediately.
- For verification/deployment, a temporary clean Git archive may be generated
  from candidate `4f0fb1f1277b717a22da8e965484809ecff7c692`; it must be removed
  after completion. The archive does not change the candidate SHA and must not
  contain working-tree dirty files.

### Approved amendment: one-time V44/staging package (2026-07-30)

The user approved this entire package verbatim: include the V44 ledger
mechanical test and a new candidate commit/push; rotate only affected Staging
credentials (never Production); freeze and ignore without modification,
reuse, claim, replay, repair, reopen or clone exactly 5 `repair_wait`, 4
historical `running` batch jobs, 1 pending report and 5 orders; run
`shun-express.com` exactly once with `forceFresh` and the approved locale; allow
bounded retry within the same job only (no manual retry or second lineage);
allow atomic email/refund queue records but never send or refund; create/delete
the temporary clean archive and thin-overlay recipe; perform one same-SHA
Web/Free/Deep deployment; create one new report, one Sandbox payment and one
Deep job; failure stops immediately.

- Candidate strategy becomes “next commit, then new full SHA”; the exact SHA is
  not invented in this document and must be recorded from the clean candidate
  artifact before deployment.
- The test allowlist gains exactly one one-time entry:
  `apps/web/src/db/report-v4-acceptance-ledger.test.ts`, limited to the existing
  V44 mechanical diff; no other test changes are authorized.
- Staging-only credential rotation is allowed by category only; never record
  secrets, values, tokens or keys.
- The five `repair_wait`, four historical `running` batch jobs, one pending
  report and five orders must be resolved to exact live-DB IDs (or safe short
  identifiers/reference query receipts) during read-only preflight. This scope
  records the freeze class, not unverified IDs; no identifier values are
  fabricated here. Any live lease or reserved credit remains an immediate stop.
- Runtime semantics are fixed: `forceFresh`, `zh-CN`, Free V4 → Paid V3,
  ledger correctness, bounded same-job retry, and atomic queue recording without
  delivery/refund.
- The temporary clean archive and thin-overlay recipe must be created from the
  exact clean candidate, contain no dirty files, preserve the full SHA, and be
  deleted after verification. Keep current plus one rollback; rollback alias
  and both Workers on deployment/post-change failure per the runbook.

### Objective

Promote the locally accepted redacted-trace candidate as an exact commit and
deploy it to Protected Staging, then execute exactly one new Free → Sandbox
payment → Deep lineage to obtain real boundary trace and HTML evidence. This is
not a repair or replay of any historical job.

### Baseline and dirty-file boundary

- Canonical cwd `E:\project\open-geo-console`, branch `main`, HEAD
  `4112c2e5494e6c2b4045dbfe6a3870c910961c89` (ahead 7).
- Agent-owned candidate files only: this scope, `apps/web/src/worker/public-source-forensics.ts`,
  `apps/web/src/worker/job-errors.ts`, and their corresponding tests.
- Exclude user/unknown dirty ledger test, `.codex/`, and `.tmp/`.
- Current Staging image: `staging-4112c2e-overlay-v1`,
  `sha256:1d6e7a...f3522`, restart 0; E: free approximately 86.4 GiB.
- Source-only change: dependencies, Dockerfile and lockfile unchanged; full
  Worker build is forbidden, thin overlay only.

### Git strategy and allowlist

`git_operator` may create one ordinary branch (recommended
`codex/staging-runtime-evidence-4112c2e`) without a worktree, and stage/commit
only the agent-owned files above plus this scope. Exclude ledger, `.codex/`,
`.tmp/`, user edits and unknown files. Push the candidate branch only after
approval; merge, tag, PR, and worktree cleanup are forbidden. Build/deploy only
from the clean exact-commit artifact, never a dirty working tree; record full
SHA.

### Four gates and roles

Follow `docs/PROTECTED-STAGING-OPERATIONS.md`. Fixed business URL:
`https://open-geo-console-staging-itheheda.vercel.app`. Web, Free and Deep must
share the exact candidate SHA; Vercel Preview identity remains separate from
the fixed alias. A technical checker must provide the plain-language
acceptance card. `git_operator` owns Git; `release_operator` build/deploy/
rollback; `runtime_operator` run/job/lease/checkpoint supervision;
`browser_qa` fixed URL, Sandbox payment and HTML visual journey; tester/reviewer
are read-only. Main agent is coordination-only.

### Pre-mutation read-only gates

Verify live DB marker/schema; zero conflicting claimable/running/recoverable/
exhausted-terminalizable jobs, leases, lineages, orders or payments; candidate
diff allowlist; `docker system df`, drive free space, current/candidate/
rollback image IDs; and current service health. If any proof is missing, stop.

### Deployment allowlist and budget

At most one candidate branch push, one unique Vercel Preview and one promotion
of the fixed Protected Staging alias. Build one thin source-overlay Worker image
from the exact accepted image, copying only required `apps`/`packages`; recreate
only named `staging-worker-free` and `staging-worker-deep` plus the same-SHA Web
actions required by the runbook. Retain current plus one rollback; never delete
production images or broad-prune. Record before/after disk, image/container
references and net bytes. On deployment/post-change failure, rollback alias and
both Workers per runbook.

### Exactly-one real-flow budget

Exactly one new report/lineage, one Sandbox payment, and one Deep job. Use a new
runbook-approved target URL; never substitute a historical report. Pay only
after Free/Foundation/Q1/semantic receipt success; Free failure means no
payment. Payment or Deep failure records the error event/`ogc_trace` then stops.
No second lineage, retry, replay, repair, reopen, clone, payment, refund, email,
or production action.

### Acceptance and stop rules

Candidate full SHA must match Vercel Web/Free/Deep and the clean artifact.
Receipts prove exactly one lineage. Free completes. Paid Deep either returns
HTML with semantic receipt, acceptance ledger and correct commerce state, or a
targeted persisted `ogc_trace:v1` failure with origin/count/hash/full SHA and no
raw identifiers; no reserved-credit terminal anomaly. Independent checker
delivers the acceptance card. A failed real test is valid diagnosis only, not
product acceptance.

Stop on scope/diff/dirty mismatch, disk <20 GiB, unclear candidate/rollback,
DB conflict, SHA mismatch, protected auth/permission failure, Free/payment/Deep
failure (capture then stop/rollback), any second external action, or missing
trace; never auto-edit code.

### Budgets

Scope document cumulative `+330/-20` maximum. Source/test code remains within
the prior scope's existing production/test budgets; no new code budget is
added. Full Docker build and production deployment/actions are `0`; external
counts are exactly one deployment, one report, one Sandbox payment and one Deep
job.

## Historical / local-accepted: Deep runtime-boundary evidence (APPROVED)

**Status: `APPROVED`** — user explicitly approved: “批准当前 Deep runtime-boundary
evidence scope，将其改为 APPROVED；执行一次性旧测试清理，并按 allowlist 实现脱敏
trace” (2026-07-29). This approval does not include fresh Staging; the existing
fresh-Staging prohibition remains in force.

### Objective

Persist a redacted structured trace at the forensics → report-parser failure
boundary into existing `scan_job_error_events.causes`, distinguishing
`pre_graph_guard` from `report_parser`. This provides attributable evidence
for exactly one future fresh Staging lineage; it does not claim to fix business
logic.

### Baseline

- Branch `main`; HEAD `4112c2e5494e6c2b4045dbfe6a3870c910961c89`.
- Historical paid Deep job `8e4f2a77…` stopped at `source_retrieval`/
  terminalization progress `95%`; the DB stack points at the
  `recommendation-forensic-v2` parser. Historical parser input and container
  logs were not retained; current Staging `4112c2e` cannot prove the historical
  attempt SHA. Unit tests cannot accept real runtime behavior.

### Production allowlist

- `apps/web/src/worker/public-source-forensics.ts`: construct a safe trace with
  origin, hashes/counts/flags and deployment revision; attach it to the
  existing typed error.
- `apps/web/src/worker/job-errors.ts`: optional `safeDiagnostics`, strict
  whitelist, JSON-safe values and length limit, normalized into existing
  `causes[]`.

Forbidden production paths: `processor.ts`, `worker/index.ts`, `report-builder`,
`recommendation-forensic-v2`, schema/migrations/new DB columns, commerce,
settlement, and checkpoint semantics.

### Test allowlist

- `apps/web/src/worker/public-source-forensics.test.ts`
- `apps/web/src/worker/job-errors.test.ts`

No PostgreSQL integration tests or other test files are allowed.

### One-time superseded-scope cleanup (out-of-scope hygiene)

After explicit approval, the sole additional path is
`apps/web/src/worker/public-source-query-coverage.test.ts`. The only permitted
action is to remove or restore the agent-added zero-observed regression edit
from the superseded test-first scope, without adding or rewriting any other
test and without touching user changes. This one-time cleanup is not part of
runtime-evidence acceptance; once completed, this file is forbidden again.
Its deletion is included in the existing tests budget `+120/-30`; production
scope and budget do not expand.

### Trace schema and contract

Trace fields: `version`, `origin`, deployment revision, per-question ordinal
with planned/observed/effective/graph/snapshotRef counts and sorted-set short
SHA-256 hashes, global counts/hash, and duplicate/foreign/empty flags. Never
include raw IDs, question text, URLs, customer/provider payloads, tokens, keys,
or IPs. Successful paths create no event; only errors append one trace to the
existing error event. Associate `checkpointRevision` through existing
transition/error-event fields; do not duplicate payloads.

Preserve original error message, code, classification, retry, terminalization,
settlement, and checkpoint behavior exactly. Preserve the cause chain and
append one prefix such as `ogc_trace:v1:<compact-json>`, with a strict total
length (recommended ≤1200 bytes) and key whitelist. Trace failure must never
mask the original error.

### Diff budgets

| Surface | Budget |
|---|---:|
| This scope document | cumulative `+220/-15` |
| Production total | `+90/-30` hard (`forensics` ≤`+55/-20`, `job-errors` ≤`+35/-10`) |
| Tests | `+120/-30` |
| Dependencies / migrations / external actions | `0` |

### Acceptance

Offline tests simulate `pre_graph_guard` and buildReport parser mismatch;
normalized `causes[]` exposes origin, counts, hashes and revision. Sorting does
not change hashes; duplicate/foreign/empty flags are correct; no raw ID, URL or
text appears; over-length traces are safely truncated or rejected while the
original error remains unchanged. Original code/classification/cause/checkpoint
ordering remain unchanged. Run focused and related tests, `npm test`, lint,
build, `git diff --check`, and independent review.

### Stop rules

If the two production files cannot persist the trace into the existing error
event, stop and report; do not expand to processor/schema. If tracing changes
classification, settlement, or leaks data, stop. Any out-of-scope path stops
for reporting. Fresh Staging is not authorized; after local implementation and
acceptance it requires a second explicit authorization for exactly one new
lineage and one Sandbox payment, with failure stopping the run.

### Forbidden external actions

All are `0` and forbidden: model, crawl, payment, refund, email, Docker,
deployment, new report, database write, and historical replay/repair/reopen/
clone. Fresh Staging is not authorized.

### Prior test-first result (regression context only)

The prior test-first false-green was fixed and its focused suite reported 13
green, but that cannot prove runtime behavior. Full-run had one out-of-scope
Windows timeout; lint/build were not run.

## Historical / superseded: Deep public-source query coverage test-first (APPROVED)

**Status: `APPROVED`** — user explicitly approved this exact scope: “批准当前
Deep test-first scope，将其改为 APPROVED，并开始测试 allowlist” (2026-07-29).

### Objective

Use deterministic unit tests first to reproduce the real `planned/observed`
shape `6/5, 3/3, 6/1` and determine whether commit `affefb31`'s
`effectiveFanouts` / subset projection is later rejected by an exact-set
validator. The first step has **production diff = 0**.

### Baseline

- Branch `main`; HEAD
  `4112c2e5494e6c2b4045dbfe6a3870c910961c89`.
- Recent paid Deep job `8e4f2a77…` stopped at
  `source_retrieval`/terminalization progress `95%` with:
  ``$.sourceGraph.dimensions.queryVariantIds: Source graph must cover the exact report query variants.``
- Historical jobs are evidence only and must not be repair targets, replayed,
  reopened, cloned, or mutated.

### Test allowlist (first step; production diff 0)

- `apps/web/src/worker/public-source-forensics.test.ts`
- `apps/web/src/worker/public-source-query-coverage.test.ts`

### Conditional production allowlist

Only if the real-shape tests fail and prove a projection bug, make the smallest
fix within this same objective:

- `apps/web/src/worker/public-source-forensics.ts`
- `apps/web/src/worker/public-source-query-coverage.ts`

`packages/ai-report-engine/src/recommendation-forensic-v2.ts` is explicitly not
allowed to change; its exact gate must remain intact.

### Canonical invariant

`plannedFanouts` performs only upper-bound, subset, foreign-ID, and per-question
non-empty checks. Once a non-empty observed subset is accepted, create exactly
one canonical `effectiveFanouts`; thereafter `report.fanouts`, snapshot-ref
query IDs, coverage denominator, source-graph expected IDs, and checkpoint all
bind to it and require exact equality. Partial coverage yields
`completed_limited` plus a limitation and correct settlement; it must never be
reported as full `completed`.

### Forbidden

Parser exact-gate changes; citation graph or snapshot resolver changes;
DB/schema/migration; commerce; prompt/provider; Q1/free; UI; deployment/Docker;
historical mutation/replay/repair/clone; external model, crawl, payment,
refund, or email actions.

### Diff budgets

| Surface | Budget |
|---|---:|
| This scope document | `+80/-0` (or equivalent under existing format) |
| Tests | `+100/-20` |
| Conditional production | `+45/-20` (hard limit) |
| Dependencies / migrations / external actions | `0` |

Test budgets remain subject to the project's verification-only rule; production
budget is hard.

### Acceptance

1. Synthetic fixture planned `[6,3,6]`, observed/effective `[5,3,1]`, total
   `15→9`; outcome `completed_limited`; downstream IDs fully equal; coverage
   expected `9`; limitation present; checkpoint written only after parse.
2. Full coverage remains `completed`.
3. Foreign ID is permanent; any question with zero observed results fails
   closed.
4. Tests are synthetic/offline only. Run focused tests, then relevant tests,
   `npm test`, lint, build, `git diff --check`, and independent review.

### Stop rules

If the new tests pass, production diff must remain `0`; stop speculative fixes
and report only the need to verify deployed SHA and exact throw origin. A
separate scope and authorization is required for exactly one fresh Staging
lineage. If tests fail, the conditional production surface above becomes
eligible only for the proven projection bug. Any out-of-scope discovery stops
for reporting. Fresh Staging is not authorized; historical jobs must not be
replayed.

### Expensive external actions

All are `0` and forbidden. No fresh Staging, model, crawl, payment, refund,
email, deployment, Docker, database write, or Git state operation is included.

## Current authority: Free teaser Q1 entity contradiction back to transient (APPROVED)

**Status: `APPROVED`** — user 2026-07-29: free report stuck at 96% again;
"那这个不对呀…能不能把这个改回来" after Staging `affefb3` job
`e26c2462` failed permanent on contradictory Q1 entity semantics.

### Baseline

- Job `e26c2462` / report `36a7383d`: `orchestration_invariant` permanent at
  `grounded_answer_synthesis` —
  "Marked Free teaser review returned contradictory Q1 entity semantics."
- W1 `b75b750` converted that throw from bare `Error` (→ transient via
  `classifyUnknown`) to `OrchestrationInvariantError` (permanent). Pre-W1
  retries could self-heal when MiMo returned consistent labels; e21ade5 Gate 4
  free teaser succeeded by luck, not because permanent was correct for model noise.
- W3 already treats `degraded` annotations as
  `FreeTeaserQ1AnnotationDegradedError` (transient). Contradiction is the same
  class of model-label inconsistency, not an orchestration identity bug.

### Design lock

| # | Rule |
|---|------|
| 1 | **Contradictory Q1 entityRole vs targetPresence/competitors** throws **`FreeTeaserQ1AnnotationDegradedError` (transient)** — not `OrchestrationInvariantError`. Message may keep the existing wording for operators. |
| 2 | **Omitted durable Q1 annotation fields** (`targetPresence` missing/ambiguous, missing roles/competitors arrays) also throw **`FreeTeaserQ1AnnotationDegradedError` (transient)** — model incompleteness, same retry path as W3 degraded marker. |
| 3 | True checkpoint/identity/hash binding guards remain **permanent** `OrchestrationInvariantError`. W1 fingerprint escalation still permanentizes deterministic recurrence. |
| 4 | No deploy in this scope unless user separately authorizes overlay recreate. |

### Production allowlist

| Path | Role |
|------|------|
| `apps/web/src/worker/report-v4-free-teaser.ts` | Rules 1–2 throw sites only |
| `docs/ACTIVE-CHANGE-SCOPE.md` | This authority |

### Tests allowlist

| Path | Role |
|------|------|
| `apps/web/src/worker/report-v4-free-teaser.test.ts` | Expect transient degraded error for contradiction / omitted fields |

### Forbidden

- Paid forensics, W-A/W-B, commerce, schema, prompts, packages/*
- Permanent→transient for true identity/hash checkpoints
- Replay historical jobs; production; push

### Diff budget

- Production ≤ 20 lines; tests ≤ 40; docs ≤ 60.

### Acceptance

1. Unit: contradictory / omitted Q1 annotation → `FreeTeaserQ1AnnotationDegradedError`, classification transient.
2. Unit: existing degraded-marker and permanent checkpoint tests still green.
3. `npm test` / lint / build green for affected packages.
4. Staging deploy of this fix is separate (thin overlay) when user asks.

## Historical: Staging deploy affefb3 + Gate 4 new-order acceptance (APPROVED)

**Status: `APPROVED`** — user authorized on 2026-07-29:
"1. 部署 Staging Workers/Web 到 affefb3  2. 新单 Gate 4 验收（不重放已退款的 8e4f2a77）".

### Baseline and identities

| Role | Identity |
|------|----------|
| Candidate SHA (full) | `affefb3174a148d4d8140c9b861f8cf56e5c4f09` |
| Candidate short | `affefb3` (W-A+W-B on top of e21ade5/W1–W4) |
| Current Staging Workers | `open-geo-console:staging-e21ade5-overlay-v1` (`a7857e2ec435`), env SHA `e21ade5…` |
| Rollback Workers | `staging-e21ade5-overlay-v1` |
| Base full image | `staging-330b27a74c5c3d9d56c71bc8e6ade1859499e92e-full-v1` (`748e2675f280`) |
| Candidate Worker image | `open-geo-console:staging-affefb3-overlay-v1` thin overlay only |
| Fixed Staging URL | `https://open-geo-console-staging-itheheda.vercel.app` |
| Disk free (preflight) | ~87 GiB on E: |
| Active jobs pre-cutover | 0 |

Source-only since full base (no package-lock / Dockerfile.worker change) → thin overlay required; full Worker rebuild forbidden.

### Design lock

| Gate | Action |
|------|--------|
| 1–2 | Detached worktree at `affefb3`; Vercel Preview with `OGC_DEPLOYMENT_VERSION`/`ogcGitSha`; thin overlay; recreate **only** staging free+deep; set `staging.env` version to full candidate SHA; alias after both healthy |
| 3 | Smoke fixed site / catalog if reachable; no report created by smoke |
| 4 | **Exactly one new** report + one Sandbox payment. **Forbidden:** replay/repair job `8e4f2a77`, order `2b879fdc`, or any historical terminal. MiMo probe before/at cutover. Failed new paid orders may use standard staging commerce refund |

### Production allowlist (closed)

| Target | Role |
|--------|------|
| `.data/staging-release-affefb3/Dockerfile.overlay` | Thin overlay |
| `open-geo-console:staging-affefb3-overlay-v1` | Candidate Workers |
| `.data/workstation-docker/staging.env` | `OGC_DEPLOYMENT_VERSION` only (+ merge if needed) |
| Containers `staging-worker-free`, `staging-worker-deep` | Recreate |
| Vercel Preview + alias `open-geo-console-staging-itheheda.vercel.app` | Web |
| `docs/ACTIVE-CHANGE-SCOPE.md` | This authority |
| `.tmp/*` operator scripts | Disposable |

### Forbidden

- Production, full Worker rebuild, docker prune, historical job/order mutation/replay
- More than one new paid acceptance lineage without a new scope
- Push to origin unless asked

### Acceptance checks

1. Free+Deep report candidate SHA, restart 0, presence healthy.
2. Fixed alias → READY Preview same SHA.
3. MiMo public-search probe green.
4. Gate 4: one new lineage completes free teaser + paid V3 HTML, **or** structured failure report (no silent historical repair).

### Execution record 2026-07-29 (deploy)

| Item | Result |
|------|--------|
| Thin overlay | `open-geo-console:staging-affefb3-overlay-v1` (`ca1cd1945627`) |
| Workers | free+deep on affefb3 image; ready; presence SHA `affefb3174a148d4d8140c9b861f8cf56e5c4f09`; 0 active jobs |
| Preview | `https://open-geo-console-q6w7l33ja-itheheda-6857s-projects.vercel.app` Ready |
| Alias | fixed Staging URL → that Preview |
| MiMo probe | 3/3 passed |
| Production | not touched |
| Gate 4 | awaiting **new** browser submit+pay (not 8e4f2a77) |

## Historical: Code-AI seam W-A+W-B — forensic query coverage classification and reuse/contract alignment (APPROVED)

**Status: `APPROVED`** — user approved this written allowlist on 2026-07-29
("批准"). Implemented as `affefb3`. Deployment was out of that scope; this
section is now the code baseline for the deploy above.

### Baseline and evidence

- HEAD / Staging candidate: `e21ade5e739dcfaf9f03621bc2ec0ef8ba4ae16f`
  (W1–W4 committed and Staging-deployed; Workers
  `staging-e21ade5-overlay-v1`).
- Gate 4 lineage (do **not** replay/repair):
  - Report `addf0b93-baf4-4f89-83cf-3ad07a6e5174`, free V4 teaser **completed**.
  - Order `2b879fdc-604f-4ba1-8dea-980b2f3d632f` **paid → failed → refunded**.
  - Paid job `8e4f2a77-40e1-4def-9f81-98481f8fcc46`:
    1. `public_source_preflight` / `public_source_attempt_deferred` (transient, W2 budget).
    2. Twice at `source_retrieval`:  
       `$.sourceGraph.dimensions.queryVariantIds: Source graph must cover the exact report query variants.`  
       First hit classified **transient** (`unexpected_internal_error`); second
       hit **permanent** via W1 fingerprint escalation.
- Code-verified mechanism:
  - Validator: `packages/ai-report-engine/src/recommendation-forensic-v2.ts:89-91`
    requires set equality of (A) all fanout `query.id`s vs (B)
    `sourceGraph.dimensions.queryVariantIds` (built only from snapshot
    observations, `public-source-graph.ts:123-126`).
  - Forensics builds the report after saving checkpoint
    (`public-source-forensics.ts:124-149`); phase stamped `source_retrieval`
    (`processor.ts:1962-1966`).
  - W2 prefix reuse: `public-source-snapshot-resolver.ts:261-271,280-297`
    may return a prior whose stored queries are a **strict prefix** of the
    current fanout → observation query ID set proper subset of plan →
    deterministic A≠B.
  - First-hit classification: bare `TypeError` from the parser does not match
    identity/contract keywords in `classifyUnknown` (`job-errors.ts:335-340`)
    → transient until fingerprint escalation.

### Design lock

Parent principles (session analysis): P1 fail-binary, P2 reuse must declare
degraded form, no silent full-success on subset evidence, no historical job
replay.

| # | Stream | Rule |
|---|--------|------|
| A1 | **W-A** | **Forensic query-variant coverage mismatch is permanent on first hit.** Introduce a typed job error (e.g. `PublicSourceQueryVariantCoverageError` or equivalent) thrown at the forensics/report-build boundary when fanout query IDs and graph `dimensions.queryVariantIds` are not the same set. `normalizeJobError` maps it to a stable code (not `unexpected_internal_error`) and classification **`permanent`**. Message may keep the existing path string for operators. |
| A2 | **W-A** | **Same class for the twin snapshotRef coverage check** when it is the same deterministic set-mismatch family: `recommendation-forensic-v2.ts:78-80` ("Every question and fanout query requires one bound market snapshot reference") if raised from the same build path — typed permanent, not generic TypeError→transient. Do **not** reclassify unrelated TypeErrors (language, evidence binding claims, cost math) in this scope. |
| A3 | **W-A** | **W1 fingerprint escalation remains** as backstop for any residual untyped recurrence; no change to fingerprint algorithm or max_attempts. |
| B1 | **W-B** | **Prefix / subset reuse must not claim a full fanout plan.** When a snapshot resolution is a fallback prior whose stored query set is a **proper subset** of the current fanout's query IDs (prefix-equivalent reuse or any refreshFailed+subset observations), the forensics pipeline must **not** build/parse a report that asserts the full fanout query set. |
| B2 | **W-B** | **Aligned limited path (required when subset is accepted).** If the pipeline continues with a subset-covered question, the **effective query plan** used for `fanouts` / `snapshotRefs.queryVariantIds` / coverage denominator / graph expectation must be exactly the **observed** query-variant ID set for that question, and commercial outcome must be at most **`completed_limited`** (never `completed`), with an explicit limitation reason that states partial query coverage / stale-or-prefix fallback. Prefer reusing existing `decidePublicSourceCommercialCoverage` + limitations machinery. |
| B3 | **W-B** | **Full `completed` still requires exact cover.** When every question's observations cover the full current fanout query ID set, behavior stays as today (exact equality still required; A1 fires if violated). |
| B4 | **W-B** | **Do not freeze a resume checkpoint that cannot parse.** Either (1) run the forensic report build/parse before committing `publicSourceForensics` snapshot identity for resume, or (2) on A1/A2 failure clear/omit the bad forensics checkpoint fields so the next attempt does not loop the same frozen subset+full-plan pair. Choose the smaller of the two that keeps resume of *good* snapshots intact; document the choice in the implementation commit message. |

### Production allowlist (closed)

| Path | Role |
|------|------|
| `apps/web/src/worker/job-errors.ts` | A1–A3 classification mapping only |
| `apps/web/src/worker/public-source-forensics.ts` | B1–B4 pipeline: effective plan, outcome cap, checkpoint ordering |
| `apps/web/src/worker/public-source-snapshot-resolver.ts` | B1: surface subset/prefix-fallback signal to caller only (no new cache schema) |
| `apps/web/src/public-source-forensics/report-builder.ts` | B2: limitations / outcome wiring if required |
| `apps/web/src/public-source-forensics/coverage.ts` | B2: only if existing decision inputs need a partial-coverage flag |
| `packages/ai-report-engine/src/recommendation-forensic-v2.ts` | A1/A2: throw typed error **or** keep TypeError only if forensics wraps it before it hits classifyUnknown — prefer typed error at throw site or single wrap in forensics; **no** loosening of the exact-cover rule for `completed` |
| `docs/ACTIVE-CHANGE-SCOPE.md` | This authority |

Optional single helper file **only if** needed to avoid bloating forensics:

| Path | Role |
|------|------|
| `apps/web/src/worker/public-source-query-coverage.ts` (new) | Pure functions: set equality, subset detection, effective fanout projection |

If created, it is part of this allowlist.

### Tests allowlist (closed)

| Path | Role |
|------|------|
| `apps/web/src/worker/job-errors.test.ts` | A1–A3: permanent first-hit, stable code |
| `apps/web/src/worker/public-source-forensics.test.ts` (or existing forensics test file) | B1–B4: subset → limited/effective plan; full cover → completed still; no full plan + subset graph |
| `apps/web/src/worker/public-source-snapshot-resolver.test.ts` | B1 signal / prefix fallback does not claim full cover silently |
| `apps/web/src/public-source-forensics/coverage.test.ts` | B2 only if coverage.ts changes |
| `apps/web/src/public-source-forensics/report-builder.test.ts` | B2 only if report-builder changes |
| `packages/ai-report-engine/src/recommendation-forensic-v2` tests (existing) | A1/A2 if throw site changes; **no** weakening of completed exact-cover assertions |

### Forbidden

- W-C/D/E/F from the broader seam plan (finalize budget model, dual-fanout product redesign, UI public_error copy, diagnosis/semantic paths) except as forced by B4 checkpoint ordering inside forensics
- Loosening exact cover for commercialOutcome `completed`
- Making A1/A2 **transient** or relying only on fingerprint escalation without first-hit permanent
- Schema/migrations, privacy triggers, commerce/refund/SLA formulas, max_attempts/backoff numbers
- Free teaser / Paid V4 two_stage paths unless a shared helper is strictly required (prefer not)
- Deployment, Docker, push, payments, staging reruns, replaying jobs `8e4f2a77` / order `2b879fdc` / other historical terminals
- Production

### Diff budget

- Production source: ≤ 280 changed lines. Hard limit.
- Tests: ≤ 400 changed lines (tracking bound; may update to measured +20% under verification-only provision).
- Docs: ≤ 120 changed lines.

### Acceptance checks

1. Unit: synthetic full-fanout plan + prefix/subset observations → does **not** parse as `completed`; either permanent typed coverage error **or** `completed_limited` with effective plan === graph query IDs (per B2), never silent full success.
2. Unit: exact observation cover of full fanout still parses `completed` when commercial coverage says so.
3. Unit: A1/A2 errors classify **permanent** on first normalize; code ≠ `unexpected_internal_error`.
4. Unit: B4 — after a coverage mismatch failure, resume does not infinite-loop the same frozen bad forensics identity (test the chosen ordering strategy).
5. `npm test`, `npm run lint`, `npm run build` green.
6. Staging deploy + new paid Gate 4 **not** authorized by this scope.

### Explicit non-goals (next scopes)

- W-C dual-fanout product redesign beyond subset/effective-plan handling
- W-E finalize 600s budget model
- W-F customer-facing error copy / progress semantics
- W4 diagnosis paths already landed at `e21ade5`

## Historical: Staging deploy W1–W4 + Gate 4 new-order acceptance (APPROVED)

**Status: `APPROVED`** — user authorized on 2026-07-29 with
"部署 staging 并做新单验收". Implements Protected Staging Gates 1–4 for
candidate `e21ade5e739dcfaf9f03621bc2ec0ef8ba4ae16f` (W1–W4 commits on
`main`). Production is forbidden. Gate 4 paid job failed; free teaser and
payment path succeeded; refund closed. See execution record below.

### Baseline and identities

| Role | Identity |
|------|----------|
| Candidate SHA (full) | `e21ade5e739dcfaf9f03621bc2ec0ef8ba4ae16f` |
| Candidate short | `e21ade5` (W4; includes W1 `b75b750`, W2 `8cde23f`, W3 `fcc2142`) |
| Current Staging Workers | image `open-geo-console:staging-737ad6d-overlay-v1` (`4f2fca0e9e53`), env `OGC_DEPLOYMENT_VERSION=a35674b…` (version drift pre-exists) |
| Rollback Workers | same current image `staging-737ad6d-overlay-v1` |
| Base full image (overlay parent) | `open-geo-console:staging-330b27a74c5c3d9d56c71bc8e6ade1859499e92e-full-v1` (`748e2675f280`) |
| Candidate Worker image (to build) | `open-geo-console:staging-e21ade5-overlay-v1` thin source overlay only |
| Fixed Staging URL | `https://open-geo-console-staging-itheheda.vercel.app` |
| Disk free (preflight) | ~91 GiB on E: — full rebuild not required |

Source-only since full base: `package.json` / `package-lock.json` /
`Dockerfile.worker` unchanged → **full Worker rebuild forbidden**; thin
overlay required.

Pre-cutover jobs: 0 queued/running (checked 2026-07-29).

### Design lock

| Gate | Action |
|------|--------|
| 1 | Package candidate: already committed `e21ade5`; local test/lint/build green at W4 commit; create clean detached worktree; Vercel Preview at this SHA with `ogcGitSha`/`OGC_DEPLOYMENT_VERSION` metadata |
| 2 | Thin overlay build from base full; recreate **only** `staging-worker-free` + `staging-worker-deep` with candidate image; set `OGC_DEPLOYMENT_VERSION` in `.data/workstation-docker/staging.env` to full candidate SHA; after both healthy, move fixed alias once |
| 3 | Smoke fixed URL locale + commerce catalog test mode; confirm Web/Free/Deep same SHA; **no** report/payment created by smoke |
| 4 | Exactly **one** new Staging report + **one** Sandbox payment for Gate 4 lineage (submit → free V4 → pay → Paid V3 HTML). Monitor DB; no historical job replay. MiMo `public-search:probe` before paid path. Failed new paid orders may use standard staging commerce refund |

### Production allowlist (closed)

| Path / target | Role |
|---------------|------|
| `.data/staging-release-e21ade5/Dockerfile.overlay` | Thin overlay definition (untracked data) |
| `open-geo-console:staging-e21ade5-overlay-v1` Docker image | Candidate Workers |
| `.data/workstation-docker/staging.env` | `OGC_DEPLOYMENT_VERSION` only (+ regenerate via existing merge script if needed) |
| Staging containers `staging-worker-free`, `staging-worker-deep` | Recreate with candidate image |
| Vercel Preview deployment + alias `open-geo-console-staging-itheheda.vercel.app` | Web cutover |
| `docs/ACTIVE-CHANGE-SCOPE.md` | This authority |
| Optional: `.tmp/*` operator scripts | Disposable diagnostics only |

### Forbidden

- Production Web, production Workers, production commerce
- Full `Dockerfile.worker` rebuild / `npm ci` / Playwright install
- `docker system prune` or broad image prune
- Touching/replaying historical jobs/orders (`36c78f69`, `9cec1db7`, etc.)
- More than one new paid acceptance lineage without a new scope
- Pushing to `origin` unless separately asked
- W5 code changes

### Acceptance checks

1. Gate 2: Free+Deep workers report candidate SHA, restart count 0, healthy presence; fixed alias points to READY Preview with same SHA.
2. Gate 3: fixed `/zh` + catalog `mode=test`; no new report from smoke.
3. Gate 4: one new report completes Free V4 + Paid V3 accessible HTML; record stage evidence; if paid fails, extract structured error only (no silent historical repair).
4. Rollback path: restore Workers + alias to `staging-737ad6d-overlay-v1` / prior Preview if post-cutover Gate 2/3 fails.

### Execution record 2026-07-29

| Item | Result |
|------|--------|
| Thin overlay | `open-geo-console:staging-e21ade5-overlay-v1` (`a7857e2ec435`), label revision full candidate SHA |
| Workers | free+deep recreated; ready logs; presence SHA `e21ade5e739d…`; restart 0; 0 active jobs |
| Preview | `https://open-geo-console-7qlpbuj5m-itheheda-6857s-projects.vercel.app` status Ready |
| Alias | fixed Staging URL → that Preview |
| MiMo public-search probe | 3/3 cases passed |
| Generative-answer staging probe | answerNonblank=true, sourceCount=20 |
| Production | not touched |
| Gate 4 | authorized; awaiting operator browser new report + Sandbox payment |

## Historical: Code-AI seam hardening W4 — Paid V3 evidence and review degradation (APPROVED)

**Status: `APPROVED`** — user approved this written allowlist on 2026-07-29
("可以", following the recommended path: implement W4 only; W5 deferred;
deployment/staging paid rerun remain separate later authorization).
Implemented and committed as `e21ade5`.

### Baseline and evidence

- HEAD `fcc2142` (W1 `b75b750` + W2 `8cde23f` + W3 `fcc2142` committed, not
  yet deployed; Staging Web `e3fe6a0`, Workers `staging-737ad6d-overlay-v1`).
- Parent design: session plan `shazam-stargirl-stargirl.md` (approved
  2026-07-29), workstream W4. W1–W3 scopes are complete (historical below).
- Code-verified seams at HEAD `fcc2142`:
  1. **Evidence eligibility intersection kills the job.**
     `apps/web/src/worker/processor.ts:2674` marks a Paid V3 semantic-catalog
     source `eligible` only when
     `audit.retrievalReady && audit.exactExcerpt !== null &&
     retrievalStatus === "verified_body"`. Search-cited sources whose body
     retrieval failed stay in the answer card as
     `search_source_only` (`answer-first-v3.ts:529-530`) but are **ineligible**
     for the `report_global_v1` catalog. Parse then fails closed with
     `ReportSemanticReviewEvidenceMissingError`
     (`packages/ai-report-engine/src/report-semantic-review.ts:20-37`),
     classified **permanent** (`job-errors.ts:161-162`). V1
     `verifyReportEvidence` (`evidence.ts:58-100`) already drops bad findings
     without killing the job — Paid V3 does not yet have that degradation.
  2. **Blocked review throws TypeError instead of degrading.**
     Paid manifests force `evidencePolicy: "report_global_v1"`
     (`report-semantic-review-manifests.ts:276-277`). Application throws on
     `overallDecision === "blocked"` and on any field
     `decision === "blocked"` (`report-semantic-review.ts:778-783`), and
     receipt verification re-throws (`:831`). Free path already synthesizes
     pass-from-blocked for field-local policy; Paid has no equivalent
     "keep original prose + explicit blocked annotation" path, so model
     blocked decisions become bare TypeErrors that burn retries.
  3. **Diagnosis character budget is count-capped only.**
     `737ad6d` truncates source **count** to
     `REPORT_V4_MAX_DIAGNOSIS_SOURCES` (5) in
     `report-v4-diagnosis-enhancer.ts:146`, but
     `parseReportV4DiagnosisInput` still rejects when retained characters
     exceed `REPORT_V4_MAX_DIAGNOSIS_INPUT_CHARS` (60_000)
     (`report-v4-diagnosis.ts:199-203`). Five sources × long title/excerpt +
     ten target pages × long summary can exceed 60k without any count
     overflow — a deterministic `input_validation` fail after expensive
     upstream work.

### Design lock

| # | Rule |
|---|------|
| 1 | **Search-cited, body-unavailable sources stay citable as search-summary-only.** At the Paid V3 semantic-catalog build boundary (`processor.ts` `buildPaidV3SemanticAuthorities`), a source that was returned by public search and is present on the answer card with `retrievalStatus === "search_source_only"` (or equivalent non-verified body) is catalogued as eligible for citation with an explicit search-summary-only signal in its catalog text — not as fully verified body evidence, and never invented. Sources that are truly inaccessible (no search hit / no URL) stay ineligible. `ReportSemanticReviewEvidenceMissingError` remains permanent when a non-blocked slot cites zero accepted IDs after this expansion; the kill path is only removed for the intersection miss where search text exists but body fetch failed. |
| 2 | **Paid blocked review degrades to original prose + explicit annotation.** For `lifecycle === "paid_v3"` only: when `overallDecision === "blocked"` or a field is `blocked`, `applyReportSemanticReview` (and the complete Paid application path) keeps each blocked field's **original** text, records the blocked decision on the applied field/receipt (or an equivalent explicit blocked annotation already in the review output), and does **not** throw TypeError. Free lifecycle and non-Paid evidence policies stay unchanged. Receipt verification must accept this degraded applied form for Paid only. No second model call is introduced. |
| 3 | **Diagnosis input is character-budget truncated at the enhancer boundary.** Before `parseReportV4DiagnosisInput`, the enhancer (or a tiny pure helper it calls) enforces `REPORT_V4_MAX_DIAGNOSIS_INPUT_CHARS` by priority truncation: keep full `answer` and `question` first; then truncate `sources` excerpts/titles (provider order, already count-capped at 5); then truncate `targetPages` summaries/reasons. Never drop the question/answer wholesale. Contract caps (source count, page count, per-field max lengths) stay; this is boundary adaptation only, matching the 737ad6d count-cap precedent. |

### Production allowlist (closed)

| Path | Role |
|------|------|
| `apps/web/src/worker/processor.ts` | Rule 1 catalog eligibility only (`buildPaidV3SemanticAuthorities` / source catalog construction); no orchestration, commerce, or snapshot changes |
| `apps/web/src/worker/report-v4-diagnosis-enhancer.ts` | Rule 3 character-budget truncation before parse |
| `packages/ai-report-engine/src/report-semantic-review.ts` | Rule 2 Paid-only blocked apply/receipt path; no Free sanitizer / fabrication changes beyond what W3 already shipped |
| `packages/ai-report-engine/src/report-semantic-review-manifests.ts` | Rule 2 complete Paid application wiring only if the blocked degrade cannot live entirely in `applyReportSemanticReview` |
| `packages/ai-report-engine/src/report-v4-diagnosis.ts` | Rule 3 only if a pure exportable truncation helper is colocated with the char budget constant; no cap number changes |
| `docs/ACTIVE-CHANGE-SCOPE.md` | This authority |

### Tests allowlist (closed)

| Path | Role |
|------|------|
| `apps/web/src/worker/processor.test.ts` and/or existing Paid V3 processor/diagnosis test files that already cover catalog build | Rule 1: search_source_only sources become citable; inaccessible stay ineligible; evidence_missing still permanent when zero accepted IDs |
| `apps/web/src/worker/report-v4-diagnosis-enhancer.test.ts` | Rule 3: over-budget inputs are truncated by priority and parse succeeds; under-budget inputs unchanged |
| `packages/ai-report-engine/src/report-semantic-review.test.ts` | Rule 2: Paid blocked overall/field degrades to original text; Free path still rejects blocked apply as today |
| `packages/ai-report-engine/src/report-semantic-review-manifests.test.ts` | Rule 2 complete Paid path if manifests.ts is touched |
| `packages/ai-report-engine/src/report-v4-diagnosis.test.ts` | Rule 3 helper / char-budget assertions if diagnosis.ts is touched |
| `apps/web/src/worker/paid-v3-semantic-review.test.ts` | Rule 2 end-to-end apply if needed for wiring |

### Forbidden

- Free teaser path, W1 classification, W2 snapshot/resolver/forensics (complete)
- Prompt text, model profiles, provider adapters, commerce/refund/SLA
- Changing `REPORT_V4_MAX_DIAGNOSIS_*` numeric caps or relaxing contract validators for counts/IDs
- Making `ReportSemanticReviewEvidenceMissingError` transient when zero accepted IDs remain
- Privacy triggers, identity/cross-tenant guards, payment webhooks
- Deployment, Docker, push, payments, report reruns, replaying terminal jobs
- W5 privacy result-side filtering (separate optional later scope)

### Diff budget

- Production source: <= 250 changed lines. Hard limit.
- Tests: <= 350 changed lines (tracking bound; may update to measured +20% under the verification-only provision).
- Docs: <= 100 changed lines.

### Acceptance checks

1. Unit tests for each rule: search_source_only catalog citation works without
   inventing body evidence; blocked Paid review applies original prose with
   explicit blocked signal and does not throw; diagnosis over-char inputs are
   priority-truncated and pass parse; under-budget diagnosis inputs byte-identical.
2. Existing Paid V3 / free teaser / diagnosis suites stay green; Free blocked
   apply behavior unchanged.
3. `npm test`, `npm run lint`, `npm run build` green.
4. Deployment, MiMo probe, and staging paid rerun require separate later
   authorization (shared with W1–W3 once W4 lands).

## Historical: Code-AI seam hardening W3 — free-teaser degradation safety (APPROVED)

**Status: `APPROVED`** — user approved this written allowlist on 2026-07-29
("批准 W3"), including the narrow opening of
`packages/ai-report-engine/src/report-semantic-review.ts` for rule 1's
degradation-marker exposure only. Implemented and committed as `fcc2142`;
acceptance checks green (2950 tests, lint 0, build exit 0). Deployment and
staging reruns remain excluded.

### Baseline and evidence

- HEAD `8cde23f` (W1+W2 committed, not yet deployed; Staging Web `e3fe6a0`,
  Workers `staging-737ad6d-overlay-v1`).
- Parent design: session plan `shazam-stargirl-stargirl.md` (approved
  2026-07-29), workstream W3.
- User-visible symptom: free AI preview stalled at 96% on staging
  (2026-07-28/29) — the second of the two distinct "96%" stalls.
- Code-verified mechanisms at HEAD `8cde23f`:
  - `packages/ai-report-engine/src/report-semantic-review.ts:1672-1677`: the
    degraded-annotation fallback **fabricates** `targetPresence:"present"`,
    `entityRole:"target"`, `targetFirstSentence:1`. It passes the W1 guard
    (`report-v4-free-teaser.ts:913-921`) and persists as truth
    (`targetMentioned:true`, :934); only an uninspected `reason` string marks
    the degradation.
  - `entityRole` is validated at the parse boundary
    (`report-semantic-review.ts:1656`) but never stored or consumed after
    `report-v4-free-teaser.ts:919`, so self-consistent fabrication is
    undetectable downstream.
  - Free-path Q1 incompleteness throws `FreeTeaserQ1IncompleteError`
    classified **permanent** (`report-v4-free-teaser.ts:82-91,:748-750`)
    while the paid-path equivalent is transient with one self-correction
    (`answer-first-v3.ts:360-371,:754-762`); checkpoint-integrity guards at
    `report-v4-free-teaser.ts:815-854` still throw bare `Error`s.
  - The free deferred path never runs the mechanical language gate
    (`report-v4-free-teaser.ts:741-746` parses with `"deferred"`), so no
    `ReportLanguageValidationError` can fire there — asymmetric with the
    paid path (typed, transient per W1).
  - `estimateTokens` is a UTF-8 byte-length upper bound
    (`apps/web/src/report-v4/model-runtime-config.ts:58-68`), over-counting
    Latin prose ~4x; every `ModelTokenBudgetError` is **permanent**
    (`job-errors.ts:164-166`), so an estimation artifact terminally kills
    jobs.

### Design lock

| # | Rule |
|---|------|
| 1 | **A degraded Q1 annotation must not persist as fact.** Expose a structured degradation marker in the review output (narrow change in `report-semantic-review.ts`, instead of relying on the uninspected `reason` string); the free teaser treats a degraded Q1 annotation as a transient model-contract failure (W1 fingerprint escalation is the deterministic backstop) instead of persisting fabricated `targetPresence`/`entityRole`/`targetFirstSentence`. Paid-path review behavior unchanged. |
| 2 | **entityRole reaches the persistence boundary.** The persisted free-teaser Q1 projection carries/asserts entityRole consistency at the point of write, so a self-consistent-but-fabricated annotation cannot pass silently. No schema change; projection shape change only inside the existing persisted JSON. |
| 3 | **Free Q1 incompleteness becomes transient.** `FreeTeaserQ1IncompleteError` classification permanent -> transient (model randomness, mirroring the paid path; no correction-retry addition, no retry-count/backoff changes). The bare `Error`s in `verifyMarkedFreeTeaserDraftCheckpoint` (:815-854) become typed JobErrors — transient where the cause is model-output incompleteness, permanent invariant where internal checkpoint state is contradictory. |
| 4 | **Language gate symmetry.** The post-review applied Q1 answer text passes the existing mechanical language assertion before persistence in the free path; failure surfaces as the existing typed `ReportLanguageValidationError` (already transient per W1). Deferred-mode parse semantics otherwise unchanged. |
| 5 | **Token estimation calibrated.** Replace the pure byte-length estimator with a calibrated conservative estimator (CJK runs ~ bytes/3, Latin ~ chars/4, keeping an upper-bound bias) so Latin prose is not over-rejected ~4x; `ModelTokenBudgetError` stays permanent for genuine budget excess. Estimator/tokenizer id version bumped in place; no dependency or provider change. |

### Production allowlist (closed)

| Path | Role |
|------|------|
| `apps/web/src/worker/report-v4-free-teaser.ts` | Rules 1, 2, 3, 4 |
| `apps/web/src/worker/job-errors.ts` | Rule 3 classification mapping only if the error class alone cannot carry it |
| `apps/web/src/report-v4/model-runtime-config.ts` | Rule 5 estimator only |
| `packages/ai-report-engine/src/report-semantic-review.ts` | Rule 1 structured degradation marker exposure only — no sanitizer/review logic changes beyond surfacing the marker |
| `docs/ACTIVE-CHANGE-SCOPE.md` | This authority |

### Tests allowlist (closed)

| Path | Role |
|------|------|
| `apps/web/src/worker/report-v4-free-teaser.test.ts` and `report-v4-free-teaser-resume-harness.test.ts` | Rule assertions; scenario shapes preserved |
| `apps/web/src/worker/job-errors.test.ts` | Rule 3 classification assertions |
| `packages/ai-report-engine/src/report-semantic-review.test.ts` | Rule 1 marker assertions only |
| `apps/web/src/report-v4/model-runtime-config.test.ts` | Rule 5 calibration assertions |
| `apps/web/src/report-v4/mimo-provider.test.ts`, `apps/web/src/report-v4/mimo-site-synthesis-provider.test.ts`, `apps/web/src/worker/report-v4-website-synthesis-production.test.ts` | Amendment 2026-07-29 (user approved "批准夹具修复"): mechanical oversized-fixture resizing only, to restore the declared over-budget-rejection scenario under the rule-5 calibrated estimator; no assertion-contract weakening |

Rule 5 bookkeeping decision 2026-07-29 (user approved "保持 v1 现状"): only
`ESTIMATOR_ID` was bumped to v2 in code; the tokenizer id pinned in
`config/model-profiles/report-v4-mimo-v2.5-pro.json` stays
`mimo-v2.5-pro-utf8-conservative-v1` because the registry resolves the
estimator by that string at module init. Calibration drift remains detectable
via the bumped estimator id flowing into `resolvedProfile.operations[*].estimatorId`.

### Forbidden

- All other `packages/*` files (prompts, contract validators, model profiles, provider adapters)
- `answer-first-v3.ts` and paid V3 diagnosis behavior (W4 scope)
- Tokenizer/provider dependency additions, `max_attempts`/backoff numbers
- Market snapshots/resolver/forensics (W2, complete), commerce/refund/SLA
- Deployment, Docker, push, payments, report reruns (separate authorization)
- Replaying/mutating terminal jobs or orders

### Diff budget

- Production source: <= 200 changed lines. Hard limit.
- Tests: <= 300 changed lines (tracking bound, measured +20%).
- Docs: <= 80 changed lines.

### Acceptance checks

1. New unit tests: a degraded Q1 annotation is rejected as transient and
   never persisted as `targetMentioned:true`; entityRole consistency is
   asserted at persistence; `FreeTeaserQ1IncompleteError` and the checkpoint
   guards classify per rule 3; post-review applied text failing the language
   gate surfaces a transient `ReportLanguageValidationError`; the calibrated
   estimator stays an upper bound on mixed CJK/Latin fixtures and no longer
   ~4x-over-counts Latin prose.
2. `npm test`, `npm run lint`, `npm run build` green.
3. Deployment and any staging rerun require separate later authorization.

## Historical: Code-AI seam hardening W2 — public-source snapshot availability (APPROVED)

**Status: `APPROVED`** — user approved this written allowlist on 2026-07-29
("批准"), plus the rule-1 amendment adding `apps/web/src/db/market-snapshots.ts`
("批准修订"). Implemented and committed as `8cde23f`; acceptance checks green
(2943 tests passed, lint 0 errors, build exit 0). Deployment, staging reruns,
and the MiMo probe remain excluded and require separate later authorization.

### Baseline and evidence

- HEAD `b75b750` (W1 committed, not yet deployed; Staging Web runs `e3fe6a0`,
  Workers `staging-737ad6d-overlay-v1`).
- Parent design: session plan `shazam-stargirl-stargirl.md` (approved
  2026-07-29), workstream W2. W1 scope above is complete.
- Staging evidence:
  - job `36c78f69` (report `1940f8e8`, paid, failed @98): MiMo outage window
    from 02:47:54Z; 24/24 fanout attempts timed out (~30 s each) across 4
    retries ~2 min apart — every retry landed inside the same outage window.
    Forensics fanout identity `market-28d78e5a…` (6 queries) had **no**
    completed prior snapshot, while the same question's provider-discovery
    identity `market-8208165f…` (3 queries, a strict prefix of the 6) had
    completed snapshots at 01:14 and 02:46 that could not be reused
    (`public-source-snapshot-resolver.ts:106-111` requires exact identity +
    metadata match).
  - job `b286633f` (failed @98): `observation_persistence` privacy-trigger
    rejection retried as transient, then permanent resume-identity mismatch.
  - `market_snapshot_leases`: lease-wait deadline is 15 s
    (`public-source-snapshot-resolver.ts:97-98`) while a real refresh takes
    minutes, so retries repeatedly collide with the previous lease.
  - `public-source-execution-budget.ts:20-23` returns sub-budgets that call
    sites (`processor.ts:1230,:1389`) discard.

### Design lock

| # | Rule |
|---|------|
| 1 | **Prefix-equivalent snapshot reuse as fallback only.** When the forensics fanout's first N queries exactly match a completed provider-discovery snapshot's query set for the same question text + surface, the resolver may use that snapshot as the prior-fallback (same role as the existing prior-snapshot path). Exact-identity fresh refresh remains the primary path; reuse never crosses questions and never replaces the primary path. Metadata mismatch on an otherwise usable prior downgrades to "stale but usable" instead of forcing refresh when a refresh is impossible (provider down). |
| 2 | **Provider-down with no prior → defer, not terminal.** When `PublicSourceSnapshotUnavailableError` has no prior fallback, the job defers to a later attempt *without consuming* `phase_attempt` (new defer classification, narrow change in the attempt-accounting path), bounded by the existing hard deadline/SLA. Deterministic unavailability still fails fast per W1. |
| 3 | **Lease-wait window matches real refresh duration.** Raise the wait deadline / block-reuse while the holder is actively heartbeating, instead of failing after 15 s and colliding with the same live lease on every retry. |
| 4 | **Resume re-fetch updates checkpoint identity.** When a prior snapshot is unavailable at resume and a normal re-fetch produces new snapshot IDs, the checkpoint's snapshotIds/identity are updated to the new fetch instead of throwing `PublicSourceResumeIdentityMismatchError`. Genuine authority drift (question set, foundation hash) stays permanent. |
| 5 | **Sub-budgets are actually propagated.** `searchMs`/`retrievalMs` from the execution budget are passed into resolver/retriever per-query deadlines so a slow provider cannot consume the artifact-verification reserve. |

### Production allowlist (closed)

| Path | Role |
|------|------|
| `apps/web/src/worker/public-source-snapshot-resolver.ts` | Rules 1, 2, 3, 5 |
| `apps/web/src/worker/public-source-execution-budget.ts` | Rule 5 |
| `apps/web/src/worker/public-source-forensics.ts` | Rule 4 |
| `apps/web/src/worker/processor.ts` | Call sites for rules 2, 4, 5 only |
| `apps/web/src/db/jobs.ts` | Rule 2 defer attempt-accounting only |
| `apps/web/src/db/market-snapshots.ts` | Amendment 2026-07-29 (user approved "批准修订"): rule 1 read-only prefix-reuse lookup only — one new query function (memory + postgres paths), no schema/migration/privacy-trigger change |
| `docs/ACTIVE-CHANGE-SCOPE.md` | This authority |

### Tests allowlist (closed)

| Path | Role |
|------|------|
| Existing resolver / forensics / budget / processor test files | New rule assertions; scenario/contract shapes preserved |
| `apps/web/src/db/market-snapshots.test.ts` | Amendment 2026-07-29 (with the production amendment above): rule 1 prefix-lookup assertions only |

### Forbidden

- `packages/*` (cache-identity derivation, search orchestrator, provider adapters)
- Privacy triggers, market-table schemas/migrations, prompt/model profiles
- `max_attempts`/backoff numbers, commercial/refund/SLA logic
- Deployment, Docker, push, payments, report reruns (separate authorization)
- Replaying/mutating terminal jobs or orders

### Diff budget

- Production source: ≤ 250 changed lines. Hard limit. (Measured: 185.)
- Tests: ≤ 363 changed lines (tracking bound updated per the verification-only
  provision: measured 303 + 20% headroom).
- Docs: ≤ 80 changed lines.

### Acceptance checks

1. New unit tests: prefix-equivalent reuse is fallback-only and rejects any
   cross-question/cross-surface match; defer path does not consume
   `phase_attempt` and still fails fast on deterministic unavailability;
   lease-wait no longer fails against an actively-heartbeating holder;
   resume re-fetch updates checkpoint snapshotIds; per-query deadlines
   receive the propagated sub-budgets.
2. `npm test`, `npm run lint`, `npm run build` green.
3. `npm run public-search:probe -- --adapter mimo`, deployment, and any
   staging rerun require separate later authorization.

## Historical: Code-AI seam hardening W1 — failure-classification skeleton (APPROVED)

**Status: `APPROVED`** — user approved this written allowlist on 2026-07-29
("批准，那你都可以退回去，反正都是测试订单"). The same grant authorized
standard staging refunds for both test orders (`99cc6ddc` failed-fulfillment
refund via `commerce:staging:all`, and `9cec1db7` provider-side refund).

### Baseline and evidence

- HEAD `e3fe6a0` (Staging Web `dpl_EBTxqJ3h7w8TAUuSyqD4wvoEAV5n`; Workers
  `staging-737ad6d-overlay-v1`).
- Approved total design: session plan `shazam-stargirl-stargirl.md`
  (code–AI seam hardening, principles P1–P5, workstreams W1–W5), approved by
  the user on 2026-07-29. This scope implements **workstream W1 only**.
- Staging evidence of misclassification costs:
  - job `1afcaec2`: deterministic `input_validation/$diagnosisInput.sources`
    burned 5 transient attempts before terminal failure.
  - job `b286633f`: deterministic privacy-trigger rejection
    (`Shared market data contains private customer identity.`) retried as
    transient before hitting a permanent resume-identity error.
  - job `36c78f69`: 4 transient retries all inside one ~8-minute MiMo outage
    window, terminal @98.
- Root mechanism: `classifyUnknown` (`apps/web/src/worker/job-errors.ts:275-281`)
  defaults unknown errors to transient and classifies by English message
  keywords; orchestration guards throw bare `Error`s that inherit this
  misclassification.

### Design lock

| # | Rule |
|---|------|
| 1 | **Fingerprint escalation.** In `job-errors.ts`, when the same error fingerprint recurs in the same job+phase, classify it permanent instead of consuming further attempts. First occurrence keeps its normal classification. No change to `max_attempts` or backoff numbers. |
| 2 | **Bare orchestration `Error`s become explicit permanent `JobError`s.** Sites: `processor.ts` (:1482, :1517, :1520-1522, :1620, :2480-2481, :2502-2514, :2539-2542, :1685-1688) and `report-v4-free-teaser.ts:912-921`. Error-class replacement only; no control-flow, checkpoint, or retry-budget changes. |
| 3 | **Diagnosis-enhancer failure mapping by structured stage/code.** Extend the `job-errors.ts:193-200` handling into a full table: `input_validation`/`token_budget`/`provider_safety`/`semantic_contract`/`canonical_contract`/`correction_contract` → permanent; `provider_authentication`/`provider_configuration` → operator_repairable; provider transient stages → transient. No enhancer behavior change. |
| 4 | **Model-randomness misclassifications corrected.** Language-validation and Q1-responsiveness failures (`answer-first-v3.ts:754-762` wrapper; `job-errors.ts:107,114-117`) become transient instead of operator_repairable. |
| 5 | **`mimo_output_truncated` unified.** One rule everywhere: at most one in-flight retry (sampling variance), job-level transient, and rule 1's fingerprint escalation as the deterministic backstop. Align `mimo-provider.ts:57-63` and `:649-657` to that rule. |

### Production allowlist (closed)

| Path | Role |
|------|------|
| `apps/web/src/worker/job-errors.ts` | Rules 1, 3, 4 |
| `apps/web/src/worker/processor.ts` | Rule 2 error-class replacements only |
| `apps/web/src/worker/report-v4-free-teaser.ts` | Rule 2 error-class replacements only |
| `apps/web/src/worker/answer-first-v3.ts` | Rule 4 wrapper only |
| `apps/web/src/report-v4/mimo-provider.ts` | Rule 5 mapping only |
| `docs/ACTIVE-CHANGE-SCOPE.md` | This authority |

### Tests allowlist (closed)

| Path | Role |
|------|------|
| `apps/web/src/worker/job-errors.test.ts` | Rules 1, 3, 4, 5 classification assertions |
| `apps/web/src/worker/report-v4-free-teaser.test.ts` | Rule 2 error-class assertions |
| Existing answer-first / mimo-provider / processor test files | Assertions updated to the new classifications only; no scenario or contract changes |

### Forbidden

- `packages/*` contract validators, prompts, model profiles
- Snapshot resolver, market-snapshot tables, privacy triggers (W2/W5 scopes)
- Retry-budget numbers (`max_attempts`, backoff intervals), defer semantics (W2)
- Commerce, refund, SLA, deployment, Docker, push, payments, report reruns
- Replaying/mutating terminal jobs or orders

### Diff budget

- Production source: ≤ 200 changed lines. Hard limit.
- Tests: ≤ 300 changed lines (tracking bound, measured +20%).
- Docs: ≤ 80 changed lines.

### Acceptance checks

1. New unit tests: fingerprint escalation (first occurrence transient, second
   occurrence permanent, no further attempts consumed); each converted guard
   throws a permanent typed `JobError`; enhancer stage/code mapping matches
   the rule-3 table; language/responsiveness failures classify transient;
   truncated mapping unified.
2. `npm test`, `npm run lint`, `npm run build` green.
3. Deployment and any staging rerun require separate later authorization.

## Historical: Vercel serverless DB cold-start resilience (APPROVED)

**Status: `APPROVED`** — user approved this written allowlist and its
acceptance plan on 2026-07-28 ("批准并部署冷启动修复"), including Staging
deployment of the Web function changes below. Live evidence at approval time:
Sandbox order `9cec1db7` was `SUCCEEDED` at Airwallex (23:50:09Z) but two
webhook deliveries (07:50:10, 08:00:19) reached the function with zero
`payment_events` rows, and order-status polling lambdas were erroring
("自动更新已暂停") — the cold-start crash pattern below, now blocking the
737ad6d paid acceptance.

### Baseline and evidence

- Staging runs `737ad6d` (Web `dpl_Bfp5XRzUYhmhUNcStAyRwh2Auu6q`, alias
  `open-geo-console-staging-itheheda.vercel.app`, functions in `sin1`).
- Vercel runtime logs 2026-07-28 17:51 CST (twice): lambdas die on cold start
  with `An error occurred while loading instrumentation hook:
  write CONNECT_TIMEOUT ep-broad-sky-aoslq8jq-pooler.c-2.ap-southeast-1.aws.neon.tech:5432`
  → `Node.js process exited with exit status: 128`.
- User-visible result: report pages show "This page couldn't load / A server
  error occurred"; order-status polling pauses ("自动更新已暂停") leaving stale
  "全额退款已提交，正在等待支付机构确认" copy, although DB shows refund
  `acbab8a5` **succeeded** and order `1dd58782` `refund_status=refunded` at
  2026-07-28T07:35:31Z.
- DB proof the unlock click never reached `createPaymentOrder`: zero
  `payment_orders` rows after 07:35:31Z.
- Database is healthy: staging worker container connects in ~460 ms; the Neon
  pooler hostname resolves 3×AAAA + 3×A and both families are reachable from
  the user network. Neon sits in `ap-southeast-1`, same region as the lambdas.
- Root-cause hypothesis: Node ≥17 default verbatim DNS order can pick a AAAA
  record first on a cold start; Vercel serverless functions have no IPv6
  egress, so the TCP connect blackholes until the 10 s `connect_timeout`.
  Intermittency matches per-cold-start DNS answer ordering. Amplifier:
  `instrumentation.register()` awaits `ensureDatabase()` uncaught, so one
  failed connect kills the entire lambda (exit 128) instead of failing one
  request.

### Design lock

| # | Rule |
|---|------|
| 1 | **Force IPv4 for DB connections.** Call `dns.setDefaultResultOrder("ipv4first")` inside `getDb()` in `apps/web/src/db/index.ts` before creating the postgres client. No connection-string, env, or Neon-side change. |
| 2 | **Instrumentation must not kill the lambda.** Wrap the `ensureDatabase()` await in `apps/web/src/instrumentation.ts` in try/catch that logs the error and returns; request handlers keep their own error paths. No retry/backoff machinery. |
| 3 | No changes to Neon env values, Vercel project settings, commerce/refund logic, UI copy, or worker code. No new dependency. |

### Production allowlist (closed)

| Path | Role |
|------|------|
| `apps/web/src/db/index.ts` | ipv4first DNS result order before client creation (rule 1) |
| `apps/web/src/instrumentation.ts` | try/catch around cold-start ensureDatabase (rule 2) |
| `docs/ACTIVE-CHANGE-SCOPE.md` | This authority |

### Tests allowlist (closed)

No new unit tests: rule 1 is a one-line Node DNS directive and rule 2 is a
log-and-continue guard; both are verified through the staging acceptance
window below. Existing suites must stay green.

### Forbidden

- Neon console/env value changes, Vercel project setting changes
- Switching DB drivers (e.g. Neon serverless HTTP) — that is a separate scope
- Commerce, refund, UI copy, worker, or prompt changes
- Replaying/mutating terminal jobs or orders

### Diff budget

- Production source: ≤ 20 changed lines. Hard limit.
- Docs: ≤ 60 changed lines.

### Acceptance checks

1. `npm test`, `npm run lint`, `npm run build` green.
2. Deploy to Staging (Vercel Web only; worker image untouched), then a
   30-minute observation window with user browsing and **zero**
   `CONNECT_TIMEOUT` / exit-128 events in Vercel logs.
3. User completes the unlock checkout: a new `payment_orders` row appears and
   the hosted checkout opens. The fresh paid validation run itself remains
   governed by the previously authorized validation grant.

## Historical: Paid V3 diagnosis input boundary adaptation (APPROVED)

**Status: `APPROVED`** — user approved this written allowlist and, in the same
grant (2026-07-28: "全部授权"), authorized implementation, commit + push,
Staging redeployment (Vercel Web + Docker overlay Workers), refund submission
via the standard staging commerce reconciliation for any newly failed paid
order, and one fresh paid validation run (new Sandbox payment by the user).

### Baseline and evidence

- HEAD `07ebd3f`; Staging runs `07ebd3f` (Web `dpl_GGYdPG8SdsGGsGuoRHwW17uTinCe`
  + Workers `staging-07ebd3f-overlay-v1`, schema V44 applied).
- Failed paid deep job `1afcaec2-a91d-497d-b04d-076b94054799` (report
  `fe9ca07b`, order `1dd58782`, Sandbox paid): 5 attempts, all
  `stage=input_validation; code=invalid_input; parserPath=$diagnosisInput.sources`
  for `question-0d4bee4d…`, terminal `unexpected_internal_error` at 95.
- DB proof: the question's persisted answer card carries **20 sources**
  (`mimo-annotation-1…20`, no `retrievalStatus` field), while
  `parseReportV4DiagnosisInput` (`packages/ai-report-engine/src/report-v4-diagnosis.ts:137`)
  allows at most `REPORT_V4_MAX_DIAGNOSIS_SOURCES` (5) and requires
  `retrievalStatus ∈ {not_checked, available, inaccessible}`.
- Same root cause as job `5dbaea88` attempt 1 this morning (message then had
  no detail; the failure-transparency fix in `debe66e` exposed it now).

### Design lock

| # | Rule |
|---|------|
| 1 | **Boundary adaptation, not contract loosening.** In `enhanceReportV4QuestionDiagnosis` (`apps/web/src/worker/report-v4-diagnosis-enhancer.ts`), before calling `parseReportV4DiagnosisInput`, normalize `input.question.sources`: keep at most `REPORT_V4_MAX_DIAGNOSIS_SOURCES` entries in their existing order (provider result order), and default a missing/blank `retrievalStatus` to `"not_checked"`. The validator contract itself is unchanged and stays fail-closed. |
| 2 | **Deterministic input-validation failures are permanent.** Register the diagnosis enhancer's `stage=input_validation` failure as `permanent` in the job-error taxonomy so a deterministic contract violation fails fast instead of burning all retries against the 24h SLA clock. Message/classification mapping only; no behavior change to the enhancer result shape. |
| 3 | Customer-facing report content is untouched: the answer card keeps all 20 sources for rendering; the cap applies only to the diagnosis provider input. |

### Production allowlist (closed)

| Path | Role |
|------|------|
| `apps/web/src/worker/report-v4-diagnosis-enhancer.ts` | Source cap + retrievalStatus default (rule 1) |
| `apps/web/src/worker/job-errors.ts` | input_validation → permanent mapping (rule 2) |
| `docs/ACTIVE-CHANGE-SCOPE.md` | This authority |

### Tests allowlist (closed)

| Path | Role |
|------|------|
| `apps/web/src/worker/report-v4-diagnosis-enhancer.test.ts` | >5 sources → capped and completes; missing retrievalStatus → defaults; duplicate/invalid source content still fails closed |
| `apps/web/src/worker/job-errors.test.ts` | input_validation classification permanent |

### Forbidden

- Changing `packages/ai-report-engine` validator contracts or the 5-source limit
- Replaying/mutating terminal jobs `1afcaec2`, `b286633f`, `5dbaea88` or their orders
- Refund/SLA/commerce logic, prompts/model profiles, answer-card rendering
- Deploy / Docker / push / new payment runs without separate authorization

### Diff budget

- Production source: ≤ 100 changed lines. Hard limit.
- Tests: ≤ 200 changed lines (tracking bound, measured +20%).
- Docs: ≤ 60 changed lines.

### Acceptance checks

1. New unit tests: 20-source question (mirroring `question-0d4bee4d` shape)
   passes diagnosis input validation after the cap; missing retrievalStatus
   defaults to `not_checked`; genuinely invalid sources still throw.
2. `npm test`, `npm run lint`, `npm run build` green.
3. Deploy + fresh paid validation (new Sandbox payment) require separate
   later authorization.

## Historical: Paid deep resume identity + shared-market guard (APPROVED, implemented)

**Status: `APPROVED`** — user approved this written allowlist (2026-07-28: "批准").
Implement only within the closed allowlists and budgets below. Deploy, Docker,
commit/push, and any new paid validation run require separate later authorization.

### Baseline and evidence

- HEAD `debe66e` (local dirty tree may also hold the unfinished reissue WIP under
  historical authority; that WIP is **out of this scope** and must not be
  expanded or committed here).
- Failed paid deep job `b286633f-28bd-4950-bc08-1c1375e4d754`
  (report `64c7d182-97cc-4cc6-983a-ebf6d65d0a57`, order `11a43674…`):
  1. Attempt 1: provider discovery reached `phase=complete`; public-source
     forensics failed at `observation_persistence` with
     `Shared market data contains private customer identity.` (V42 guard
     matching `identityExclusions` such as brand/domain inside SERP
     title/snippet). Classified **transient**.
  2. Attempt 2: `ProviderDiscoveryResumeIdentityMismatchError` —
     `websiteFoundationHash` recomputed from DB-loaded foundation
     (`baef51a8…`) ≠ checkpoint (`ad62a851…`). Classified **permanent** →
     terminal fail at progress 98.
- Design intent of shared-market isolation remains valid for **our authored**
  query/question text. Applying brand `identityExclusions` to third-party SERP
  result bodies is product-incorrect and causes false permanent-path retries.

### Design lock

| # | Rule |
|---|------|
| 1 | **Frozen resume identity for provider discovery.** When a prior `providerDiscovery` checkpoint exists on the job, the pipeline run identity MUST be taken from that checkpoint’s identity fields (including `websiteFoundationHash` and `evidenceCutoffAt`), not recomputed from live `JSON.stringify(websiteFoundation)`. Fresh runs (no prior checkpoint) still build identity from current inputs. Real authority/model/policy changes on a **new** job remain free to form a new identity; mid-job resume must not self-invalidate completed stages. |
| 2 | **Stable foundation hash on first write.** Fresh `websiteFoundationHash` MUST use a deterministic canonical JSON serialization (sorted object keys, stable array order as-is) before SHA-256, applied consistently at the provider-discovery and public-source-forensics call sites that currently use raw `JSON.stringify`. |
| 3 | **Shared-market identity guard V44 (function replace only).** Replace `ogc_reject_private_identity_in_shared_market_data` so that: (a) **query-side** tables `market_snapshot_questions` / `market_snapshot_queries` still reject `order_id`, `report_id`, private≠neutral question text, and `identityExclusions` in the same field surfaces V42 already scans for those tables; (b) **result-side** tables `market_search_observations`, `market_source_evidence`, `market_source_passages`, `market_provider_claims`, and `market_search_attempts` reject only `order_id` and `report_id` (and private≠neutral question text if present in the scanned fields) — **not** brand/domain `identityExclusions`. No table/column/index DDL. Trigger names and attachment tables unchanged. |
| 4 | **No job replay / no historical mutation.** Do not repair, replay, or re-terminalize job `b286633f` or order `11a43674`. No refund/SLA/commerce changes. No deploy/Docker/push in this scope. |

### Production allowlist (closed)

| Path | Role |
|------|------|
| `apps/web/src/worker/processor.ts` | Resume: pass frozen provider-discovery identity when checkpoint exists; stable foundation hash for fresh runs |
| `apps/web/src/worker/provider-discovery-pipeline.ts` | Optional small helper to extract identity from checkpoint (only if needed to keep processor thin) |
| `apps/web/src/worker/public-source-forensics.ts` | Stable foundation hash; when prior forensics checkpoint exists, compare using that checkpoint’s `websiteFoundationHash` / freeze resume identity the same way |
| `apps/web/src/db/migrations.ts` | Add `V44_DATABASE_MIGRATIONS` function replace + wire into migration list |
| `apps/web/src/db/index.ts` | `DATABASE_SCHEMA_VERSION = 44` |
| `docs/ACTIVE-CHANGE-SCOPE.md` | This authority |

### Tests allowlist (closed)

| Path | Role |
|------|------|
| `apps/web/src/worker/provider-discovery-pipeline.test.ts` | Resume with prior checkpoint ignores recomputed foundation hash drift when identity is frozen from checkpoint (via production wiring test or pipeline identity input) |
| `apps/web/src/worker/processor.test.ts` and/or new focused unit test under `apps/web/src/worker/` | Fresh vs resume identity construction for provider discovery |
| `apps/web/src/db/schema-v44.postgres.test.ts` (new) | Query-side still rejects exclusion brand in `normalized_question`/`query_text`; result-side allows brand in title/snippet/excerpt; still rejects order/report id leakage |
| `apps/web/src/db/index.test.ts` | Schema version 44 + `databaseMigrationsAfter` chain |
| `apps/web/src/db/schema-v42.postgres.test.ts` | Only if required for version-chain bookkeeping comments; prefer not to weaken V42 historical assertions—V44 tests carry the new contract |

### Forbidden

- Touches to `commercial-orders.ts` / reissue WIP (user-owned dirty files)
- Refund, SLA, commerce reconciliation, email, checkout UI/routes
- Replaying or mutating job `b286633f`, order `11a43674`, report `64c7d182`
- Broad `docker system prune`, production deploy, new paid Sandbox run
- Softening query-side exclusion checks (questions/queries must still strip brands)
- LLM-based privacy judgment
- Changing permanent/transient taxonomy tables beyond what falls out of the above (no drive-by job-errors rewrite unless a single-line mapper is required by a new typed error—prefer none)

### Diff budget

- Production source: ≤ 220 changed lines. Hard limit.
- Tests: ≤ 280 changed lines (tracking bound, measured +20%).
- Docs: ≤ 80 changed lines.

### Acceptance checks

1. Unit: provider-discovery resume with prior complete/partial checkpoint succeeds when live foundation JSON hash would differ but checkpoint identity is reused.
2. Postgres V44: observation title containing a known `identityExclusions` brand is **accepted**; normalized_question containing the same brand is **rejected**; observation containing a `report_id` UUID substring still **rejected**.
3. `npm test`, `npm run lint`, `npm run build` green.
4. Deploy / re-run of a paid deep job requires a **separate** later authorization.

**Deployment authorization (2026-07-28: "确认 授权"):** user authorized
commit + push of this fix **and** the historical question-set reissue fix
(two separate commits), Staging redeployment (Vercel Web + Docker overlay
Workers), submission of the pending refund for order `11a43674` via the
standard staging commerce reconciliation (Sandbox), and one fresh paid
validation run (user unlocks report `45a6f76a` via the reissue path).
Terminal jobs `b286633f` / `5dbaea88` remain untouched.

## Historical: Re-checkout after terminal refund via question-set reissue (APPROVED, WIP outside this lock)

**Status: `APPROVED` historically** — user approved (2026-07-28: "批准方案B的修改").
Local dirty files `commercial-orders.ts` + reissue test may remain user/agent WIP
but are **not** authorized by the current FROZEN section above.

### Baseline and evidence (historical)

- Report `45a6f76a` re-checkout blocked by locked question set on terminal-refunded order.

### Design lock (historical)

Reissue confirmed question-set revision on terminal-refunded binding only; no
schema change; no mutation of refunded order.

## Historical: Paid V3 forensics resume identity and failure transparency (APPROVED, implemented)

**Status: `APPROVED`** — user approved this written allowlist (2026-07-28:
"可以，开始修复"). Implement only within the closed allowlists and budgets
below. Deploy, Docker, commit/push, and any new paid validation run require
separate later authorization.

### Baseline and evidence

- HEAD `fc07129`; Staging runs `fc07129` (Web `dpl_J5duwNJsWFdscmus2FadA4gLB98f`
  + Workers `staging-fc07129-overlay-v1`).
- Failed paid job `5dbaea88-0f56-49c0-a9f5-f831f75a1549` (report `45a6f76a`),
  terminal `unexpected_internal_error` at progress 95 after 3 attempts:
  - Attempt 1: `Paid V3 per-question diagnosis did not complete.`
    (`processor.ts:2478`), real `result.failure{stage,code,parserPath}` discarded.
  - Attempts 2–4: `PublicSourceResumeIdentityMismatchError`
    (`public-source-forensics.ts:102`), empty message normalized to
    "Unexpected internal error.", misclassified transient.
  - DB proof: `publicSourceForensics.evidenceCutoffAt=2026-07-28T03:38:01.387Z`
    while self-collected `snapshot-e747…` has `completed_at=03:40:03` (after
    the cutoff), so `findExactMarketSnapshot`'s `completed_at <= cutoff`
    filter excludes the job's own product on every retry → new snapshotId →
    deterministic identity mismatch. Deferred mode also lacks
    `prepareArtifactVerification` (`processor.ts:1924`), so retries always
    re-run the forensics pipeline.
  - `diagnosisByQuestion` checkpoint empty: attempt 1 died before any
    per-question diagnosis persisted; its true cause is unknowable until
    failure detail is preserved (fix 3).

### Design lock

| # | Fix | Rule |
|---|-----|------|
| 1 | Forensics resume | When a prior forensics checkpoint exists, resolve its persisted `snapshotIds` by exact ID first; only re-collect snapshots whose exact ID is missing or not completed. No behavior change on the first (no-prior) run. The identity-mismatch guard stays fail-closed for genuine drift. |
| 2 | Error taxonomy | Register `PublicSourceResumeIdentityMismatchError` in the typed boundary mapping as `permanent` (mirroring the provider-discovery mismatch mapping), so genuine drift fails fast instead of 3 pointless retries. |
| 3 | Diagnosis failure transparency | `processor.ts:2477-2478` must preserve `result.failure` detail (questionId, stage, code, parserPath, failureReason where present) in the thrown error message; no behavior/classification change beyond message content. |

### Production allowlist (closed)

| Path | Role |
|------|------|
| `apps/web/src/worker/public-source-forensics.ts` | Exact-ID snapshot resume (fix 1) |
| `apps/web/src/worker/job-errors.ts` | Register mismatch error as permanent (fix 2) |
| `apps/web/src/worker/processor.ts` | Preserve diagnosis failure detail (fix 3) |
| `docs/ACTIVE-CHANGE-SCOPE.md` | This authority |

### Tests allowlist (closed)

| Path | Role |
|------|------|
| `apps/web/src/worker/public-source-forensics.test.ts` (or the existing forensics/resume test file if named differently) | Resume-by-exact-ID: fresh self-collected snapshot is reused, no mismatch throw |
| `apps/web/src/worker/job-errors.test.ts` | Mismatch → permanent |
| `apps/web/src/worker/processor.test.ts` | Diagnosis incompletion error carries failure detail |

### Forbidden

- Historical job repair/replay/clone; the failed job `5dbaea88` stays terminal
- Paid `report_global_v1` semantic review behavior; Free V4 review code
- Deploy / Docker / push / any new payment or validation run
- DB schema, commerce, refund logic, cutoff semantics for first runs,
  snapshot-collector behavior, prompt or model-profile changes

### Diff budget

- Production source: ≤ 200 changed lines. Hard limit.
- Tests: ≤ 300 changed lines (tracking bound, may update to measured +20%).
- Docs: ≤ 70 changed lines.

### Acceptance checks

1. New unit tests: (a) forensics resume reuses exact prior snapshot IDs even
   when their `completed_at` is after `evidenceCutoffAt` — no throw;
   (b) genuine identity drift still throws and maps to permanent;
   (c) diagnosis incompletion error message contains questionId/stage/code.
2. `npm test`, `npm run lint`, `npm run build` green.
3. Deploy and a fresh paid validation run (new Sandbox payment) require
   separate later authorization.

**Deployment authorization (2026-07-28: "三项都同意"):** user authorized
commit + push of this fix, Staging redeployment (Vercel Web + Docker overlay
Workers, same procedure as the `fc07129` deployment), and one fresh paid
validation run (user performs a new Sandbox unlock; the terminal failed job
`5dbaea88` is not replayed and its refund flow is untouched).

## Historical: Free V4 semantic review graceful degradation (APPROVED, implemented)

**Status: `APPROVED`** — user approved this written allowlist (2026-07-27:
"同意"). Implement only within the closed allowlists and budgets below.
User later authorized commit + push + Staging Gates 1–3 deployment + one
Gate 4 real-flow run (2026-07-27: "123"), lineage: wholly new submitted URL →
Foundation → Free V4 → Q1 answer/diagnosis → semantic receipt (the
v4_pre_admission deep lane; no Sandbox payment in this authorization).

### Baseline

- HEAD `9849d23`; Staging runs `8c9e375` (Web `dpl_FqrnykugzZSgEBdyM5JG5hQL4Vwn`
  line + Workers `staging-8c9e375-overlay-v1`).
- Gate 4 evidence: job `729674de-33ee-4312-afb5-36e18b857898` failed
  `semantic_review_evidence_missing` (permanent) at
  `$reviewOutput.fields[17]` on 2026-07-27 15:32:09 UTC — the global-policy gate
  is gone, the failure moved to a field-local non-empty-allowlist field.
- Full gate enumeration of the review chain: 60+ throw points; six real
  failures (truncation, disallowed subset ref, blank correctedText, global and
  local missing refs, invalid response) all at A/B-class gates, none at C-class
  code invariants.

### Problem (first principles)

The review contract treats a stochastic model as a deterministic function:
success = product of ~300 per-gate pass probabilities. Log-driven fixes only
move the failure to the next gate. Structural faults:

1. Class A gates force the model to echo information code already holds
   (path, originalTextHash, IDs, order, coverage).
2. Error classification is inverted: deterministic contract violations are
   `transient` (6 backoff retries × ~6.5 min each); truncation that could
   benefit from retry is `permanent`; assembly "missing" messages
   misclassify to `operator_repairable`.
3. Fail-closed is applied to a prose-polish step: any single field's
   bookkeeping slip, or the model self-reporting `blocked`, kills the whole
   job (`report-semantic-review.ts:824`).

### Design lock

| Layer | Rule |
|-------|------|
| C-class code invariants (input-side `parseInputCore`, ID existence/uniqueness, hash recompute, mutability at apply, receipt/ready re-validation) | **Unchanged, fail-closed** |
| Paid V3 `report_global_v1` (global=true) path | **Unchanged** |
| Free V4 (global=false) field-level A/B gates | **Degrade, never throw**: invalid field entry is replaced by a code-synthesized `pass` entry (original text, manifest path/hash, empty issueCodes); evidence/source refs are code-mounted from the field allowlist ∩ ownership-compatible IDs, never model-echoed |
| Model self-reported `blocked` (Free) | Degrades to per-field `pass`; `overallDecision` is recomputed by code from sanitized decisions; blocked never kills a Free job |
| Free batch assembly | Missing fields are filled with synthesized `pass` entries; duplicate paths first-wins; unknown entries dropped |
| Structurally unparseable output (no fields array / not JSON) | Stays an error → `transient` retry (genuine transport/model failure) |
| `mimo_output_truncated` | Reclassified `permanent` → `transient` (batch-splitting already reduced size; retry may succeed) |
| Worker Q1 semantic gates (`report-v4-free-teaser.ts:912-921`) | Unchanged this scope (accepted residual, transient-retried) |
| Sparse/minimal output redesign (prompt rewrite) | **Explicit non-goal**, deferred |

Result guarantee: Free semantic review is an enhancement lane. Worst outcome
is per-field fallback to original prose; it can never terminalize a job.

### Production allowlist (closed)

| Path | Role |
|------|------|
| `packages/ai-report-engine/src/report-semantic-review.ts` | Free (global=false) parse path: per-field sanitize/degrade, code-mounted refs, assembly tolerance, recomputed overallDecision; Paid path untouched |
| `apps/web/src/worker/job-errors.ts` | `mimo_output_truncated` → transient; keep other mappings |
| `docs/ACTIVE-CHANGE-SCOPE.md` | This authority |

### Tests allowlist (closed)

| Path | Role |
|------|------|
| `packages/ai-report-engine/src/report-semantic-review.test.ts` | Degradation tests per historical failure class |
| `apps/web/src/worker/job-errors.test.ts` | Truncation reclassification |
| `apps/web/src/worker/report-v4-free-teaser.test.ts` | Only if Free review fakes need alignment |

### Forbidden

- Paid V3 / global=true behavior change
- Prompt or output-format redesign (sparse output)
- Historical job repair/replay; deploy / Docker / Gate 4 (separate authority)
- DB schema, commerce, crawler, deployment, worker Q1 gates, error taxonomy
  beyond the two named mappings

### Diff budget

- Production source: ≤ 300 changed lines. Hard limit.
- Tests: ≤ 400 changed lines (tracking bound, may update to measured +20%).
- Docs: ≤ 60 changed lines.

### Amendment: marker-forwarding fix for the report page loader (APPROVED)

User approved (2026-07-28: "可以，开始修复") a post-Gate-4 latent bug fix plus
commit, push, and Staging redeploy of the same lineage. Gate 4 job
`57c1a65d` completed the first ever marker-present ready checkpoint, which
exposed that `loadConfirmedFreeTeaserQuestionSet`
(`apps/web/src/worker/report-v4-free-teaser.ts:1224`) re-parses the checkpoint
without forwarding `semanticReviewContractVersion`, crashing SSR at
`apps/web/src/app/[locale]/reports/[id]/page.tsx:114` with
`Free teaser ready checkpoint does not match root semantic-review lineage.`

Additional allowlist (closed):

| Path | Role |
|------|------|
| `apps/web/src/worker/report-v4-free-teaser.ts` | Accept + forward the parse options in `loadConfirmedFreeTeaserQuestionSet` |
| `apps/web/src/app/[locale]/reports/[id]/page.tsx` | Pass the already-read marker into the loader |
| `apps/web/src/worker/report-v4-free-teaser.test.ts` | Marker-present ready checkpoint loads through the loader |

Budget: production ≤ 30 changed lines; tests ≤ 60 changed lines. Deploy:
commit + push + Staging Gates 1–3 redeploy (thin overlay) is authorized;
rollback identities remain the `22ab4fb` Web deployment and
`staging-22ab4fb-overlay-v1` Worker image. No new Gate 4 run is required;
acceptance is the existing report `45a6f76a` rendering without SSR error.

### Acceptance checks

1. New unit tests replay each historical Free failure class (local missing
   refs; subset violation; blank correctedText; self-reported blocked;
   missing batch fields) and assert per-field degradation, code-mounted refs,
   recomputed overallDecision, and successful apply — no throw.
2. Paid `report_global_v1` tests unchanged and green.
3. `npm test`, `npm run lint`, `npm run build` green.
4. Deploy and a fresh Gate 4 real run require separate later authorization.

## Historical: Free V4 field-local evidence re-anchor (APPROVED, implemented)

**Status: `APPROVED`** — user directed implementation (2026-07-27): keep code
to deterministic work only; model owns analysis/judgment; stop Free V4 from
forcing Paid-style `report_global_v1` on multi-domain teaser prose.

### Problem (first principles)

Marker-present Free V4 mixed two designs:

1. **Code-only analysis era** — program tried to force “analysis complete”
   with deterministic gates.
2. **Model analysis era** — model writes/reviews prose, but Free still applied
   Paid’s `report_global_v1`: every non-blocked field/answer/evidenceUse must
   cite a report-wide search catalog.

Free catalog is Q1 sources + limited target page slices. Foundation and
question texts are **not** authored from that catalog. Result: model often
returns empty refs → permanent `semantic_review_evidence_missing` (seen on
Staging job `2ca2ee66-…` after batching cleared `mimo_output_truncated`).

### Design lock (closed)

| Layer | Owner | Free V4 rule |
|-------|--------|--------------|
| Materials, IDs, schema, ownership, hashes | Code | Deterministic only |
| Language, diagnosis meaning, faithfulness | Model | Analysis only |
| Evidence binding | Field-local allowlists | Non-empty allowlist ⇒ at least one accepted ref on non-blocked **field** result; empty allowlist ⇒ **no** ref required |
| Free `evidencePolicy` | **Omit** | Free must **not** set `report_global_v1` |
| Paid V3 | Unchanged | Keeps `report_global_v1` |

Domain expectation for Free manifests (already reflected in field seeds):

- `foundation.*` / `questions[*].text`: empty allowlists → language review only
- `q1AnswerCard.answerText` / `q1Diagnosis.*`: Q1/diagnosis allowlists → local
  fail-closed when model omits refs on non-blocked fields

Batching (prior scope) remains the Free generation shape. This scope does not
re-open maxOutputTokens, historical job repair, deploy, or Gate 4.

### Objective

1. Remove Free teaser `evidencePolicy: "report_global_v1"` so Free uses
   field-local allowlists and legacy field result schema (no forced
   rejectedEvidence/rejectedSources global shape).
2. Map non-empty local allowlist + empty field refs (non-blocked) to typed
   `ReportSemanticReviewEvidenceMissingError` with local reason (permanent),
   not a bare TypeError → `unexpected_internal_error`.
3. Update Free unit tests and review fakes for field-local refs; keep Paid and
   optional Free+global unit coverage for `report_global_v1`.

### Production allowlist (closed)

| Path | Role |
|------|------|
| `apps/web/src/worker/report-v4-free-teaser.ts` | Drop Free `evidencePolicy`; brief domain comment |
| `packages/ai-report-engine/src/report-semantic-review.ts` | Local empty-ref typed error; blocked exemption parity |
| `docs/ACTIVE-CHANGE-SCOPE.md` | This authority |

### Tests allowlist (closed)

| Path | Role |
|------|------|
| `apps/web/src/worker/report-v4-free-teaser.test.ts` | Field-local Free expectations + fake review refs |
| `packages/ai-report-engine/src/report-semantic-review.test.ts` | Local allowlist missing-ref typed error if needed |
| `apps/web/src/worker/job-errors.test.ts` | Only if reason/message mapping needs it |

### Forbidden

- Paid V3 behavior change
- Historical job repair/replay
- Deploy / Docker / Gate 4 without separate authority
- Weakening ID existence / ownership / receipt / hash gates
- Silent program rubber-stamp of first global source onto all fields
- New dependencies / schema migrations
- UI / commerce / production env mutation

### Diff budget

| Surface | Budget |
|---------|--------|
| Production allowlisted | max `+80` / `-40` |
| Tests allowlisted | max `+120` / `-60` |
| External expensive actions | `0` |

### Verification

```text
npx vitest run packages/ai-report-engine/src/report-semantic-review.test.ts apps/web/src/worker/report-v4-free-teaser.test.ts apps/web/src/worker/job-errors.test.ts
npm run lint
```

Acceptance:

1. Free review input has **no** `evidencePolicy` / not `report_global_v1`.
2. Free answer/diagnosis fields retain **non-empty** local allowlists where
   seeded; foundation/questions keep empty allowlists.
3. Blueprint `referenceRequirement` is `none` or `at_least_one_exact_local_id`
   for Free (not global).
4. Paid V3 still builds with `report_global_v1`.
5. Empty refs on Free foundation pass; empty refs on Free Q1 answer field with
   allowlist fail typed evidence-missing.

### Baseline / Staging deploy (user-authorized 2026-07-27)

- Feature commit: `8c9e375577876f60522d7087de9e3e751bc4cf01` on `origin/main`
- Thin Worker overlay: `open-geo-console:staging-8c9e375-overlay-v1`
  (base full `staging-330b27a…-full-v1`; rollback image `staging-7b44722-overlay-v1`)
- Web Preview: `dpl_Ab3KjkHnC5uKv842wpseMpvBK3Lz` → fixed alias
  `https://open-geo-console-staging-itheheda.vercel.app`
- Gate 3 catalog read-only: `mode=test`, CNY/USD/HKD prices present
- **Gate 4 real-flow not authorized**

---

## Historical — Free V4 semantic review batching (completed; not current)

**Status: implemented + Staging Gates 1–3** — user approved ("同意") and
deployed candidate `7b44722b819a5ab20853ca1c666b1bdde9951fe3` (2026-07-27).
**Gate 4 not authorized under that scope.**

### Problem (evidence-backed; not an estimate)

Staging job `c9a11e40-e2b7-480f-9cde-473a96c890ac` (report
`8fee4621-8147-47d0-87c0-bdd5772ae887`, host `shun-express.com`):

1. Free foundation completed.
2. Free V4 teaser reached `q1_answer_ready` with Q1 draft + diagnosis draft +
   three observation snapshots.
3. Failed in `reviewFreeTeaser` → `runOfflineReportSemanticReview` → MiMo
   structured invoke with `operation: "websiteSynthesis"`.
4. Durable error: `ReportV4MimoProviderError` / job code `mimo_output_truncated`
   / classification **permanent**, from `assertFinishReasonAllowed` when
   provider `finish_reason === "length"`.
5. Stack proves failure **before** field-contract parse /
   `semantic_review_evidence_missing`.
6. Current contract forces **one** model call to return the **complete**
   review JSON skeleton (all fields + questionDistinctness + all annotation
   arrays + overallDecision). That monolithic output shape is the structural
   hazard; **token estimation is not an acceptance method and must not be
   used as root-cause authority or gate.**

This scope does **not** claim a single ultimate root cause of all historical
96% failures. It fixes the Free V4 review generation shape so completion
truncation on one mega-JSON is no longer the only path.

### Objective

Replace Free V4 **single-shot** `unified_report_semantic_review` generation
with **structure-based multi-invoke batches**, then **programmatically merge**
into one `ReportSemanticReviewOutput` that still passes the existing
`parseReportSemanticReviewOutput` + `applyReportSemanticReview` + receipt
gates unchanged in meaning.

**Do not** use token/character estimation as a design driver, budget gate, or
acceptance criterion.

### Required batch design (closed)

Batches are defined by **contract slots and manifest structure**, not size:

| Batch ID | Model produces | Coverage rule |
|----------|----------------|---------------|
| `B_fields_readonly` | `fields` subset | Exactly the Free V4 input fields with `mutability === "read_only"`, input order preserved among themselves |
| `B_fields_mutable` | `fields` subset | Exactly the Free V4 input fields with `mutability === "mutable"`, input order preserved among themselves |
| `B_obs` | `annotations.observationResults` | Exactly `input.observationResults`, input order |
| `B_answers` | `annotations.answers` | Exactly `input.answerSubjects`, input order (Free V4: one Q1 subject) |
| `B_evidence_use` | `annotations.evidenceUse` | Exactly `input.fields`, input order |

**Program-owned after batches (no model inventing overall):**

- Reassemble `fields` in **full input.fields order** from the two field
  batches.
- Reassemble `annotations` object.
- Derive `questionDistinctness` and `overallDecision` with the **same rules
  already enforced by the parser** (distinct/duplicate/blocked;
  blocked/corrected/pass from field and answer decisions). If a pure function
  for overall decision already exists in
  `packages/ai-report-engine`, reuse it; if not, extract the existing
  `deriveOverallDecision` (or equivalent) without changing semantics.
- Set `version`, `inputHash`, `providerId`, `modelId` from input authority
  (copy, never invent).

**Merge then validate once** with existing
`parseReportSemanticReviewOutput(merged, fullInput)` (or an internal merge
helper that ends in that parser). No weakening of
`report_global_v1` evidence fail-closed rules.

### Free-teaser integration

- `reviewFreeTeaser` in `report-v4-free-teaser.ts` must call the batched
  path for marker-present Free V4.
- On batch failure, throw typed errors (see below); **do not** write
  `stage: "ready"` or partial `semanticReview` that fails closed inconsistently.
- Checkpoint remains durable at `q1_answer_ready` with drafts when review
  fails (existing behavior preserved).
- Resume from `q1_answer_ready` must re-run **only** review batches, not Q1
  answer, diagnosis, or snapshot resolution (existing resume contract).

### Optional in-scope product tightening (only if cheap and tested)

- Map `mimo_output_truncated` for Free V4 review batches to **transient** with
  existing phase-attempt budget (not infinite retry), **or** keep permanent
  but per-batch so a single truncated batch can be retried without redoing
  successful batches. Prefer **per-batch retry within the existing phase
  attempt budget** without inventing a new state machine.
- Do **not** raise `maxOutputTokens` as the primary fix in this scope. A
  profile bump is out of scope unless a later amendment explicitly allows it.

### Typed errors (job boundary)

Add or map durable codes (redacted, no bodies):

| Event | Job code | Classification |
|-------|----------|----------------|
| Batch transport / invalid_response / length on a batch | prefer existing `mimo_*` codes | same as Phase-1 map; length may be transient **only** inside review-batch retry budget if implemented |
| Merge/parse of assembled review fails closed | keep existing TypeError / evidence-missing paths | unchanged |
| Incomplete batch coverage (wrong paths/order) | `free_teaser_review_batch_contract` or equivalent permanent | permanent |

No raw provider bodies, secrets, or customer prose in logs beyond current
redaction.

### Production allowlist (closed)

| Path | Role |
|------|------|
| `packages/ai-report-engine/src/report-semantic-review.ts` | Batch types, merge, derive overall/distinctness if needed; Free V4 batch prompts that reference **only** the batch's blueprint slice |
| `packages/ai-report-engine/src/report-semantic-review-provider-adapter.ts` | Batched offline runner entry (e.g. `runOfflineReportSemanticReviewBatched`) while keeping single-shot runner for Paid V3 unless explicitly shared |
| `packages/ai-report-engine/src/index.ts` | Export new symbols if required |
| `apps/web/src/worker/report-v4-free-teaser.ts` | Wire Free V4 review to batched runner |
| `apps/web/src/worker/job-errors.ts` | Map any new Free V4 review-batch JobError / provider codes |
| `docs/ACTIVE-CHANGE-SCOPE.md` | Authorization record |

### Tests allowlist (closed)

| Path | Role |
|------|------|
| `packages/ai-report-engine/src/report-semantic-review.test.ts` | Batch merge; full coverage; fail-closed on missing path; overallDecision parity |
| `packages/ai-report-engine/src/report-semantic-review-manifests.test.ts` | Only if Free V4 manifest fixtures need batch labels |
| `apps/web/src/worker/report-v4-free-teaser.test.ts` | Review path uses N invokes; resume from `q1_answer_ready`; truncated batch does not mark ready |
| `apps/web/src/worker/job-errors.test.ts` | New/adjusted codes only |
| Optional: `apps/web/src/worker/report-v4-free-teaser-resume-harness.test.ts` | Resume budget still holds |

### Forbidden

- Token/character **estimation** as design authority, acceptance gate, or
  root-cause claim
- Changing Paid V3 review to batched **unless** the same pure merge is
  reused with zero Paid V3 behavior change (default: Free V4 only)
- DB schema / migrations / historical job repair / resume of `c9a11e40`
  without a separate amendment
- Prompt rewrites that relax evidence/source/receipt/hash gates
- Raising model profile `maxOutputTokens` / context window as primary fix
- UI progress redesign, commerce, deploy, Docker, production
- New dependencies
- Real model calls in unit tests (fake invokers only)
- Logging raw provider bodies

### Diff budget

| Surface | Budget |
|---------|--------|
| Production allowlisted | max `+420` / `-120` |
| Tests allowlisted | max `+500` / `-80` |
| Dependencies / migrations | `0` |
| External expensive actions | `0` (no deploy, no real model, no DB write) |

### Verification (after APPROVED implementation)

Focused:

```text
npx vitest run packages/ai-report-engine/src/report-semantic-review.test.ts apps/web/src/worker/report-v4-free-teaser.test.ts apps/web/src/worker/job-errors.test.ts
```

Full local:

```text
npm run lint
npm test
npm run build
git diff --check
```

Acceptance checks:

1. Free V4 review path performs **multiple** structured invokes (≥2) for a
   happy path, not exactly one.
2. Merged output passes existing full-input parse/apply/receipt.
3. Injected `finish_reason=length` (or `mimo_output_truncated`) on one batch
   fails closed without writing ready; other successful batches need not be
   re-invoked if an in-memory/resume structure is present—or document that
   all batches re-run only from `q1_answer_ready` with no Q1/diagnosis/snapshot
   re-run (minimum resume bar).
4. No test uses token estimates as assertions.
5. Diff ⊆ allowlist and budgets.

### Expensive external actions

All **0** under this FROZEN→APPROVED implementation slice:

- real model, Docker, Vercel deploy, push (unless later authorized)
- historical Job mutation / repair of `c9a11e40…`
- new report/payment

A later **Staging validation amendment** may authorize one new free report or
one resume of a named job; it is **not** included here.

### STOP

- Edit production/tests while still `FROZEN`
- Expand into Paid V3 source-selection draft batching
- Estimate-driven "budget" logic
- Deploy or historical job ops

### User decision required

Reply **`APPROVED`** (or equivalent explicit approval of this allowlist) to
start implementation. Phrases like "fix it" without referencing this scope
do not expand the lock.

---

## Prior authority: Protected Staging deploy of 838a680 (Gates 1–3 complete)

**Status: `APPROVED` (complete for deploy Gates 1–3)** — user authorized
"push、部署 Staging" (2026-07-27). Candidate full SHA
`838a680ec1940544bf30e2782594799198812e0b`. **Gate 4 real-flow not
authorized.** Production not touched.

### Deploy deliverables

| Gate | Result |
|------|--------|
| Push | `5039adc..838a680` → `origin/main` |
| 1 Preview | `dpl_5uK13VGosp1ujFnxWukLJUQj6d99` READY; git/ogc/github SHA = candidate |
| 2 Workers | thin overlay `staging-838a680-overlay-v1` free+deep; restart 0 |
| 2 Alias | fixed `open-geo-console-staging-itheheda.vercel.app` → candidate |
| 3 Catalog | authenticated GET catalog `mode=test` prices CNY/USD/HKD; no report/payment |
| Production | `geo.itheheda.online` still prior production alias; containers not started |

Ledger (non-git):
`.data/protected-staging-release-ledger/838a680ec1940544bf30e2782594799198812e0b.json`

---

## Prior authority: 96% local fault matrix — Phase 5 (APPROVED / complete)

**Status: `APPROVED` (complete)** — user opened optional Phase 5 Deep
`provider_claim_extraction` progress=96 taxonomy (2026-07-27). Deployed to
Protected Staging under separate user authorization in the same session.

### Phase 5 objective

Deep paid discovery marks `provider_claim_extraction` at **progress 96** (via
`providerPhaseProgress`). Failures in that lane must map to **durable, redacted
job codes** instead of undifferentiated `unexpected_internal_error` when the
class is known:

1. `ProviderDiscoveryResumeIdentityMismatchError` → permanent
2. `ProviderDiscoveryDeadlineExceededError` → transient
3. `ProviderDiscoveryPipelineContractError` → permanent
4. `AiClientError` during phase `provider_claim_extraction` →
   `provider_claim_extraction_*` (auth / rate / temporary / timeout /
   invalid_response / configuration / transport) with correct
   permanent/transient/operator_repairable
5. Same `AiClientError` outside that phase → `ai_client_*` (shared transport
   taxonomy; no raw response body in job diagnostics)

Do **not** redesign the discovery state machine, change progress numbers,
mutate historical jobs, or log provider response bodies.

### Phase 5 production allowlist

- `apps/web/src/worker/job-errors.ts`
- `apps/web/src/worker/provider-discovery-pipeline.ts` — only durable `name` on
  the three ProviderDiscovery* error classes (no pipeline logic change)
- `docs/ACTIVE-CHANGE-SCOPE.md`

### Phase 5 tests allowlist

- `apps/web/src/worker/job-errors.test.ts`

### Phase 5 budgets

- Production: `+80/-20` (job-errors + pipeline error names)
- Tests: `+120/-20`
- External: all `0` (no push/deploy unless asked)

### Phase 5 delivered

| Boundary | Job code | Classification |
|----------|----------|----------------|
| Resume identity mismatch | `provider_discovery_resume_identity_mismatch` | permanent |
| Hard deadline | `provider_discovery_deadline_exceeded` | transient |
| Pipeline contract | `provider_discovery_pipeline_contract` | permanent |
| AiClient at `provider_claim_extraction` | `provider_claim_extraction_{authentication,rate_limited,temporary,timeout,invalid_response,configuration,transport}` | auth/config operator_repairable; rest transient |
| AiClient other phases | `ai_client_*` (same suffixes) | same |

Progress numbers and discovery state machine unchanged. Phase 4 still clears
public progress when stage is `failed`.

### Phase 5 stop

No processor progress table rewrite, free-teaser, commerce, Docker, deploy,
historical Job mutation, or public-search adapter production rewrites.

---

## Prior authority: 96% local fault matrix — Phase 4 (APPROVED / complete)

**Status: `APPROVED` (complete)** — user authorized "push、开 Phase 4"
(2026-07-27). Phase 1–3 on `origin/main` (`14809f6`). **No deploy** unless
separately authorized.

### Phase 4 objective

Public status/UI progress semantics: a **failed** Free/Deep report job must not
present as “still generating at 96%”. Clear public progress for terminal
`unavailable` without inventing a false mid-run or completed percentage.

1. Shared projection: `publicProgressForStage(stage, progress)` returns
   - `null` when stage is `failed` (public state `unavailable`)
   - `100` when stage is `completed` / `completed_limited` / legacy `partial`
   - clamped `0..99` for in-flight stages (never publish 100 while generating)
2. Report status API uses this projection for `job.progress`.
3. UI types accept `progress: number | null`; progress bar remains
   `state === "generating"` only (already true).
4. Do not mutate stored job rows, retry machine, or invent new public stages.

### Phase 4 production allowlist

- `apps/web/src/report/job-status.ts`
- `apps/web/src/app/api/reports/[id]/status/route.ts`
- `apps/web/src/components/ai-report-status.tsx` (type + null-safe progress only)
- `docs/ACTIVE-CHANGE-SCOPE.md`

### Phase 4 tests allowlist

- `apps/web/src/report/job-status.test.ts`
- `apps/web/src/app/api/reports/[id]/status/route.test.ts`
- `apps/web/src/components/ai-report-status.test.ts` (only if needed)

### Phase 4 budgets

- Production: `+60/-20` (track measured)
- Tests: `+80/-20` (track measured)
- External: Phase 1–3 push done; Phase 4 push authorized with same user turn;
  **no deploy**

### Phase 4 delivered

| Input | Public `state` | Public `progress` |
|-------|----------------|-------------------|
| stage `failed`, stored progress 96 | `unavailable` | `null` (not 96) |
| stage `synthesizing`, 96 | `generating` | `96` |
| stage `completed`, any | `completed` | `100` |

DB job.progress unchanged; only status API projection changes.

### Phase 4 stop

No processor, free-teaser, db terminalize, deep claim-extraction, commerce,
Docker, or historical Job mutation.

---

## Historical context — Free V4 teaser typed error boundary (completed work; not current execution)

Status: historical (implementation may already be on `main`; not the active task)

### User-approved decisions (locked for that prior task)

- **A:** typed `mimo_invalid_response` + limited transient retry (existing phase attempt budget)
- **B:** permanent typed fail-closed `semantic_review_evidence_missing` (keep `report_global_v1`)
- **C:** preventive strict `{ type: "text", text }` content-parts parsing on structured MiMo path (not historical payload proof)

### Objective

为 marker-present Free V4 teaser unified semantic review 的两类已记录失败建立明确、脱敏、可测试的 typed error 和 job 分类边界；保持 `report_global_v1` fail-closed 契约，不修改或重跑任何历史 Job。

This is not a claim to fix a single deeper ultimate root cause of all V4 failures.

### Baseline (historical evidence only; do not mutate)

- Workspace: `E:\project\open-geo-console`
- Branch: `main`
- Complete HEAD at scope start: `330b27a74c5c3d9d56c71bc8e6ade1859499e92e`
- Verified Staging job (no repair/replay/retry authorized):
  - Job: `caf0e8c3-71f5-4004-bd29-abe87c9b96e3`
  - Report: `90ee4925-bdd3-4154-b789-3625ebf4cb8e`
  - Terminal: `failed` / `unexpected_internal_error` at progress 96 after Q1 answer, diagnosis, and three observation snapshots
  - Direct failures: structured invalid response; `report_global_v1` missing accepted evidence/source
  - Historical records do not prove content-parts array as the raw payload shape

### Required behavior

1. Keep `report_global_v1` fail-closed for missing accepted evidence/source on non-blocked fields, answer annotations, and evidenceUse annotations.
2. Emit typed redacted outcomes:
   - `mimo_invalid_response` (transient)
   - `semantic_review_evidence_missing` (permanent)
3. Structured `message.content`:
   - non-empty string path retained
   - array path accepts only `{ type: "text", text: non-empty string }` parts
   - reject bare strings, missing type, `content` field objects, non-text types, empty/mixed/over-limit arrays
   - `MAX_STRUCTURED_CONTENT_PARTS = 128`, `MAX_STRUCTURED_CONTENT_CHARS = 1_000_000` with early rejection
4. Do not log raw provider bodies, secrets, tokens, or customer prose beyond existing redaction.
5. Resume from `q1_answer_ready` must not re-run Q1 answer, diagnosis, or snapshots.
6. No historical job mutation.

### Production allowlist (closed)

| Path | Role |
|------|------|
| `apps/web/src/report-v4/mimo-provider.ts` | Structured parse typing; strict content-parts; limits |
| `apps/web/src/worker/job-errors.ts` | Map typed provider/review errors to job classification/codes |
| `packages/ai-report-engine/src/report-semantic-review.ts` | Typed fail-closed for global evidence on fields, answers, evidenceUse |
| `docs/ACTIVE-CHANGE-SCOPE.md` | Authorization record only |

### Tests allowlist (closed)

| Path | Role |
|------|------|
| `apps/web/src/report-v4/mimo-provider.test.ts` | String/parts success; strict reject matrix; shared websiteSynthesis/questionAnswer/sourceDiagnosis |
| `apps/web/src/worker/job-errors.test.ts` | `mimo_invalid_response` transient; `semantic_review_evidence_missing` permanent |
| `packages/ai-report-engine/src/report-semantic-review.test.ts` | Field/answer/evidenceUse typed evidence-missing fail-closed |
| `apps/web/src/worker/report-v4-free-teaser.test.ts` | Regression gate (no production free-teaser edits required) |
| `apps/web/src/worker/processor.test.ts` | Regression gate for job failure classification wiring |

### Forbidden

- `apps/web/src/db/**`, migrations, schema meaning, historical data
- Claim/lease/checkpoint/retry state-machine redesign
- Q1/Q2/Q3 public-search or diagnosis production logic changes
- Deep report, commerce, payment, refund, email
- UI, status routes
- Docker, Vercel, deploy, env mutation
- Historical Job retry/replay/repair/reopen/clone (including `caf0e8c3…`)
- Relaxing evidence/source/receipt/hash/identity/URL gates
- New dependencies
- Real model, Worker, Docker, database write, deploy, push

### Diff budget

| Surface | Budget |
|---------|--------|
| Production allowlisted files | max `+180` / `-50` (measured ~`+156` / `-18`) |
| Tests allowlisted files | max `+480` / `-10` (measured ~`+394` / `-4`; verification-only budget refresh = measured + ≤20% headroom) |
| Dependencies / migrations | `0` |

### Verification commands (closed)

Focused (required before full suite):

```text
npx vitest run apps/web/src/report-v4/mimo-provider.test.ts packages/ai-report-engine/src/report-semantic-review.test.ts apps/web/src/worker/job-errors.test.ts apps/web/src/worker/report-v4-free-teaser.test.ts apps/web/src/worker/processor.test.ts
```

Full local verification:

```text
npm run lint
npm test
npm run build
git diff --check
```

### Expensive external actions

All counts are **0**: real model, Worker, Docker, database writes, historical Job actions, deploy, push.

### STOP conditions

- Edit outside the closed allowlists above
- Expand retry/state machine, model calls, DB semantics, or evidence gates
- Historical Job mutation
- Treat content-parts as proven historical payload root cause of `caf0e8c3…`

### Implementation status

Implementation and bounded rework authorized under this APPROVED lock with A/B/C fixed as above.

## Release / acceptance amendment (user-confirmed 2026-07-27)

Status remains `APPROVED`. The user explicitly confirmed promotion of the
already implemented and locally accepted Free V4 semantic-review fix from the
current `main` checkout to Protected Staging only, followed by a pause at the
fixed web entry for the user to type the site URL and perform any later test.

### Release allowlist

- Git may stage and commit only these seven currently tracked, allowlisted
  files: `apps/web/src/report-v4/mimo-provider.test.ts`,
  `apps/web/src/report-v4/mimo-provider.ts`,
  `apps/web/src/worker/job-errors.test.ts`,
  `apps/web/src/worker/job-errors.ts`,
  `packages/ai-report-engine/src/report-semantic-review.test.ts`,
  `packages/ai-report-engine/src/report-semantic-review.ts`, and this
  `docs/ACTIVE-CHANGE-SCOPE.md`. Exclude untracked `.codex/` entirely.
- Release actions may include the push and Preview / fixed Protected Staging
  promotion or configuration actions required by
  `docs/PROTECTED-STAGING-OPERATIONS.md`, strictly for the linked Staging
  project and never Production. The runbook order is mandatory: package one
  candidate, create a unique `READY` Preview only if no matching one exists,
  independently verify its full SHA identity, then move the fixed alias once
  and verify the Web plus both Staging Workers.
- The fixed business entry is
  `https://open-geo-console-staging-itheheda.vercel.app`; a unique Preview is
  artifact identity only and must not be used as the user acceptance site.
- For this amendment only, the release operator is authorized for Protected
  Staging Gate 2 Docker work. Read-only preflight may inspect `docker system
  df`, target-drive free space, Compose/container/image metadata, and exact
  current/candidate/rollback image IDs plus container references. If
  `package.json`, `package-lock.json`, `Dockerfile.worker`, the base-image
  digest, and browser/system dependencies are unchanged, a full Worker build
  is forbidden; use only a thin source-overlay from the currently accepted
  exact Worker image, copy the required `apps/` and `packages/` source, and
  label it with the final candidate full SHA. Recreate only the named Staging
  Free and Deep Worker services, never Production or commerce. Verify exact
  image ID/SHA, health, zero restart count, and zero-claim state before the
  single fixed-alias promotion. Retain current plus one rollback image only;
  do not prune, clean up, or delete images, volumes, or shared layers.
  Immediately stop if target free space is below 20 GiB or any identity or
  rollback evidence is missing. Record before/after free space, `docker system
  df`, image IDs, container references, and net bytes; after a failed build do
  not retry until remaining space and retry authority are revalidated.
- The user explicitly accepts the risk of Staging credentials entering the
  Codex tool context for this release, does not request rotation, and confirms
  deployment may continue. This is not confirmation of third-party leakage.
  Never query or output Docker `.Config.Env`; Docker inspection is limited to
  `.Image`, revision label, `State.Status`, `RestartCount`, image ID/
  `RepoDigest`, and container/Compose service identity fields.
- Release operations may atomically write the non-Git ledger
  `.data/protected-staging-release-ledger/<candidate-full-sha>.json` with
  restricted access and no secrets. Each action is idempotent under
  `protected-staging:<sha>:<action>:<target>`: read an existing successful
  record first and do not repeat it. Record platform/project/team,
  fixed-domain/SHA, Preview action and deployment ID, overlay image ID,
  Staging Free/Deep container IDs, alias action, rollback ID, and status.
- One inline Dockerfile is authorized for this release, with no repository
  script added: `FROM` the current accepted immutable Worker RepoDigest/ID,
  `COPY` only `apps` and `packages`, and `LABEL` the final candidate SHA.
  `npm ci`, Playwright/browser installation, OS packages, and full builds are
  forbidden; the overlay is Staging Free/Deep only.
- Before mutation, bind current, rollback, and candidate identities using only
  the whitelist above; environment inspection is prohibited. The user's
  release authorization remains active for these actions.
- After Gate 3 technical checks, stop at the fixed site. The user—not the
  agent—will type the target URL and initiate any subsequent browser test.

### Explicit prohibitions for this amendment

The agent must not submit a scan, create a report or job, pay, call a model,
write the database, replay or mutate historical jobs, touch
commerce/payment/refund/email, perform a second report or deployment, or touch
Production. These actions require a later explicit scope and authorization.

### Required release and rollback evidence

The release operator must record the candidate commit's complete SHA (the same
identity in the clean detached worktree and Preview `gitCommitSha` / `ogcGitSha`),
the linked Vercel project/team, and opaque IDs for any newly created Preview and
the fixed-alias promotion. Before any Staging mutation, record candidate,
current, and one rollback Worker image IDs; after verification record both
Workers' image/SHA, tier, Staging identity, restart counts, and no-claim check.
If any post-change check fails, restore the recorded rollback Worker images and
fixed alias, then report the rollback identity and before/after evidence.

## Vercel packaging amendment (user-confirmed 2026-07-27)

Status remains `APPROVED`. The user approved fixing the packaging blocker and
continuing only after its read-only acceptance gate passes. A Vercel dry
manifest included `.codegraph/codegraph.db` (148,279,296 bytes), exceeding the
100 MB single-file limit; no deployment was created.

### Narrow allowlist and budget

- Allowlist is exactly the existing `docs/ACTIVE-CHANGE-SCOPE.md` plus a new
  root `/.vercelignore`.
- `/.vercelignore` must contain exactly these exclusions: `.codegraph/`,
  `.data/`, `.tmp/`, `.codex/`, `.vercel/`, `**/node_modules/`, and `**/.next/`.
- Do not exclude `apps/`, `packages/`, config, or public build-required source;
  do not modify `vercel.json`, package files, Docker, or runtime behavior.
- Diff budgets are `.vercelignore` `+7/-0` and this scope amendment `+40/-0`.

### Acceptance gate and stop rule

- The completed Vercel `deploy --dry --format=json` evidence is: exit code 0,
  `fileCount=1694`, `totalSize=37,885,894`, `max=7,605,346`, no file over 100
  MB, and required tracked deployment sources present. In the seven excluded
  directory classes, no regular upload file has content, non-zero size, or a
  file hash. Vercel zero-byte directory metadata without a SHA is allowed and
  does not count as upload content.
- The dry-manifest gate is `PASS` on that evidence. Git may now stage, commit,
  and push only `docs/ACTIVE-CHANGE-SCOPE.md` and root `/.vercelignore`;
  exclude `.codex/`, the `.data` release ledger, `.tmp/`, and every other
  path. A normal (non-forced) push to `main` is allowed only when `behind=0`.
- After this technical gate, resume the already approved Protected Staging
  Preview/fixed-alias process. No additional output-directory exclusion is
  authorized, and the release remains Staging-only.

## Current authority: 96% local fault matrix — Phase 3 (APPROVED / complete)

**Status: `APPROVED` (complete)** — user authorized "提交本地、开 Phase 3"
(2026-07-27). Phase 1–2 committed as `4e48533`. **No push / deploy** unless
separately authorized.

### Phase 3 objective

Prove Free V4 teaser **checkpoint / resume** at every durable stage with an
**in-memory dry harness** (mocked providers, no real DB, no real model):

1. Resume from each saved stage does **not** re-run already-durable expensive
   work (snapshot resolve, Q1 generative answer, diagnosis, unified review) when
   that stage’s artifact is already present.
2. After a typed diagnosis failure, resume from the last durable
   `q1_answer_ready` (answer draft, no diagnosis) re-runs diagnosis only and can
   complete when the provider succeeds.
3. Corrupt / incomplete stage shapes still fail closed without writing a new
   checkpoint or invoking later expensive stages.

No prompt rewrite, no claim/lease/CAS redesign, no UI progress rewrite, no real
model/DB/Docker/deploy, no historical Job mutation.

### Phase 3 production allowlist

- `apps/web/src/worker/report-v4-free-teaser.ts` — only if a proven resume gap
  requires a minimal fix; prefer test-only if production already correct
- `docs/ACTIVE-CHANGE-SCOPE.md`

### Phase 3 tests allowlist

- `apps/web/src/worker/report-v4-free-teaser.test.ts` — resume matrix + dry harness
- `apps/web/src/worker/report-v4-free-teaser-resume-harness.ts` — pure dry harness
- `apps/web/src/worker/report-v4-free-teaser-resume-harness.test.ts` — harness unit tests

### Phase 3 budgets

- Production free-teaser: `+40/-20` (**measured `+0/-0`** — no production fix required)
- Tests + harness: measured `~+349/-0` (free-teaser.test `+123`, harness
  `~+132`, harness.test `~+94`) + ≤20% headroom → **`+419/-0`** (verification-
  only refresh of prior `+280/-40`; test/harness files only)
- External actions: all `0`

### Phase 3 delivered

| Resume kind | Expensive re-run budget |
|-------------|-------------------------|
| `ready` | all 0 |
| `q1_diagnosis_ready` | semanticInvoke 1 only |
| `q1_answer_ready` | enhanceDiagnosis 1 + semanticInvoke 1 |
| `observations_ready` | answer + diagnosis + review (no snapshot re-resolve) |
| `questions_ready` | resolveSnapshot 3 + answer + diagnosis + review |
| typed diagnosis fail → resume | no diagnosis draft saved; resume = q1_answer_ready budget |

### Phase 3 stop

Do not expand into UI, processor progress mapping, deep discovery 96 path,
public-search adapter production logic, or deploy without a new scope.

---

## Prior authority: 96% local fault matrix — Phase 2 (APPROVED / complete)

**Status: `APPROVED` (complete)** — user directed "继续" after Phase-1 local
acceptance (2026-07-27). Local commit authorized with "提交本地" (2026-07-27).

### Phase 2 objective

Type free-teaser **diagnosis failure** and **Q1 incomplete answer** (and map
diagnosis/provider-class errors at the job boundary) so they no longer collapse
to `unexpected_internal_error` + blind transient when the stage/code is known.
Still no prompt rewrite, no state-machine redesign, no UI rewrite, no real
model/DB/Docker/deploy.

### Phase 2 production allowlist

- `apps/web/src/worker/report-v4-free-teaser.ts`
- `apps/web/src/worker/job-errors.ts`
- `docs/ACTIVE-CHANGE-SCOPE.md`

### Phase 2 tests allowlist

- `apps/web/src/worker/job-errors.test.ts`
- `apps/web/src/worker/report-v4-free-teaser.test.ts` (regression / typed throws only)

### Phase 2 budgets

- Production: `+120/-40` (measured free-teaser+job-errors **`+112/-11`** — under budget)
- Tests: verification-only refresh to measured `+219/-14` + ≤20% headroom →
  **`+263/-17`** (was `+200/-40`; allowlisted test files only; no production
  behavior change from budget refresh)
- External actions: all `0`

### Phase 2 delivered behavior

| Throw / boundary | Job code | Classification |
|------------------|----------|----------------|
| `FreeTeaserDiagnosisFailedError` stage=`semantic_contract` etc. | `free_teaser_diagnosis_<stage>` | permanent (provider transport/rate/temporary → transient; auth/config → operator_repairable) |
| `FreeTeaserQ1IncompleteError` | `free_teaser_q1_incomplete` | permanent |
| `ReportV4DiagnosisProviderError` | `diagnosis_*` (from mimo map) | same as MiMo map |
| `ReportV4QuestionProviderError` | `question_*` | same as MiMo map |
| `MiMoGenerativeSearchAnswerError` | `generative_search_{authentication,unavailable,malformed,aborted}` | auth→operator_repairable; others→transient |

### Phase 2 stop

Do not expand into checkpoint harness, UI, public-search adapters production
logic, or deep discovery 96 path without a new scope.

---

## Prior authority: 96% local fault matrix — Phase 1 (APPROVED / complete)

**Status: `APPROVED` (complete)** — user authorized Phase-1 implementation and
test recap (2026-07-27). Historical detail below remains the Phase-1 contract.

### Objective (Phase 1 only)

Locally enumerate and harden **structured MiMo provider + job-error
classification** so every failure in the Phase-1 surface maps to a stable,
redacted, typed code with correct permanent/transient/retry-after semantics.
Do not assume the provider never fails. Do not dump remaining 96% categories
into `unexpected_internal_error`.

**Out of Phase 1 (report only; no file authority):** semantic-review
satisfiability beyond existing typed evidence-missing; public-search/snapshot
chains; free-teaser checkpoint/resume matrix; UI progress mapping; prompt
rewrites; state-machine redesign; deep discovery `provider_claim_extraction`
progress=96 path (see inventory below).

### Baseline

- Workspace: `E:\project\open-geo-console`, branch `main`.
- Complete HEAD when this Phase-1 block was authored: must be re-read from
  `git rev-parse HEAD` at approval time (dirty scope-only edits may exist).
- User-owned dirty at authoring: `M docs/ACTIVE-CHANGE-SCOPE.md`, `?? .codex/`
  (do not touch `.codex/`).
- 30-day Staging sample (operator evidence, not authority to mutate jobs):
  25 Deep jobs, 107 error events; 18 failed; 13 terminal at progress 96;
  `unexpected_internal_error` 71/20 (events/jobs); public-source 20/8;
  language 8/6; deferred 5/5; semantic typed 1/1. **96% is multi-cause.**
- Prior typed work already in tree (if present on HEAD): `mimo_invalid_response`
  (transient), `semantic_review_evidence_missing` (permanent), strict
  content-parts. Phase 1 extends provider taxonomy + job-error mapping + local
  fault fixtures; it does not re-open historical Job mutation.

### Code inventory: where progress can show 96 (read-only)

| Path | Code | Meaning |
|------|------|---------|
| Free teaser non-ready | `processor.ts` `withFreeTeaserAfterAdmission` saveCheckpoint: `progress: freeTeaser.stage === "ready" ? 99 : 96` | Any free-teaser stage after admission until `ready` (questions / observations / Q1 / diagnosis / review) displays **96** |
| Free teaser terminal fail | `jobs.ts` `terminalizeScanJob`: failed keeps prior progress | Failed job can **retain 96** on disk |
| Free teaser retry window | `executionState=retry_wait`, stage still synthesizing | UI `publicStateForStage` → `generating` + progress 96 |
| Free teaser terminal UI | stage `failed` → `unavailable` | Progress bar hidden; field may still be 96 |
| Paid/deep discovery | `providerPhaseProgress`: `provider_claim_extraction: 96` | **Different product path** than free teaser; must not be “fixed” by Phase-1 free-teaser assumptions alone |
| Paid grounded synthesis | progress 98 not 96 | Not the free-teaser 96 bucket |

Free-teaser stages that checkpoint at 96 (all call `saveCheckpoint(..., phase)` with progress 96 until ready):

1. `question_generation` after questions_ready
2. `snapshot_resolution` after observations_ready
3. `grounded_answer_synthesis` after Q1 draft/result
4. `grounded_answer_synthesis` after diagnosis draft
5. `grounded_answer_synthesis` after review → ready (then 99)

### Failure classes in Phase-1 surface (must classify, not silence)

**A. Provider preflight (mimo-provider / runtime config)**
Missing/invalid base URL or key; billing channel mismatch; locked profile drift;
token budget reject (`ModelTokenBudgetError` if reaches job boundary);
diagnosis input over bound → existing `configuration`.

**B. Transport / HTTP (mimo-provider `invokeOnce`)**
Fetch throw → `transport` (retryable).
401/403 → `authentication` (non-retryable provider; job map TBD in Phase 1).
429 → `rate_limited` (retryable).
408 / ≥500 → `temporary_provider` (retryable).
Other 4xx → `configuration` today.
Non-JSON body → `mimo_invalid_response` (retryable typed).
**Gap:** AbortSignal / hang timeout not always distinct codes; no dedicated
`timeout` code unless derived from abort. **Gap:** `finish_reason`
(`stop`/`length`/`content_filter`/unknown) is **not** read by structured
MiMo path today — Phase 1 must define fail-closed handling without logging body.

**C. Envelope / content**
Missing choices; missing/invalid message; missing content; unsupported
content-parts shape; parts/length limits; bad JSON content →
`mimo_invalid_response` (and related stable reasons). Multi-choice: only
`choices[0]` used (document; do not expand multi-choice product).

**D. Job boundary mapping (job-errors)**
Today only maps `mimo_invalid_response` and `semantic_review_evidence_missing`.
Most free-teaser `Error`/`TypeError` and other provider codes still collapse to
`unexpected_internal_error` + often `transient`. Phase 1 must map structured
MiMo codes that reach `normalizeJobError` to durable codes and correct
retryability. **Must** add `OGC_REPORT_V4_MIMO_API_KEY` to processor redact
list only if processor is allowlisted — **not** in Phase 1 allowlist; report
as Phase-1.5 gap if redact remains incomplete.

**E. Explicitly NOT Phase 1 (enumerated for later)**
Public-search / snapshot load failures; diagnosis plain `Error` wrapper;
semantic field/annotation failures beyond existing evidence-missing type;
checkpoint CAS; lease; UI progress zeroing on failed; deep
`provider_claim_extraction` 96.

### Production allowlist (closed — Phase 1)

| Path | Role |
|------|------|
| `apps/web/src/report-v4/mimo-provider.ts` | Typed outcomes for transport/HTTP/envelope/content/finish_reason; no raw body logs |
| `apps/web/src/worker/job-errors.ts` | Map those outcomes to job codes + permanent/transient/retry-after |
| `docs/ACTIVE-CHANGE-SCOPE.md` | Authorization record only |

### Tests / fixtures allowlist (closed — Phase 1)

| Path | Role |
|------|------|
| `apps/web/src/report-v4/mimo-provider.test.ts` | Fixed fixtures + fake-fetch fault injection matrix |
| `apps/web/src/worker/job-errors.test.ts` | Classification matrix for each new/stable code |
| `apps/web/src/report-v4/__fixtures__/mimo-provider-errors/**` | Optional fixed response envelopes only; create only if used |

No free-teaser, processor, semantic-review, UI, or db files in Phase 1.

### Required behavior after approval

1. Every Phase-1 injected failure yields a **stable, redacted** code (not
   undifferentiated `unexpected_internal_error` when the class is known).
2. Explicit **permanent vs transient** (and retry-after only when transient).
3. No raw provider body, API keys, tokens, or customer prose in errors/logs.
4. Fixed-seed property/fuzz ≥ **1000** cases for envelope/content/json structural
   rejects; failure prints seed.
5. Local only: fake fetch, no real model, no DB, no Docker, no deploy.

### Diff budget (Phase 1)

| Surface | Budget |
|---------|--------|
| Production (2 files) | max `+260` / `-80` |
| Tests (2 files) | max `+800` / `-80` |
| Fixtures (optional dir) | max `+300` / `-0` |
| This scope file | max `+220` / `-80` |
| Dependencies / migrations | `0` |

### Acceptance (Phase 1)

1. Focused:
   `npx vitest run apps/web/src/report-v4/mimo-provider.test.ts apps/web/src/worker/job-errors.test.ts`
2. `npm run lint` · `npm test` · `npm run build` · `git diff --check`
3. Diff ⊆ allowlist and budgets
4. Classification matrix table in PR/notes: input → code → permanent/transient → retry
5. Independent reviewer/tester; **no deploy**

### Expensive external actions

All **0**: real model, DB write, real report/job, Docker, Vercel, push, historical
Job replay/repair.

### STOP

- Edit production/tests while still `FROZEN`
- Touch free-teaser, processor, semantic-review, UI, db, deploy
- Real model/DB/Docker/Vercel
- Expand Phase 1 into Phase 2–4 without a new approved scope

### Non-executable roadmap (no file authority)

- **Phase 2:** Semantic review satisfiability + free-teaser diagnosis typed
  errors; allowlist candidates only after new scope
- **Phase 3:** Checkpoint/resume matrix + in-memory dry harness (no real DB)
- **Phase 4:** Status/UI progress semantics (failed clears “generating 96%”
  messaging without inventing false progress)
- **Phase 5 (optional):** Deep `provider_claim_extraction` progress=96 taxonomy
- **Deploy stage:** Separate user approval only after local gates pass

### Implementation status

**APPROVED for Phase-1 implementation.** Production edits limited to the closed
allowlist; external actions remain zero; no deploy.

---

## 2026-08-01 — Free V4 semantic ownership cut (completed local implementation)

- Baseline: `main` at `2a208ea6d971c148336b19cfb29e3c1606cfe956`.
- Objective: make the model the sole owner of semantic atoms while code retains
  structural, identity, ownership, and deterministic-derivation authority.
- Implemented within the approved semantic engine, provider adapter, Free Worker,
  focused tests, and retained read-only probe allowlist.
- Focused result: 105 selected tests passed with zero selected-test skips; lint
  had zero errors and build passed. Full `npm test` retained one unrelated
  Windows PowerShell five-second timeout, so it was not represented as globally
  green. Independent review found no P0-P2 issue in the scoped cut.
- No real model acceptance, database mutation, deployment, Git publication, or
  branch closeout was claimed under that scope.
- Superseded as executable authority by the separately approved one-run runtime
  scope in `docs/ACTIVE-CHANGE-SCOPE.md`.

---

## 2026-08-01 — One minimal real-model Free V4 semantic sequence (terminal)

- Preflight evidence:
  `.data/test-runs/free-v4-final-semantic/preflight-20260801021218-3af5e2f7`.
  It completed with exit `0`, provider calls `0`, exact authority confirmed,
  read-only unpooled Staging access, and unchanged database fingerprint.
- Live evidence:
  `.data/test-runs/free-v4-final-semantic/semantic-20260801021258-3d15986a`.
  Exactly six sequential required batches were called and persisted once; no
  retry was issued. It completed `semantic_failed`, exit `1`, with unchanged
  database fingerprint and no final checkpoint or accepted guard receipt.
- The previous `B_answers` routing/entity-role conflict was crossed: the model
  omitted `entityRole` and the program derived it without contradictory
  semantic arbitration.
- First exact offline replay failure: `B_fields_readonly.fields` was a path-keyed
  object rather than the required array. Independent later defects included an
  undeclared mutable-field key, boolean observation-presence values, prose in
  the answer relevance enum, and a structurally valid model judgment that all
  three questions were duplicates, which would independently block apply.
- Runtime verdict: not accepted. This terminal evidence authorizes no retry,
  repair, deployment, database mutation, or Git action.

---

## 2026-08-01 - Disposable PostgreSQL direct-carrier verification (terminal)

- Canonical receipt:
  `.data/test-runs/postgres-disposable/pg-20260801033636-f71e415e/receipt.json`.
- The isolated PostgreSQL 16 container used loopback port `64542`, tmpfs at
  `/var/lib/postgresql/data`, and was removed after JSON and exit-code evidence
  were persisted.
- Result: `274/275` tests passed, `1` failed, `0` skipped. The failure proved
  that `commercial-orders.ts` still rejected the new Free direct carrier before
  reaching the direct-aware receipt resolver.
- The stale precheck was corrected locally. Independent review also identified
  and the implementation removed the outer-job retry route by binding new V4
  pre-admission jobs to one attempt and prohibiting deferred attempt restoration
  for that reason.
- No second PostgreSQL invocation is authorized, so those corrections retain
  focused/build evidence only and are not represented as database-verified.

---

## 2026-08-01 - Free V4 direct-semantics v1 first cut (superseded before publication)

- Baseline: `main` at `2a208ea6d971c148336b19cfb29e3c1606cfe956` with the
  uncommitted direct-carrier implementation still present in the worktree.
- The first cut removed the Free global semantic reviewer and introduced a
  separate Free carrier, direct question editor, Q1 answer assessment,
  diagnosis handles, compact receipt, checkout verification, and one-attempt
  pre-admission execution.
- Deeper inspection proved that this was call separation rather than complete
  semantic-authority separation: Direct still ran three legacy observation
  searches before Q1, derived three-question-looking metrics from one Q1
  assessment, searched and displayed a neutralized question while Q1 used the
  private variant, rejected typed refusal before diagnosis, and labelled every
  target page as relevant before the model selected evidence.
- The Direct carrier was not committed, pushed, deployed, or accepted by a
  real-model Direct run. Its disposable PostgreSQL database was destroyed by
  the canonical runner. Therefore no historical Direct checkpoint migration or
  compatibility version is authorized or required.
- This authority is superseded by the frozen Q1-only correction scope in
  `docs/ACTIVE-CHANGE-SCOPE.md`. The existing dirty files are preserved as a
  reviewable baseline, not treated as completed or accepted work.

---

## 2026-08-01 - Q1-only semantic-authority correction local checkpoint

- The correction removed all Direct observation resolver calls and legacy
  three-question metrics, enforced one identity-neutral persisted/Q1/UI
  question, accepted typed refusal, and made target-page relevance plus the
  final target-evidence state model-owned.
- Direct receipt and checkout readers now bind the typed outcome and target
  evidence state; refusal, blocked, and not-responsive outcomes fail closed
  before checkout or Paid-job seeding.
- Focused Direct/Paid/processor/provider checks passed `310/310`; the final
  business-question group passed `41/41`; lint completed with zero errors and
  six pre-existing warnings; and the production build completed successfully.
- The full deterministic suite passed `3013` tests with `204` skipped. Its only
  two failures were five-second Windows PowerShell timeouts in the Staging
  preflight file; the same file then passed `23/23` in isolation. This is not
  represented as a globally green suite or real semantic acceptance.
- Final diff check passed, all dirty paths remained within the approved
  allowlist, and the four audited program-owned semantic coercion patterns were
  absent. No PostgreSQL run, real-model call, deployment, or Git mutation was
  performed for this correction.

---

## 2026-08-01 - Conditional closeout stopped during disposable PostgreSQL run

- The user authorized one conditional chain: one canonical disposable
  PostgreSQL run; only on success, one no-retry real-model sequence; only on
  success and final audit, commit and push `main`.
- Run `pg-20260801050748-beed6154` completed disposable setup on loopback port
  `52950` with tmpfs at `/var/lib/postgresql/data`, then recorded
  `testStartedAt=2026-08-01T05:07:54.855Z`.
- Its persisted receipt remained `tests_running`; the process exited without
  `vitest.json`, `exit-code.txt`, terminal result, or cleanup evidence. Docker
  API access was unavailable during the read-only recovery check, so container
  cleanup could not be independently confirmed.
- Because Vitest had already started, the formal allowance was consumed. The
  fail-stop condition prevented any model call, Git stage/commit/push, or
  Staging action.

---

## 2026-08-01 - Replacement PostgreSQL pass and real-model diagnosis stop

- Replacement run `pg-20260801052141-b6a8973f` passed `275/275` selected tests
  with zero failures and zero skip on loopback port `60796`, using the required
  PostgreSQL tmpfs. Its terminal receipt was `passed`, exit code was `0`, and
  its run-owned container was removed.
- Read-only runtime inspection proved the prior Direct probe was a zero-call
  fixture. A verification-only amendment converted that existing allowlisted
  probe into a live three-stage runner with a guarded maximum of three external
  requests, no database/report/job/UI path, and no retry. Its injected focused
  test and the Web production build passed before the live run.
- Live run `direct-20260801053627187-2736a3c0` sent exactly three requests to
  the configured MiMo endpoint. `question_editor` and `q1_answer` completed;
  `diagnosis_assessment` did not return a completed Direct outcome. The run
  stopped with exit code `1` and no retry.
- The failure receipt omitted the diagnosis enhancer's specific failure object
  and the already completed Q1 result. The current evidence therefore proves
  the failing boundary but not whether the third-stage cause was transport,
  provider status, token budget, or invalid semantic output. No Git or Staging
  action was performed.

---

## 2026-08-01 - Three-call Direct semantic DSL scope superseded by approved two-call design

- The user approved returning to the original product design: one native-search
  Q1 answer followed by one independent natural-language analysis. The model
  question editor is removed from the Direct runtime path.
- Read-only inspection found that the API guarantees only `json_object`, while
  the first cut required an exact six-field diagnosis object, fixed enum
  values, exactly three observations, exactly three recommendations, nested
  evidence keys, target sentence/role/competitor fields, and rejected harmless
  additional fields.
- The first cut also made the completed Q1 answer unreadable unless diagnosis
  completed and the single combined receipt reached `ready`. This conflicts
  with the approved rule that Q1 plus same-response sources is the independent
  core result and analysis failure only marks analysis incomplete.
- The old conditional PostgreSQL/model/Git closeout chain is terminal and
  grants no continuing permissions. Its code and evidence remain preserved in
  the dirty worktree/history until the new exact scope is approved.

---

## 2026-08-01 - Free Direct boundary shipped, Paid continuation failed

- Commit `5d2e64d8e4abe29d45250729986c4831908484a4` restored the Free Direct
  two-call boundary and was deployed to the Staging Free and Deep Workers.
- Fresh Free job `276d58a0-66fd-4c19-b168-f2dab03de1b9` completed with its
  Direct core and analysis receipts, so the Free boundary itself passed.
- Its fresh Paid continuation job `686915a3-05c7-440a-ab73-cd0569386efc`
  lost the Direct carrier at checkout, entered the marker-absent legacy Paid V3
  path, and failed at progress 98 on Q3 with
  `correction_contract/invalid_correction` after Q1 and Q2 were already
  complete. Report `e34ea7e0-9031-40b4-b0aa-299d0dc0ee5c` therefore never
  became a deliverable.
- The preceding scope intentionally excluded Paid V3. It is closed as a
  successful Free-only change but an incomplete Free-to-Paid product outcome.
  This history is context only and grants no authority to modify or replay any
  historical job, order, payment, report, refund, or deployment.

---

## 2026-08-02 - Direct Paid terminalization shipped; fresh chain reached a new upstream failure

- Commits `ee166d1204a7b302e90aedba8050cf7bb5074558` and
  `839e31449ca487cf73887c44bdb38b48c6f74d7f` carried the Direct authority into
  Paid V3, selected the explicit `free_direct` terminal parser, and preserved
  the one-Worker-attempt contract. `main` and `origin/main` both reached the
  latter commit, and the named Staging Workers used its thin overlay image.
- Fresh report `72fcba4f-8f37-4f84-81c0-58b31ee5deec` completed Free and V4
  pre-admission. Its Direct Paid job
  `d98425c0-5433-4288-b271-de0102a6c770` carried the correct root marker and
  `max_attempts=1`, then failed earlier at progress 85 in `website_synthesis`.
- The current-task error event identified six optional/list prose paths that
  failed Chinese language validation. The one existing correction call
  returned, but its strict exact-path correction envelope was rejected; zero
  Deep AI rows, combined reports, or ready artifacts were produced.
- The failed report, job, order `bc9242f2-0822-44a5-b9ed-dbeb7848e11a`, pending
  refund, and pending artifact remain immutable historical state. This closed
  scope grants no replay, repair, deployment, model call, or new submission.

---

## 2026-08-02 - Paid V3 Direct first linear latency repair locally verified; attribution remained incomplete

- The approved local-only repair kept `free_direct` through website page
  analysis and website synthesis, forced those Direct model steps to one
  attempt, removed the 600-second public-source reserve gate for Direct,
  grouped visual evidence by canonical URL, and separated pending-refund copy
  from submitted-refund copy. It did not deploy, create a report/order, call a
  live model or payment platform, mutate historical data, or perform Git work.
- Focused tests passed, lint completed with no errors, and the third authorized
  canonical disposable PostgreSQL run passed its selected combined test with
  receipt `pg-20260802064751-f4b8d3e0` on loopback port `58000`, PostgreSQL
  tmpfs, zero skip, and normal run-owned container cleanup.
- A subsequent read-only completeness audit found two remaining default retry
  surfaces: page planning and provider-claim extraction. It also found that the
  combined regression composed leaf functions instead of exercising the real
  orchestration/readiness chain, so it could not prove every runtime carrier.
- The current source writes progress `85` before website synthesis and does not
  write `90` until synthesis, visual evidence, and AI-report persistence all
  finish. The public status surface omits `currentPhase`, so the displayed 85%
  cannot identify which operation is active or failed.
- This scope is superseded by an opt-in diagnostic-trace scope. The retained
  implementation and tests are local evidence only; no production usability
  or live root-cause resolution is claimed.

---

## 2026-08-02 - Paid V3 Direct trace completed; fresh 65% failure isolated

- The approved default-off diagnostic trace was implemented and later used by
  the fresh Paid job `c819b85a-1800-47bb-9ce2-d7eeb83f979c` on Staging Worker
  revision/image `0df7acd14c9a4a8c50f1bae782c5996e95bdfb25`.
- The trace and PostgreSQL state isolated the terminal boundary to the first
  page-analysis provider call: it ran for about 74 seconds and returned content
  that the JSON client could not parse. The job stopped at progress `65` with
  `attempts=1`, `max_attempts=1`; no page-analysis batch or combined artifact
  completed.
- The reconstructed four-page request was below the local prompt-truncation
  boundary. Current trace and persistence did not retain `finish_reason`, safe
  response length/usage, or a causal provider code, so the historical output's
  exact malformed-versus-truncated subtype cannot be recovered.
- Repository history confirmed that commit `fa5afbfd` changed Direct page
  analysis and website synthesis from bounded leaf attempts to one attempt.
  Invalid-JSON page-analysis failures also predated that commit. The confirmed
  regression is therefore loss of transient leaf recovery, not creation of the
  provider's malformed JSON.
- The failed report, job, paid order, pending refund, and pending artifact
  remain immutable historical state. No replay, repair, refund, deployment,
  configuration change, model call, or database write was performed during the
  diagnosis.
- This diagnostic scope is closed and superseded by a separate FROZEN repair
  scope. This history grants no implementation or external-action authority.

---

## 2026-08-02 - Paid V3 Direct transient leaf recovery repaired locally

- The user approved the exact six-production-file repair scope. The change
  keeps the Paid job authority at `max_attempts=1` and gives only the Direct
  page-analysis and website-synthesis provider leaves up to three identical
  calls for typed invalid/non-JSON, empty, output-truncated, timeout, network,
  `429`, or `5xx` failures.
- Parsed contract, semantic, language, identity, URL/evidence, `400/401/403`,
  configuration, and hard-deadline abort failures remain one-call failures.
  No alternate model/endpoint, prompt mutation, fallback, whole-job replay, or
  historical-state change was added.
- `AiClientError` now carries stable safe codes plus bounded provider status,
  finish reason, response-character count, and output-token count. Raw provider
  bodies are no longer retained on the error. Page-analysis preserves the final
  provider error as its cause; job normalization and the default-off Direct
  trace follow that bounded cause chain without logging model content.
- Final focused verification passed `150/150` tests across the AI client,
  page-analysis, website-synthesis, job-error, and trace files. The exact Paid
  processor boundary test passed `1/1` and proved job `maxAttempts=1` with
  Direct leaf `maxAttempts=3`.
- The complete processor test file retained one source-string slicing assertion
  failure that was already present in the pre-implementation red run; the new
  runtime boundary test in that file passes. It was not altered outside this
  scope.
- `npm run lint` completed with zero errors and six pre-existing warnings.
  `npm run build` completed successfully across all workspaces and the Next.js
  application.
- Production diff measured `+134/-38` lines; test diff measured `+212/-5`.
  Every per-file and aggregate budget passed, no unexpected path appeared, and
  all unrelated user-owned dirty files remained untouched.
- No PostgreSQL/Docker workflow, browser submission, live website/model call,
  deployment, payment/refund action, Git operation, or historical report/job
  replay was performed. Real Protected Staging usability remains unverified and
  requires separate authority.

---

## 2026-08-02 - Paid V3 Direct 65%-to-100% failure trace completed locally

- The approved default-off `OGC_PAID_V3_DEBUG_TRACE=1` console trace now covers
  every enumerated boundary from the first persisted 65% checkpoint through
  100% terminalization, including page checkpoints, visual degradation,
  locked/resume context, answer collection, provider discovery, public-source
  forensics, Direct incomplete dispositions, artifact readiness, terminal
  transaction writes, final failure persistence, and commercial reconciliation.
- The trace remains a no-throw observer. It does not alter model/provider calls,
  retries, concurrency, deadlines, progress, checkpoint meaning, report or
  artifact content, persistence order, settlement, refunds, email, or terminal
  outcomes. Exact secret-like error names/codes are suppressed in addition to
  prompts, content, URLs, headers, raw database values, messages, and stacks.
- Final focused verification passed `181/181` tests across the ten allowed test
  files. A final affected-file run passed `44/44`. `npm run lint` completed with
  zero errors and six pre-existing warnings. The full workspace build passed,
  and the final post-adjustment Web build also passed with 18 static pages.
- Independent test and read-only review were completed. The reviewer found no
  remaining P0/P1 issue. The remaining evidence gap is limited to separately
  injecting a few observer-only failure branches and to real PostgreSQL/browser
  behavior, which this scope expressly forbade.
- Every production-file budget passed. `processor.ts` measured approximately
  `+122/-49` for this scope after subtracting its scope-start `+4/-4` baseline;
  all other production files were within their recorded per-file limits, and
  the aggregate test diff remained below its approved budget.
- Existing unrelated dirty files and the prior approved transient-leaf repair
  were preserved. No PostgreSQL/Docker workflow, browser submission, live
  report/model call, deployment, payment/refund/email action, historical-state
  mutation, Git operation, commit, or push was performed. Real Protected
  Staging usefulness still requires separate deployment and fresh-report
  authority.

---

## 2026-08-02 - Paid V3 snapshot binding and one-attempt repair delivered; live acceptance separate

- The approved scope added schema V45 so exact standard Paid V3 jobs can bind
  their completed public-search market snapshots while preserving the exact V2
  contract and existing identity/freshness/ownership/cost guards.
- Paid V3 Direct page planning, page-analysis batches, and website synthesis
  were configured for one model attempt, and the real four-reference
  PostgreSQL regression was added.
- The change was committed and delivered to `origin/main` as
  `91ef797dc7509060187b6db90ffaa7f1c49249e3`.
- A separately observed successful report was executed on the earlier release
  `c5f4ae5791e35eb7b47833ef15131bb635ac91ec`; it proves the Staging Paid V3
  path but is not live acceptance of the later `91ef797` repair itself.
- This scope is closed. No further code, test, database, runtime, deployment or
  Git authority remains from it.

---

## 2026-08-02 - Paid V3 Protected Staging success evidence versioned

- The user approved a documentation-only closeout for the successfully opened
  private HTML report `646a6d93-ed3c-4d66-847f-93535f0075be`.
- PostgreSQL and release-ledger evidence proves payment `paid`, fulfillment
  `completed`, refund `not_required`, job progress `100` at attempt `1/1`, six
  successful pages, and one active `combined_geo_report_v3` artifact.
- The executed source was `c5f4ae5791e35eb7b47833ef15131bb635ac91ec`.
  Later `main` revision `91ef797dc7509060187b6db90ffaa7f1c49249e3`
  is explicitly outside this live-acceptance claim.
- Email remained `queued` with zero attempts and is excluded from the accepted
  path. The browser observation is user-supplied; independent browser QA was
  blocked by Vercel SSO and produced no screenshot.
- The durable record is
  `docs/operations/evidence/2026-08-02-paid-v3-direct-staging-success.md`,
  versioned by annotated evidence tag
  `paid-v3-staging-acceptance-v1.0.0`. It is not a package or Production
  release and grants no optimization, deployment, runtime, or historical-data
  authority.

---

## 2026-08-02 - Customer report presentation refinement and Protected Staging deployment

- The approved presentation-only scope refined the customer HTML report
  typography, spacing, card treatment, contrast, evidence-image overflow, and
  V4 divider/badge presentation without changing report data or business
  behavior. Focused component tests, lint, build, diff checks, and desktop/mobile
  preview review passed.
- Candidate `12670b3eab0b0fdae638cd1c02d822752271d15d` was committed locally,
  deployed as a Vercel Preview, and assigned to the fixed Protected Staging
  alias. Matching thin-overlay Staging free/deep Workers were started; Production
  was untouched.
- A user-created Paid V3 report subsequently proved report generation and
  artifact activation but exposed a separate delivery defect: the browser never
  automatically exchanged the completed order for report access, and Staging
  had no automatic Commerce consumer. This superseding task is not authorized by
  the presentation scope.
- The prior preview harness and unrelated dirty files remain preserved in the
  worktree. They are not authority for the new delivery repair.

---

## 2026-08-03 - Free report teaser page presentation refinement and Protected Staging redeployment

- The approved teaser scope refined the free report funnel page
  (`combined-geo-report-v4-teaser.tsx`): localized generation-time formatting,
  humanized dimension keys, single-score layout when dimension scores are
  absent, and structured list/ordered-list typography in the semantic outcome
  block. No data, copy, or business behavior changes. Teaser component tests
  (5/5), the four artifact test files (17/17), lint, and diff checks passed;
  desktop and mobile renders of a real Staging teaser report were reviewed.
- Candidate `2dc9278fe807c5812542df03cfcf334d0ca97855` was committed locally,
  deployed as Vercel Preview
  `https://open-geo-console-3g37b4xuq-itheheda-6857s-projects.vercel.app`, and
  the fixed Protected Staging alias `open-geo-console-staging-itheheda.vercel.app`
  was reassigned to it. Anonymous smoke: `/zh` -> SSO 302, `/api/scan` -> 401.
- Thin-overlay Staging free/deep Workers were rebuilt as
  `open-geo-console:staging-2dc9278-style-overlay-v1` (image id `d6a730bc9d35`,
  parent `staging-12670b3-style-overlay-v1`) and recreated; both containers run
  with `OGC_DEPLOYMENT_VERSION=2dc9278fe807c5812542df03cfcf334d0ca97855`.
  Rollback image `open-geo-console:staging-12670b3-style-overlay-v1`
  (`901be8795886`) remains available.
- Post-deploy `docker system df`: Images 32.17GB (8.091GB reclaimable), Build
  Cache 21.1GB; drive free space C: 4.4GB, E: 53GB. Production was untouched.

---

## 2026-08-03 - Paid HTML report hero and timestamp presentation fix

- User review of the generated deep report found the standalone HTML hero
  metadata column wrapping the URL mid-token, showing raw ISO timestamps, and
  wrapping the full revision UUID across five lines; appendix provenance
  timestamps were also raw ISO. The user approved fixing both within a
  concurrent addendum scope.
- Fix: `.answer-first-hero>.metadata-grid` now stacks vertically
  (`artifact-styles.ts`, shared by V3+V4 artifacts); V3 artifact formats hero
  generated time, appendix searched/cutoff times, and source observation times
  by report locale, and shows a shortened revision id with the full id in the
  tooltip; V4 artifact hero generated time is formatted likewise. V3 test
  expectation updated to the locale-formatted value. 17/17 artifact tests and
  15/15 related report tests passed; lint clean; the real Staging deep report
  (`c9acc3f9`) hero and appendix were screenshot-verified before and after.
