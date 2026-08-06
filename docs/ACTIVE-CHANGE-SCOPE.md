# Active Change Scope Lock

Status: `APPROVED`

User request on 2026-08-06: commit the local Flash-unified profile + grounded
refusal + page-analysis budget/batch fixes, then deploy to Protected Staging
for retest. No secrets in Git. No Production.

## Objective

1. Commit and push the working-tree changes (Flash model, insufficient_evidence
   grounded refusal, page-analysis batchSize=1 and 32768 output budget, related
   tests/docs).
2. Align gitignored Staging env `OGC_AI_MODEL=deepseek-v4-flash` with the profile.
3. One Vercel Preview, one thin Worker overlay, recreate free/deep, move fixed
   Staging alias once, probe Flash.

## Production allowlist (user-owned dirty set)

- `config/model-profiles/report-v4-sensenova-deepseek-v4-flash-v1.json`
- `apps/web/src/report-v4/openai-compatible-provider.ts` (+ tests)
- `apps/web/src/provider-profile/runtime.test.ts`
- `apps/web/src/public-search-adapters/anysearch/generative-answer.ts` (+ tests)
- `apps/web/src/worker/processor.ts` (+ tests)
- `packages/ai-report-engine/src/analysis.ts` (+ tests)
- `packages/ai-report-engine/src/generative-search-answer.ts` (+ tests)
- `packages/ai-report-engine/src/open-geo-answer-v3.ts` (+ tests)
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
| Flash probe | 1 |
| Production | 0 |
