# Active Change Scope Lock

Status: `APPROVED`

Prepared on 2026-08-07 after the user asked to deploy local code for manual
testing. The dirty tree packages the already-implemented work present on disk
(semantic-substitution removal, OpenAI-compatible model-profile hard switch,
provider/runtime updates, Free/Direct probe and related tests/docs). User
approved this exact Staging Gates 0–3 allowlist on 2026-08-07 and explicitly
included `git push origin main` (cap 1).

## Objective

Package the full dirty working tree as **one** candidate commit on top of
current `main` (`54720d40…`), then deploy **Protected Staging only** through
Gates 0–3 so the fixed Staging URL and Staging free/deep Workers serve the
candidate. The user performs manual browser testing.

Out of scope for the agent: Gate 4 automated free/paid lineage, report
submission, payment, refund, email, model call by the agent, Production.

## Confirmed baseline

| Item | Value |
|---|---|
| Repository | `E:\project\open-geo-console` |
| Branch | `main` at `54720d40dbaca07d51ab885338932f0fb9e59634` |
| Dirty surface | ~45 paths + 2 new model-profile JSON files; ~+1666/-665 tracked |
| Current Staging Workers | `open-geo-console:staging-54720d40-model-buyer-q-overlay-v1`, `OGC_DEPLOYMENT_VERSION=54720d40…` |
| package-lock / Dockerfile.worker | unchanged → **no full Worker rebuild** |
| Config note | Candidate renames/replaces model-profile JSON under `config/`; thin overlay **must** also `COPY config` (apps+packages alone is insufficient for tsx JSON imports) |

## Allowed actions (only after APPROVED)

### Gate 0 — candidate package

1. Commit **only** the allowlisted dirty paths (including new profile JSON and
   deleted SenseNova-named profile JSON). One commit on `main`.
2. Record full candidate SHA. `git push origin main` only if approval includes
   push (default **0**).
3. Clean exact-SHA checkout under `.data/staging-release-<short>/`.

### Gate 1 — preflight

1. Confirm Docker engine, disk free, idle Staging free/deep (wait/drain only).
2. Record rollback: fixed-alias host, Worker image tag/ID, version `54720d40…`.
3. Confirm thin-overlay path (no package-lock / Dockerfile.worker change).
4. `npx vercel whoami` from the clean checkout.
5. Do **not** print secret env values. Optionally record only whether
   `OGC_PROVIDER_PROFILE` / `OGC_REPORT_V4_MODEL_PROFILE_ID` names already match
   the candidate profile IDs (names only). If names still point at deleted
   SenseNova profile IDs, **stop** and report — do not invent secret values.

### Gate 2 — Staging deploy (source-only)

1. **One** manual Preview:
   ```powershell
   $env:VERCEL_ORG_ID = 'team_PbYYV2K2zBjTeThfavXStTOI'
   $env:VERCEL_PROJECT_ID = 'prj_WVpdlJfsEp0YyWM2W54w8oBy985S'
   npx vercel deploy --yes --meta ogcGitSha=<candidate-full-sha>
   ```
2. Require `READY` and `gitCommitSha = ogcGitSha = <candidate-full-sha>`.
3. Build **exactly one** thin overlay:
   - `FROM open-geo-console:staging-54720d40-model-buyer-q-overlay-v1`
   - `COPY --from=source` **apps**, **packages**, and **config**
   - OCI revision = full candidate SHA
   - tag: `open-geo-console:staging-<short>-semantic-provider-overlay-v1`
4. Preserve `staging.env` bytes; replace **only** `OGC_DEPLOYMENT_VERSION`
   unless Gate 1 already confirmed profile name alignment. No secret mutation.
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

- Direct: no alias-substring target/competitor diagnosis
- Free: invalid semantic review does not fabricate target present
- Legacy Free unmarked generation fails closed for new runs
- OpenAI-compatible profile selection works with Staging env names

## File allowlist (commit surface = current dirty tree)

### Production / runtime / config

- `.env.example`
- `AGENTS.md`
- `README.md`
- `apps/web/src/components/combined-geo-report-v3-artifact.tsx`
- `apps/web/src/provider-profile/runtime.ts`
- `apps/web/src/public-search-adapters/anysearch/adapter.ts`
- `apps/web/src/public-search-adapters/anysearch/generative-answer.ts`
- `apps/web/src/report-v4/mimo-provider.ts`
- `apps/web/src/report-v4/model-runtime-config.ts`
- `apps/web/src/report-v4/openai-compatible-provider.ts`
- `apps/web/src/report/combined-artifact-readiness.tsx`
- `apps/web/src/scripts/probe-free-v4-direct-semantics.ts`
- `apps/web/src/worker/answer-first-v3.ts`
- `apps/web/src/worker/paid-v3-semantic-review.ts`
- `apps/web/src/worker/report-v4-free-teaser.ts`
- `config/model-profiles/report-v4-openai-compatible-deepseek-v4-flash-v1.json` (new)
- `config/model-profiles/report-v4-openai-compatible-mimo-v2.5-pro-v1.json` (new)
- `config/model-profiles/report-v4-sensenova-deepseek-v4-flash-v1.json` (delete)
- `config/model-profiles/report-v4-sensenova-mimo-v2.5-pro-v1.json` (delete)
- `packages/ai-report-engine/src/generative-search-answer.ts`
- `packages/ai-report-engine/src/open-geo-answer-v3.ts`
- `packages/ai-report-engine/src/report-semantic-review.ts`
- `scripts/start-report-v4-staging-workers.ps1`
- `scripts/start-workstation-workers.ps1`

### Tests

- All corresponding dirty `*.test.ts` / `*.test.tsx` files listed in current
  `git status` (including probe, preflight, startup-readiness, anysearch,
  mimo/openai-compatible provider, production-runtime, free-teaser, answer-first,
  paid semantic review, generative-search-answer, open-geo-answer-v3,
  report-semantic-review manifests/tests).

### Docs

- `docs/ACTIVE-CHANGE-SCOPE.md`
- `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md`
- `docs/COMMERCIAL-OPERATIONS.md`
- `docs/DECISIONS.md`
- `docs/PROTECTED-STAGING-OPERATIONS.md`
- `docs/operations/public-search-surface-certification.md`

### Deploy-only paths

| Path | Purpose |
|---|---|
| `.data/staging-release-<short>/**` | Clean checkout + Dockerfile.overlay |
| `.data/workstation-docker/staging.env` | `OGC_DEPLOYMENT_VERSION` only (unless Gate 1 stop) |
| `.data/workstation-docker/staging-*.override.yaml` | free/deep image tag only |

## Explicitly forbidden

- Production anything.
- Full Worker rebuild (`npm ci`, Playwright, OS packages).
- Docker mass prune.
- Historical report/job/order mutation, replay, clone.
- Agent Gate 4 / model / payment / refund / email.
- Second Preview/overlay/alias without a new scope after failure.
- Expanding source beyond the allowlisted dirty set at commit time.
- Printing or inventing secrets / API keys.

## Diff budget

- Application production/test: **0 new lines** in this scope (package existing
  dirty tree only).
- Scope/history docs for status and receipts only.

## Expensive external actions (hard caps)

| Action | Max |
|---|---|
| Candidate commit on `main` | 1 |
| `git push origin main` | 0 unless approval includes push; then 1 |
| Staging Preview deploy | 1 |
| Thin overlay Docker build (apps+packages+config) | 1 |
| Staging free+deep recreate | 1 pair |
| Fixed alias move | 1 |
| Agent report / payment / model / refund / email | **0** |

## Acceptance checks

1. Candidate full SHA equals Web meta and both Workers’ revision / version.
2. Fixed alias points at the candidate Preview.
3. Free and deep running, restart 0, readiness present.
4. Worker image contains new `config/model-profiles/report-v4-openai-compatible-*.json`.
5. Gate 3 smoke or SSO boundary recorded.
6. Rollback identities recorded before cutover.

## Rollback

1. Restore prior `OGC_DEPLOYMENT_VERSION` / `staging.env` bytes.
2. Recreate free+deep on
   `open-geo-console:staging-54720d40-model-buyer-q-overlay-v1`.
3. Restore prior Web host if alias moved.
4. Verify and **stop**.

## Stop conditions

- Dirty tree outside allowlist at commit time.
- package-lock / Dockerfile.worker change → full rebuild required.
- Staging env still requires deleted SenseNova profile IDs and cannot be
  aligned without secret mutation.
- SHA mismatch, readiness failure, or Production path required.

---

**Awaiting explicit user approval of this exact allowlist.**  
Reply with approval (and whether to include `git push origin main`) to set
Status `APPROVED` and execute Gates 0–3 only.
