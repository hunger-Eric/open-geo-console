# Active Change Scope Lock

Status: `APPROVED`

Prepared on 2026-08-07 after the user asked to deploy local code for manual
testing. The dirty tree is the already-implemented **test-only prospective
report behavior reset** (target-site crawl as authority; crawl-diagnostic
HTML; content-quality limitations non-fatal). User approved this exact Staging
Gates 0–3 allowlist on 2026-08-07 and explicitly included `git push origin main`
(cap 1).

## Objective

Package the dirty working tree as **one** candidate commit on top of current
`main` (`81f19587…`), then deploy **Protected Staging only** through Gates 0–3
so the fixed Staging URL and Staging free/deep Workers serve the candidate.
The user performs manual browser testing of new prospective reports.

Out of scope for the agent: Gate 4 automated free/paid lineage, report
submission, payment, refund, email, model call, Production anything.

## Confirmed baseline

| Item | Value |
|---|---|
| Repository | `E:\project\open-geo-console` |
| Branch | `main` tracking `origin/main` at `81f195876eb4a26a3cd246075f00f21c70777c8b` |
| Dirty surface | 15 paths, ~+486/-191 at FROZEN write (implementation + this deploy scope) |
| Current Staging Workers | `open-geo-console:staging-81f19587-score-article-overlay-v1` (`47566c7a0b8a`), `OGC_DEPLOYMENT_VERSION=81f19587…` |
| package-lock / Dockerfile.worker | unchanged → thin overlay only |
| Full Worker rebuild | **forbidden** |

## Allowed actions (only after APPROVED)

### Gate 0 — candidate package

1. Commit **only** the allowlisted dirty paths. One commit on `main`.
2. Record full candidate SHA. `git push origin main` only if approval
   explicitly includes push (default **0**).
3. Clean exact-SHA checkout under `.data/staging-release-<short>/`.

### Gate 1 — preflight

1. Confirm Docker engine, disk free, idle Staging free/deep (wait/drain only).
2. Record rollback: fixed-alias host, Worker image tag/ID, version `81f19587…`.
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
   - `FROM open-geo-console:staging-81f19587-score-article-overlay-v1`
   - `COPY` only `apps/` and `packages/`; OCI revision = full candidate SHA
   - tag: `open-geo-console:staging-<short>-crawl-diagnostic-overlay-v1`
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

User validates, for example:

- Target crawl failure → crawl-diagnostic HTML report, not failed job
- Parseable model draft with quality defects → HTML with limitations
- Public-search / answer / visual enrichment failures do not block activation

## File allowlist

### Commit surface (package existing dirty tree only)

| Path | Role |
|---|---|
| `apps/web/src/worker/processor.ts` | Crawl-diagnostic terminalization path |
| `apps/web/src/db/combined-correction-terminalization.ts` | Terminal boundary for diagnostic |
| `apps/web/src/db/combined-reports.ts` | Report persistence compatibility |
| `apps/web/src/report/artifact-model.ts` | V3 crawl-diagnostic view model |
| `apps/web/src/report/combined-artifact-readiness.tsx` | Ready HTML for crawl diagnostic |
| `apps/web/src/server/visible-ai-report.ts` | Visible reader for diagnostic payload |
| `apps/web/src/components/combined-geo-report-v3-artifact.tsx` | Diagnostic rendering |
| `apps/web/src/components/combined-geo-report-v3-artifact.test.tsx` | Render tests |
| `apps/web/src/components/combined-artifact-fixtures.ts` | Fixture type narrowing only |
| `packages/ai-report-engine/src/combined-geo-report-v3.ts` | Crawl-diagnostic contract |
| `packages/ai-report-engine/src/combined-geo-report-v3.test.ts` | Contract tests |
| `packages/ai-report-engine/src/synthesis.ts` | Quality-check non-fatal adjustments |
| `packages/ai-report-engine/src/synthesis.test.ts` | Synthesis tests |
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
- Schema migration or new dependency (not present in dirty tree).

## Diff budget

- Application production/test: **0 new lines** in this scope (package existing
  dirty tree only; ~+486/-191 at FROZEN write).
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
   `open-geo-console:staging-81f19587-score-article-overlay-v1`
   (`sha256:47566c7a0b8a`).
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
