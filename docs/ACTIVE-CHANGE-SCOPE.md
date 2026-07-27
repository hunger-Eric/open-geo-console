# Active Change Scope Lock

Status: `APPROVED`

This file is the sole executable task authority for the current work.

## Current scope — Free V4 teaser unified semantic review typed error boundary

Status: `APPROVED`

### User-approved decisions (locked)

- **A:** typed `mimo_invalid_response` + limited transient retry (existing phase attempt budget)
- **B:** permanent typed fail-closed `semantic_review_evidence_missing` (keep `report_global_v1`)
- **C:** preventive strict `{ type: "text", text }` content-parts parsing on structured MiMo path (not historical payload proof)

### Objective

为 marker-present Free V4 teaser unified semantic review 的两类已记录失败建立明确、脱敏、可测试的 typed error 和 job 分类边界；保持 `report_global_v1` fail-closed 契约，不修改或重跑任何历史 Job。

This is not a claim to fix a single deeper ultimate root cause of all V4 failures.

### Baseline (historical evidence only; do not mutate)

- Workspace: `E:\project\open-geo-console`
- Branch: `main`
- Complete HEAD at scope start: `330b27a74c5c3d9d56c71bc8e6ade1859499e92e`
- Verified Staging job (no repair/replay/retry authorized):
  - Job: `caf0e8c3-71f5-4004-bd29-abe87c9b96e3`
  - Report: `90ee4925-bdd3-4154-b789-3625ebf4cb8e`
  - Terminal: `failed` / `unexpected_internal_error` at progress 96 after Q1 answer, diagnosis, and three observation snapshots
  - Direct failures: structured invalid response; `report_global_v1` missing accepted evidence/source
  - Historical records do not prove content-parts array as the raw payload shape

### Required behavior

1. Keep `report_global_v1` fail-closed for missing accepted evidence/source on non-blocked fields, answer annotations, and evidenceUse annotations.
2. Emit typed redacted outcomes:
   - `mimo_invalid_response` (transient)
   - `semantic_review_evidence_missing` (permanent)
3. Structured `message.content`:
   - non-empty string path retained
   - array path accepts only `{ type: "text", text: non-empty string }` parts
   - reject bare strings, missing type, `content` field objects, non-text types, empty/mixed/over-limit arrays
   - `MAX_STRUCTURED_CONTENT_PARTS = 128`, `MAX_STRUCTURED_CONTENT_CHARS = 1_000_000` with early rejection
4. Do not log raw provider bodies, secrets, tokens, or customer prose beyond existing redaction.
5. Resume from `q1_answer_ready` must not re-run Q1 answer, diagnosis, or snapshots.
6. No historical job mutation.

### Production allowlist (closed)

| Path | Role |
|------|------|
| `apps/web/src/report-v4/mimo-provider.ts` | Structured parse typing; strict content-parts; limits |
| `apps/web/src/worker/job-errors.ts` | Map typed provider/review errors to job classification/codes |
| `packages/ai-report-engine/src/report-semantic-review.ts` | Typed fail-closed for global evidence on fields, answers, evidenceUse |
| `docs/ACTIVE-CHANGE-SCOPE.md` | Authorization record only |

### Tests allowlist (closed)

| Path | Role |
|------|------|
| `apps/web/src/report-v4/mimo-provider.test.ts` | String/parts success; strict reject matrix; shared websiteSynthesis/questionAnswer/sourceDiagnosis |
| `apps/web/src/worker/job-errors.test.ts` | `mimo_invalid_response` transient; `semantic_review_evidence_missing` permanent |
| `packages/ai-report-engine/src/report-semantic-review.test.ts` | Field/answer/evidenceUse typed evidence-missing fail-closed |
| `apps/web/src/worker/report-v4-free-teaser.test.ts` | Regression gate (no production free-teaser edits required) |
| `apps/web/src/worker/processor.test.ts` | Regression gate for job failure classification wiring |

### Forbidden

- `apps/web/src/db/**`, migrations, schema meaning, historical data
- Claim/lease/checkpoint/retry state-machine redesign
- Q1/Q2/Q3 public-search or diagnosis production logic changes
- Deep report, commerce, payment, refund, email
- UI, status routes
- Docker, Vercel, deploy, env mutation
- Historical Job retry/replay/repair/reopen/clone (including `caf0e8c3…`)
- Relaxing evidence/source/receipt/hash/identity/URL gates
- New dependencies
- Real model, Worker, Docker, database write, deploy, push

### Diff budget

| Surface | Budget |
|---------|--------|
| Production allowlisted files | max `+180` / `-50` (measured ~`+156` / `-18`) |
| Tests allowlisted files | max `+480` / `-10` (measured ~`+394` / `-4`; verification-only budget refresh = measured + ≤20% headroom) |
| Dependencies / migrations | `0` |

### Verification commands (closed)

Focused (required before full suite):

```text
npx vitest run apps/web/src/report-v4/mimo-provider.test.ts packages/ai-report-engine/src/report-semantic-review.test.ts apps/web/src/worker/job-errors.test.ts apps/web/src/worker/report-v4-free-teaser.test.ts apps/web/src/worker/processor.test.ts
```

Full local verification:

```text
npm run lint
npm test
npm run build
git diff --check
```

### Expensive external actions

All counts are **0**: real model, Worker, Docker, database writes, historical Job actions, deploy, push.

### STOP conditions

- Edit outside the closed allowlists above
- Expand retry/state machine, model calls, DB semantics, or evidence gates
- Historical Job mutation
- Treat content-parts as proven historical payload root cause of `caf0e8c3…`

### Implementation status

Implementation and bounded rework authorized under this APPROVED lock with A/B/C fixed as above.

## Release / acceptance amendment (user-confirmed 2026-07-27)

Status remains `APPROVED`. The user explicitly confirmed promotion of the
already implemented and locally accepted Free V4 semantic-review fix from the
current `main` checkout to Protected Staging only, followed by a pause at the
fixed web entry for the user to type the site URL and perform any later test.

### Release allowlist

- Git may stage and commit only these seven currently tracked, allowlisted
  files: `apps/web/src/report-v4/mimo-provider.test.ts`,
  `apps/web/src/report-v4/mimo-provider.ts`,
  `apps/web/src/worker/job-errors.test.ts`,
  `apps/web/src/worker/job-errors.ts`,
  `packages/ai-report-engine/src/report-semantic-review.test.ts`,
  `packages/ai-report-engine/src/report-semantic-review.ts`, and this
  `docs/ACTIVE-CHANGE-SCOPE.md`. Exclude untracked `.codex/` entirely.
- Release actions may include the push and Preview / fixed Protected Staging
  promotion or configuration actions required by
  `docs/PROTECTED-STAGING-OPERATIONS.md`, strictly for the linked Staging
  project and never Production. The runbook order is mandatory: package one
  candidate, create a unique `READY` Preview only if no matching one exists,
  independently verify its full SHA identity, then move the fixed alias once
  and verify the Web plus both Staging Workers.
- The fixed business entry is
  `https://open-geo-console-staging-itheheda.vercel.app`; a unique Preview is
  artifact identity only and must not be used as the user acceptance site.
- After Gate 3 technical checks, stop at the fixed site. The user—not the
  agent—will type the target URL and initiate any subsequent browser test.

### Explicit prohibitions for this amendment

The agent must not submit a scan, create a report or job, pay, call a model,
write the database, replay or mutate historical jobs, run Docker, touch
commerce/payment/refund/email, perform a second report or deployment, or touch
Production. These actions require a later explicit scope and authorization.

### Required release and rollback evidence

The release operator must record the candidate commit's complete SHA (the same
identity in the clean detached worktree and Preview `gitCommitSha` / `ogcGitSha`),
the linked Vercel project/team, and opaque IDs for any newly created Preview and
the fixed-alias promotion. Before any Staging mutation, record candidate,
current, and one rollback Worker image IDs; after verification record both
Workers' image/SHA, tier, Staging identity, restart counts, and no-claim check.
If any post-change check fails, restore the recorded rollback Worker images and
fixed alias, then report the rollback identity and before/after evidence.
