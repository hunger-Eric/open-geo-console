# Active Change Scope Lock

Status: `APPROVED`

User request on 2026-08-06: commit the local three-phase main-path model-output
compatibility repair and deploy it to Protected Staging for retest. No secrets
in Git. No Production.

## Objective

1. Commit and push analysis/synthesis/semantic-review compatibility changes and
   their tests/docs.
2. One Vercel Preview for the candidate SHA.
3. One thin Worker overlay (apps/packages/config), set
   `OGC_DEPLOYMENT_VERSION` to the full SHA, recreate free/deep, move fixed
   Staging alias once.
4. Confirm DB writable and MiMo probe still healthy.

## Production allowlist (user dirty set)

- `packages/ai-report-engine/src/analysis.ts` (+ test)
- `packages/ai-report-engine/src/synthesis.ts` (+ test)
- `packages/ai-report-engine/src/validation.ts`
- `packages/ai-report-engine/src/report-semantic-review.ts` (+ test)
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
