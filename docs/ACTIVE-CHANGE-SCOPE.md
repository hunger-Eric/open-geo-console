# Active Change Scope Lock

Status: `APPROVED`

Prepared on 2026-08-08 after the user asked to deploy local code for manual
testing. The dirty tree is the already-completed **split free and paid question
flows** implementation (archived in `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md`).
User approved this exact Staging Gates 0–3 allowlist on 2026-08-08 and
explicitly included `git push origin main` (cap 1).

## Objective

Package the dirty working tree as **one** candidate commit on top of current
`main` (`4cf29bc1…`), then deploy **Protected Staging only** through Gates 0–3
so the fixed Staging URL and Staging free/deep Workers serve:

1. Free V4: one dedicated model-authored non-editable buyer question through
   the existing search/answer/analysis path; free renderer shows only that
   question.
2. Paid: separate three editable candidates until user confirmation; checkout
   requires a confirmed, unbound, report-owned paid set locked to the order.

The user performs manual browser testing. Agent does **not** run Gate 4,
model calls, payments, refunds, or email.

## Confirmed baseline

| Item | Value |
|---|---|
| Repository | `E:\project\open-geo-console` |
| Branch | `main` at `4cf29bc1cc5c77097d440800b98a44aeea25a221` |
| Dirty surface | 16 paths, ~+440/-496 at FROZEN write |
| Current Staging Workers | `open-geo-console:staging-4cf29bc1-buyer-review-checkout-overlay-v1`, `OGC_DEPLOYMENT_VERSION=4cf29bc1…` |
| package-lock / Dockerfile.worker | unchanged → thin overlay only (`apps` + `packages`) |
| Full Worker rebuild | **forbidden** |

## Allowed actions (only after APPROVED)

### Gate 0 — candidate package

1. Commit **only** the allowlisted dirty paths. One commit on `main`.
2. Record full candidate SHA. `git push origin main` only if approval
   explicitly includes push (default **0**).
3. Clean exact-SHA checkout under `.data/staging-release-<short>/`.

### Gate 1 — preflight

1. Confirm Docker engine, disk free, idle Staging free/deep (wait/drain only).
2. Record rollback: fixed-alias host, Worker image tag/ID, version `4cf29bc1…`.
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
   - `FROM open-geo-console:staging-4cf29bc1-buyer-review-checkout-overlay-v1`
   - `COPY` only `apps/` and `packages/`; OCI revision = full candidate SHA
   - tag: `open-geo-console:staging-<short>-split-questions-overlay-v1`
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

- Free teaser shows one non-editable free question only.
- Paid path: three editable candidates; checkout only after confirmation.
- Paid set independent from free question; lock to order on checkout.
- Use **new** prospective reports only (no historical repair).

## File allowlist (commit surface = current dirty tree)

| Path | Role |
|---|---|
| `apps/web/src/worker/report-v4-free-teaser.ts` | Free/paid question generation split |
| `apps/web/src/worker/report-v4-free-teaser.test.ts` | Free teaser tests |
| `packages/public-search-observer/src/business-questions.ts` | Question contract helpers |
| `packages/public-search-observer/src/business-questions.test.ts` | Contract tests |
| `apps/web/src/db/business-questions.ts` | Paid set persistence/read |
| `apps/web/src/app/api/reports/[id]/business-questions/route.ts` | Confirm/read API |
| `apps/web/src/app/api/reports/[id]/checkout/route.ts` | Checkout uses confirmed paid set |
| `apps/web/src/app/api/reports/[id]/checkout/route.test.ts` | Checkout tests |
| `apps/web/src/components/combined-geo-report-v4-teaser.tsx` | Free renderer single question |
| `apps/web/src/components/combined-geo-report-v4-teaser.test.tsx` | Teaser UI tests |
| `apps/web/src/components/commercial-checkout.tsx` | Confirm-before-checkout UI |
| `apps/web/src/components/commercial-checkout.test.tsx` | Checkout UI tests |
| `apps/web/src/components/commercial-checkout.test.ts` | Checkout unit tests |
| `apps/web/src/app/[locale]/reports/[id]/page.tsx` | Report page wiring |
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
- Historical report/job/order mutation, replay, clone (including `45f09dbf-…`).
- Agent Gate 4 / model / payment / refund / email.
- Second Preview/overlay/alias without a new scope after failure.
- Expanding source beyond the allowlisted dirty set at commit time.

## Diff budget

- Application production/test: **0 new lines** in this scope (package existing
  dirty tree only; ~+440/-496 at FROZEN write).
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
   `open-geo-console:staging-4cf29bc1-buyer-review-checkout-overlay-v1`.
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
