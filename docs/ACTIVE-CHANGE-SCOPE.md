# Active Change Scope Lock

Status: `APPROVED`

Prepared on 2026-08-07 after the user asked to deploy the local Direct V3
HTML-only / answer-preserving work so they can manually test. User approved
this exact Staging Gates 0–3 allowlist on 2026-08-07 with Docker Desktop
already running. `git push origin main` was not included → push count remains 0.

## Objective

Package the already-implemented local working tree as one candidate commit,
then deploy **Protected Staging only** through Gates 1–3 so the fixed Staging
URL and Staging free/deep Workers run the candidate. The user performs manual
browser/report testing themselves.

Out of scope for the agent: Gate 4 automated free/paid lineage, new report
submission, payment, refund, email send, model probe, Production anything.

## Confirmed baseline

| Item | Value |
|---|---|
| Repository | `E:\project\open-geo-console` |
| Branch | `main` tracking `origin/main` |
| Pre-commit HEAD | `3eb4f9cf05834f087c2159426d85c464a19b0ed8` |
| Dirty tree | 48 paths, Direct V3 HTML-only scope already implemented and unit/lint/build checked locally |
| Current Staging env version | `OGC_DEPLOYMENT_VERSION=8c58ae4f2800703b922f6658ad754681924b3acd` in `.data/workstation-docker/staging.env` |
| Docker Desktop Linux engine | **not running** at FROZEN write (must start under Gate 1) |
| Disk free (E:) | ~43.5 GiB (thin overlay only; full Worker rebuild forbidden) |
| package-lock / Dockerfile.worker / base image | unchanged by this candidate → **thin source-overlay only** |
| Prior implementation scope | Archived under `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md` (2026-08-07 Paid V3 Direct HTML-only) |

Rollback Web host and exact Worker image IDs must be re-recorded in Gate 1
after Docker starts and after reading the current fixed alias / container
inspect, before any cutover.

## Allowed actions (only after APPROVED)

### Gate 0 — candidate package

1. Commit **only** the already-approved Direct V3 production/test/doc paths
   present in the dirty tree (see allowlist). One commit on `main`.
2. Record the full candidate SHA. Optional: one `git push origin main` if the
   user approved push in the same approval (needed only for remote backup /
   share; Vercel CLI deploy does not require push under current `link=null`).
3. Create one clean exact-SHA checkout under
   `.data/staging-release-<shortsha>/` (detached) for deploy artifacts only.
   No second worktree for ordinary edits.

### Gate 1 — preflight

1. Start Docker Desktop only if needed; wait until the Linux engine answers.
2. Record: free disk, `docker system df`, current Staging free/deep image IDs
   and tags, `OGC_DEPLOYMENT_VERSION`, fixed alias target host, zero
   claimable/running/recoverable Staging work (wait/drain only; never force-fail
   historical jobs).
3. Confirm `package.json` / `package-lock.json` / `Dockerfile.worker` unchanged
   vs current Worker base → thin overlay path remains mandatory.
4. `npx vercel whoami` must succeed from the clean checkout.

### Gate 2 — Staging deploy (source-only)

1. **One** manual Preview from the clean checkout:
   ```powershell
   $env:VERCEL_ORG_ID = 'team_PbYYV2K2zBjTeThfavXStTOI'
   $env:VERCEL_PROJECT_ID = 'prj_WVpdlJfsEp0YyWM2W54w8oBy985S'
   npx vercel deploy --yes --meta ogcGitSha=<candidate-full-sha>
   ```
2. Independently require `READY`, Preview target, project/team match, and
   `gitCommitSha = ogcGitSha = <candidate-full-sha>`.
3. Build **exactly one** thin source-overlay Worker image:
   - Dockerfile under `.data/staging-release-<short>/Dockerfile.overlay`
   - `FROM` = recorded current accepted full/base Worker image (not a full rebuild)
   - `COPY` only `apps/` and `packages/`; OCI revision label = full candidate SHA
   - tag: `open-geo-console:staging-<short>-direct-v3-overlay-v1`
4. Preserve original bytes of `.data/workstation-docker/staging.env`; replace
   **only** the single `OGC_DEPLOYMENT_VERSION` line with the full candidate SHA
   (never print secret values).
5. Write a transient compose overlay for free+deep only (`OGC_APP_IMAGE` /
   image tag + version). Recreate **only**:
   `staging-worker-free`, `staging-worker-deep`
   with `--no-deps --no-build --force-recreate`.
6. Use `Wait-WorkerReadiness` from
   `scripts/start-report-v4-staging-workers.ps1` (60s / 2s poll) unchanged.
   Require exact image ID/revision, tier, Staging identity, restart count 0.
7. After Web Preview + both Workers share the full candidate SHA, move the
   fixed alias **once**:
   ```powershell
   npx vercel alias set <candidate-preview-host> `
     open-geo-console-staging-itheheda.vercel.app `
     --scope team_PbYYV2K2zBjTeThfavXStTOI
   ```
8. Staging schema: V47 may apply automatically when Web/Workers open the
   Staging database. That is authorized **only** as the normal forward
   migration on Staging; no row rewrites, no historical report repair, no
   Production migration.

### Gate 3 — protection smoke (agent)

- Fixed URL `/zh` protection behavior, catalog `mode=test` when reachable,
  Web/Worker identity equality, restart counts, zero workflow side effects.
- Human SSO browser confirmation of the protected page may be recorded as the
  browser-facing check if automation is blocked.

### Manual testing (user only)

- User runs whatever free/paid Staging checks they choose.
- Agent does **not** submit reports, create orders, call models, send email,
  or issue refunds under this scope.

## File allowlist

### Commit surface (already implemented; package only)

- All dirty production/test/doc paths from the Direct V3 scope that match
  `git status` at FROZEN write (48 paths under `AGENTS.md`, `README.md`,
  `apps/web/src/**` listed in the prior approved scope, and
  `docs/{AI-REPORT-ENGINE,DECISIONS,REPORT-WORKSPACE,ACTIVE-CHANGE-SCOPE,ACTIVE-CHANGE-SCOPE-HISTORY}.md`).
- No new production files beyond that already-dirty set.

### Deploy-only paths (ephemeral / ignored runtime)

| Path | Purpose |
|---|---|
| `docs/ACTIVE-CHANGE-SCOPE.md` | Status and evidence |
| `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md` | Archive prior scope + final receipt |
| `.data/staging-release-<short>/**` | Clean checkout + Dockerfile.overlay |
| `.data/workstation-docker/staging.env` | `OGC_DEPLOYMENT_VERSION` only |
| `.data/workstation-docker/staging-*.override.yaml` | Candidate free/deep image tag only |

## Explicitly forbidden

- Production Web, Workers, commerce, database, images, alias, or env.
- Full Worker image rebuild (`npm ci`, Playwright/Chromium, OS packages).
- Broad Docker prune / mass image delete.
- Historical report/job/order/payment/refund/email replay, repair, clone.
- Agent-driven Gate 4 lineage, model calls, payments, refunds, or email.
- Second Preview, second overlay build, second alias move, or redeploy retry
  without a new approved scope after failure/rollback.
- Expanding production source beyond the already-dirty Direct V3 set.

## Diff budget

- Application production/test behavior: **0 new lines** in this scope
  (package existing dirty tree only).
- Scope/history docs for status and receipts only.

## Expensive external actions (hard caps)

| Action | Max |
|---|---|
| Candidate commit on `main` | 1 |
| `git push origin main` | 0 unless user explicitly includes push in approval; then 1 |
| Start Docker Desktop | 1 if needed |
| Staging Preview deploy | 1 |
| Thin overlay Docker build | 1 |
| Staging free+deep recreate | 1 pair |
| Fixed alias move | 1 |
| Staging V47 forward migration | automatic with first Staging process open; no manual rewrite |
| Agent report / payment / model / refund / email | **0** |

## Acceptance checks (deploy ready for user manual test)

1. Candidate full SHA equals Web `gitCommitSha` / `ogcGitSha` and both Workers’
   image revision / `OGC_DEPLOYMENT_VERSION`.
2. Fixed Staging alias points at the candidate Preview host.
3. Free and deep Staging containers running, restart count 0, readiness logs
   present within the 60s wait contract.
4. Gate 3 protection smoke passes or SSO boundary is recorded.
5. Rollback identities (prior Web host + prior Worker image ID/tag + prior
   `OGC_DEPLOYMENT_VERSION`) are recorded before cutover and remain available.

## Rollback

On any Gate 2/3 failure after mutation:

1. Restore original `staging.env` bytes (or prior `OGC_DEPLOYMENT_VERSION`).
2. Recreate only free+deep on the recorded prior Worker image.
3. If the fixed alias moved, restore it to the recorded prior Web host once.
4. Verify rollback; **stop**. No second Preview/build without a new scope.

## Stop conditions

- Dirty tree contains unexpected paths outside the Direct V3 allowlist at commit
  time.
- Docker cannot start, or Staging has claimable/running work that cannot be
  drained without force-failing history.
- package-lock / Dockerfile.worker / base changed → full rebuild required
  (out of this scope).
- Preview READY but SHA mismatch, Worker readiness failure, or alias identity
  inequality.
- Any Production path is required.

---

**Awaiting explicit user approval of this exact allowlist.**  
Reply with approval (and whether to include `git push origin main`) to set
Status `APPROVED` and execute Gates 0–3 only.
