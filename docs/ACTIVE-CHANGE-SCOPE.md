# Active Change Scope Lock

Status: `APPROVED`

Prepared on 2026-08-08 after the user asked to deploy local code for manual
testing. The dirty tree is the already-completed **pre-admission bounded retry
and free-report fallback** implementation (archived in
`docs/ACTIVE-CHANGE-SCOPE-HISTORY.md`). User approved this exact Staging Gates
0–3 allowlist on 2026-08-08 and explicitly included `git push origin main`
(cap 1).

## Objective

Package the dirty working tree as **one** candidate commit on top of current
`main` (`9f2732b0…`), then deploy **Protected Staging only** through Gates 0–3
so the fixed Staging URL and Staging free/deep Workers serve:

1. Prospective `v4_pre_admission` jobs: max three attempts; only typed
   transport/upstream outages enter retry wait; contract failures stay terminal.
2. Checkpoint resume for valid `questions_ready` / `q1_answer_ready` without
   re-running completed question-generation model calls.
3. Marker-bearing terminally incomplete free teaser falls through to the
   persisted technical/Free AI report view (no fabricated Q1, no teaser checkout).

The user performs manual browser testing. Agent does **not** run Gate 4, model
calls, payments, refunds, or email.

## Confirmed baseline

| Item | Value |
|---|---|
| Repository | `E:\project\open-geo-console` |
| Branch / HEAD | `main` / `9f2732b0914767c937853e9e58df51af4ae50264` (matches `origin/main`) |
| Dirty surface | 10 modified + 1 untracked test, ~+224/-196 tracked |
| Current Staging Workers | `open-geo-console:staging-3b732680-split-questions-overlay-v1` (`93de239b060f`), env `OGC_DEPLOYMENT_VERSION=3b732680…` (Worker lag behind HEAD is pre-existing) |
| Overlay FROM base | Use currently running Worker image `staging-3b732680-split-questions-overlay-v1` as thin-overlay base (source-only; includes apps+packages; candidate also includes later HEAD commits via clean checkout COPY) |
| package-lock / Dockerfile.worker | unchanged → thin overlay only |
| Full Worker rebuild | **forbidden** |

Note: thin overlay copies the clean candidate checkout’s `apps/` + `packages/`,
so the image content is the full candidate SHA even when FROM is an older
overlay base.

## Allowed actions (only after APPROVED)

### Gate 0 — candidate package

1. Commit **only** the allowlisted dirty paths. One commit on `main`.
2. Record full candidate SHA. `git push origin main` only if approval
   explicitly includes push (default **0**).
3. Clean exact-SHA checkout under `.data/staging-release-<short>/`.

### Gate 1 — preflight

1. Confirm Docker engine, disk free, idle Staging free/deep (wait/drain only).
2. Record rollback: fixed-alias host, Worker image tag/ID, version from
   `staging.env` / containers.
3. Confirm thin-overlay path.
4. `npx vercel whoami` from the clean checkout.

### Gate 2 — Staging deploy (source-only)

1. **One** manual Preview:
   ```powershell
   $env:VERCEL_ORG_ID = 'team_PbYYV2K2zBjTeThfavXStTOI'
   $env:VERCEL_PROJECT_ID = 'prj_WVpdlJfsEp0YyWM2W54w8oBy985S'
   npx vercel deploy --yes --meta ogcGitSha=<candidate-full-sha>
   ```
2. Require `READY` and `gitCommitSha = ogcGitSha = <candidate-full-sha>`.
3. Build **exactly one** thin overlay:
   - `FROM open-geo-console:staging-3b732680-split-questions-overlay-v1`
   - `COPY` only `apps/` and `packages/`; OCI revision = full candidate SHA
   - tag: `open-geo-console:staging-<short>-preadmit-retry-overlay-v1`
4. Preserve `staging.env` bytes; replace **only** `OGC_DEPLOYMENT_VERSION`.
5. Recreate **only** `staging-worker-free` and `staging-worker-deep`
   (`--no-deps --no-build --force-recreate`).
6. Inline 60s / 2s readiness wait — **do not** source the full body of
   `scripts/start-report-v4-staging-workers.ps1`.
7. Move fixed alias **once** to the candidate Preview for
   `open-geo-console-staging-itheheda.vercel.app`.

### Gate 3 — protection smoke (agent)

- Fixed `/zh` protection (SSO 302 OK), Web/Worker SHA equality, restart 0.
- No report/crawl/model/order/payment/refund/email.

### Manual testing (user only)

- New Free/V4 pre-admission: transient upstream failures may retry up to 3
  attempts; permanent/contract failures stay terminal.
- Incomplete marker-present teaser shows technical/Free report fallback, not
  empty teaser checkout fabrication.
- Use **new** prospective reports only.

## File allowlist (commit surface)

| Path | Role |
|---|---|
| `apps/web/src/worker/processor.ts` | Pre-admission retry eligibility |
| `apps/web/src/worker/processor.test.ts` | Retry tests |
| `apps/web/src/worker/report-v4-free-teaser.ts` | Checkpoint resume / attempt budget |
| `apps/web/src/worker/report-v4-free-teaser.test.ts` | Free teaser tests |
| `apps/web/src/db/report-v4-admission-jobs.ts` | Attempt/max-attempt handling |
| `apps/web/src/db/report-v4-admission-jobs.test.ts` | Admission job tests |
| `apps/web/src/db/commercial-orders-semantic-review.postgres.test.ts` | Mechanical test alignment if dirty |
| `apps/web/src/app/[locale]/reports/[id]/page.tsx` | Free report fallback render |
| `apps/web/src/app/[locale]/reports/[id]/page.test.tsx` | New page fallback tests |
| `docs/ACTIVE-CHANGE-SCOPE.md` | This scope / receipts |
| `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md` | Archive only if already dirty |

### Deploy-only paths

| Path | Purpose |
|---|---|
| `.data/staging-release-<short>/**` | Clean checkout + Dockerfile.overlay |
| `.data/workstation-docker/staging.env` | `OGC_DEPLOYMENT_VERSION` only |
| `.data/workstation-docker/staging-*.override.yaml` | free/deep image tag only |

## Explicitly forbidden

- Production anything.
- Full Worker rebuild; Docker mass prune.
- Historical report/job/order mutation, replay, clone.
- Agent Gate 4 / model / payment / refund / email.
- Second Preview/overlay/alias without a new scope after failure.
- Expanding source beyond the allowlisted dirty set at commit time.
- Stripe webhook resend or commerce mutation.

## Diff budget

- Application production/test: **0 new lines** in this scope (package existing
  dirty tree only; ~+224/-196 tracked at FROZEN write plus untracked page test).
- Scope/history docs for status and receipts only.

## Expensive external actions (hard caps)

| Action | Max |
|---|---|
| Candidate commit on `main` | 1 |
| `git push origin main` | 0 unless approval includes push; then 1 |
| Staging Preview deploy | 1 |
| Thin overlay Docker build | 1 |
| Staging free+deep recreate | 1 pair |
| Fixed alias move | 1 |
| Agent report / payment / model / refund / email | **0** |

## Acceptance checks

1. Candidate full SHA equals Web meta and both Workers’ revision / version.
2. Fixed alias points at the candidate Preview.
3. Free and deep running, restart 0, readiness present.
4. Gate 3 smoke or SSO boundary recorded.
5. Rollback identities recorded before cutover.

## Rollback

1. Restore prior `OGC_DEPLOYMENT_VERSION` / `staging.env` bytes.
2. Recreate free+deep on
   `open-geo-console:staging-3b732680-split-questions-overlay-v1`
   (`sha256:93de239b060f…`).
3. Restore prior Web host if alias moved.
4. Verify and **stop**.

## Stop conditions

- Dirty tree outside allowlist at commit time.
- package-lock / Dockerfile.worker change → full rebuild required.
- SHA mismatch, readiness failure, or Production path required.

---

**Awaiting explicit user approval of this exact allowlist.**  
Reply with approval (and whether to include `git push origin main`) to set
Status `APPROVED` and execute Gates 0–3 only.
