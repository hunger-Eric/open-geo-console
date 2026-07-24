# Active Change Scope Lock

## Protected Staging semantic-authority candidate deployment

Status: `APPROVED`

### Sole authority and objective

This file is the sole authority for the next action. It supersedes the completed
local-implementation scope and authorizes no action while `FROZEN`.

The only objective is to package the already locally accepted semantic-authority
repair into one immutable candidate revision and deploy that exact revision to
the protected Staging Web, Free Worker, and Deep Worker without creating or
processing a report, calling a model, crawling a site, creating an order, or
making a payment.

Deployment is an intermediate state only. It does not prove that the complete
flow is fixed. The sole future real acceptance target remains one newly created,
persisted lineage:

`URL -> Foundation -> Free V4 -> Q1 answer/diagnosis -> semantic receipt -> Sandbox payment -> Paid V3 -> accessible complete HTML`

The failed R6 report `ca243d40-707d-4c54-a65e-ed07db47a9c3` and every other
historical report, job, order, payment, artifact, receipt, token, checkpoint, and
repair state remain immutable. They must not be retried, repaired, resumed,
replayed, cloned, paid, replaced, deleted, or reused as acceptance authority.

### Read-only preflight baseline

Preflight was observed on 2026-07-24 without a commit, deployment, report,
payment, model call, crawl, or database write:

- Repository: `E:/project/open-geo-console`
- Branch: `codex/v4-answer-optimization-scope-reset`
- Base HEAD: `f3d92e35cd85eb11e9c9e8656fc979a2778012c9`
- Worktree: 53 tracked unstaged paths, 0 staged paths, 0 untracked paths
- Sorted path-set SHA-256, using LF between paths:
  `fe74de3f84640c5f32972e15dc355e5b5492a8384a570c34a4969d877faee595`
- Code/test content-manifest SHA-256:
  `7b5b1979d61852bef18a4fddc773f3322df042e0b99d1174b374159886595407`
- Dependency and base-image inputs changed: none
- Local acceptance already passed: focused tests, full `npm test`
  (`302` passed files / `46` skipped; `2820` passed tests / `188` skipped),
  `npm run lint`, `npm run build`, and `git diff --check`
- Protected Staging PostgreSQL: profile `staging`, schema `42`
- Worker claim risk now: claimable `0`, active running `0`, expired recoverable
  `0`, exhausted terminalizable `0`
- Preserved non-claimable history: `repair_wait` free `4`, deep `2`
- Merged Worker environment:
  `OGC_DEPLOYMENT_PROFILE=staging`,
  `OGC_DEPLOYMENT_VERSION=12449e807bdd4c5c2385f92f4a7523b6e025dac9`,
  `OGC_JOB_QUEUE_PROVIDER=postgres`, `FULFILLMENT_MODE=realtime`
- SHA-256 of all merged `staging.env` lines except
  `OGC_DEPLOYMENT_VERSION`:
  `3723e36045914ce12f8f0d27d3b6758453ef0a57c2fdb19a97b9031078c2b1eb`
- Staging live-drill job/fault variables: absent
- Target Docker data drive: `E:`, free space approximately `17.68 GiB`
- Docker footprint: 57 images / 52.74 GB, 61 containers / 1.008 GB,
  351 volumes / 23.99 GB, build cache 1.29 GB

Every drift-prone fact above must be rechecked immediately before its dependent
mutation. This snapshot is not authority to ignore later drift.

### Exact candidate source manifest

Only the following 53 already changed tracked paths may enter the candidate.
No additional tracked or untracked path may be staged:

1. `AGENTS.md`
2. `apps/web/src/app/[locale]/reports/[id]/page.tsx`
3. `apps/web/src/db/commercial-orders.ts`
4. `apps/web/src/db/report-semantic-review-activation.test.ts`
5. `apps/web/src/db/report-semantic-review-activation.ts`
6. `apps/web/src/db/scan-admission.ts`
7. `apps/web/src/worker/processor.ts`
8. `apps/web/src/worker/report-v4-diagnosis-enhancer.test.ts`
9. `apps/web/src/worker/report-v4-free-teaser.ts`
10. `docs/2026-07-13-public-source-forensics-v2-analysis-report.md`
11. `docs/ACTIVE-CHANGE-SCOPE.md`
12. `docs/AI-REPORT-ENGINE.md`
13. `docs/DECISIONS.md`
14. `docs/operations/evidence/2026-07-14-combined-report-correction-acceptance.md`
15. `docs/PROJECT-STATE.md`
16. `docs/REPORT-WORKSPACE.md`
17. `docs/superpowers/plans/2026-07-12-default-locale-url-implementation.md`
18. `docs/superpowers/plans/2026-07-13-analysis-chain-recovery.md`
19. `docs/superpowers/plans/2026-07-13-protected-staging-commerce-endpoint.md`
20. `docs/superpowers/plans/2026-07-13-protected-staging-live-worker-drills.md`
21. `docs/superpowers/plans/2026-07-13-provider-independent-public-search-adapters.md`
22. `docs/superpowers/plans/2026-07-13-staging-v2-mimo-runtime.md`
23. `docs/superpowers/plans/2026-07-14-combined-geo-report-business-question-correction.md`
24. `docs/superpowers/plans/2026-07-14-combined-geo-report-question-answer-presentation.md`
25. `docs/superpowers/plans/2026-07-14-geo-title-quality-and-terminology.md`
26. `docs/superpowers/plans/2026-07-14-localized-technical-analysis.md`
27. `docs/superpowers/plans/2026-07-14-provider-discovery-evidence-quality-v2.md`
28. `docs/superpowers/plans/2026-07-14-report-language-and-internal-pdf.md`
29. `docs/superpowers/plans/2026-07-14-v2-report-completion-recovery.md`
30. `docs/superpowers/plans/2026-07-15-adaptive-public-source-acquisition.md`
31. `docs/superpowers/plans/2026-07-15-answer-first-open-geo-report-v3.md`
32. `docs/superpowers/plans/2026-07-15-open-geo-console-heygen-product-demo.md`
33. `docs/superpowers/plans/2026-07-15-v3-replacement-fulfillment.md`
34. `docs/superpowers/plans/2026-07-16-generative-search-answer-mainline.md`
35. `docs/superpowers/plans/2026-07-16-report-v4-spec-conformance-gates.md`
36. `docs/superpowers/plans/2026-07-16-source-selection-diagnosis.md`
37. `docs/superpowers/plans/2026-07-19-v4-baseline-consolidation-complete-report.md`
38. `docs/superpowers/plans/2026-07-20-v4-admission-representative-crawl-remediation.md`
39. `docs/superpowers/prompts/2026-07-16-report-v4-orchestrator-handoff.md`
40. `docs/superpowers/specs/2026-07-10-commercial-report-delivery-implementation-plan.md`
41. `docs/superpowers/specs/2026-07-10-homepage-only-free-preview-implementation-plan.md`
42. `docs/superpowers/specs/2026-07-10-protected-staging-and-production-security-implementation-plan.md`
43. `docs/superpowers/specs/2026-07-11-airwallex-payment-return-implementation-plan.md`
44. `docs/superpowers/specs/2026-07-11-html-first-visual-evidence-report-implementation-plan.md`
45. `docs/superpowers/specs/2026-07-11-instant-report-journey-implementation-plan.md`
46. `docs/superpowers/specs/2026-07-12-answer-snapshot-contracts-implementation-plan.md`
47. `docs/superpowers/specs/2026-07-12-product-correction-and-two-way-email-implementation-plan.md`
48. `docs/superpowers/specs/2026-07-12-public-web-recommendation-source-forensics-implementation-plan.md`
49. `docs/superpowers/specs/2026-07-19-v4-baseline-consolidation-complete-report-design.md`
50. `docs/TASKS.md`
51. `packages/ai-report-engine/src/report-semantic-review-manifests.ts`
52. `packages/ai-report-engine/src/report-v4-diagnosis.test.ts`
53. `packages/ai-report-engine/src/report-v4-diagnosis.ts`

The 42 Markdown paths are the previously approved authority cleanup. The
remaining 11 paths are the previously approved and locally accepted repair:
8 production paths (`+127/-19`) and 3 test paths (`+10/-14`). Before staging,
the 11 code/test paths must still produce the exact content-manifest hash above.
No source, test, or documentation content may change after this scope is
approved except changing this file's status from `FROZEN` to `APPROVED`.

### Diff budget

- Candidate path count: exactly `53`; no headroom.
- Production code: exactly the current 8 paths and current content
  (`+127/-19`); no further production-code lines.
- Tests: exactly the current 3 paths and current content (`+10/-14`); no
  further test lines.
- Documentation: exactly the current 42 paths; after approval only the one-line
  `FROZEN` to `APPROVED` status replacement in this file may differ from this
  scope snapshot.
- Ignored runtime Dockerfile: exactly the source-overlay body printed below.
- Merged Worker environment: exactly one line replacement,
  `OGC_DEPLOYMENT_VERSION`.
- No other tracked, ignored, environment, compose, Vercel, Docker, database, or
  runtime file may change.

### Candidate commit boundary

After explicit approval of this exact scope, only these Git mutations are
allowed:

1. Change this file's status to `APPROVED`.
2. Recheck the 53-path set, the 11-path content hash, the complete diff,
   `git diff --check`, and the absence of staged/untracked/out-of-scope paths.
3. Stage exactly the 53 paths above.
4. Create exactly one local candidate commit with message
   `fix: lock semantic authority for protected staging`.
5. Verify the commit has the exact parent
   `f3d92e35cd85eb11e9c9e8656fc979a2778012c9`, contains exactly the manifest
   above, and leaves the main worktree clean.

No amend, second commit, tag, merge, rebase, reset, stash, push, pull, fetch,
branch deletion, worktree creation, or cleanup is authorized. A mismatch is a
stop condition, not permission to restage or rewrite history.

### Vercel Web deployment boundary

The only Vercel target is the root-linked project:

- Team: `team_PbYYV2K2zBjTeThfavXStTOI`
- Project: `prj_WVpdlJfsEp0YyWM2W54w8oBy985S`
- Project name: `open-geo-console`
- Fixed protected alias:
  `https://open-geo-console-staging-itheheda.vercel.app`
- Current deployment and exact Web rollback:
  `dpl_CvWyY6ydVhuGtUaakjF93kZEnzg5`
- Current deployed revision:
  `12449e807bdd4c5c2385f92f4a7523b6e025dac9`

`apps/web/.vercel/project.json` points to stale project
`prj_CNIlwt4u8zDWxEW7EosgjbagG3id`, which returned `404`; it must not be used,
relinked, edited, or deleted.

Deployment may reuse the existing clean detached worktree
`.data/semantic-review-phase3-candidate`. It may move that worktree to the
new candidate commit and must preserve its root `.vercel/project.json` binding.
No new worktree may be created and no other worktree may be pruned or cleaned.

Exactly one new Vercel Preview deployment may be created from the clean detached
candidate. It must carry `ogcGitSha=<full candidate SHA>` metadata. Before any
alias move, Vercel inspection must prove:

- state `READY` and target Preview, never Production;
- project/team identity exactly as listed above;
- `gitCommitSha`, `githubCommitSha`, and `ogcGitSha` all equal the full
  candidate SHA;
- read-only protected `GET /zh` (including its normal redirect) succeeds; and
- read-only protected `GET /api/commerce/catalog` succeeds and reports test
  commerce.

Only after the candidate Workers are verified may the fixed protected alias
move exactly once to the new Preview. If post-cutover read-only checks fail, one
rollback alias move to `dpl_CvWyY6ydVhuGtUaakjF93kZEnzg5` is allowed. No retry,
second Preview, Production promotion, deployment deletion, domain change,
environment edit, or project relink is authorized.

### Docker Worker deployment boundary

A full Worker build is forbidden because dependency/base inputs are unchanged
and the Docker target drive has less than the required 20 GiB free. The script
`scripts/start-report-v4-staging-workers.ps1` invokes `Dockerfile.worker` and
therefore must not be run for this deployment.

The exact pre-deployment image roles are:

- Current:
  `open-geo-console:staging-12449e807bdd4c5c2385f92f4a7523b6e025dac9`,
  image `sha256:7d78311c673e2ae54b2ae384816458427c100199b281a95b34c767c877d353f5`,
  size `1,237,613,402` bytes
- Rollback:
  `open-geo-console:staging-05a5209ff60dc910023daba397cb6f5933ab4a9d`,
  image `sha256:ae8c08a5e385c4f5eb11b400ea754edccc868332fc44eb057c35b8d873d0f079`,
  size `1,237,562,394` bytes
- Candidate:
  `open-geo-console:staging-<full candidate SHA>`, whose image ID must be
  captured after its one authorized build

The current Staging containers are:

- Free:
  `0b24e00cbbb73f682ced082168cd4ac234c1b2c5b94049ee2b2a44d38f7e750b`
- Deep:
  `bffd25630948f2847ba93d0ff47d107c739dde168e56431b025289e50ae709a4`

Exactly one thin source-overlay build is allowed. Its Dockerfile may be
rewritten only at ignored path
`.data/semantic-review-phase3-runtime/Dockerfile.overlay` and must contain only:

```dockerfile
FROM open-geo-console:staging-12449e807bdd4c5c2385f92f4a7523b6e025dac9

ARG OGC_REVISION
LABEL org.opencontainers.image.revision=$OGC_REVISION

COPY apps/ /app/apps/
COPY packages/ /app/packages/
```

The build context must be the clean detached candidate. The build may not run
`npm ci`, install Playwright/Chromium or operating-system packages, pull or
change a base image, use `Dockerfile.worker`, copy repository documentation,
use `docker cp`, or edit a running container.

Immediately before container recreation, repeat the PostgreSQL risk query.
All four counts must be zero: claimable now, active running, expired
recoverable, and exhausted terminalizable. The six observed `repair_wait` rows
must remain unchanged and unclaimed. Any nonzero risk count, changed database
profile/schema, or unexpected nonterminal state stops deployment before
container mutation.

Only `.data/workstation-docker/staging.env` may change, and only its single
`OGC_DEPLOYMENT_VERSION` line may change to the full candidate SHA. The LF-based
hash of every other line must remain
`3723e36045914ce12f8f0d27d3b6758453ef0a57c2fdb19a97b9031078c2b1eb`.
Original bytes must be retained for rollback without printing secrets.

Only `staging-worker-free` and `staging-worker-deep` may be recreated, together,
with `--no-deps --no-build --force-recreate`, using the existing compose
configuration and the ignored tier override. No commerce, Production, database,
volume, network, or unrelated container may be recreated or stopped.

Candidate Worker acceptance requires:

- both containers running with restart count `0`;
- both containers reference the captured candidate image ID;
- image tag and OCI revision label equal the full candidate SHA;
- deployment profile `staging`, Vercel environment `preview`, commerce mode
  `test`, exact Free/Deep tier, PostgreSQL queue provider, and realtime mode;
- normal startup/readiness log lines and no claim, crawl, model, report, job
  transition, repair, payment, refund, or email event;
- PostgreSQL profile still `staging`, schema still `42`, risk counts still all
  zero, and the six `repair_wait` rows unchanged.

Worker startup may perform only its normal `worker_presence` removal/heartbeat
writes. No migration or other database mutation is authorized. If the risk
guard indicates that startup could mutate `scan_jobs`, credits, artifacts, or
repair state, stop before recreation.

If candidate Worker verification fails, one rollback recreation of both
Staging Workers to current image
`sha256:7d78311c673e2ae54b2ae384816458427c100199b281a95b34c767c877d353f5`
and restoration of the original `staging.env` bytes is allowed. This is a
rollback, not authority to rebuild or retry.

After full Web and Worker deployment verification, the new candidate becomes
current, the former current image
`sha256:7d78311c673e2ae54b2ae384816458427c100199b281a95b34c767c877d353f5`
becomes the sole retained rollback, and only the then-zero-reference older rollback image
`sha256:ae8c08a5e385c4f5eb11b400ea754edccc868332fc44eb057c35b8d873d0f079`
may be removed. If deployment rolls back, only the captured, zero-reference
candidate image may instead be removed. At most one exact image removal is
authorized. Broad prune commands are forbidden.

Before and after the build, recreation, rollback, or exact image removal,
record E-drive free bytes, `docker system df`, image IDs/sizes/labels, and
container references. No second build may follow a failed build.

### External-action and mutation budget

- Tracked source edits before approval: `0`
- Tracked source edits after approval: only this file's status line
- Local commits: exactly `1`
- Pushes, tags, merges, rebases, PRs: `0`
- New Vercel deployments: at most `1` Preview
- Forward alias moves: at most `1`
- Rollback alias moves: at most `1`, only after a failed post-cutover check
- Docker builds: at most `1`, thin overlay only
- Staging Worker recreation: one Free/Deep pair
- Rollback Worker recreation: at most one Free/Deep pair after failure
- Exact Docker image removals: at most `1`
- New worktrees: `0`
- Database migrations or schema/data repair: `0`
- Reports, scans, crawls, model calls, orders, payments, refunds, emails,
  artifacts, receipts, access tokens, or customer delivery actions: `0`

Ignored runtime evidence may be written only beneath
`.data/semantic-review-phase3-runtime/`. It must contain no secret values,
customer data, raw tokens, or payment identifiers and must not be staged.

### Forbidden subsystems and behavior

- Production Vercel targets, aliases, deployments, domains, environment
  variables, databases, Workers, containers, images, volumes, or data.
- Database migrations, schema changes, data repair, queue repair, job recovery,
  credit settlement, artifact repair, or historical-state mutation.
- Commerce Worker recreation or execution; Airwallex, refund, email, or
  delivery actions.
- Report submission, forced regeneration, crawl, model, semantic-review,
  checkout, payment, Webhook, token, or artifact-generation actions.
- Dependency, lockfile, package, browser, operating-system, base-image, or
  Dockerfile.worker changes.
- Source/test fixes, compatibility branches, fallbacks, retries, replay,
  cleanup refactors, or scope expansion discovered during deployment.
- Broad Docker cleanup, volume cleanup, Worktree cleanup, deployment deletion,
  branch cleanup, or secret printing.

### Stop conditions

Stop without retry or scope expansion if any of the following occurs:

- source path set or code/test content hash differs from this lock;
- any local acceptance gate is no longer valid;
- candidate commit parent, manifest, or cleanliness differs;
- Vercel project, metadata, target, readiness, protected GET, or alias identity
  differs;
- a second Vercel deployment or rebuild would be needed;
- dependency/base inputs changed or a full Worker build appears necessary;
- E-drive space decreases unexpectedly or Docker state cannot be attributed;
- database profile is not `staging`, schema is not `42`, any claim risk count is
  nonzero, or a preserved `repair_wait` row changes;
- a Worker claims work or emits crawl, model, report, repair, commerce, refund,
  email, or artifact activity;
- an action would touch Production or any path, deployment, image, container,
  environment line, database row, report, order, payment, or history outside
  this lock.

Normal rollback within the exact limits above is allowed after a deployment
failure. Rollback does not authorize a retry.

### Completion boundary

This deployment scope completes only when one exact candidate revision is
verified across the protected Staging Web, Free Worker, and Deep Worker, the
fixed alias resolves to that revision, the current/rollback image pair is
recorded, and no prohibited workflow or data mutation occurred.

Even then, report only: `Protected Staging deployment completed; real flow not
yet accepted.` Do not say the overall repair is complete.

After deployment, create a separate `FROZEN` real-flow authorization for
exactly one new report and one Sandbox payment. The user controls URL submission
and payment. If that fresh flow fails at any stage, do not retry, repair, resume,
replay, replace, pay again, or reuse it. Report the actual failed stage and root
cause, create a new precise `FROZEN` repair scope, and obtain new approval before
any repair or another real report.

Only one wholly new report completing the entire real chain may support the
statement that the overall flow is fixed.
