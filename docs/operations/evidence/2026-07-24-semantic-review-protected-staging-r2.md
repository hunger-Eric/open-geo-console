# 2026-07-24 protected-Staging semantic-review Phase 3R2 evidence

## Result

Final status: `DEVIATION_REVIEW_REQUIRED`.

The exact Phase 3R1 repair candidate was deployed to protected Staging and the
one authorized replacement `https://shun-express.com/` report was submitted
through the normal protected UI. The repaired completed-shared-snapshot path
was exercised successfully: two selected snapshots predated the new report,
retained their origin query IDs and origin fanout hashes, and passed the exact
current semantic identity, query-text/hash/derivation, authority, attempt, and
observation checks. The marker-bearing Free V4 job advanced beyond
`snapshot_resolution` to `grounded_answer_synthesis`.

The job then failed terminally because every bounded automatic attempt returned
`Free teaser Q1 diagnosis did not complete.` The persisted Free checkpoint
stopped at `q1_answer_ready`: a Q1 answer draft exists, but no Q1 diagnosis
draft, Free semantic review, ready receipt, checkout, order, payment event,
credit, refund, Paid job, or Paid artifact exists. No retry, second report,
second deployment/image build, manual Webhook, database repair, production
mutation, or push is authorized or was performed.

## Candidate and deployment

- Branch: `codex/v4-answer-optimization-scope-reset`.
- Candidate: `fca651f61b5eed961379419b15a7bb4017979c46`
  (`fix: accept exact shared teaser snapshots`).
- Detached deployment worktree:
  `E:/project/open-geo-console/.data/semantic-review-phase3-candidate`;
  exact detached HEAD and clean at deployment.
- Exactly one new Vercel Preview:
  `dpl_9pTUXLadf5zYb5UnWu3gWuWh1jik`.
- Preview URL:
  `https://open-geo-console-ifkhyooi7-itheheda-6857s-projects.vercel.app`.
- State/environment: `READY` / `preview`.
- Exact metadata queries for `gitCommitSha`, `githubCommitSha`, and `ogcGitSha`
  each selected that one Preview at the candidate SHA.
- Authenticated catalog access completed successfully before alias movement.
- The fixed protected-Staging alias
  `https://open-geo-console-staging-itheheda.vercel.app` was moved once and
  resolves to that exact Preview. The former Preview remains available as the
  Web rollback; neither Preview was deleted.

## Worker image, containers, and disk

- Dependency/base inputs were unchanged. No full Worker build, `npm ci`,
  browser/system-package installation, `docker cp`, or in-container edit ran.
- Exactly one thin overlay was built from
  `sha256:7d5f873f46ebfe173c6595c519e0979b63456021b7745970b745d1ecc367827e`;
  the build copied only `apps/` and `packages/` and transferred 204.72 kB of
  context.
- Candidate tag:
  `open-geo-console:staging-fca651f61b5eed961379419b15a7bb4017979c46`.
- Candidate image:
  `sha256:c5f558db842b1a7c6cb84a0fe373ace719d2ad2a6304f3c238148dc3c185aff1`,
  size 1,237,555,268 bytes, OCI revision equal to the candidate SHA.
- Retained rollback:
  `sha256:7d5f873f46ebfe173c6595c519e0979b63456021b7745970b745d1ecc367827e`,
  size 1,237,526,128 bytes, revision
  `11927beb4f8fafd5eaddde5d0491dbcf4a44b849`.
- Only the ignored `OGC_DEPLOYMENT_VERSION` line changed. The SHA-256 of all
  other `staging.env` lines was
  `3723e36045914ce12f8f0d27d3b6758453ef0a57c2fdb19a97b9031078c2b1eb`
  before and after.
- Replacement Staging Free container:
  `1f721a6c08ac43d88220d5ef7bad41fb838ad38ec7c16576f102c9b911b80a44`.
- Replacement Staging Deep container:
  `f4f0bc1f44ee86bba7596465be68fec6512a0de8968a94028e214c884f566d70`.
- Both containers were running with zero restarts, exact candidate image and
  revision, `staging` / `preview` / `test` markers, exact deployment version,
  correct Free/Deep commands, and ready logs before report submission.
- PostgreSQL remained deployment profile `staging`, schema version `42`.
- After a fresh zero-reference check, only the approved older rollback
  `sha256:ed721dacbbc02e4b7973b9d1fce555d8697a986a371f7d5513f0cb986af96761`
  was removed. No broad cleanup ran. Images changed from 58 after the build to
  57 after removal; Docker image usage remained 52.74 GB because the removed
  image shared its retained layers.
- E: free space was 19,779,538,944 bytes at the execution preflight,
  19,778,174,976 bytes after the thin build, and 19,778,109,440 bytes after
  replacement and exact cleanup. The final evidence inspection read
  19,778,101,248 bytes. Build cache changed from 1.258 GB to 1.269 GB.
- Production Free/Deep container IDs remained
  `e137f4e57d0d2490f6263c2a92a816f6154ab2347cf6acaaa08aa6a11af70cee`
  and
  `13ccba729da8b36a82193ae46d706ff7f0a49afaedfacba69f1aae36e9e79d67`
  on image
  `sha256:ed17c0fe9e159834df2dc72a5f8a5d70314e2dcb3f6fd5b2b4a4f3174229e234`.
  Their pre-existing restart loop was not changed or repaired.

## Replacement report lineage

- Report:
  `d31a0f70-5500-4d9b-89aa-c484e93495da`, created
  `2026-07-24T06:41:22.698Z`.
- The UI required the protected-Staging force-regeneration checkbox for the
  already tested site; it was selected once and the submit button was clicked
  once.
- Foundation Free job:
  `711b586c-48cb-4c1d-9340-2553fee7e240`; completed once with no error.
- Persisted Free AI report:
  `5ff67d20-0974-408c-8c5f-8ad97501ddbf`,
  model `mimo-v2.5-pro`, prompt `ai-website-report-v2`.
- Marker-bearing V4 pre-admission job:
  `9ae1cc50-95c4-436c-a4a3-7cafac5cc9f7`.
- Marker: `report-semantic-review-v1`.
- Confirmed question set:
  `business-question-set-7876b4e3a2807c500c70861315bc819b437405418df5b2519fd13589f1182a38`.
- Final job authority: stage/execution state `failed` / `failed`, terminal phase
  `terminalization`, checkpoint revision `12`, total claims `4`, phase attempt
  `3` at maximum `3`, error code `unexpected_internal_error`.
- Four error events were recorded at `grounded_answer_synthesis`, all with the
  same fingerprint
  `02bfc5ccfff5017683745f6a1904d6dcba89ea5ed72224a2d84784cbadb794ff`
  and sanitized message `Free teaser Q1 diagnosis did not complete.`
- Final Free checkpoint: stage `q1_answer_ready`,
  `q1AnswerDraft=true`, `q1DiagnosisDraft=false`,
  `semanticReview=false`, and no ready timestamp or receipt.

## Completed shared-snapshot proof

Three completed snapshots were selected in question order.

1. Reused snapshot
   `snapshot-0628f2bd9af6b30775f10b28d2b7c52a8f8db94965a11a7e3c419d0171046b33`
   was created `2026-07-22T11:05:28.813Z`, before the new report.
   Recomputed comparison had exactly one snapshot-field difference,
   `queryFanoutHash`, and all three origin query IDs differed from the
   report-local expected IDs. All three query texts, query hashes, and
   derivation rules were exact; semantic cache identity, question identity,
   locale/region, surface authority, surface/version, fanout version, query
   plan, attempts, and returned observations were exact.
2. Fresh snapshot
   `snapshot-0602c4e066a1a7bfc682ce81974e80e74d237925f024d404c35edd545098a1a5`
   was created `2026-07-24T06:44:18.880Z`. It had zero snapshot-field or query
   differences from the current report-local authority.
3. Reused snapshot
   `snapshot-2bda4cfafe20ae89409242370cd8ad1ccc423bcf07ea1fa2251e9ddca7e26bda`
   was created `2026-07-22T11:10:17.116Z`, before the new report. Its comparison
   matched the first reused case: only `queryFanoutHash` differed, all three
   origin query IDs differed, and query text/hash/derivation plus every
   semantic identity and persisted authority field remained exact.

All nine persisted snapshot attempts were `succeeded` and all nine query
observation groups were `returned`. Six attempts belong to the two historical
reused snapshots; only the three attempts on the fresh snapshot were new
public-provider calls for this report. Advancing to `q1_answer_ready` proves
that the deployed repair accepted the exact shared authorities rather than
falling back or recrawling them.

## Caps and commercial boundary

- New public-search provider calls: exactly `3`; the two reused snapshots added
  zero new search calls.
- The persisted `q1AnswerDraft` proves one completed Q1 answer operation and
  the four same-fingerprint error events prove four failed diagnosis
  operations. No Free semantic reviewer or Paid model call occurred.
- The provider path did not persist a complete aggregate vendor call, token,
  or price receipt for the foundation/question-generation work and this
  pre-review terminal failure. Exact aggregate invocation count, token use,
  and dollar spend therefore cannot be established from persisted authority;
  this is an additional reason to stop before any further call. No claim of
  passing the 40-call, 800,000-token, or US$10 caps is made.
- Orders `0`; payment events `0`; credits `0`; refunds `0`; Paid artifacts `0`.
- No Airwallex Sandbox checkout was opened, so no user/provider payment
  interaction is pending.

## Stop boundary

The deployed candidate remains on the protected Staging Web and two Staging
Workers; the failed report and all new rows remain immutable evidence.
Continuing requires a newly frozen and explicitly approved repair scope. It
must not retry or repair this report, replay either job, create another report
or checkout, mutate historical snapshots, or treat this stopped run as Paid V3
acceptance. Phase 4 and every production action remain separately forbidden.
