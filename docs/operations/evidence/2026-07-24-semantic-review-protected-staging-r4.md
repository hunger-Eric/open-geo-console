# 2026-07-24 protected-Staging semantic-review Phase 3R4 evidence

## Result

Final status: `DEVIATION_REVIEW_REQUIRED`.

The exact Phase 3R3 Q1 diagnosis repair was deployed to the protected Staging
Web and Free/Deep Workers. Exactly one new `https://shun-express.com/` report
was submitted through the normal protected UI. The foundation Free report
completed with a real configured MiMo model result, and the marker-bearing V4
job selected three complete public-search snapshots and produced a Q1 answer.

The V4 job then failed terminally at `grounded_answer_synthesis`. All four
bounded error events had the same fingerprint and sanitized message
`Free teaser Q1 diagnosis did not complete.` The final Free checkpoint contains
a Q1 answer draft but no Q1 diagnosis draft or semantic-review receipt. The
approved stop rule therefore prohibited checkout and the Airwallex Sandbox
payment. No retry, replacement report, second deployment/image, manual
Webhook, database repair, production mutation, or push occurred.

## Candidate and Web deployment

- Branch: `codex/v4-answer-optimization-scope-reset`.
- Candidate: `05a5209ff60dc910023daba397cb6f5933ab4a9d`
  (`fix: complete deferred q1 diagnosis correction`).
- Detached deployment worktree:
  `E:/project/open-geo-console/.data/semantic-review-phase3-candidate`;
  exact detached HEAD and clean at deployment.
- Exactly one new Vercel Preview:
  `dpl_AzvNKkJu1d3RarbGYKkk6zxx2mv8`.
- Preview URL:
  `https://open-geo-console-re5rnyvy8-itheheda-6857s-projects.vercel.app`.
- State/target: `READY` / `preview`.
- `gitCommitSha`, `githubCommitSha`, and `ogcGitSha` all equal the candidate.
- The protected catalog request succeeded before alias movement.
- The fixed protected-Staging alias
  `https://open-geo-console-staging-itheheda.vercel.app` was moved once and
  resolves to that exact Preview.
- Former Preview `dpl_9pTUXLadf5zYb5UnWu3gWuWh1jik` remains the Web rollback.
  No deployment was deleted or promoted to production.

## Worker image, containers, and disk

- Dependency/base inputs were unchanged. No full Worker build, `npm ci`,
  browser/system-package installation, base pull, `docker cp`, or in-container
  edit ran.
- Exactly one thin overlay was built from
  `sha256:c5f558db842b1a7c6cb84a0fe373ace719d2ad2a6304f3c238148dc3c185aff1`;
  it copied only `apps/` and `packages/` with 87.09 kB build context.
- Candidate tag:
  `open-geo-console:staging-05a5209ff60dc910023daba397cb6f5933ab4a9d`.
- Candidate image:
  `sha256:ae8c08a5e385c4f5eb11b400ea754edccc868332fc44eb057c35b8d873d0f079`,
  size 1,237,562,394 bytes, exact candidate revision label.
- Retained rollback:
  `sha256:c5f558db842b1a7c6cb84a0fe373ace719d2ad2a6304f3c238148dc3c185aff1`,
  size 1,237,555,268 bytes, revision
  `fca651f61b5eed961379419b15a7bb4017979c46`.
- Only ignored `OGC_DEPLOYMENT_VERSION` changed. The SHA-256 of every other
  `staging.env` line remained
  `3723e36045914ce12f8f0d27d3b6758453ef0a57c2fdb19a97b9031078c2b1eb`.
- Staging Free container:
  `6737c85317aa6d5674c01c4622b202875570667ee9b42f4607f897155549eaeb`.
- Staging Deep container:
  `452e6e73d9c2e4e45c205f6dbde0de2857d3de7d26f999c3e6f831183aa17aa8`.
- Both use the exact candidate image/revision, are running with zero restarts,
  have correct free/deep tiers and `staging` / `preview` / `test` identity, and
  emitted the normal readiness line.
- PostgreSQL remained profile `staging`, schema version `42`.
- The older zero-reference image
  `sha256:7d5f873f46ebfe173c6595c519e0979b63456021b7745970b745d1ecc367827e`
  was the only image removed after candidate readiness. No broad cleanup ran.
- E drive free bytes were 19,328,458,752 before the thin build,
  19,322,486,784 after it, and 19,322,273,792 at final inspection.
- Docker ended with 57 images using 52.74 GB, 23.76 GB local volumes, and
  1.279 GB build cache.
- Production Free/Deep container IDs and image remained unchanged:
  `e137f4e57d0d2490f6263c2a92a816f6154ab2347cf6acaaa08aa6a11af70cee`,
  `13ccba729da8b36a82193ae46d706ff7f0a49afaedfacba69f1aae36e9e79d67`,
  and
  `sha256:ed17c0fe9e159834df2dc72a5f8a5d70314e2dcb3f6fd5b2b4a4f3174229e234`.
  Their pre-existing restart loop was not changed or repaired.

## New report lineage

- Report:
  `4e9d34ca-e6cf-4721-a40f-49815392a7fd`, created
  `2026-07-24T09:29:13.294Z`.
- The protected UI force-regeneration checkbox was selected once and the
  submit button was clicked once.
- Foundation Free job:
  `8208a7ea-2ccd-482c-962d-991a35eafefd`; terminal `completed`.
- Persisted foundation AI report:
  `63173a0b-4753-48dd-896d-7915ab45b061`,
  model `mimo-v2.5-pro`, prompt `ai-website-report-v2`.
- Marker-bearing V4 job:
  `e5708704-229b-4c1a-87e8-c82ea0fcfdf9`.
- Marker: `report-semantic-review-v1`.
- Confirmed question set:
  `business-question-set-1dcec693caccee8e45f6f76ac33119ebad6e2d4468d7e9e56882da8aa5b52d59`.
- Final V4 state: stage/execution `failed` / `failed`, terminal phase
  `terminalization`, checkpoint revision `12`, total claims `4`, phase attempt
  `3` at maximum `3`, error code `unexpected_internal_error`.
- Four error events were persisted at `grounded_answer_synthesis`, all with
  fingerprint
  `02bfc5ccfff5017683745f6a1904d6dcba89ea5ed72224a2d84784cbadb794ff`
  and message `Free teaser Q1 diagnosis did not complete.`
- Final Free checkpoint: `q1_answer_ready`,
  `q1AnswerDraft=true`, `q1DiagnosisDraft=false`,
  `semanticReview=false`, with no ready timestamp or receipt.

## Public-search and real-model evidence

- Reused completed snapshots:
  `snapshot-0628f2bd9af6b30775f10b28d2b7c52a8f8db94965a11a7e3c419d0171046b33`
  and
  `snapshot-2bda4cfafe20ae89409242370cd8ad1ccc423bcf07ea1fa2251e9ddca7e26bda`,
  both created on 2026-07-22 before this report.
- Fresh completed snapshot:
  `snapshot-c69b0bfb16c5d31f5adf0ffb2853144deece0a9188de9f24fbd931cab4a8a7e0`,
  created `2026-07-24T09:32:01.029Z`.
- Each snapshot has three queries, three succeeded attempts, and nine returned
  observations. Only the fresh snapshot's three provider attempts are new to
  this report.
- The persisted foundation AI report and Q1 answer draft prove real configured
  model execution. Four diagnosis failures prove the bounded diagnosis
  operations ran, but raw provider output was not persisted.
- A complete aggregate provider-call, token, or price receipt is unavailable,
  so the exact 40-call / 800,000-token / US$10 aggregate cannot be established.
  This independently requires stopping before any manual retry or payment.

## Commercial and stop boundary

- Orders: `0`.
- Payment events: `0`.
- Credits: `0`.
- Refunds: `0`.
- Paid artifacts: `0`.
- No checkout was opened and no Airwallex Sandbox payment was attempted.

The exact candidate remains on the protected Staging Web and both Staging
Workers because the report already exists. The failed report, jobs,
checkpoints, errors, and snapshots remain immutable evidence. Continuing
requires a newly frozen and explicitly approved diagnosis scope. It must not
retry or repair this report, create another report/checkout/payment, replay
either job, or treat this stopped run as Free or Paid acceptance.
