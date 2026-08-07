# Active Change Scope Lock

Status: `APPROVED`

Prepared on 2026-08-07 after the user asked to deploy local code for manual
testing. The dirty tree packages two already-completed local scopes:

1. Browser-scoped unfinished-report recovery entry
2. Business-specific, GEO-native Paid V3 article delivery

plus any residual presentation/readiness edits already present in that dirty
set. User approved this exact Staging Gates 0–3 allowlist on 2026-08-07 and
explicitly included `git push origin main` (cap 1).

## Objective

Package the full dirty working tree as **one** candidate commit on top of
current `main` (`c0deea7e…`), then deploy **Protected Staging only** through
Gates 0–3 so the fixed Staging URL and Staging free/deep Workers serve the
candidate. The user performs manual browser testing.

Out of scope for the agent: Gate 4 automated free/paid lineage, report
submission, payment, refund, email, model call, Production anything.

## Confirmed baseline

| Item | Value |
|---|---|
| Repository | `E:\project\open-geo-console` |
| Branch | `main` (`ahead 1` of `origin/main` with prior decision-narrative commit) |
| Pre-commit HEAD | `c0deea7eee89daef9d8adf2e8ff6e3e6a19ebcc9` |
| Dirty surface | 19 modified tracked paths + 4 untracked recovery files (~+900/-496 tracked) |
| Current Staging Workers | `open-geo-console:staging-c0deea7e-decision-narrative-overlay-v1` (`sha256:0a39b263…`), `OGC_DEPLOYMENT_VERSION=c0deea7e…` |
| Docker Desktop | running (29.6.1) at FROZEN write |
| Disk free (E:) | ~41.2 GiB → thin overlay only; full Worker rebuild forbidden |
| package-lock / Dockerfile.worker | unchanged by this candidate |

## Allowed actions (only after APPROVED)

### Gate 0 — candidate package

1. Commit **only** the allowlisted dirty paths (tracked + the four new recovery
   files). One commit on `main` on top of `c0deea7e`.
2. Record full candidate SHA. `git push origin main` only if the approval
   explicitly includes push (default **0**). Note: this would also publish the
   already-local `c0deea7e` commit if still unpushed.
3. Clean exact-SHA checkout under `.data/staging-release-<short>/` for deploy
   artifacts only.

### Gate 1 — preflight

1. Confirm Docker engine, disk free, idle Staging free/deep (wait/drain only;
   never force-fail history).
2. Record rollback: current fixed-alias host, Worker image tag/ID, and
   `OGC_DEPLOYMENT_VERSION=c0deea7e…`.
3. Confirm thin-overlay path.
4. `npx vercel whoami` succeeds from the clean checkout.

### Gate 2 — Staging deploy (source-only)

1. **One** manual Preview from the clean checkout:
   ```powershell
   $env:VERCEL_ORG_ID = 'team_PbYYV2K2zBjTeThfavXStTOI'
   $env:VERCEL_PROJECT_ID = 'prj_WVpdlJfsEp0YyWM2W54w8oBy985S'
   npx vercel deploy --yes --meta ogcGitSha=<candidate-full-sha>
   ```
2. Require `READY` and `gitCommitSha = ogcGitSha = <candidate-full-sha>`.
3. Build **exactly one** thin source-overlay:
   - `FROM open-geo-console:staging-c0deea7e-decision-narrative-overlay-v1`
   - `COPY` only `apps/` and `packages/`; OCI revision = full candidate SHA
   - tag: `open-geo-console:staging-<short>-recovery-article-overlay-v1`
4. Preserve original `staging.env` bytes; replace **only**
   `OGC_DEPLOYMENT_VERSION` with the full candidate SHA.
5. Transient compose override; recreate **only**
   `staging-worker-free` and `staging-worker-deep`
   (`--no-deps --no-build --force-recreate`).
6. Wait readiness with the proven 60s / 2s poll (inline `Wait-WorkerReadiness`
   only — **do not** source the full body of
   `scripts/start-report-v4-staging-workers.ps1`). Require image ID/revision,
   tier, restart 0.
7. After Web + Workers share the full SHA, move fixed alias **once** to the
   candidate Preview for
   `open-geo-console-staging-itheheda.vercel.app`.

### Gate 3 — protection smoke (agent)

- Fixed URL `/zh` protection (SSO 302 acceptable), Web/Worker SHA equality,
  restart counts 0.
- No report/crawl/model/order/payment/refund/email from smoke.

### Manual testing (user only)

User validates, for example:

- Home recovery card for recent unfinished tasks (same browser cookie only)
- Paid V3 GEO article as complete article deliverable (not outline)
- Presentation/readiness behavior already in the dirty tree

Agent does **not** submit reports or commerce actions.

## File allowlist

### Commit surface (package existing dirty tree only)

**Browser recovery**

- `apps/web/src/server/recent-report-resume.ts` (new)
- `apps/web/src/server/recent-report-resume.test.ts` (new)
- `apps/web/src/components/recent-report-resume-card.tsx` (new)
- `apps/web/src/components/recent-report-resume-card.test.tsx` (new)
- `apps/web/src/app/[locale]/page.tsx`
- `apps/web/src/app/api/scan/route.ts`
- `apps/web/src/app/api/scan/route.persistence.test.ts`
- `apps/web/src/i18n/en.ts`
- `apps/web/src/i18n/zh.ts`
- `apps/web/src/i18n/types.ts`

**Paid V3 GEO article**

- `packages/ai-report-engine/src/combined-geo-report-v3.ts`
- `packages/ai-report-engine/src/combined-geo-report-v3.test.ts`
- `apps/web/src/worker/geo-article-example.ts`
- `apps/web/src/worker/geo-article-example.test.ts`
- `apps/web/src/worker/processor.ts`
- `apps/web/src/worker/paid-v3-direct-linear-flow.postgres.test.ts`
- `apps/web/src/report/combined-artifact-readiness.tsx`
- `apps/web/src/report/combined-artifact-readiness.test.tsx`
- `apps/web/src/components/combined-geo-report-v3-artifact.tsx`
- `apps/web/src/components/combined-geo-report-v3-artifact.test.tsx`
- `apps/web/src/report/artifact-styles.ts`

**Scope docs**

- `docs/ACTIVE-CHANGE-SCOPE.md`
- `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md`

### Deploy-only paths (ephemeral / ignored runtime)

| Path | Purpose |
|---|---|
| `.data/staging-release-<short>/**` | Clean checkout + Dockerfile.overlay |
| `.data/workstation-docker/staging.env` | `OGC_DEPLOYMENT_VERSION` only |
| `.data/workstation-docker/staging-*.override.yaml` | Candidate free/deep image tag only |

## Explicitly forbidden

- Production Web/Workers/commerce/data/images/alias.
- Full Worker rebuild (`npm ci`, Playwright, OS packages).
- Broad Docker prune / mass image delete.
- Historical report/job/order replay, repair, clone.
- Agent Gate 4 lineage, model calls, payments, refunds, email.
- Second Preview/overlay/alias without a new approved scope after failure.
- Expanding source beyond the allowlisted dirty set at commit time.

## Diff budget

- Application production/test: **0 new lines** in this scope (package existing
  dirty tree only; ~+900/-496 tracked at FROZEN write plus four new recovery
  files).
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

## Acceptance checks (ready for user manual test)

1. Candidate full SHA equals Web `gitCommitSha` / `ogcGitSha` and both Workers’
   image revision / `OGC_DEPLOYMENT_VERSION`.
2. Fixed Staging alias points at the candidate Preview.
3. Free and deep running, restart 0, readiness logs present.
4. Gate 3 protection smoke or SSO boundary recorded.
5. Rollback identities recorded before cutover.

## Rollback

On Gate 2/3 failure after mutation:

1. Restore prior `OGC_DEPLOYMENT_VERSION` / original `staging.env` bytes.
2. Recreate only free+deep on
   `open-geo-console:staging-c0deea7e-decision-narrative-overlay-v1`
   (`sha256:0a39b263…`).
3. If alias moved, restore prior Web host once.
4. Verify and **stop**. No second Preview/build without a new scope.

## Stop conditions

- Dirty tree contains paths outside the allowlist at commit time.
- Thin overlay path invalid (package-lock / Dockerfile.worker change).
- Preview READY but SHA mismatch, Worker readiness failure, or identity inequality.
- Any Production path required.

---

**Awaiting explicit user approval of this exact allowlist.**  
Reply with approval (and whether to include `git push origin main`) to set
Status `APPROVED` and execute Gates 0–3 only.
