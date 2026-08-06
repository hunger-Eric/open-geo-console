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

## 2026-08-03 - Paid report browser/email delivery repair implemented locally; live acceptance superseded

- The approved delivery scope implemented secure same-browser completion
  access and a future-only Protected Staging email consumer. The retained local
  candidate is commit `8d903b349985b8e08879c95eb9f25cce621bf192` on
  `codex/delivery-root-fix`.
- Focused local verification, lint, build, compose validation, and the bounded
  disposable PostgreSQL commerce test passed before the external sequence.
- The sole authorized Vercel upload did not produce a usable new candidate, so
  no fixed-alias move, matching Worker/Commerce replacement, incident email
  pass, fresh report, Sandbox payment, or live usability acceptance followed.
- The user then requested a root-cause latency audit. Durable Staging job,
  transition, snapshot, query, and attempt evidence confirmed that two recent
  Paid V3 jobs both took about 14 minutes and repeatedly executed the same
  first three public-search query identities before a six-query refresh was
  cancelled by non-concurrency-aware per-query deadlines.
- This record is context only. It grants no authority to retry the prior
  deployment, send historical email, create a report or payment, modify report
  generation, or perform Git/Production actions. The next active scope must
  explicitly combine any retained delivery behavior with the separately
  approved minimal search optimization and one fresh acceptance path.

---

## 2026-08-03 - Paid V3 public-search duplication optimization implemented locally; Staging acceptance blocked

- The approved four-runtime-file optimization made Provider Q2/Q3 produce the
  complete six-query public-search fanout once, aligned the canonical timeout
  at 60 seconds, divided the 180-second search budget by concurrency waves, and
  added an overall search deadline.
- Resume now verifies the two standard snapshot identities before reuse. An
  older three-query checkpoint fails closed before any new adapter call rather
  than silently repeating its first three queries.
- Focused tests passed 63/63, the disposable PostgreSQL linear-flow test passed
  1/1 with zero skips, lint had zero errors, the full build passed, and an
  independent review found no blocking issue.
- The retained local candidate is
  `ae3f43664f62510a72da74b11519bb9b2a0e8136` on
  `codex/delivery-root-fix`.
- No Preview, Worker overlay, alias move, report, payment or email acceptance
  was performed. Release preflight stopped when Staging Workers and the fixed
  alias changed concurrently under an unattributed external deployment, so
  live acceptance of this candidate remains unproven.
- This archived record grants no authority to overwrite that concurrent
  deployment, retry external actions, or claim the report delivery/latency
  incident fixed in Staging or Production.

---

## 2026-08-03 - Paid report read-mode presentation committed locally

- The approved five-file page scope retained the existing Paid V3 read-mode
  navigation and folding, aligned V3/V4 report metadata presentation, updated
  the shared artifact styling, and admitted the exact CSP hash required by the
  committed inline read-mode script.
- The focused Paid V3 component test passed 11/11, scoped lint passed, the full
  workspace build passed, and the final diff contained only the five approved
  page files plus the scope records.
- The retained local commit is
  `40e7bc108db8cf53c97abd485f9e766304261c67` on
  `codex/delivery-root-fix`.
- `apps/web/.tmp-preview/` remains untracked and untouched. No push, merge,
  deployment, report generation, payment, email, Production action, or cleanup
  was performed.
- This scope is closed. It grants no authority for the new Free/Paid
  information architecture or GEO article generation work.

---

## 2026-08-03 - Free/Paid report progression and GEO article implemented locally

- The approved report scope reordered the existing Free V4 teaser and Paid V3
  HTML into a progressive website-context -> buyer-question -> source/gap ->
  diagnosis/action reading flow, while preserving the same report lineage and
  existing technical evidence.
- Free retains all three question titles but exposes only Q1, its first three
  sources and one core gap. Paid retains Q1-Q3, full sources, technical
  evidence, actions and a Paid-only GEO article example with writing rationale.
- The article path makes one bounded model attempt and falls back to a
  deterministic evidence-grounded article without changing fulfillment.
- Focused tests passed 48/48, the selected disposable PostgreSQL Paid V3
  linear-flow test passed 1/1 with zero skips, scoped lint and the full build
  passed, and `git diff --check` passed. Full lint remains blocked only by the
  pre-existing excluded `apps/web/.tmp-preview/debug-readiness.ts` file.
- These changes remain uncommitted in the worktree because the user asked to
  switch away from the expired MiMo model before the already authorized commit
  and Protected Staging deployment. This archived record is context only and
  does not authorize model/runtime edits or external calls.

---

## 2026-08-03 - SenseNova Token Plan compatibility admission completed with search gap

- The user approved one authenticated model-list request, one structured JSON
  probe and one native-search/source probe, with the supplied credential stored
  only in the existing ignored local/Staging configuration.
- The account returned four model IDs: `deepseek-v4-flash`, `glm-5.2`,
  `sensenova-6.7-flash-lite` and `sensenova-u1-fast`. The approved priority
  selected `deepseek-v4-flash`; all three ignored generic `OGC_AI_*`
  configurations now use the SenseNova Token Plan endpoint and that model.
- The structured JSON probe returned HTTP 200 with the standard OpenAI
  `choices[0].message.content` envelope, `finish_reason=stop`, valid JSON and
  the exact requested object.
- The single MiMo-compatible native `web_search` probe returned HTTP 400 and no
  provider URL annotations. No retry or alternate-model probe was performed.
- The candidate is admitted for report analysis/writing but cannot replace the
  MiMo public-search/source surface by itself. MiMo-specific search and Report
  V4 rollback variables, running Workers, database authority and deployed
  services were unchanged.
- This admission is closed. It authorizes no production-source edit, provider
  authority mutation, Git action or deployment.

---

## 2026-08-03 - AnySearch grounding implemented locally; deployment stopped at rights evidence

- Commit `be3c032e0a73b6a13b80b6901617a4203e7881c6` added the approved
  AnySearch REST adapter, AnySearch-grounded SenseNova answer provider,
  compile-time runtime/certification wiring, launcher validation and secret
  redaction together with the previously approved report redesign and GEO
  article presentation.
- Focused AnySearch tests passed 25/25, the full workspace build passed, and
  the disposable Paid V3 Direct PostgreSQL regression passed 1/1 with no skip.
  The existing article-project AnySearch key was copied only into ignored
  Open GEO Console runtime configuration and was not committed or disclosed.
- The authenticated certification, authority activation and deployment were
  not executed. AnySearch's current public Terms/Privacy views did not return
  legal text and their public legal endpoints returned HTTP 404, so commercial
  storage/display rights for URL/title/snippet remained ambiguous under the
  approved stop condition.
- The local commit was not pushed because a branch push could trigger an
  uncertified Preview deployment. `apps/web/.tmp-preview/` remained untracked
  and untouched. This archived scope grants no new external-call, Git,
  deployment or authority permission.

---

## 2026-08-03 - One-pass local AnySearch/SenseNova report diagnostic completed

- The user approved one fault-first local diagnostic at commit
  `be3c032e0a73b6a13b80b6901617a4203e7881c6`: three fixed neutral buyer
  questions, exactly three AnySearch calls, up to five SenseNova calls, no
  retry, no database, crawl, deployment, certification or customer mutation.
- Run `68327506cf574956b344c7e92f307e0e` completed with three AnySearch HTTP
  200 responses and four successful SenseNova operations (three grounded
  answers plus one GEO article). Ranked result counts were 10/9/10; selected
  source counts were 2/3/9. Every selected URL belonged to its same-call
  AnySearch result set and no invented URL was detected.
- DSV appeared in none of the three selected source sets or answers. Q3
  selected nine sources, heavily concentrated on one domain, and generated
  inline numbered-source prose including a zero-based `来源0`, exposing source
  diversity and customer-readable citation-mapping problems.
- The existing Paid V3 combined resolver could not accept the three already
  generated answers without a validated production checkpoint and would have
  redispatched provider calls. The diagnostic stopped that branch rather than
  retrying or inventing a parallel production schema.
- A local fixture-bannered Paid V3 preview was rendered. Browser QA produced
  desktop (1440 viewport) and mobile (390 viewport) screenshots with no
  non-file browser requests. High-impact findings: TOC anchors target closed
  `details` sections without opening them, so the main report remains unreadable;
  and the DSV target URL is visually combined with Example/Overview/V3 fixture
  content in the body, which remains easy to misread despite the banner.
- Mobile TOC width overflow, hidden target-absence explanation, Q3's nine-card
  source density and unloaded file-mode technical evidence image were retained
  as medium visual risks. Desktop document width itself did not overflow, the
  banner was prominent, and the intended section order remained visible.
- Redacted artifacts are retained only under ignored directory
  `.data/local-diagnostics/anysearch-sensenova-report-68327506cf574956b344c7e92f307e0e/`.
  Secret/content scans passed. No fix, retry, push, deployment or external
  action followed; this scope is exhausted and grants no repair authority.

---

## 2026-08-03 - Paid V3 editorial template restored locally

- The approved two-file production scope recomposed the prospective Paid V3
  HTML into the retained deep-green-rail and warm-paper editorial template,
  with visible `00-08` progression from website facts through answers,
  evidence, target absence, technical diagnosis, actions, GEO article and
  methodology.
- All paid technical evidence and GEO article rationale remain present. The
  customer-visible source ordinal display now maps zero-based provider
  references to one-based displayed rows without rewriting persisted answers.
- The existing canonical readiness contract remains unchanged. The component
  preserves each question's source-order evidence chain in HTML while CSS
  presents the intended `02 answers -> 03 evidence -> 04 absence` progression.
- Focused tests passed 34/34, scoped lint passed, the full workspace build
  passed, and `git diff --check` passed.
- Independent in-app-browser QA passed on desktop and 390px mobile after one
  scoped wrapping repair: 9/9 TOC links worked, no horizontal overflow,
  `<details>` dependency or console error remained, and final P0/P1/P2/P3
  findings were none.
- Local preview evidence is retained only under ignored directory
  `.data/local-diagnostics/template-restoration-20260803/` and records zero
  model, search, crawl, database and payment calls. No Git operation,
  deployment or customer-data mutation occurred. This scope is closed.

# 2026-08-03 — Superseded renderer-only content-focus scope

- Status: superseded before approval; no production implementation was
  authorized under that scope.
- Reason: read-only first-principles tracing confirmed that the active Direct
  source-analysis prompt and GEO-article prompt also inject task/rubric voice
  into customer-visible prose. The replacement FROZEN scope includes those two
  prompt surfaces and makes full technical/screenshot preservation explicit.
- The current template-restoration working-tree baseline remains unchanged.


# 2026-08-03 — Completed Paid V3 content focus and technical-evidence preservation

## Approved scope record

Status: `APPROVED`

Approved by the user on 2026-08-03 for the exact allowlist and behavior below.

## Objective

Remove prompt-shaped, teacher-like and report-production narration from the
prospective Paid V3 customer report while preserving the complete report chain,
all website/technical diagnosis, and every ready visual-evidence screenshot.

The customer reading order remains:

`website facts -> buyer answer -> source contribution -> target absence/gap ->
website and technical diagnosis -> actions -> publish-ready GEO article ->
method appendix`.

The change must address both confirmed sources of the problem:

1. fixed renderer copy currently explains how the report should be read; and
2. the active Direct analysis and GEO-article prompts currently instruct the
   model to explain the analysis/writing task, allowing that rubric voice to
   become customer-visible prose.

Production edits are authorized only within this exact allowlist and behavior.

## Root-cause baseline

- Repository: `E:/project/open-geo-console`.
- Branch / HEAD: `codex/delivery-root-fix` at
  `be3c032e0a73b6a13b80b6901617a4203e7881c6`.
- The immediately preceding approved Paid V3 template restoration remains
  uncommitted and is the visual/behavioral baseline for this scope.
- Existing modified baseline files that must be preserved:
  - `apps/web/src/components/combined-geo-report-v3-artifact.tsx`
  - `apps/web/src/components/combined-geo-report-v3-artifact.test.tsx`
  - `apps/web/src/report/artifact-styles.ts`
  - `design-qa.md`
  - `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md`
  - this scope file.
- User-owned untracked `apps/web/.tmp-preview/` is excluded and must remain
  untouched.
- Confirmed first divergence in the active AnySearch/SenseNova Direct path:
  - `invokeFreeV4DirectAnalysis` asks the model to `Analyze` and `Explain why`;
    its `summary`, `observations` and `recommendations` are rendered directly.
  - `generateGeoArticleExample` asks for an article and an explanation of why
    every section is written that way; its fallback also describes itself as an
    example and says what an article should do.
  - the renderer adds further report-guide, reading-order and method narration.
- Eliminated cause: the current template-restoration diff did not delete the
  technical findings, page table, dimension scores, model findings, page-type
  analysis, evidence quotations, evidence URLs, or ready evidence-image loop.
- The current fixture-only `file://` preview contains one ready screenshot tag,
  but its `/api/reports/.../evidence/...` URL cannot resolve from a local file.
  That preview is not evidence that production screenshots were deleted.
- Literal hidden-prompt leakage is not confirmed. Existing customer-prose
  checks already reject internal phrases such as system prompt, raw provider
  JSON and tool-call arguments. The confirmed defect is prompt/rubric voice in
  otherwise valid customer prose.

## Exact production allowlist

- `apps/web/src/worker/report-v4-free-teaser.ts`
  - Change only the shared Direct source-analysis system text used by Free Q1
    and reused for Paid Q2/Q3.
  - Require customer-visible fields to state the business conclusion directly:
    what the sources establish, what role each source played, whether the
    target appeared, the target's concrete gap, and the next action.
  - Prohibit task/method narration such as describing the analysis, the report,
    the supplied payload, the prompt, the evidence contract, or what the reader
    will see next.
  - Preserve the exact JSON shape, evidence-handle rules, target identity,
    one-call behavior, failure-to-incomplete behavior and receipts.
- `apps/web/src/worker/geo-article-example.ts`
  - Make the model-owned title, introduction, sections and FAQ a publish-ready
    customer article, with no self-description as an example/report and no
    narration about how an article should be written.
  - Keep `rationale` as a separate structured field that explains the evidence
    and business reason for each section; it must not leak into article prose.
  - Apply the same separation to the deterministic fallback.
  - Preserve the one-call limit, timeout, fallback, output schema, evidence-ref
    validation, locked buyer questions and all factual bounds.
- `apps/web/src/components/combined-geo-report-v3-artifact.tsx`
  - Replace Section 00 reading instructions with a compact conclusion selected
    only from already persisted answer, diagnosis, action and technical fields.
  - Remove fixed procedural narration from Sections 01-04 and 06; each section
    must enter its actual customer findings directly.
  - Keep the complete GEO article uninterrupted, followed by one consolidated
    writing-strategy block containing every existing rationale/evidence ref.
  - Move generation mode, limitations, provenance and method statements into
    Section 08.
  - Preserve all three buyer questions, complete answers, source evidence,
    target gaps, actions, article content and methodology.
  - Preserve the complete Section 05 technical surface: every deterministic
    finding, page row, dimension score, model finding and recommendation,
    evidence quotation, evidence URL, ready evidence image, and page-type
    analysis. Do not slice, summarize, hide or drop these values.
- `apps/web/src/components/source-selection-diagnosis-section.tsx`
  - Keep customer-substantive source reasoning in Section 03: dominant pattern,
    target position, priority breakthrough, per-source contribution, observable
    factors, target comparisons and target actions.
  - Remove visible purpose/method preambles and move limitation/trust copy to
    Section 08 without changing diagnosis data, source order or claims.
- `apps/web/src/report/artifact-styles.ts`
  - Style the conclusion, consolidated writing strategy and methodology notes
    within the restored Paid V3 visual system.
  - Keep technical evidence cards and screenshots clearly visible, captioned
    and responsive rather than visually burying them in the long section.
  - Preserve the deep-green rail, warm-paper document, 00-08 structure and all
    Free/other artifact styles.

No other production/runtime file is allowed.

## Exact test, fixture and evidence allowlist

- `apps/web/src/worker/report-v4-free-teaser.test.ts`
  - Assert the Direct analysis prompt requests direct customer conclusions and
    contains no instruction to narrate the analysis/report process.
  - Preserve the exact call count, handle binding and incomplete fallback tests.
- `apps/web/src/worker/geo-article-example.test.ts`
  - Assert the prompt separates publish-ready article prose from rationale.
  - Assert model and fallback article bodies contain no example/report/writing-
    instruction narration while rationale remains complete.
- `apps/web/src/components/combined-geo-report-v3-artifact.test.tsx`
  - Prove conclusion-first copy, no fixed procedural narration, complete article
    before writing strategy, and method content only in Section 08.
  - Prove every technical value and every ready evidence image is still present.
- `apps/web/src/components/source-selection-diagnosis-section.test.tsx`
  - Prove substantive source reasoning remains and method boilerplate is absent.
- `apps/web/src/report/combined-artifact-readiness.test.tsx`
  - Prove all existing required values and ready evidence assets remain in the
    canonical HTML and the readiness contract still passes.
- `apps/web/src/components/combined-artifact-fixtures.ts`
  - Fixture-only additions if needed to represent multiple technical findings,
    source quotations and ready screenshot assets in deterministic QA.
- `design-qa.md`
  - Append a separated content-and-technical-preservation QA result; preserve
    all earlier history.
- Ignored evidence only under
  `.data/local-diagnostics/paid-report-content-focus-*`:
  - fixture-only HTML and desktop/mobile screenshots;
  - evidence images must be locally resolvable in the QA capture rather than
    broken `file://` API URLs;
  - zero model, search, crawl, database, payment or email calls.
- Scope authority/history only:
  - `docs/ACTIVE-CHANGE-SCOPE.md`
  - `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md`

No new production component, abstraction, dependency, route, schema, config,
tracked screenshot or report contract is allowed.

## Required customer behavior

1. Model-owned customer prose starts with the finding, not the task. It must not
   say that it is analyzing, explaining, demonstrating, generating, following a
   prompt, using supplied input, or teaching the reader how the report works.
2. Direct analysis follows `conclusion -> source contribution -> target gap ->
   action`. Honest uncertainty remains allowed, but it must describe the
   observed business limitation rather than the analysis process.
3. The GEO article title, introduction, body and FAQ read as a page the customer
   could publish after review. Only the separate post-article writing-strategy
   block explains why sections were written that way.
4. Section 00 leads with an evidence-derived conclusion. Section 01 starts with
   website facts, Section 02 with the first buyer answer, Section 03 with source
   evidence, and Section 04 with the target conclusion/gap.
5. Section 05 remains a full website visibility and technical diagnosis. It
   retains all technical arrays and text, and renders every ready evidence asset
   associated with each finding/citation. No `slice`, collapsed omission or
   single-image cap may be introduced.
6. Evidence screenshots have a visible caption/source and fit desktop/mobile
   width without clipping. A deterministic QA preview must display at least one
   real fixture image successfully; a broken image icon is a failed check.
7. Section 06 retains the full roadmap. Section 07 retains the complete article,
   FAQ and all rationale. Section 08 retains provenance, search/model metadata,
   coverage, limitations, generation mode and non-causality boundaries.
8. The visible and semantic 00-08 order, all 9 TOC anchors, mobile reflow and
   no-horizontal-overflow guarantee remain unchanged.
9. Stored reports, source ordering, access, readiness, locale, model selection,
   fulfillment and all commercial behavior remain unchanged.

## Forbidden behavior

- No change to AnySearch retrieval, SenseNova transport/model selection, answer
  source selection, call counts, retries, timeouts, evidence handles, receipts,
  checkpoints, Worker orchestration, crawler, database, schema or report shape.
- No change to the inactive deferred semantic-review path or its large final
  synthesis contract; the scoped prompt fix is limited to the currently selected
  AnySearch/SenseNova Direct path plus its GEO-article call.
- No new validator that could reject a structurally valid provider response and
  turn a completed analysis/report into an incomplete or failed one.
- No removal, summarization or relocation out of Section 05 of technical facts,
  screenshots, quotations, URLs, page rows, findings or page-type analyses.
- No new model call and no renderer-authored unsupported business claim.
- No change to payment, order, Webhook, entitlement, credit, refund, email,
  redirect, access control, customer PDF or historical reports.
- No deployment, Docker, Vercel, Staging, Production, Git commit/push/merge or
  branch/worktree operation.
- No edits or cleanup under `apps/web/.tmp-preview/`.
- No visual redesign beyond the already approved restored template.

## Incremental diff budget

Measured from the working-tree snapshot at creation of this revised FROZEN
scope:

- Direct analysis prompt: at most 24 changed production lines.
- GEO article prompt and deterministic fallback: at most 90 changed production
  lines.
- Paid V3 artifact component: at most 220 changed production lines.
- Source-selection diagnosis component: at most 100 changed production lines.
- Paid V3 scoped styles: at most 110 changed production lines.
- Aggregate production diff for this scope: at most 544 changed lines.
- Tests and deterministic fixture: at most 320 changed lines total.
- `design-qa.md` plus scope/history closeout: at most 200 changed lines total.

Exceeding a production limit is a stop-and-report condition.

## Acceptance checks

1. Focused Direct analysis, GEO article, Paid V3 component, source-selection and
   combined-readiness tests pass with no skip.
2. Tests capture the exact outbound prompt text and prove customer fields are
   requested as direct findings while rationale remains a separate field.
3. Static rendered-HTML assertions prove every fixture technical value and every
   ready evidence asset remains present, and article prose precedes rationale.
4. Scoped lint passes for all changed production/test files.
5. The full workspace production build passes.
6. `git diff --check` passes; the incremental diff stays inside this allowlist
   and budget; the preceding template-restoration work remains intact.
7. A zero-external-call fixture preview is inspected at desktop and 390px mobile:
   - Sections 00-07 contain findings/content rather than task instructions;
   - Section 05 visibly contains the complete technical groups and at least one
     successfully loaded evidence screenshot with source/caption;
   - the full article is uninterrupted and writing strategy follows it;
   - method/trust/limitation content appears in Section 08;
   - 9/9 TOC links work, no horizontal overflow and no console errors.
8. `design-qa.md` may say `final result: passed` only when no P0/P1/P2 content,
   technical-preservation, broken-image or responsive finding remains.

## Stop conditions

- A required conclusion is not already present in persisted Paid V3 data.
- Correcting the customer tone requires a report schema/validator/version change
  or any additional provider call.
- A required fix needs a production file outside the five-file allowlist.
- A ready production evidence asset is missing before rendering, which would be
  a generation/storage issue rather than this presentation scope.
- A required customer-facing prompt fix is found only in the inactive deferred
  semantic-review path; that is a separate approval decision.
- Browser QA cannot obtain a fresh fixture capture or finds an unresolved P0/P1/
  P2 within budget.
- Any step would require an external provider call, database mutation,
  deployment, Git action or historical-data mutation.

Implementation is authorized under the user's explicit approval of this exact
revised scope.
## Closeout result

- Customer-visible Direct analysis and GEO-article prompts now request findings
  and publish-ready prose instead of task or writing-process narration.
- The Paid V3 renderer now leads with a persisted-data conclusion, keeps the
  complete article before one consolidated writing-strategy block, and moves
  method, limitations, provenance and generation mode into Section 08.
- Section 05 still renders every deterministic finding, page row, dimension
  score, model finding, recommendation, evidence quotation, source URL, ready
  evidence image and page-type analysis. The deterministic fixture proves two
  ready evidence assets render together.
- Focused tests passed 54/54; scoped lint passed with no output; the full
  workspace build compiled successfully and generated 18/18 static pages;
  `git diff --check` passed.
- Independent Codex in-app-browser QA passed at 1440x1024 and 390x844 with
  9/9 TOC anchors, two nontrivial loaded evidence images, no horizontal
  overflow, no console errors and no P0/P1/P2 findings.
- Evidence is retained under
  `.data/local-diagnostics/paid-report-content-focus-20260803/` with a receipt
  recording zero model, search, crawl, database, payment and email calls.
- No Git operation, deployment, Docker action or customer-data mutation
  occurred. This scope is closed.

---

## 2026-08-03 - Paid report presentation commit completed locally

- The approved local-commit-only scope created exactly one commit,
  `95e7fb296f6a308b92e4279f9d076a745e22b888`, with parent
  `be3c032e0a73b6a13b80b6901617a4203e7881c6` and message
  `feat: restore paid report template and content focus`.
- The commit contains exactly the 14 approved tracked paths. Cached diff and
  whitespace checks passed; the only remaining canonical-worktree status is
  the preserved user-owned untracked `apps/web/.tmp-preview/`.
- No push, merge, rebase, branch/worktree mutation, Docker action, deployment,
  report, payment or email occurred under the Git scope.
- That scope is closed. Protected Staging deployment is governed only by the
  new active FROZEN scope.

---

## 2026-08-03 - Paid report candidate deployed to Protected Staging Gates 1-3

- The user approved the exact deployment-only scope for candidate
  `95e7fb296f6a308b92e4279f9d076a745e22b888`.
- One Vercel Preview was created: `dpl_J71XhBtERHciEMEd8DjWNc8SWPYM`.
  Independent metadata inspection proved READY Preview identity and exact
  `gitCommitSha` / `ogcGitSha` equality with the candidate.
- One thin source-overlay Worker image was built:
  `open-geo-console:staging-95e7fb2-paid-report-overlay-v1`, image
  `sha256:95a62dcdfc1f91ff834e67d642609c682e79d9a550660073a6ef374bcfb4e83e`.
  No dependency, browser or operating-system rebuild occurred.
- Only the Staging Free and Deep Workers were recreated. Both run the candidate
  SHA with the Staging profile, correct realtime tier and restart count zero.
  Queue counts were zero before and after replacement.
- The fixed Protected Staging alias was moved once to the candidate Preview.
  Authenticated browser QA rendered the Chinese landing page with no page
  console errors; an authenticated catalog read returned HTTP 200,
  `enabled=true`, `mode=test` and CNY/USD/HKD prices.
- Thirteen bounded database counts for reports, jobs, crawl/model/search rows,
  orders, payments, refunds, emails and artifacts were identical before and
  after Gate 3. No report, crawl, model/search operation, order, payment,
  refund, email or customer artifact was created by deployment smoke testing.
- E: free space changed from 55,110,230,016 to 55,096,504,320 bytes. The prior
  accepted Web deployment and Worker image remain available as rollback; no
  cleanup was performed.
- Production, the Commerce service, historical data, Git remotes/main,
  `apps/web/.tmp-preview/**` and the read-mode worktree were untouched.
- Independent read-only review accepted Gates 1-3. Terminal status:
  **Protected Staging deployment completed; real flow not yet accepted.**
- A fresh manually submitted report/payment/email path is Gate 4 and was not
  authorized or performed by this scope.

---

## 2026-08-03 - Unified provider profile design completed

- The user approved a single canonical `OGC_PROVIDER_PROFILE` selector with
  two initial complete capability bundles: `mimo_native` and
  `sensenova_anysearch`.
- The design maps general analysis, V4 structured operations, public search,
  grounded buyer answers, source diagnosis and GEO article generation through
  one immutable startup-resolved bundle. Secrets remain separate data inputs
  and cannot independently select a route.
- Missing/incompatible configuration, conflicting legacy routing variables or
  an inactive search authority fails Worker startup before job claim. Runtime
  capability probes and automatic provider fallback are prohibited.
- Existing MiMo, SenseNova and AnySearch clients, prompts, report contracts,
  persistence, orchestration, payment and historical reports remain outside
  the change. Existing/in-flight jobs keep their immutable provider/model
  snapshots.
- The design is recorded at
  `docs/superpowers/specs/2026-08-03-unified-provider-profile-design.md`.
  Implementation, runtime activation, deployment and a fresh report remain
  separately scoped work.

---

## 2026-08-03 - Unified provider profile implemented locally

- The user approved the final audited FROZEN allowlist. Local implementation
  completed on branch `codex/delivery-root-fix` at unchanged baseline HEAD
  `24a2619d0e56450bae0305a889b1fd72aa95224d`; no Git state change was made.
- `OGC_PROVIDER_PROFILE` is the only routing selector. `mimo_native` keeps MiMo
  native search, while `sensenova_anysearch` binds SenseNova
  `deepseek-v4-flash` to AnySearch without runtime fallback.
- Worker startup now validates the complete selected profile before database
  preparation, resolves the exact active public-search authority after
  connectivity, and publishes one immutable provider bundle before presence,
  batch drain or claim.
- Existing clients, prompts, report contracts, persistence and orchestration
  were retained. No schema, task-state, payment, email or UI behavior changed.
- Measured change was 929 production/configuration lines, 47 locked-profile
  JSON lines, 502 test lines and 78 reader-projection lines beyond the scope
  refresh, all within the approved budgets. All 45 changed paths matched the
  allowlist and the non-test secret-pattern scan was clean.
- Deterministic verification passed: 20 files / 266 tests, scoped ESLint with
  zero errors, `git diff --check`, and the complete workspace/Next.js build.
  Full ESLint remained blocked only by 17 pre-existing errors in excluded
  `apps/web/.tmp-preview/debug-readiness.ts`; that directory was untouched.
- PostgreSQL fixture tests, real provider/search/database calls, Docker,
  deployment, Git writes and report generation were not run or performed.
  Terminal status: **local implementation and automated verification complete;
  Git and Protected Staging acceptance pending separate authorization, with
  acceptance requiring exactly one fresh report.**

---

## 2026-08-03 - Unified provider profile release stopped before push

- The user approved the complete Git-and-Protected-Staging scope and explicitly
  accepted the documented Staging-only AnySearch legal risk.
- Git candidate packaging succeeded locally: one exact 46-path commit
  `62352e8bb0397e8edd7d3e00fdcc54456c9874f4`, parent
  `24a2619d0e56450bae0305a889b1fd72aa95224d`, message
  `feat: unify provider profile routing`. Cached whitespace and secret checks
  passed. The commit was not pushed.
- Read-only Staging preflight passed at schema 45 with zero claimable,
  expired-recoverable and exhausted-terminalizable jobs. No AnySearch authority
  existed; the exact active MiMo rollback authority remained intact.
- Ignored Staging source configuration was switched to
  `sensenova_anysearch` and generated once with the approved PrepareOnly path.
  The merged runtime contained SenseNova/AnySearch data, no nonblank stale MiMo
  V4 routing, and no provider variables in the commerce projection. Existing
  running Free/Deep containers were not recreated and remained healthy on
  rollback image `95a62dcd...`, restart count zero.
- The first branch-scoped Vercel Preview variable upsert failed with exit code
  1 while saving `OGC_PUBLIC_SEARCH_ADAPTER`; Vercel CLI 56.4.1 returned no
  attributable platform error. The required single read-only follow-up listed
  zero variables for Preview branch `codex/delivery-root-fix`, proving no
  partial remote configuration was retained.
- The release stopped immediately. No signing secret was generated; no
  AnySearch/SenseNova call, certification artifact, authority install/activate,
  push, Preview, Docker build/recreation, alias move, report, job, order,
  payment, refund or email occurred. Production and all historical data were
  untouched.
- Terminal status: **candidate committed locally; release blocked before push
  by the branch-scoped Vercel environment-variable write path. A new FROZEN
  recovery scope is required before any retry or alternative configuration.**

---

## 2026-08-03 - Unified provider profile recovery stopped before push

- Recovery candidate `ac3fe3c5a99e3e1e2b4983e1f60d5e9485564f4b` passed its
  read-only gates: clean canonical worktree, absent remote task branch, empty
  target Preview-variable set, Staging marker, schema 45, safe queue counts,
  and complete `sensenova_anysearch` runtime configuration.
- The mandatory first Vercel write, limited to the target Preview branch and
  `OGC_PUBLIC_SEARCH_ADAPTER=anysearch`, failed once with exit code 1:
  `Project open-geo-console does not have a connected Git repository.`
- One name/target-only follow-up confirmed the target branch still had zero
  Preview variables. No signing secret, provider call, certification artifact,
  authority row, push, Preview, Docker action, database write or business data
  action occurred.
- The secret-free terminal ledger is retained only in ignored local storage at
  `.data/protected-staging-release-ledger/ac3fe3c5a99e3e1e2b4983e1f60d5e9485564f4b.json`.
- Terminal status: **blocked before push. Connecting the Vercel project to Git
  or choosing a non-Git Preview path requires a new FROZEN scope.**

---

## 2026-08-03 - Canonical manual Vercel deployment mode documented

- The user explicitly requested a durable operator note after repeated
  deployment-path confusion and approved a documentation-only FROZEN.
- `docs/PROTECTED-STAGING-OPERATIONS.md` now states at the top that the current
  Web release mode is one manual Vercel Preview from the exact canonical
  candidate checkout, using the proven command skeleton
  `vercel deploy --yes --meta ogcGitSha=<candidate-full-sha>`.
- The runbook distinguishes `.vercel/project.json` local project linkage from
  a Vercel Git-provider `link`, requires live `link` / `gitSource` inspection,
  and forbids inferring branch-scoped variables, Git-triggered Preview, or a
  Git connect/disconnect action under the current manual mode.
- It records Git push and Vercel deployment as separately authorized actions,
  requires exact `gitCommitSha` / `ogcGitSha` and Web/Free/Deep SHA agreement
  before alias movement, and clarifies that `link=null` does not mean the
  project has never been deployed.
- Reader-facing change measured `+47/-0`, within the approved `+70/-0` budget.
  The section was reread, required invariants were found, `git diff --check`
  passed, and no runtime, Git, Vercel, Docker, database, provider, report, or
  other external action occurred.
- Terminal status: **deployment-mode lesson recorded locally in the mandatory
  runbook; documentation remains uncommitted and unpushed.**

---

## 2026-08-03 - Unified provider profile Staging release rolled back at Gate 2

- Approved scope executed in gate order for candidate
  `ac3fe3c5a99e3e1e2b4983e1f60d5e9485564f4b` on branch
  `codex/delivery-root-fix`: Gate 1 preflight passed (staging marker,
  schema 45, zero claimable/running jobs, disk 52 GiB, rollback identities
  recorded); the branch was pushed once, non-force, creating
  `origin/codex/delivery-root-fix` at the candidate SHA.
- Readiness checks: `eslint src` 0 errors (full lint is blocked only by the
  forbidden `apps/web/.tmp-preview` leftover); 13 stale schema-version-chain
  test failures proven pre-existing on deployed baseline `95e7fb2`; 2
  PowerShell-parser tests passed 22/22 in isolation after full-suite load
  timeouts; monorepo build passed.
- Exactly one manual Preview was created:
  `dpl_52H7ciEE5UjybEHrJWmJRWpWRweK`
  (`https://open-geo-console-mcnrorp7g-itheheda-6857s-projects.vercel.app`),
  READY, target preview, project/team verified, `ogcGitSha` and
  `githubCommitSha` both equal the full candidate SHA (`gitDirty=1` reflects
  the disclosed uncommitted documentation).
- Gate 2 built the approved thin source-overlay image
  `open-geo-console:staging-ac3fe3c-provider-profile-overlay-v1`
  (`sha256:ae9dca41f2dc72bd61ade5c32022e419b7c91d88916160278e2398e70af9b6c1`,
  revision label = candidate SHA, key source files hash-verified against the
  canonical worktree) and recreated only the two Staging Workers.
- Both recreated Workers fail-closed at startup readiness:
  `getActivePublicSearchSurfaceAuthority` found no active AnySearch
  authority for environment/surface/version/`zh-CN`/`CN`. The AnySearch
  Staging authority installation was explicitly outside this scope, so the
  recorded rollback restored both Workers to
  `sha256:95a62dcdfc1f91ff834e67d642609c682e79d9a550660073a6ef374bcfb4e83e`.
- The rollback image also fails-closed under the current merged Staging
  environment: its `95e7fb2` code rejects
  `OGC_REPORT_V4_MODEL_PROFILE_ID=report-v4-sensenova-deepseek-v4-flash-v1`,
  which the environment now selects. Both Workers were therefore left
  stopped on the rollback image identity. The previously running Workers
  had survived only because their container environment was frozen before
  the `sensenova_anysearch` selection was written.
- The fixed Protected Staging alias was never moved; the fixed site still
  serves rollback Web deployment `dpl_J71XhBtERHciEMEd8DjWNc8SWPYM`.
  No report, crawl, model call, order, payment, refund, email, database
  write, authority change, or production action occurred. Docker delta:
  +1 overlay image, images 32.19 GB -> 32.2 GB, E: free space unchanged at
  52 GiB.
- Terminal status: **rolled back at Gate 2; deployment blocked. Staging now
  has no runnable Worker under the current merged environment: the candidate
  requires an installed and active AnySearch Staging authority, and the
  rollback image requires the pre-`sensenova_anysearch` environment. A new
  FROZEN scope must choose between installing the AnySearch Staging
  authority (candidate path) or reverting the Staging environment to the
  MiMo profile (rollback path).**

---

## 2026-08-03 - Checkout entry restored on fixed Protected Staging (Preview env repair)

- Root cause established read-only: the candidate's
  `getRecommendationProductAvailability` requires `OGC_PROVIDER_PROFILE`
  and a resolvable AnySearch runtime; the Vercel Preview environment lacked
  `OGC_PROVIDER_PROFILE`, `OGC_PUBLIC_SEARCH_ANYSEARCH_BASE_URL`, and
  `OGC_PUBLIC_SEARCH_ANYSEARCH_API_KEY`, so `/api/commerce/catalog` returned
  `enabled=false`, the checkout form never rendered, and the
  `href="#checkout"` "Unlock full report" anchors appeared dead.
- Exactly three Preview-scoped environment writes were made via the Vercel
  API (upsert, encrypted, values copied from the local merged staging
  environment; no Production variables, no deletions, no branch scoping).
- One new manual Preview of the unchanged candidate:
  `dpl_EetcWT3cUjcwa9yqr2fCuKR3RX9j`
  (`https://open-geo-console-lo19gsn1j-itheheda-6857s-projects.vercel.app`),
  READY, preview target, `ogcGitSha` and `githubCommitSha` equal to
  `ac3fe3c5a99e3e1e2b4983e1f60d5e9485564f4b`.
- The fixed Protected Staging alias was moved once to
  `dpl_EetcWT3cUjcwa9yqr2fCuKR3RX9j` (API-verified). Anonymous `/zh` and
  `/api/commerce/catalog` still return 302 SSO protection. Both Staging
  Workers remained untouched on candidate image `sha256:ae9dca41...`,
  restart count zero.
- The interactive `vercel env add` path was attempted first and aborted at
  its TTY Git-branch prompt without creating any variable; the writes were
  completed via the project env API instead.
- No payment, order, refund, email, report submission, crawl, model call,
  database write, Git mutation, Worker action, or Production change
  occurred. The authenticated catalog confirmation and checkout retry are
  the user's browser-side verification.
- Terminal status: **fixed-site checkout entry repair deployed; awaiting
  the user's authenticated confirmation that the payment form renders.
  Sandbox payment (Gate 4) remains separately scoped.**

---

## 2026-08-04 - Provider timeout recovery and unapproved A1 superseded

- The approved Provider Profile timeout repair was implemented in commit
  `5c27ab4348e0585f8fd19f3e935d8eba3fe6d7ec`, pushed, built as the approved
  thin Staging Worker overlay, and installed on both named Staging Workers.
- A new Paid V3 run advanced through page analysis and website synthesis,
  establishing that the earlier roughly 65-second client-timeout regression
  no longer reproduced. It later terminalized in grounded answer synthesis
  with `ai_client_output_truncated` after the AnySearch answer path applied
  its 2500-token cap.
- A FROZEN amendment proposed threading the locked profile's question-answer
  output cap into the AnySearch answer provider. That amendment was never
  approved or implemented. The failed run and both pending refunds remain
  untouched.
- The user then supplied the paid/generating UI screenshot and explicitly
  approved replacing and archiving the old scope in favor of the bounded
  payment-state UI change.
- Terminal status: **superseded at the user's direction; timeout repair
  acceptance established through website synthesis, later paid-run failure
  retained as historical evidence, and the proposed A1 remained unapproved.**

---

## 2026-08-04 - Payment-return purchase-control visibility (parallel session)

- Objective: on a report payment-return page, hide purchase controls once the
  return represents payment success/confirmation or the authoritative order
  status is `paid`; show them again for cancelled, failed, or refunded states.
- Implemented per its approved scope: shared `order` + `payment_return`
  parser and pure visibility rule in `apps/web/src/components/payment-return.ts`;
  conditional form/Suspense handling in `commercial-checkout.tsx` and
  `payment-return-banner.tsx`; 16/16 focused Vitest tests passed; scoped
  ESLint and `git diff --check` passed. Local browser verification was
  blocked by platform policy and is not claimed.
- Its scope authorized no Git mutation, so the resulting source/test changes
  remain UNCOMMITTED in the canonical working tree at this archive time,
  alongside `apps/web/next-env.d.ts` (auto-regenerated) and the pre-existing
  `docs/PROTECTED-STAGING-OPERATIONS.md` edits. Ownership of those dirty
  files stays with the user; no later task may commit, revert, or clean them.
- Terminal status: **implemented and locally test-verified; not committed,
  not deployed; archived at the user's direction to make way for the A1
  truncation-cap scope.**

---

## 2026-08-04 - A1 unified output-cap fix ACCEPTED

- Objective: eliminate the two hardcoded `maxTokens: 2_500` caps on the
  combined_geo_report_v3 SenseNova path (AnySearch grounded answers and
  provider claim extraction) by threading the locked profile's 8192
  `maxOutputTokens` to both call sites. Cap-only; no retry/degrade/contract
  semantics changed.
- Implemented in commit `0dd82061c8d1e7ec556006a9f20e707c4d96e271` (pushed;
  exactly the 7 allowlisted files; production 29 changed lines, tests 19).
  Focused tests all green: claim extraction 6/6, generative-answer 6/6,
  runtime 8/8, processor 80/80, provider-discovery 30/30.
- Deployed as thin overlay
  `open-geo-console:staging-0dd8206-output-cap-overlay-v1`
  (`sha256:ab4f795c9bf7...`) built from a `git archive` export of the exact
  commit (dirty working tree excluded by construction) on base
  `sha256:ab9df490...`; both Staging Workers recreated, restartCount=0,
  healthy. Rollback line: current `sha256:ab4f795c...`, one rollback
  `sha256:ab9df490...`.
- Acceptance (user Sandbox order `2cba6a0b-a11b-4a83-9d89-0d374cb648f4`,
  report `6f067d45-18bd-4129-9352-9e1e03cd6198`, job
  `8141b78f-863f-4f60-bb7d-ea2593bd0739`): completed end-to-end in 12m34s,
  attempts=1, no `ai_client_timeout`, no `ai_client_output_truncated`;
  answer calls 9.4s/21.2s under the 8192 cap, one claim-extraction call
  67.7s (old 60s timeout would have killed it), one claim TypeError degraded
  via the designed contract-skip path. Order `fulfillment_status=completed`,
  `refund_status=not_required`.
- Remaining open items outside this scope: two pending refunds
  (`6eaff177-...`, `c0a1df43-...`) await separate submission authorization;
  the UI task's uncommitted component changes remain user-owned dirty files;
  the fixed Protected Staging site still serves the `ac3fe3c` Preview (web
  process needed none of these worker-only fixes).
- Terminal status: **complete and accepted.**

---

## 2026-08-04 - Staging commerce operations and HTML download delivery

- W1 started the existing Staging commerce consumer; new eligible email
  deliveries were claimed successfully. Four pre-activation queued rows and
  historical failed rows remained untouched.
- W2 ran the single authorized Staging commerce reconciliation. The command
  found 12 pending Sandbox refunds rather than the two anticipated by the
  scope; it submitted all 12 in that one run and all succeeded. No order or
  report was created.
- W3 added the authorized standalone HTML report download and browser-open
  hint in commit `aac357d1fd9bc863ae7026b2ca38c60344a02529`. Focused tests and
  the web production build passed. Preview
  `dpl_HUPxAFtg9sWTjyYViiogu7EW146v` reached READY and the fixed Protected
  Staging alias was moved to it.
- User browser acceptance and the related version tag remained pending when
  the user explicitly approved archiving this scope in favor of the report
  progress-status repair.
- Terminal status: **implemented and deployed; superseded with browser
  acceptance still pending.**

---

## 2026-08-04 - Continuous report progress and automatic status refresh

- The V4 free-report status now exposes one public lifecycle: the base job is
  capped at 65 percent and the pre-admission/free-preview job maps from 65 to
  99 percent. The handoff no longer resets the visible bar to zero. Legacy
  single-stage free reports and paid deep reports retain raw progress.
- `AiReportStatus` now self-schedules status checks until a terminal response,
  tolerates a transient failed check, pauses while the document is hidden, and
  resumes when visible. The payment-return banner no longer stops after two
  minutes; it continues with a bounded 15-second maximum interval.
- The manual refresh button and its obsolete test were removed. Both visible
  progress bars now use the persisted job-stage description rather than a
  repeated generic generation sentence.
- Verification: 45 focused Vitest tests passed across five files; scoped
  ESLint passed; `npm run build --workspace apps/web` completed with TypeScript
  and all 18 static pages successful; `git diff --check` passed. Production
  changed-line count stayed within 180 and tests stayed within 220.
- No Worker, database, queue, payment/refund state-machine, deployment, Docker,
  live report, Git history, or external provider action occurred.
- Terminal status: **implemented and locally verified; not deployed.**

---

## 2026-08-04 - Local real-browser acceptance for report progress UI

- The local PostgreSQL endpoint at `localhost:55432` was unavailable, so no
  database-backed report route, report creation, or live generation was used.
  A first loopback Next route attempt was also blocked by a pre-existing 308
  language-route loop (`/zh/reports/...` and `/reports/...`), recorded but not
  repaired because route work was outside this verification scope.
- Independent browser QA then used an in-memory esbuild bundle (`write:false`)
  of the current-worktree `AiReportStatus`, `PaymentReturnBanner`,
  `payment-return`, and `ai-report-status-copy` sources. A loopback-only HTTP
  server supplied the bundle; no fixture, screenshot, report artifact, or
  repository file was created.
- Actual browser DOM/timer evidence: free progress rendered
  `analyzing 65% -> queued 65% -> discovering 67%`; at least three status
  requests occurred without click or reload; the visible stage text matched
  the persisted stage; no manual refresh button or paused-refresh instruction
  was present.
- With accelerated monotonic browser time, payment polling remained active
  beyond the former 120-second boundary. The authoritative terminal response
  arrived on status request 12 at virtual 144000ms
  (`paymentStatus=paid`, `fulfillmentStatus=completed`,
  `refundStatus=not_required`, `progress=null`). No later status request
  occurred after waiting more than two accelerated 15-second maximum
  intervals. AI polling likewise stopped after its terminal job response.
- A preliminary extra-request observation was rejected as harness error: the
  temporary completion-access substitute returned an invalid 204 JSON shape.
  The final run used stable module-level Next hook substitutes, no React
  StrictMode, a parseable completion response, and separate status-endpoint
  counting.
- Boundary: this is real-browser rendering and timer acceptance of the current
  component sources, backed by the existing API/unit/build checks. It is not a
  database-backed Next-route E2E, live report-generation test, deployment, or
  deployed-site acceptance.
- Both loopback servers were stopped. No code, test, database, Docker,
  environment, Git, payment, report, provider, or external state was changed.
- Terminal status: **local component-browser acceptance passed; not deployed.**

---

## 2026-08-04 - Local browser acceptance of progress/auto-refresh UI (coordination note)

- This note was appended mid-flight by the S1-S4 staging scope while the
  parallel browser-acceptance scope was still active; at that moment the user
  had redirected acceptance to staging. The parallel session subsequently ran
  its browser pass to completion — see the entry "Local real-browser
  acceptance for report progress UI" above, which is the authoritative record
  (acceptance passed).
- The UI changes were then committed as `aa46efe` under the S1-S4 scope (S1)
  and will reach Protected Staging in that scope's integrated deployment,
  where the user performs final acceptance.

---

## 2026-08-04 - Integrated staging: progress UI, transient-failure retry, refund automation

- S1: the parallel session's completed progress/auto-refresh UI changes were
  verified (43 focused tests + web build) and committed as `aa46efe`.
- S2: transient-failure fault tolerance for the paid deep free-direct flow,
  committed as `8e11203` (+7/−3 production): `processor.ts` lets transient
  failures take `retry_wait` (v4_pre_admission one-shot guard untouched),
  `commercial-orders.ts` raises that lineage to `max_attempts=3`,
  `provider-claim-extraction.ts` retries network/timeout AiClientError.
  Verified: 80 focused tests, disposable-postgres 6/6 (receipt
  `pg-20260804041950-3477b986`), broader sweep 1214 passed, web build.
- S3: `compose.yaml` `staging-commerce-reconcile` loop service (commit
  `a7ce1af`) running with `staging.env` + `staging-commerce.env` (deviation
  from the written single env_file: Airwallex credentials required).
  First loop submitted the one pending staging TEST refund (order
  `4a3869e3`, Airwallex `rfd_sgpv7jqpthl0oxer5me_xg6f8u`, CNY 199.00) and
  drained the last 4 queued emails; queue now zero; db audit passed.
- S4: Preview `dpl_8Wm9kkWCDUd1jwVtN5qYjmWNH8Wt` (ogcGitSha `a7ce1af`)
  READY, fixed Protected Staging alias moved, SSO intact. Thin worker
  overlay `staging-a7ce1af-retry-overlay-v1` (`1a82ee00f646`) built FROM
  `staging-0dd8206-output-cap-overlay-v1`; only the two staging workers
  recreated, healthy; rollback `ab4f795c9bf7` retained; E: 51 GiB free
  before and after; no Docker cleanup.
- Historical failed job `51c0c553` was not repaired or replayed; its order
  was refunded through S3 only.
- Terminal status: **implemented, verified, and deployed to Protected
  Staging; user browser acceptance and the `v0.3.0` tag remain pending.**

---

## 2026-08-04 - Trusted-country pricing and Airwallex HPP country

- User approved the frozen allowlist with
  `批准此范围并归档旧范围`. The implementation stayed on `main` at baseline
  `c0f18fc5d650a697dfc2a41e3649dba4096dd34c`; no Git mutation occurred.
- New checkout offers are server-authoritative: trusted `CN` receives
  CNY 299.00; every other valid ISO alpha-2 country and every missing,
  invalid, or untrusted country receives USD 99.00. HKD remains readable for
  historical orders but is not offered to new checkout.
- Vercel country is trusted only under the existing Vercel trust gate;
  Cloudflare country is trusted only under the explicit proxy gate. A complete
  ISO alpha-2 allowlist rejects `XX`, `ZZ`, and malformed values.
- The catalog returns one price. The UI has no currency state or selector and
  sends no currency in the checkout body. Checkout independently derives the
  price and ignores conflicting browser currency input.
- The checkout response carries the same validated country and the browser
  passes it to Airwallex HPP as `country_code`; unknown/invalid country omits
  the option. Existing active orders retain their persisted currency and
  amount during provider recovery or legacy migration.
- The test price catalog is CNY 29900 / USD 9900 with catalog version
  `2026-08-04.v2`. Live readiness now requires those two offered price
  variables and no longer requires a new-order HKD price.
- Verification: 49 focused Vitest tests across six files passed; scoped ESLint
  passed; `npm run build --workspace apps/web` completed with TypeScript and
  all 18 static pages; `git diff --check` passed. Production additions stayed
  within 190 lines, tests within 260, and config/operations docs within 35.
- Independent browser QA loaded the real current `CommercialCheckout` source
  in a loopback-only intercepted harness. CN, HK, MO, TW, US, and unknown all
  showed the expected single price, rendered zero currency selectors, sent no
  browser currency, and produced the expected HPP currency/country options.
  The temporary `127.0.0.1:56356` listener was stopped and confirmed released.
- Independent code review found one invalid-`ZZ` country issue; the ISO
  allowlist fix and three regression paths were then reviewed again, and the
  reviewer confirmed no remaining blocker.
- No VPN switch, database write, real order, PaymentIntent, payment, refund,
  email, provider call, Docker action, deployment, or Git operation occurred.
  Browser evidence is local deterministic acceptance, not deployed Vercel
  geolocation or merchant payment-method availability acceptance.
- Terminal status: **implemented, independently reviewed, and locally verified;
  not deployed.**

---

## 2026-08-04 - Download bar on the standalone report HTML page

- `report.html/page.tsx` now renders a small download bar above the artifact
  (anchor to `/reports/[id]/report.html/download` + the existing browser-open
  hint, reusing `actions.downloadHtml`/`downloadHtmlHint`, interface locale
  resolved via `x-ogc-interface-locale`, `print:hidden`). Commit `a4d4813`
  (production +14/−2, test +18).
- Verified: `report.html` page suite 10/10 (new assertion: authorized access
  renders the `/download` href; anonymous still 404s); web build passed.
- Preview `dpl_DuvzZ4ytt8D8NHF5bap98h5uhzju` (ogcGitSha `a4d4813`) READY,
  fixed Protected Staging alias moved, anonymous `/` 302→SSO intact.
  Rollback: re-alias `dpl_8Wm9kkWCDUd1jwVtN5qYjmWNH8Wt`.
- No worker/commerce/Docker/database changes.
- Terminal status: **implemented, verified, and deployed to Protected
  Staging; user browser acceptance and the `v0.3.0` tag remain pending.**

---

## 2026-08-04 - Download-route 404 fix and top-right download placement

- Root cause verified by user acceptance: `/reports/<id>/report.html/download`
  returned 404 because `apps/web/src/i18n/routes.ts`
  `PUBLIC_FILE_PATTERN = /\/[^/]+\.[^/]+$/` only exempted paths whose LAST
  segment contains a dot; the locale proxy 308-rewrote the download path to
  `/zh/...`, which has no route. The pattern now exempts any dotted segment
  (`/\/[^/]+\.[^/]+/`). No proxy.ts, download route, artifact, dictionary, or
  worker/commerce/Docker/database change.
- Per user directive the download affordance on
  `report.html/page.tsx` moved from the full-width top bar into the artifact's
  existing top-right actions styling (`artifact-actions` + `primary`, centered
  on the 1120px report column, right-aligned hint, `no-print`); same anchor
  and `actions.downloadHtml`/`downloadHtmlHint` texts.
- Verified: 21 focused tests passed (i18n routes incl. two new
  `/report.html/download` cases returning `next`; report.html page suite with
  new `artifact-actions`/`primary` assertions); `npm run build --workspace
  apps/web` passed (route table still lists `ƒ /reports/[id]/report.html/download`).
- Commit `ee25de12aca4d609904284ab5fc3c7522e20b6fb` on `main`, pushed.
  Production diff: routes.ts +1/−1, page.tsx +9/−5; tests +4 lines; within the
  20/25 budget. Unrelated dirty files (commerce, client-ip, .env.example,
  COMMERCIAL-OPERATIONS.md) were left untouched and uncommitted.
- Preview `dpl_BaEQNVbv2GtaSd7GTzHsVYBKZXaN` (ogcGitSha `ee25de1`) READY,
  fixed Protected Staging alias moved, anonymous download URL 302→SSO intact.
  Rollback: re-alias `dpl_DuvzZ4ytt8D8NHF5bap98h5uhzju`.
- Terminal status: **implemented, verified, and deployed to Protected
  Staging; user browser acceptance and the `v0.3.0` tag remain pending.**

---

## 2026-08-04 - Inline evidence images into the downloaded report HTML

- User acceptance found the downloaded standalone HTML lost all evidence
  screenshots: artifact components render them as site-relative
  `/api/reports/<id>/evidence/<assetId>` (and `/evidence/recommendation/<id>`)
  URLs, which resolve to `file://` in the saved file.
- `report-scope.tsx` gained `inlineEvidenceImages()`: for ready assets with a
  `storageKey`, bytes are read via the existing `EvidenceStorage.get()` and
  both API src patterns are replaced with `data:<contentType>;base64,...`.
  Not-ready, keyless, missing, or unreadable assets keep their API src and
  never fail the download. The download route calls it (V4 has no evidence
  assets; narrowed with `"evidenceAssets" in model`). Online page, artifact
  components, evidence API routes, and the storage layer unchanged.
- Verified: 13 focused tests passed (5 helper cases incl. both src patterns,
  base64 content, and all passthrough paths); web build passed.
- Commit `d116b90da6a51073ae55ea48110e26b561e6895e` on `main`, pushed
  (production +28, tests +53; within budget). Housekeeping commit `79d02de`
  on the same push carried the previously reviewed trusted-country pricing
  batch (14 files, 46 focused tests green before commit).
- Preview `dpl_EiRKJGKAy2TSMYExcYVQ3iBKhYNP` (ogcGitSha `d116b90`) READY,
  fixed Protected Staging alias moved, anonymous download URL 302→SSO intact.
  Rollback: re-alias `dpl_BaEQNVbv2GtaSd7GTzHsVYBKZXaN`.
- Terminal status: **implemented, verified, and deployed to Protected
  Staging; user browser acceptance (offline screenshots in the downloaded
  file) and the `v0.3.0` tag remain pending.**

---

## 2026-08-04 - Docker stale image cleanup

- User directed cleanup of old project images, keeping only the latest. The
  frozen scope listed 25 exact image IDs; the user approved it.
- Before: 77 images / 32.31GB (`docker system df`), E: drive 51G free.
- Removed 23 of 25 with plain `docker rmi` (no `--force`): all 19 listed
  unreferenced staging overlay/full images (`5ef0fecd18b5`, `901be8795886`,
  `26bb8f778d05`, `5cb3a2b3a929`, `d6a730bc9d35`, `23c9cb696e0f`,
  `b08ea493fc2a`, `748e2675f280`, `ab9df490fb21`, `0b62fd4561c2`,
  `ea1d552f5d97`, `7b08c1e1a477`, `3f436e73870a`, `95a62dcdfc1f`,
  `ae9dca41f2dc`, `02b474693b25`, `8a62a930f5a5`, `4a28445023a7`,
  `1cdc060d597c`) and 4 dangling images (`dab66c879b81`, `498795247e31`,
  `2e8c58d6fa0e`, `75fd8eb23b77`).
- Stopped instead of forcing on 2 listed dangling images that turned out to
  be referenced by RUNNING containers of another project: `b5f4c57c96d9`
  (redis:7-alpine layer, `freight_lead_agent-redis-1`) and `0e5e5e1396de`
  (postgres:16-alpine layer, `freight_lead_agent-postgres-1`). Both retained.
- Retained as scoped: current staging worker `1a82ee00f646`, staging
  commerce + rollback `ab4f795c9bf7`, production `ed17c0fe9e15`. All four
  open-geo staging containers still running; no other project's image,
  container, volume, or build cache touched; no prune commands used.
- After: 54 images / 30.38GB; E: drive 51G free. Net image footprint
  −1.93GB (overlay tags shared base layers, so tagged size ≠ freed bytes).
- Terminal status: **complete.**

---

## 2026-08-04 - v0.3.0 release tag

- User confirmed browser acceptance of the downloaded report HTML (offline
  evidence screenshots) on Protected Staging and approved the tag scope.
- Annotated tag `v0.3.0` created on `main` HEAD `d197f1d1124f92087c88d8d0fc7e1095cbc6cd9e`
  (tag object `c324d7e02e86c75043b839601a99320aea18bcd5`) and pushed to
  `origin`; `git ls-remote --tags origin v0.3.0` verified.
- The tag covers the delivered line: trusted-country pricing + Airwallex HPP
  country, fulfillment retry hardening, commerce refund/email reconciliation,
  and the self-contained downloadable report HTML (top-right action,
  locale-route 404 fix, inline evidence images).
- No code, deployment, branch, Docker, database, worker, or commerce changes.
- Terminal status: **complete.**

---

## 2026-08-04 - Reusable emailed report access link (option B)

- User reported the emailed "open report" link dies after one click and chose
  option B: the link stays reusable for the token's 30-day lifetime (paid
  customers keep opening their report; forwarding risk accepted as product
  design).
- `apps/web/src/app/api/reports/[id]/access/route.ts`: GET and POST now verify
  via the pre-existing `verifyReportAccessToken` (revocation + expiry only —
  the same check the cookie path trusts) instead of the one-shot
  inspect/redeem pair. Each POST re-sets the device cookie; the 7-day link
  TTL no longer applies to the emailed link. Confirm-page copy (zh/en) now
  states the link stays reusable until access expires; the POST error dropped
  "or already used". No change to `db/report-tokens.ts`, token issuance,
  cookie attributes, revocation, or `link_reissue` (still the post-expiry
  remedy).
- Verified: 9 access-route tests passed incl. a new second-open-redeems case;
  `npm run build --workspace apps/web` passed.
- Commit `fd8205e8b6cb550e951f53a2bec42b352929ca59` on `main`, pushed
  (production ~+6/−6 lines, tests +30/−20; within budget).
- Preview `dpl_CdYNPdRc4VJDzuYNstbe97i3u1xL` (ogcGitSha `fd8205e`) READY,
  fixed Protected Staging alias moved, SSO intact. Rollback: re-alias
  `dpl_EiRKJGKAy2TSMYExcYVQ3iBKhYNP`.
- Terminal status: **implemented, verified, and deployed to Protected
  Staging; user second-click acceptance pending.**

---

## 2026-08-04 - Paid V3 decision layout and date-reference repair

- User approved four issues: give future website synthesis an authoritative
  report-as-of timestamp; localize technical-dimension labels; remove the
  customer-visible per-source verification column while retaining aggregate
  audit counts; and replace the dense three-column roadmap with a numbered
  three-phase why-to-how action chain.
- Changed only the Paid V3 component, its scoped CSS/test, website-synthesis
  prompt/test, prompt-version constant, and the active scope. Prompt provenance
  advanced to `ai-website-report-v3`; no schema, payment, commerce, access,
  report persistence, or historical artifact was changed.
- Verified 50 focused tests, scoped lint, AI report engine type build, and the
  complete workspace/Next.js production build. Full tests retained the same 15
  unrelated failures: 13 stale schema-44 expectations and two Windows
  PowerShell timeouts. Full lint retained the same 17 errors in the ignored
  `.tmp-preview/debug-readiness.ts`; changed files passed scoped lint.
- Read-only real-report rerender retained source SHA-256
  `b48e18945421eec339b3d501996ebb46c86fab8c6ba9dfc724826c28abe25c15`,
  all 3 answers, 26 source rows, 10 roadmap actions, and 22 evidence images.
  Independent browser acceptance passed desktop/narrow layout, mouse/keyboard
  disclosure, print expansion, no overflow, and zero console errors. The
  historical erroneous date conclusion was deliberately not rewritten.
- No model call, report generation, database mutation, deployment, Docker
  action, payment, email, or Git mutation occurred under this scope.
- Terminal status: **implemented and locally accepted; release pending a
  separately frozen Git phase followed by an exact-SHA Staging phase.**

---

## 2026-08-04 - Paid V3 Phase 1 Git publication

- User explicitly approved the Phase 1 Git allowlist.
- Reverified 50 focused tests, scoped lint, full workspace build, and
  `git diff --check`; all Phase 1 gates passed.
- Staged exactly the eight approved paths and created commit
  `d8c938511682b3dcb12ca4b66adaeaeb25d08e6e`, direct parent
  `3ab11f0b1219873579a366617957413a206e6815`, with message
  `feat: improve paid report decision flow and date context`.
- Pushed `main` to `origin` once without force. Post-push local `main` and
  `origin/main` both equal the full candidate SHA; canonical worktree was
  clean and existing detached worktrees were unchanged.
- No Vercel, Docker, Staging/Production runtime, database, report, model,
  payment, refund, email, or customer-data action occurred.
- Terminal status: **Phase 1 complete; Phase 2 Protected Staging scope written
  separately and frozen pending explicit approval.**

---

## 2026-08-04 - Paid V3 Phase 2 first cutover attempt

- User explicitly approved the exact-SHA Protected Staging release.
- Preflight passed for candidate identity, approximately 50.6 GiB free disk,
  Staging database marker, zero claimable/running/recoverable/terminalizable
  jobs, and current/rollback identities.
- Created exactly one READY Preview
  `dpl_A53XPfWHjkS5oCesn6mJQqLEGmJG`; `gitCommitSha` and `ogcGitSha` both equal
  candidate `d8c938511682b3dcb12ca4b66adaeaeb25d08e6e`.
- Built exactly one thin overlay image
  `sha256:a707736c7a9c3024283ee270e89bd107a218f50e2636e41bf2dfcc32b109705c`
  with the exact candidate OCI revision label.
- Candidate Free and Deep containers were started, but a temporary cutover
  check waited only 8 seconds for the Free readiness log. Free remained
  running with restart count zero and no application error was captured, but
  the short predicate timed out before retaining a matching log.
- Automatic rollback restored the original Staging runtime-env bytes and both
  Workers to image `sha256:1a82ee00f646...22289f`, version `a7ce1af...`, with
  restart count zero. The fixed alias was never moved and remains on
  `dpl_CdYNPdRc4VJDzuYNstbe97i3u1xL`.
- Repository evidence confirms the authoritative `Wait-WorkerReadiness`
  contract defaults to 60 seconds and current Workers emit the expected log.
  The failure is a cutover-check timeout, not a proven runtime failure.
- No Production, commerce, report/model/search, payment, email, delivery,
  artifact, or customer-data action occurred.
- Terminal status: **rolled back safely; bounded reuse-only recovery frozen
  pending explicit approval.**

---

## 2026-08-04 - Paid V3 reuse-only recovery deployment

- User explicitly approved reusing the existing candidate Preview and Worker
  image; no second Preview or image build was created.
- Recreated only Staging Free/Deep using candidate image
  `sha256:a707736c7a9c3024283ee270e89bd107a218f50e2636e41bf2dfcc32b109705c`.
  The repository's unchanged 60-second readiness contract passed for both;
  tiers and Staging/Preview identity were exact, restart counts were zero, and
  claimable/running/recoverable/terminalizable counts remained zero.
- Moved the fixed alias once to READY Preview
  `dpl_A53XPfWHjkS5oCesn6mJQqLEGmJG`; Web, Free, and Deep all identify
  `d8c938511682b3dcb12ca4b66adaeaeb25d08e6e`.
- Catalog returned HTTP 200 with `mode=test`. Automated `/zh` rendering was
  blocked by Vercel SSO/browser-control timeout; the user then opened the fixed
  Protected Staging URL and explicitly confirmed the page was normal.
- No Production, commerce, report, crawl, model/search, order, payment, refund,
  email, delivery, artifact, or customer-data action occurred.
- The exact proven path and the prohibition on ad hoc short readiness checks
  are now recorded in `docs/PROTECTED-STAGING-OPERATIONS.md`.
- Terminal status: **Protected Staging deployment completed; real flow not yet
  accepted.**

---

## 2026-08-04 - Free checkout gating and website-derived buyer questions

- While a free report is missing, generating, or unavailable, the status view
  no longer mounts the paid checkout, report-email field, price/action, operator
  key form, or the checkout-owned buyer-question request. The existing upgrade
  entry remains available only after a free AI report is ready and deep access
  is absent.
- New question sets retain the three stable buyer intents but now use bounded
  website-profile signals for concrete services/routes, audiences/markets, and
  purchase capabilities. Noisy inferred audience prose, language-mismatched
  values, and promotional operating metrics are excluded; neutralization and
  exactly-three-question contracts remain unchanged.
- Existing and historical reports/question sets were not rewritten or replayed.
- Verification passed: 16 focused tests, scoped Web lint, full workspace build,
  and `git diff --check`. Full lint retained the unrelated 17 errors in the
  ignored `.tmp-preview/debug-readiness.ts`.
- No Git, deployment, Docker, database, report, model, commerce, payment, email,
  or customer-data action occurred under the implementation scope.
- Terminal status: **implemented and locally verified; Git publication and
  Protected Staging release authorized under the next exact scope.**

---

## 2026-08-04 - Buyer-question, temporal-truth, and limited-entitlement repair

- The user approved a bounded local repair for three confirmed boundaries:
  inferred or unspecified market noise entering buyer questions, model prose
  contradicting the authoritative report date, and refunded
  `completed_limited` orders retaining paid full-report access.
- Implementation remained within the approved production and test allowlists.
  Focused non-PostgreSQL verification passed 97 tests across eight files; the
  canonical disposable PostgreSQL run passed 24 tests across three selected
  files, and supplemental affected PostgreSQL checks passed 16 plus five tests.
  Scoped lint, build, diff checks, and independent review passed.
- Repository-wide acceptance did not pass: the final complete `npm test` had
  3,188 passed, 16 failed, and 210 skipped tests across 15 failing files. The
  failures were 13 stale schema/migration-chain assertions ending at schema 44,
  one disposable PostgreSQL inventory timeout, and two Windows PowerShell
  Staging-preflight timeouts.
- The 23 modified implementation/test paths are retained unchanged as the
  baseline for the next frozen scope. No deployment, Docker image, live data,
  report, model/search, payment, refund, email, Git, or customer-data action
  occurred.
- Terminal status: **the three bounded repairs are implemented and their
  focused checks passed, but repository-wide acceptance failed; the timeout and
  schema-test failures remain unresolved under a new scope.**

---

## 2026-08-04 - Schema V45 migration-chain and test-timeout repair

- The user approved a frozen local scope covering schema version 45 versus
  historical version-44 test expectations, the disposable PostgreSQL inventory
  timeout, two Windows PowerShell Staging-preflight timeouts, and a complete
  `npm test` zero-failure acceptance gate.
- Root causes were confirmed independently: historical schema constants and
  fixture cutoffs stopped at V44; the inventory test repeated recursive
  repository discovery for each selection assertion; and the two preflight
  assertions each paid a 2.5-to-3.5-second Windows PowerShell startup cost,
  which crossed the five-second per-test boundary under full-suite contention.
- The repair advanced test-only migration chains and historical fixture cutoffs
  through V45 without changing schema or migration semantics, reused one
  discovered PostgreSQL inventory, and shared one real Windows PowerShell probe
  across the two launcher assertions. The Staging launcher itself was not
  changed.
- Focused verification passed: 24 schema/migration files had 17 runnable
  assertions pass with database-backed suites environment-gated; inventory was
  10/10 and Staging preflight was 22/22. Both timeout groups then passed five
  consecutive runs.
- Canonical disposable PostgreSQL receipt
  `.data/test-runs/postgres-disposable/pg-20260804131610-ef972571/receipt.json`
  selected all 23 requested schema files and passed 43/43 with zero failures,
  zero skips, and successful container cleanup.
- Scoped Web ESLint, runner syntax check, workspace build, and `git diff
  --check` passed. One complete final `npm test` exited zero: 320 test files
  passed, 50 were environment-gated; 3,204 tests passed, 210 were skipped, and
  zero failed. No timeout or unhandled error was reported.
- Scope audit matched all 27 implementation paths with no missing or extra
  path. The preceding 23-path retained baseline remained byte-identical at
  aggregate SHA-256
  `3c03460ade046420980ea51a8d443ad386ff55920eda9cafcbe371b281b524a4`.
- No Git, deployment, Docker image build, Staging/Production mutation, report,
  model/search, commerce, email, or customer-data action occurred.
- Terminal status: **completed; full local automated acceptance passed with
  zero failed tests.**

---

## 2026-08-04 - Release receipt: candidate 84d8173 to Protected Staging

- Candidate `84d817366f875fd59179474ebae257886f6b22af` (parent `4af464b8`,
  subject `fix: enforce report access boundaries and stabilize verification`)
  verified on local `main`; clean detached deployment checkout at
  `.data/deploy-worktree-readmode`. Push remains unauthorized; remote
  publication pending.
- Web: ONE manual Preview `dpl_8t79n7HX69GJLpgZXY5QidK7VqkD`
  (host `open-geo-console-imgn5p3d5-itheheda-6857s-projects.vercel.app`)
  READY, exact project `prj_WVpdlJfsEp0YyWM2W54w8oBy985S`, ogcGitSha =
  candidate. Fixed Protected Staging alias moved once (previous:
  `dpl_BfsqUMEESJDFvVS9maaAECQq9r49`; rollback Web: `dpl_A53XPfWHjkS5oCesn6mJQqLEGmJG`).
- Worker: ONE thin source-overlay image
  `open-geo-console:staging-84d8173-report-boundaries-overlay-v1`
  (`sha256:a33d5e1e73bf6201a0866c2d4922e14d7f8f5336f4ed7208062f6c22763287b7`,
  revision `84d8173`) built FROM the accepted current image
  `sha256:002fc0877e...` via local tag (first attempt with a bare
  `FROM sha256:` failed on registry resolution; no extra image produced).
  Rollback Worker image `sha256:a707736c7a9c...` retained untouched.
- Runtime env: original bytes backed up (`.tmp/staging.env.bak-84d8173`);
  only `OGC_DEPLOYMENT_VERSION` changed to the candidate. Exactly the two
  named Worker services recreated once (`--no-deps --no-build
  --force-recreate`); Commerce and Production untouched.
- Readiness (60s): both workers report exact candidate revision, correct
  free/deep tier identity, restart count zero, clean ready logs, zero
  workflow effects.
- Smoke on the fixed URL: `/zh` and catalog both 302→SSO (protection
  intact); authenticated catalog/browser checks left to user acceptance.
- Disk: E: 51G free before and after; no Docker cleanup, no prune.
- Terminal status: **deployed to Protected Staging; user manual acceptance
  and remote-main publication pending.**

---

## 2026-08-04 - Release receipt: candidate 8048f04 to Protected Staging

- Candidate `8048f04fc4fbcbf025e0666b478581958d9c7d23` (parent `6cf83d83`,
  subject `fix: derive service category from real products and unblock
  terminal-incomplete checkout`) committed and pushed to `origin/main`
  (`4af464b..8048f04`) under the user's explicit 提交/推送/部署 instruction.
- Web: ONE manual Preview `dpl_2ogns8cva4RZ9hyBWhgKGJCZYT5a`
  (host `open-geo-console-flgp4cpto-itheheda-6857s-projects.vercel.app`)
  READY, preview target, exact project `prj_WVpdlJfsEp0YyWM2W54w8oBy985S`,
  ogcGitSha independently read back via `vercel api` = candidate
  (`gitCommitSha` absent under the documented `link=null` mode). Fixed
  Protected Staging alias moved once (previous/rollback Web:
  `dpl_8t79n7HX69GJLpgZXY5QidK7VqkD`); post-move alias readback confirms
  `dpl_2ogns8cva4RZ9hyBWhgKGJCZYT5a`.
- Worker: ONE thin source-overlay image
  `open-geo-console:staging-8048f04-checkout-category-overlay-v1`
  (`sha256:6b8657f2108db0cb5d6f5623eb139afe37781b707ce5e2cf6191d63deaa331fc`,
  revision label = full candidate SHA) built FROM the accepted current image
  `open-geo-console:staging-84d8173-report-boundaries-overlay-v1`
  (`sha256:a33d5e1e73bf...`) via local tag. Rollback Worker image
  `sha256:002fc0877e32...` (`staging-4af464b-free-checkout-overlay-v1`)
  retained untouched.
- Runtime env: original bytes backed up (`.tmp/staging.env.bak-8048f04`);
  byte-comparison proves only `OGC_DEPLOYMENT_VERSION` changed to the
  candidate. Exactly the two named Worker services recreated once
  (`--no-deps --no-build --force-recreate`); Commerce and Production
  untouched.
- Readiness (60s boundary, 2s poll): both workers ready in 1s with the
  tier-specific ready log, exact candidate image ID, correct free/deep tier,
  `staging`/`preview`/`test` markers, `OGC_DEPLOYMENT_VERSION` = candidate,
  restart count zero. Zero claimable/running/expired-recoverable/
  exhausted-terminalizable jobs before and after recreation (only the five
  pre-existing historical `repair_wait` rows, untouched).
- Smoke on the fixed URL: alias API readback = candidate deployment; `/zh`
  and `/api/commerce/catalog` both 302 to Vercel SSO and anonymous
  `POST /api/scan` rejected by deployment protection (302). Authenticated
  catalog (`mode=test`) and browser checks left to user acceptance; Vercel
  SSO blocks automation, recorded as the explicit boundary.
- Disk: E: 51G free before and after; overlay added ~1.9 MB over shared
  layers; no Docker cleanup, no prune, no older-image removal.
- Terminal status: **Protected Staging deployment completed; real flow not
  yet accepted.** Gate 4 (one wholly new report and one Sandbox payment)
  requires a separate FROZEN scope and explicit authorization.

---

## 2026-08-05 - Stripe Sandbox Checkout cutover and Gate B payment proof

- The user approved branch `codex/stripe-sandbox-checkout` to replace the
  development/test paid-report checkout entry with Stripe-hosted Checkout while
  preserving PostgreSQL payment and fulfillment authority.
- The candidate added the official Stripe Node SDK integration, hosted Checkout
  Session creation, raw-body signed Webhook processing, test/live-key
  fail-closed readiness, safe return URLs, and deterministic order-scoped
  idempotency. The existing Airwallex server adapter and route were not migrated
  or used for the Stripe order.
- Focused tests passed 16/16, lint completed with zero errors and six unrelated
  existing warnings, the workspace build passed, and `git diff --check` passed.
  Independent review found no actionable Stripe idempotency defect under the
  proven zero-old-Session baseline.
- Exactly one task-owned Stripe Sandbox Checkout Session was created for order
  `56ef077e-44b0-4d59-8de5-a9595eb1a522`; the user completed one test-card
  payment. Stripe readback was `livemode=false`, `complete/paid`, `9900 USD`.
- One `checkout.session.completed` event was durably processed with no error.
  Exactly-once counts were: one order, one payment event, one reserved credit,
  one queued Deep job, one queued payment-confirmation email, one access record,
  and zero refunds. No Worker, Commerce/email consumer, deployment, live-mode
  payment, bank verification, payout, or refund was run.
- The task-owned synthetic report cannot serve as paid-delivery proof: its
  target is `https://synthetic.example/`, the expected V4 persisted site
  snapshot is absent, and its public-search endpoint is intentionally
  non-routable. That report/order/job remains untouched and is not repair or
  replay authority.
- Terminal status: **Gate A implementation checks and Gate B Stripe Sandbox
  payment boundary passed; full paid report delivery, deployment, live mode,
  and bank/payout readiness remain unverified.**

---

## 2026-08-05 - Stripe Gate C first isolated Shun Express lineage stopped at DNS

- The user approved preserving the pre-Stripe `sensenova_anysearch` runtime in
  one disposable Gate C database, one local Web, one Stripe listener, and one
  real-Chrome submission before any payment.
- Gate C Web was replaced once on port 3000 with the canonical merged Staging
  public-search identity while retaining Stripe test configuration and the
  isolated database. The existing listener was preserved.
- The exact active Protected Staging AnySearch authority
  `public-search-authority-0b41faeb8c0308142381374ac1a70d821c313d340b3b5d163d4e293ebed4ec68`
  was transferred through the existing authority functions after the user
  separately approved Protected Staging as the trust source. Commerce and
  product readiness passed; catalog returned enabled test mode at USD 99.00.
- Real Chrome submitted exactly one new `https://shun-express.com/` report:
  report `e9c59223-c117-43dd-998a-af192b6cef0c`, Free job
  `eec00265-2073-47c7-b1b9-a4317b0c7c82`.
- The single Free invocation reached authoritative terminal failure in
  discovery. It persisted the same `UrlSafetyError` twice within its internal
  retry boundary: `The target hostname could not be resolved.` No site
  snapshot, question set, order, Checkout Session, payment, access, email, Deep
  job, or report artifact was created.
- The later shell supervision timeout was not causal. A post-failure Windows
  and Node lookup resolved `shun-express.com` to `120.76.156.213`, supporting a
  bounded transient-DNS interpretation; the terminal report/job remain
  immutable and are not replay or repair authority.
- Terminal status: **Gate C runtime/authority/catalog prerequisites passed, but
  the first isolated lineage failed before questions and payment at target DNS
  resolution. A replacement report requires a new FROZEN scope.**

---

## 2026-08-05 - Gate C replacement preflight stopped at unresponsive Catalog

- The user approved one replacement Shun Express lineage, but the strict
  preflight stopped at its first live-readiness gate before creating anything.
- PostgreSQL still contained exactly one immutable failed report, its one failed
  Free job with no lease, one exact active AnySearch authority, and zero Deep
  jobs, orders, payment events, refunds, credits, access records, queued emails,
  site snapshots, question sets, and artifacts.
- The task-owned Web still held port 3000 as PID 3772 and its reconstructed
  runtime identity matched Staging, `sensenova_anysearch`, AnySearch, zh-CN/CN,
  and Stripe test mode. Commerce and product readiness resolved ready.
- The required live Catalog request to
  `http://127.0.0.1:3000/api/commerce/catalog` timed out after 15 seconds, so
  `enabled=true` could not be re-proven.
- No process was stopped, no DNS check was consumed, and no report, Worker,
  provider, Checkout Session, payment, Webhook, or Deep action occurred.
- Terminal status: **stopped before replacement submission; a one-time Gate C
  Web recovery requires a new FROZEN scope and explicit approval.**

---

## 2026-08-05 - Gate C recovered; first replacement submit click wrote nothing

- The user approved all remaining operations in the consolidated Gate C scope.
- The exact task-owned Web PID 3772 was stopped once and replaced with PID
  46564 under the identical merged Staging, AnySearch, and Stripe-test runtime.
  Catalog returned HTTP 200, `enabled=true`, `mode=test`, USD 99.00. Listener
  PID 65212 and the isolated staging/tmpfs database remained unchanged.
- The immutable failed lineage and exact zero commercial/Deep/snapshot/question
  counts passed. The stale Free PID 44344 was stopped once without a lease, and
  the sole DNS-only safe-resolver check resolved `shun-express.com` to
  `120.76.156.213` without HTTP, crawl, model, search, or provider work.
- Existing real Chrome tab 1652081899 filled the target and issued exactly one
  submit click, without refresh, duplicate click, checkout, or payment.
- PostgreSQL then still contained exactly the one immutable failed report and
  Free job. No new report or queued job existed, so the runtime stopped before
  invoking Free. All commercial descendants remained zero.
- Terminal status: **zero-write browser submission; no Worker or payment ran.
  Read-only diagnosis plus any final submit attempt requires a new FROZEN scope
  and explicit approval.**

---

## 2026-08-05 - Force-fresh replacement failed because preflight used the wrong resolver

- The user approved read-only diagnosis, one final real-Chrome submit, and the
  remaining paid-delivery chain.
- Read-only browser/source evidence proved the prior zero-write click had
  correctly reused the active 30-day `free_site_trials` mapping. Protected
  Staging requires its existing force-fresh control to create a new lineage.
- Real Chrome explicitly enabled force-fresh and submitted once, creating
  report `3c3e93d9-41d5-4d08-a080-842c92f0292b` and Free job
  `b0a58fd4-58c1-4f66-9d92-b548b79853e1`.
- The sole Free invocation terminally failed in discovery with the same
  recurring `UrlSafetyError: The target hostname could not be resolved.`.
  It first recorded transient/retry-wait, then permanent terminal failure.
  There was no HTTP crawl, provider/model/search call, snapshot, question set,
  Checkout, payment, access, email, Deep job, or artifact.
- First-principles comparison confirmed the accepted DNS preflight directly
  called `resolveSafeUrl` with Node system DNS, but actual Worker discovery
  calls `createSafeFetch()` and selects Cloudflare DoH when the canonical
  Staging variable is inherited. The checks were not the same effective
  resolver.
- Current source and the existing workstation receipt identify the matching
  host-drain boundary: `undici` safe fetch does not use the workstation's
  required environment proxy for Cloudflare DoH, so accepted host drains clear
  only `OGC_PUBLIC_DNS_DOH_URL` in process memory and use system DNS. No
  tracked configuration changes.
- Terminal status: **stopped before payment; both failed lineages are immutable.
  A process-only system-DNS replacement lineage requires a new FROZEN scope.**

---

## 2026-08-05 - Resolver-corrected scope stopped at Next dev Catalog 404

- The user approved the complete process-only system-DNS replacement lineage.
- Database, failed-lineage, authority, and reconstructed runtime counts matched,
  but the mandatory live Catalog preflight returned HTTP 404 instead of HTTP
  200 enabled/test/USD 99.00. Execution stopped before inspecting or stopping
  the idle Free worker and before any DNS, report, Worker, or payment action.
- Read-only diagnostics confirmed port 3000 remained owned by PID 46564, whose
  command line is this repository's `next dev`. The `.next/dev` app-path
  manifest and compiled Catalog route both exist, and the source route has no
  HTTP 404 response branch.
- The mismatch is therefore bounded to the live Next dev route state. No second
  Catalog request, process mutation, rebuild, cache deletion, or external action
  was performed.
- Terminal status: **preflight failed without workflow effects; one exact Web
  restart plus the already frozen full chain requires fresh approval.**

---

## 2026-08-05 - Catalog 404 traced to overlapping localhost development sites

- The user approved one exact Gate C Web recovery and the remaining paid chain.
- PID 46564 was stopped once. Port 3000 remained open, so no concurrent manual
  replacement was initially started.
- Read-only process evidence then proved the remaining listener was unrelated
  `E:\project\personal-website`: PID 61160 on `127.0.0.1:3000`. Gate C had
  previously listened on IPv6 `::`, so the Catalog probe sent to
  `127.0.0.1:3000` had reached the wrong project and returned 404.
- The authorized Gate C replacement start produced PID 41588 on
  `0.0.0.0:3000`, not IPv6. The unrelated personal site was untouched. The
  existing Stripe listener still forwards to `localhost:3000`, so continuing
  would leave its Webhook destination ambiguous.
- No Catalog request to the new Gate C, DNS check, report, Worker, Checkout,
  payment, or database workflow effect followed.
- Terminal status: **stopped before workflow effects; Gate C must be explicitly
  rebound to `::1` while preserving the existing listener and personal site.**

---

## 2026-08-05 - Port 3010 migration blocked by runtime execution policy

- The user selected dedicated port 3010 and approved moving only the task-owned
  Gate C Web and Stripe CLI forwarding path there, followed by the full
  system-DNS/Free/Stripe/Deep acceptance chain.
- Read-only preflight proved 3010 free; Gate C PID 41588, Stripe listener PID
  65212, unrelated personal-site PID 61160, idle Free PID 62616, the disposable
  database, exact AnySearch authority, and all zero downstream counts matched.
- The first runtime-operator context was rejected by platform policy before the
  combined stop/listener-secret/Web-start operation executed. A fresh dedicated
  runtime-operator context independently reached the same pre-execution
  `blocked by policy` result.
- No command was split or retried after rejection. No PID, port, file, secret,
  database row, DNS request, report, Worker, Checkout, payment, or Webhook state
  changed.
- Terminal status: **approved scope technically blocked at the mandatory runtime
  owner boundary; another scope approval cannot remove this platform block.**

---

## 2026-08-05 - Port 3010 migration passed; final force-fresh click failed before admission

- The user explicitly authorized the primary task to perform only the Gate C
  Web and Stripe-listener migration to port 3010, overriding the runtime-owner
  boundary for that migration while retaining every other approved limit.
- Read-only revalidation proved the disposable staging/tmpfs PostgreSQL on
  `127.0.0.1:55434`, schema 45, the exact active AnySearch authority, two
  immutable failed Free lineages with no leases, and zero commercial, Deep,
  snapshot, question, artifact, or regeneration rows.
- Exact old Gate C PID 41588 and Stripe listener PID 65212 were each stopped
  once. The unrelated `E:\project\personal-website` dev server remained
  untouched on `127.0.0.1:3000`; its Next child PID rotated independently.
- A policy-compatible one-shot Node launcher started Stripe listener PID 56728
  forwarding only `checkout.session.completed` to
  `http://localhost:3010/api/webhooks/stripe` and Gate C Web PID 67292 on
  `0.0.0.0:3010`. The signing secret stayed in process memory and was neither
  printed nor persisted.
- Catalog returned HTTP 200, `enabled=true`, `mode=test`, and USD 99.00.
  PostgreSQL counts and the authority remained exact. Idle Free PID 62616 was
  stopped once with no lease. The sole effective-resolver DNS-only check used
  system DNS and resolved `shun-express.com` to public IPv4 `120.76.156.213`
  without HTTP, crawl, model, search, or provider work.
- Existing real Chrome enabled force-fresh and clicked submit exactly once.
  The page returned `暂时无法扫描该网站。`; it did not navigate to a report.
  PostgreSQL remained at exactly two reports/two failed jobs and zero new or
  downstream rows, so no Free drain, Checkout, payment, Webhook, Deep drain, or
  email action followed.
- Read-only source/environment comparison identified the exact migration defect:
  both Staging source files contain an empty Sensitive placeholder for
  `OGC_IP_HASH_SECRET`, while ignored `.env.local` contains the required
  nonblank local value. The replacement launcher restored provider and Stripe
  values but omitted the local IP/token-secret allowlist. `/api/scan` therefore
  failed at `requireSecret("OGC_IP_HASH_SECRET")` before its transaction, which
  exactly matches the generic UI error and zero database writes. The same audit
  also found empty process inputs for the later payment/email secret families.
- Terminal status: **port isolation, Stripe listener, Catalog, authority, and
  effective DNS passed; the only authorized submit was consumed by a
  migration-environment omission before admission. Correcting the Web runtime,
  restarting it again, and making another report/payment attempt require one
  new FROZEN recovery scope and explicit approval.**

---

## 2026-08-05 - Corrected Gate C admitted Shun Express; Free stopped at provider rate limit

- The user approved the complete corrected-runtime recovery scope. Faulty Web
  PID 67292 was stopped once and replaced by PID 16920 on port 3010 with the
  disposable 55434 database, local IP/token secret allowlist, three distinct
  process-only sandbox commercial secrets, Stripe test key, in-memory listener
  secret, and the exact SenseNova/AnySearch zh-CN/CN identity. Stripe listener
  PID 56728 and the unrelated personal site were preserved.
- Catalog again returned HTTP 200, enabled test mode, USD 99.00. Database and
  authority counts remained exact before submission.
- Real Chrome enabled force-fresh and clicked exactly once, creating report
  `72e0eaf5-2dbf-414b-8347-2f45047b03f8` and queued Free job
  `199b550b-ebd6-4f83-b751-6e8d0d91c403`, reason
  `staging_regeneration`. No checkout or payment occurred.
- Two launch-boundary failures produced no claim or external work: bare
  `npm.cmd` resolved a nonexistent project-local npm, then the corrected
  absolute npm start inherited Web's Cloudflare queue selector with empty
  Sensitive placeholders. The canonical workstation source proved host Workers
  use `OGC_JOB_QUEUE_PROVIDER=postgres`; both pre-claim failures left the job
  queued with attempts zero.
- The first effective Free drain used `D:\node\npm.cmd`, PostgreSQL batch mode,
  and the approved empty process-only DoH override. It resolved and crawled the
  real homepage, persisted one crawl-evidence row, and completed page analysis.
  The checkpoint correctly identifies Shun Express cross-border logistics,
  including Taiwan, Philippines, Dubai and other routes, self-operated lines,
  warehousing, customs and delivery flow.
- The sole effective drain then received `ai_client_rate_limited` during
  `website_synthesis`. The job stopped at stage `synthesizing`, progress 85,
  attempts 1, execution state `retry_wait`, no lease, with
  `retry_not_before=2026-08-05T06:39:23.630Z`. The report technical scan is
  completed, but no AI report, site snapshot, question set, questions, order,
  payment event, credit, access, email, Deep job, artifact, or refund exists.
- No retry, payment, Deep run, browser follow-up, DNS repeat, file/source, Git,
  or unrelated process action followed.
- Terminal status: **the target site and execution logic now match, but the
  provider rate-limited the final Free synthesis before questions. The current
  approved scope forbids a retry; one built-in continuation of this exact
  nonterminal retry-wait job and the remaining paid chain require a new FROZEN
  scope and explicit approval.**

---

## 2026-08-05 - Approved Free continuation stopped before launch at unresponsive Web

- The user approved one built-in continuation of the exact nonterminal
  retry-wait Free job and the remaining paid chain.
- Database time was later than `retry_not_before`; the job remained
  `synthesizing`/85%, attempts 1, `retry_wait`, unleased. The target report,
  checkpoint, two old failed lineages, authority, and zero commercial/question/
  Deep/artifact counts matched. Catalog initially returned HTTP 200 enabled
  test mode at USD 99.00; Web PID 16920, Stripe listener PID 56728, and the
  unrelated personal site matched.
- The runtime operator stopped before launching a Worker after a 15-second
  Catalog timeout and an apparent downstream count drift. Independent SQL
  proved its count interpretation was wrong: the seventh value, artifact
  revisions, was zero; the final value was the one expected
  `staging_free_regenerations` row belonging to the target report.
- No unapproved consumer existed. Only Web PID 16920 was connected to the
  disposable database. Orders, events, credits, access, email, Deep jobs,
  artifacts and refunds remained zero.
- An independent Catalog read then also timed out after 30 seconds. The Web
  process continued to own port 3010 but was not serving readiness. The scope
  prohibited a process restart, so no continuation Worker, payment, Deep run,
  browser action, or state mutation followed.
- Terminal status: **the database did not drift and the approved continuation
  remains unconsumed, but Gate C Web PID 16920 is unresponsive. One exact Web
  replacement plus the already bounded continuation/payment/Deep chain require
  a new FROZEN scope and explicit approval.**

---

## 2026-08-05 - Web recovered; approved Free continuation failed language validation

- The user approved one exact replacement of unresponsive Web PID 16920, one
  continuation of the named retry-wait job, and the remaining paid chain. The
  approval included a conditional primary-owner override for only the Web
  replacement.
- PID 16920 was stopped once and replaced by Gate C Web PID 60288 on port 3010
  with the corrected in-memory staging/provider/database/Stripe/local-secret
  runtime. Listener PID 56728 and the unrelated personal site were untouched.
  Catalog returned HTTP 200 enabled test mode, USD 99.00 in 844 ms.
- The database, expected regeneration row, target job, old failures, authority,
  and zero downstream counts matched before the single continuation.
- The one continuation used the normal PostgreSQL batch claim path and reached
  website synthesis. It stopped at progress 85 with attempts 2 of 3,
  `retry_wait`, no lease, and `unexpected_internal_error`. No questions, order,
  payment, Deep job or artifact was created.
- Append-only `scan_job_error_events` supplied the authoritative diagnosis:
  attempt 1 was `AiClientError`, HTTP 429; attempt 2 was
  `WebsiteReportLanguageValidationError`. The second model result violated the
  immutable zh report-language contract across executive-summary, dimension,
  finding, page-analysis and roadmap fields. It was classified transient with
  retry-not-before `2026-08-05T07:00:25.515Z`.
- No third attempt, browser/payment action, Deep run, DNS repeat, file/source,
  Git, or unrelated process action followed.
- Terminal status: **Web readiness and the real target crawl are correct, but
  the second synthesis output failed the zh language contract. The current
  scope permits no further retry. One final built-in attempt 3 and the remaining
  paid chain require a new FROZEN scope and explicit approval; if attempt 3
  fails, this lineage must stop permanently.**

---

## 2026-08-05 - Final Free attempt completed without required report outputs

- The user approved exactly one final built-in continuation, attempt 3 of 3,
  for Free job `199b550b-ebd6-4f83-b751-6e8d0d91c403`. Payment and Deep were
  conditional on three correct durable Shun Express buyer questions.
- The exact preflight passed: Gate C Web PID 60288 and Stripe listener PID
  56728 matched, Catalog was enabled in Stripe test mode at USD 99.00, the
  disposable staging database and authority matched, the retry cooldown had
  elapsed, and the named job was the sole claimable Free job.
- One Worker was launched through `D:\node\npm.cmd` with PostgreSQL batch mode
  and the approved process-only runtime overrides. It normally claimed the
  named job as attempt 3 and reached terminal `completed`, progress 100,
  attempts 3 of 3, with no lease or retained error. No second Worker ran.
- The mandatory output gate nevertheless failed: the report had zero site
  snapshots, zero checkpoints, zero question sets and zero questions, so no
  Shun Express question text or source association existed.
- A queued, unleased Deep job with reason `v4_pre_admission` appeared before
  payment, while orders, payment events, credits, access rows, emails, refunds
  and artifacts remained zero.
- The scope's fail-closed condition was applied. No Checkout Session, payment,
  browser action or Deep drain followed, and no report/job state was repaired,
  retried, replayed, reopened, cloned or substituted.
- Terminal status: **the final authorized Free attempt is consumed and the
  lineage failed acceptance because its required durable report/question
  outputs do not exist. This lineage is permanently stopped before payment.**

### Correction after main-branch state-machine comparison

- The preceding terminal interpretation was incorrect and is superseded by
  current source and database evidence. `HEAD`, local `main` and `origin/main`
  were identical, and the Stripe diff did not modify the Free Worker or report
  pipeline.
- Main intentionally creates one queued `v4_pre_admission` job after the Free
  base job completes. Although stored on the Deep lane, the status API exposes
  it as the remaining free preview stage. That job, not the completed Free base
  job, creates the V4 site snapshot and three buyer questions before checkout.
- Database evidence showed the exact pre-admission job remained queued,
  unleased and unattempted at 0 of 1. Therefore zero snapshots/questions at
  that boundary were expected and did not prove report failure. The lineage
  was not permanently stopped; the correct continuation starts with that exact
  pre-admission job and never reruns Free.

---

## 2026-08-05 - Corrected pre-admission path expired before its first claim

- The user approved removal of unrelated generated drift and continuation from
  the existing queued V4 pre-admission job without rerunning Free.
- `apps/web/next-env.d.ts` was restored to the exact `main` object. The retained
  production/test/dependency/documentation diff remained Stripe-specific.
- Six focused Stripe test files passed all 34 tests, targeted ESLint passed,
  and the full workspace build passed, including the Stripe Webhook route.
- The exact pre-admission job was the sole claimable Deep job and was normally
  claimed once. It failed at progress 5, attempt 1 of 1, during `admission` with
  `Free teaser requires one terminal analyzable Admission snapshot.` No retry,
  payment, browser action or paid Deep run followed.
- Durable evidence showed no HTTP crawl, search, source retrieval, question or
  provider/model call. The terminal snapshot contained one candidate, zero
  analyzable pages and one deadline exclusion.
- Root cause is confirmed from source and database time: the ten-minute product
  deadline is anchored to the pre-admission job's `created_at`, not its claim
  time. The job was created at `2026-08-05T07:06:51.303383Z`, expired at
  `07:16:51.303383Z`, and was not claimed until `07:21:40.504Z`. The production
  runner therefore selected its no-network deadline fallback and immediately
  finalized an unavailable snapshot.
- Terminal status: **the Stripe implementation remains locally verified, but
  this Shun Express lineage did not reach Stripe Checkout. The pre-admission
  one-shot was consumed by an operational delay before claim; its failed
  lineage was not repaired or replayed. This lineage-local outcome does not
  supersede the successful Gate B Stripe Sandbox payment proof recorded above.**

---

## 2026-08-05 - Payment-only fixture stopped before Stripe Checkout

- The user approved one payment-only acceptance with no Worker, website read,
  search, model, report generation or delivery consumer.
- Preflight verified Gate C Web PID 60288, enabled Stripe test Catalog at USD
  99.00, listener PID 56728 forwarding to the port-3010 Stripe Webhook, staging
  schema-45 PostgreSQL on tmpfs, and zero rows for all deterministic fixture
  and commercial identities.
- One temporary ignored harness used the repository's Free-direct receipt
  helper to insert one checkout-only Shun Express fixture report, one completed
  snapshot, one confirmed high-confidence question set with exactly three
  questions, and one completed pre-admission semantic carrier. The harness was
  deleted immediately and no retained source/test/config file changed.
- The application status endpoint did not accept the synthetic carrier as
  checkout-ready: `hasAiReport=false`, `checkoutEligible=false`, and the
  business-question endpoint exposed no active set. The approved fail-closed
  condition therefore stopped before any checkout request.
- Final fixture counts are report 1, snapshot 1, question set 1, questions 3,
  carrier 1. Orders, payment events, credits, access keys, emails, paid jobs,
  artifacts and refunds remain zero. No Stripe Checkout Session, payment,
  Webhook delivery, browser payment, Worker or external provider/model call
  occurred.
- Terminal status: **the local Stripe code remains test/build verified, but the
  payment-only synthetic precondition was rejected by the application's
  semantic authority parser. This one-time fixture did not start Stripe
  Checkout. That fixture-local outcome does not supersede the successful Gate B
  Stripe Sandbox payment and exactly-once acceptance recorded above.**

---

## 2026-08-05 - Stripe Sandbox Checkout local closeout accepted

- The user approved one consolidated local-only scope to review, minimally
  repair, test, build, and independently review the uncommitted Stripe Sandbox
  Checkout candidate. No report, Checkout Session, payment, refund, provider
  call, Worker, consumer, database, runtime, deployment, or Git mutation ran.
- The complete path review found no Worker, report-generation, database-schema,
  deployment, or unrelated production change. No additional task-owned drift
  remained to remove, and builds created no tracked or untracked drift.
- Local review added fail-closed validation for Checkout Session amount and
  currency, `livemode=false`, paid async status, and binding of non-paying
  Checkout events before recording. All Session-bearing Webhooks now verify the
  order, Session, amount, and currency before entering the existing PostgreSQL
  event boundary.
- Independent review found two actionable issues. Both were repaired: live
  commerce now stops before any report/order read or write, and Stripe return
  URLs now use canonical `OGC_REPORT_BASE_URL` rather than the incoming request
  Host. The second independent pass found no remaining actionable finding.
- Final focused verification passed all six files and 42 tests. Targeted ESLint
  passed, `git diff --check` passed, and the complete workspace build passed,
  including `/api/webhooks/stripe`. The test tracking bound was mechanically
  adjusted from 720 to 875 after the final measured test diff reached 729 lines;
  production remained within its hard 650-line budget at 621 lines.
- Residual non-blocking hardening: the Webhook route buffers `request.text()`
  before applying its 256 KiB check. A true upstream or streaming body limit
  remains separate future security work and must preserve raw signature bytes.
- The historical fixture and pre-admission failures remain unchanged facts and
  do not supersede Gate B: order `56ef077e-44b0-4d59-8de5-a9595eb1a522`
  already proved one `livemode=false`, complete/paid USD 99.00 Checkout, one
  signed Webhook, and the expected exactly-once PostgreSQL consequences.
- Stripe refunds remain unimplemented and fail closed; the refund consumer is
  still Airwallex. Stripe live Checkout/payment/production Webhooks, bank
  verification, payouts, and real-site report delivery remain outside this
  Sandbox acceptance.
- Terminal status: **Stripe Sandbox Checkout is locally acceptable and ready to
  commit, but remains uncommitted pending explicit Git authorization.**

---

## 2026-08-04 - Release receipt: candidate 6bf7f12 (Stripe sandbox checkout) to Protected Staging

- Candidate `6bf7f12749a0ed625e72f8beaf9bed6d98d99fd9`
  (`feat: add Stripe sandbox checkout`, branch
  `codex/stripe-sandbox-checkout`, NOT merged to `main`) deployed under a
  user-approved FROZEN scope. No merge, push, branch, or worktree deletion.
- Pre-deploy platform setup (user-approved): one Stripe-specific Vercel
  protection-bypass token (note `stripe-sandbox-webhook`); one Stripe Sandbox
  webhook endpoint `we_1U10CaRsPpQ6QFI3r2Zo95Ma` for
  `checkout.session.completed` / `async_payment_succeeded` /
  `async_payment_failed` / `expired` pointing at the fixed staging URL with
  the bypass parameter; `STRIPE_SECRET_KEY` (user-supplied `sk_test_`) and
  the endpoint's fresh `STRIPE_WEBHOOK_SECRET` (`whsec_`) written as
  Sensitive Preview env vars via the Vercel API. No value was printed, logged,
  or committed; local working copies remain only in ignored `.tmp/`.
- Web: ONE manual Preview `dpl_BhCQDqW4nUypHhBmiLrUvftvDunJ`
  (host `open-geo-console-psr11a73g-itheheda-6857s-projects.vercel.app`)
  READY, preview target, exact project, ogcGitSha readback = candidate,
  deployed from clean exact-SHA checkout `.data/deploy-worktree-readmode`.
  Fixed alias moved once (previous/rollback Web
  `dpl_2ogns8cva4RZ9hyBWhgKGJCZYT5a`); post-move alias readback = candidate.
- Worker: ONE full image build (reason: `package-lock.json` dependency
  change; thin overlay forbidden) tagged
  `open-geo-console:staging-6bf7f12-stripe-sandbox-v1`
  (`sha256:cdced559306cafbc2ee8cc3c972e5e0c76d631c4256a73164781fc088d8d04fb`,
  revision label = full candidate SHA). Current previous image
  `sha256:6b8657f2108d...` is the retained rollback line; older images
  untouched, no cleanup.
- Runtime env: original bytes backed up (`.tmp/staging.env.bak-6bf7f12`);
  byte-comparison proves only `OGC_DEPLOYMENT_VERSION` changed. Exactly the
  two named Worker services recreated once; Commerce and Production
  untouched.
- Readiness (60s boundary): both workers ready in 1s, exact candidate image
  ID, correct free/deep tiers, staging/preview/test markers, restart count
  zero. Zero claimable/running/recoverable/exhausted work before and after
  (only the five pre-existing historical `repair_wait` rows).
- Smoke on the fixed URL: alias readback = candidate; anonymous `/zh`,
  catalog, `POST /api/scan`, and unsigned `POST /api/webhooks/stripe` all
  302 to Vercel SSO; the bypass webhook URL reaches the app and rejects a
  bad signature with 400 (signature verification fail-closed). Zero reports,
  orders, payments, or emails created by deployment smoke.
- Disk: E: 51 GiB free before, 46 GiB after the full build (one new ~1.2 GB
  compressed image plus cache), still above the 20 GiB floor; no prune.
- Terminal status: **Protected Staging deployment completed; the Stripe
  Sandbox real test is the user's pending manual step.** Merge of
  `codex/stripe-sandbox-checkout` to `main`, branch cleanup, and any
  production Stripe work require separate authority. Docs closeout
  (committing this receipt) is pending user authorization.

---

## 2026-08-05 - Release receipt: candidate 9cd3ab6 (Stripe refund dispatch) to Protected Staging

- Candidate `9cd3ab65d18c3c91e2f9962aebc24ba2df789d21`
  (`feat: submit Stripe sandbox refunds through provider dispatch`)
  committed on `codex/stripe-sandbox-checkout`; `main` fast-forwarded and
  both refs pushed (`6bf7f12..9cd3ab6`) under the user's explicit
  提交+部署 instruction.
- Web: ONE manual Preview `dpl_Bf9sihzP3K6E6zX3zbx7W7oifpj8`
  (host `open-geo-console-qqg6rht7x-itheheda-6857s-projects.vercel.app`)
  READY, preview target, exact project, ogcGitSha readback = candidate.
  Fixed alias moved once (previous/rollback Web
  `dpl_BhCQDqW4nUypHhBmiLrUvftvDunJ`); post-move alias readback = candidate.
- Worker: ONE thin source-overlay image
  `open-geo-console:staging-9cd3ab6-stripe-refund-overlay-v1`
  (`sha256:52094df505464f87bf66cf371fef94a6509d5593b5266ceeb1653846ac9cd87a`,
  revision label = full candidate SHA) built FROM the accepted current image
  `open-geo-console:staging-6bf7f12-stripe-sandbox-v1`
  (`sha256:cdced559306c...`, retained as the rollback line). Older images
  untouched, no cleanup.
- Runtime env: original bytes backed up (`.tmp/staging.env.bak-9cd3ab6`);
  byte-comparison proves only `OGC_DEPLOYMENT_VERSION` changed plus exactly
  one appended `STRIPE_SECRET_KEY` (user-supplied Sandbox key, never printed
  or committed). staging-commerce.env projection untouched.
- Recreated exactly `staging-worker-free`, `staging-worker-deep`, and
  `staging-commerce-reconcile` (first authorized commerce-consumer rebuild)
  on the candidate image: ready in 2s, restart count zero, exact image ID,
  correct tiers/markers, reconcile container verified to hold
  `STRIPE_SECRET_KEY` (existence only). Email-only `staging-commerce`,
  Production services untouched. Zero claimable/running work before and
  after (five historical `repair_wait` rows only).
- Smoke: alias readback = candidate; anonymous `/zh` and `POST /api/scan`
  302 to Vercel SSO (protection intact); zero workflow effects.
- Refund-row finding (not a deployment defect): the pre-existing pending
  Stripe refund `69202f81-...` exhausted its five retry attempts on the OLD
  image's `commercial_refund_payment_unavailable` and was terminally marked
  `failed` (failure_code `unknown_error`) at 10:09:54, seconds before the
  new consumer container's first cycle; its `refund_assistance` email was
  queued and delivered to the redirected test recipient. Stripe API readback
  confirms ZERO refund objects on `pi_3U10coRsPpQ6QFI30qFhE8Nh`, so nothing
  was ever submitted provider-side. Requeuing that terminal row is a
  historical-data mutation and was NOT performed; it requires a separate
  explicit scope. The deployed dispatch path is unit-tested but has not yet
  been proven by a live Sandbox refund submission.
- Disk: no material change (thin overlay over shared layers); no prune.
- Terminal status: **Protected Staging deployment completed; Stripe refund
  dispatch live but unproven end-to-end; the terminal refund row awaits a
  user decision (scoped requeue, manual provider refund plus scoped sync, or
  leave as-is).**

---

## 2026-08-05 - Receipt: single-row Stripe refund requeue (scope-approved)

- Guarded correction on staging refund row `69202f81-e7cb-4d2b-a5c6-89ef44a3318a`
  (order `7234ce15-...`): pre-checks verified staging marker, row `failed`/
  unsubmitted, and ZERO Stripe refund objects on `pi_3U10coRsPpQ6QFI30qFhE8Nh`;
  the conditional update matched exactly one row (`state=pending`,
  `attempts=0`, lease/failure fields cleared). The order's `refund_status`
  was `failed` and was restored to `pending` per the scope's conditional.
  No other row, the failed report/job, or the delivered assistance email was
  touched.
- The deployed `staging-commerce-reconcile` consumer submitted the refund on
  its next cycle (no agent Stripe call): row `succeeded` at
  2026-08-05T10:58:45Z with `provider_refund_id=re_3U10coRsPpQ6QFI30bHZXawh`,
  `submitted_at`/`succeeded_at` set, one attempt.
- Stripe API readback: exactly ONE refund object `re_3U10coRsPpQ6QFI30bHZXawh`,
  status `succeeded`, amount 9900 USD minor, created 10:58:44Z. This is the
  first live proof of the Stripe refund dispatch path deployed in `9cd3ab6`.
- Order converged to `refund_status=refunded`; `payment_status=paid`,
  `fulfillment_status=failed`, and `delivery_status=delivered` unchanged.
- Idempotency: the row is terminal (`succeeded`) and the consumer claims only
  `pending` rows; a full later consumer cycle left Stripe-side count at
  exactly one (`re_3U10coRsPpQ6QFI30bHZXawh` only) and the row unchanged
  (`succeeded`, one attempt). No double refund.
- Terminal status: **Stripe Sandbox refund path verified end to end; the
  customer's stuck refund is now truthfully refunded (Sandbox, no real
  funds).**

---

## 2026-08-06 - Open GEO public relationship and usage-boundary repair

- Objective: make the public homepage identify Open GEO Console as an
  实解智能 product, explain the public homepage-check flow, and state the
  public-input and diagnostic-result boundaries in Chinese and English.
- Production files: `apps/web/src/product/config.ts`, the localized dictionary
  types and Chinese/English dictionaries, and the localized homepage.
- Verification file: `apps/web/src/i18n/i18n.test.ts`.
- Completion: localized tests passed 7/7; Web lint completed with zero errors
  and six pre-existing out-of-scope warnings; the Next.js production build
  passed including its TypeScript validation; desktop and mobile Chinese and
  English browser checks passed without submitting the scanner form or
  observing horizontal overflow.
- The standalone TypeScript command remained blocked by the pre-existing
  TypeScript 6 `baseUrl` deprecation in `apps/web/tsconfig.json`; no
  out-of-scope configuration change was made.
- No scan, provider/model call, report, database write, payment, email,
  deployment, upload, commit, push, merge, or branch action was performed
  under that implementation scope.

---

## 2026-08-06 - Preview publication stopped at independent SHA verification

- User-approved release mode: publish the completed homepage repair to
  `origin/main`, create exactly one isolated manual Vercel Preview, and move no
  production or fixed-Staging alias.
- Candidate commit `258db0b886d0cd68dc6e7908cc94380c878b1595`
  (`feat: clarify Open GEO product relationship`) was created on `main` and
  pushed once. Local `main` and `origin/main` matched exactly and the canonical
  checkout was clean.
- Exactly one manual Preview was created:
  `dpl_AHXiNtFmkmSfeLyLKcakBt2v3JS3`,
  `https://open-geo-console-kjq3ptext-itheheda-6857s-projects.vercel.app`.
  The deploy command completed successfully in about 110 seconds and CLI
  inspection reported `READY`, target `preview`, and the intended project.
- Independent identity acceptance did not complete: the CLI inspection exposed
  no `ogcGitSha` or Git SHA fields. A following read-only `npx vercel api
  --help` usage command returned exit code 1. The approved stop condition was
  therefore reached before browser QA.
- No retry, second deployment, alias movement, promotion, production action,
  Vercel environment change, Worker/Docker action, database/data operation,
  scan, report, provider/model call, payment, refund, or email occurred.
- Terminal result: **Git publication succeeded and one READY Preview exists,
  but candidate identity and user-visible Preview acceptance remain unverified.**
  A new explicit scope is required for any bounded metadata recovery or
  browser QA.
