# Active Change Scope Lock

Status: `APPROVED`

User request on 2026-08-06: after OpenCode China opt-in succeeded, perform a
full Staging redeploy so Web Preview, fixed alias, and free/deep Workers share
one candidate that includes the OpenCode Go base-URL allowlist. Secrets remain
in gitignored runtime env only.

## Objective

1. Commit and push the OpenCode Go base-URL allowlist (no secrets).
2. Create one manual Vercel Preview for the new candidate SHA.
3. Build one thin Worker overlay from the current accepted Staging Worker image,
   set `OGC_DEPLOYMENT_VERSION` to the candidate SHA, recreate free/deep only.
4. After Web/Worker SHA equality, move the fixed Staging alias once.
5. Probe Flash once; archive receipt and set scope to `NONE`.

## Baseline (pre-redeploy)

| Item | Value |
| --- | --- |
| Parent main | `79669aa7c511500935da713cdb21c6936f07ad8b` |
| Current fixed alias Preview | `dpl_E8qX1MR8pM74b4UF7u7R7vHZ9poH` / `2657a9c` |
| Current Worker image | `open-geo-console:staging-opencode-go-ai-overlay-v1` |
| Rollback Worker | `open-geo-console:staging-2657a9c-geo-article-overlay-v1` (`f40c445871d6`) |
| AI base (gitignored env) | `https://opencode.ai/zen/go/v1` |
| AI model | `deepseek-v4-flash` |
| Flash probe after opt-in | HTTP 200 |

## Production file allowlist

- `apps/web/src/report-v4/openai-compatible-provider.ts`
- `apps/web/src/report-v4/openai-compatible-provider.test.ts`
- `docs/ACTIVE-CHANGE-SCOPE.md`
- `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md` (receipt only)

Budget: production `+40/-15`, test `+40/-10`, docs `+120/-20`.

## External actions

| Action | Count |
| --- | --- |
| Non-force push `origin/main` | 1 (feature) + 1 optional docs receipt |
| Manual Vercel Preview | 1 |
| Thin Worker overlay build | 1 |
| Recreate free/deep | 1 pair |
| Fixed alias move | 1 |
| Flash probe | 1 |
| Production | 0 |
| Secrets in git | 0 |

## Forbidden

- Committing API keys
- Production deploy
- Replaying historical failed jobs
- Full Worker rebuild / docker prune
