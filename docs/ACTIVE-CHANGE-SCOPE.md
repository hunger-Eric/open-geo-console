# Active Change Scope Lock

Status: `APPROVED`

User request on 2026-08-06: switch Staging AI model from DeepSeek V4 Flash to
**DeepSeek V4 Pro** on OpenCode Go after paid deep jobs failed with
`ai_client_output_truncated` under Flash.

## Objective

1. Pin the locked SenseNova-compatible profile operations and env check to
   `deepseek-v4-pro`.
2. Update gitignored Staging/local env `OGC_AI_MODEL` only (base URL stays
   OpenCode Go; no secret commit).
3. Commit/push, one Preview deploy, one thin Worker overlay, recreate free/deep,
   move fixed Staging alias once, probe Pro.

## Production allowlist

- `config/model-profiles/report-v4-sensenova-deepseek-v4-flash-v1.json`
- `apps/web/src/report-v4/openai-compatible-provider.ts`
- `apps/web/src/report-v4/openai-compatible-provider.test.ts`
- `docs/ACTIVE-CHANGE-SCOPE.md`
- `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md` (receipt)

Budget: production `+30/-20`, test `+30/-20`, docs `+80/-20`.

## Runtime env (gitignored)

- `.data/workstation-docker/staging.env`
- `apps/web/.env.staging.local`
- `apps/web/.env.local`

## External actions

| Action | Count |
| --- | --- |
| Push main | 1 (+ optional receipt) |
| Vercel Preview | 1 |
| Thin Worker overlay | 1 |
| Recreate free/deep | 1 pair |
| Alias move | 1 |
| Pro probe | 1 |
| Production | 0 |

## Forbidden

- Secrets in git
- Production deploy
- Historical job replay
- SenseNova key reintroduction unless requested
