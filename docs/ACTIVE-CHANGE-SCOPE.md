# Active Change Scope Lock

Status: `APPROVED`

User request on 2026-08-06: commit local changes and deploy to Protected
Staging for retest. Secrets stay gitignored. No Production.

## Objective

1. Commit and push the working-tree MiMo-via-OpenCode profile switch, page
   analysis contract diagnostics, ai-probe improvements, and related tests.
2. Align Staging runtime `OGC_DEPLOYMENT_VERSION` to the candidate full SHA
   (not a docker-desktop placeholder).
3. One Vercel Preview, one thin Worker overlay (apps/packages/config), recreate
   free/deep, move fixed Staging alias once, probe `mimo-v2.5-pro`.

## Production allowlist (user dirty set)

- `.env.example`
- `config/model-profiles/report-v4-sensenova-mimo-v2.5-pro-v1.json` (new)
- `apps/web/src/provider-profile/runtime.ts` (+ test)
- `apps/web/src/report-v4/model-runtime-config.ts` (+ test)
- `apps/web/src/report-v4/openai-compatible-provider.ts` (+ test)
- `apps/web/src/public-search-adapters/anysearch/generative-answer.test.ts`
- `apps/web/src/scripts/ai-probe.ts` (+ new `ai-probe.test.ts`)
- `apps/web/src/worker/job-errors.ts` (+ test)
- `packages/ai-report-engine/src/analysis.ts` (+ test)
- `scripts/start-report-v4-staging-workers.ps1`
- `scripts/start-workstation-workers.ps1`
- `docs/ACTIVE-CHANGE-SCOPE.md`
- `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md`

## External actions

| Action | Count |
| --- | --- |
| Push main | 1 (+ optional receipt) |
| Vercel Preview | 1 |
| Thin Worker overlay | 1 |
| Recreate free/deep | 1 pair |
| Alias move | 1 |
| Model probe | 1 |
| Production | 0 |

## Forbidden

- Secrets in git
- Production deploy
- Historical job replay
