# Active Change Scope Lock

Status: `APPROVED`

Prepared on 2026-08-07 after the user asked to deploy local code for manual
testing. The dirty tree is the already-completed **Clean Paid V3 article and
explainable score presentation** scope (archived in
`docs/ACTIVE-CHANGE-SCOPE-HISTORY.md`). User approved this exact Staging Gates
0–3 allowlist on 2026-08-07 and explicitly included `git push origin main`
(cap 1).

## Objective

Package the dirty working tree as **one** candidate commit on top of current
`main` (`597b9daf…`), then deploy **Protected Staging only** through Gates 0–3
so the fixed Staging URL and Staging free/deep Workers serve:

- clean Paid V3 article reading surface (title vs research query; supporting
  notes collapsed after the article)
- reconstructable `technical_checklist_v2` scoring presentation
- synthesis score-band rubric for semantic dimensions

The user performs manual browser testing. Agent does **not** run Gate 4, model
calls, payments, refunds, or email.

## Confirmed baseline

| Item | Value |
|---|---|
| Repository | `E:\project\open-geo-console` |
| Branch | `main` tracking `origin/main` (clean remote identity at `597b9daf…`) |
| Pre-commit HEAD | `597b9daf801ae75463e5ce598b7c32939eb94a43` |
| Dirty surface | 11 paths, ~+305/-261 at FROZEN write |
| Current Staging Workers | `open-geo-console:staging-597b9daf-recovery-article-overlay-v1`, `OGC_DEPLOYMENT_VERSION=597b9daf…` |
| package-lock / Dockerfile.worker | unchanged → thin overlay only |
| Full Worker rebuild | **forbidden** |

## Allowed actions (only after APPROVED)

### Gate 0 — candidate package

1. Commit **only** the allowlisted dirty paths. One commit on `main`.
2. Record full candidate SHA. `git push origin main` only if approval explicitly
   includes push (default **0**).
3. Clean exact-SHA checkout under `.data/staging-release-<short>/`.

### Gate 1 — preflight

1. Confirm Docker engine, disk free, idle Staging free/deep (wait/drain only).
2. Record rollback: fixed-alias host, Worker image tag/ID, version `597b9daf…`.
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
   - `FROM open-geo-console:staging-597b9daf-recovery-article-overlay-v1`
   - `COPY` only `apps/` and `packages/`; OCI revision = full candidate SHA
   - tag: `open-geo-console:staging-<short>-score-article-overlay-v1`
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

- Paid V3 article: main body first; supporting notes collapsed after.
- Technical score: reconstructable checklist vs legacy label.
- Semantic dimensions: separate from technical score; band presentation.

## File allowlist

### Commit surface

| Path | Role |
|---|---|
| `packages/geo-auditor/src/index.ts` | `technical_checklist_v2` score breakdown |
| `packages/geo-auditor/src/index.test.ts` | Score arithmetic tests |
| `packages/ai-report-engine/src/synthesis.ts` | Score-band rubric in synthesis prompt |
| `packages/ai-report-engine/src/synthesis.test.ts` | Rubric presence tests |
| `apps/web/src/worker/geo-article-example.ts` | Editorial title vs research query |
| `apps/web/src/worker/geo-article-example.test.ts` | Article generation tests |
| `apps/web/src/components/combined-geo-report-v3-artifact.tsx` | Article surface + score presentation |
| `apps/web/src/components/combined-geo-report-v3-artifact.test.tsx` | Render tests |
| `apps/web/src/report/artifact-styles.ts` | Checklist / supporting-notes styles |
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
- Historical report recalculation or mutation.
- Agent Gate 4 / model / payment / refund / email.
- Second Preview/overlay/alias without a new scope after failure.
- Expanding source beyond the allowlisted dirty set.

## Diff budget

- Application production/test: **0 new lines** in this scope (package existing
  dirty tree only; ~+305/-261 at FROZEN write).
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
   `open-geo-console:staging-597b9daf-recovery-article-overlay-v1`.
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
