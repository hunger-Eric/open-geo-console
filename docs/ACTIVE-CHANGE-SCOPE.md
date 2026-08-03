# Active Change Scope Lock

Status: `APPROVED`

This is the complete audited Git-and-Protected-Staging release authority for
the locally verified unified Provider Profile implementation. The user
explicitly approved this exact scope and accepted its stated Protected-Staging-
only AnySearch legal risk on 2026-08-03.

## User-observable objective

Create one immutable candidate commit from the current implementation, push
only branch `codex/delivery-root-fix`, and deploy that exact SHA to the fixed
Protected Staging site with both Staging Workers using
`OGC_PROVIDER_PROFILE=sensenova_anysearch`. Stop after Gate 3 so the user can
submit and test a wholly new report themselves.

The fixed business-test entry is:
`https://open-geo-console-staging-itheheda.vercel.app`.

## Baseline and current identities

- Canonical repository/worktree: `E:/project/open-geo-console`; no additional
  worktree may be created or used.
- Branch: `codex/delivery-root-fix`.
- Parent HEAD: `24a2619d0e56450bae0305a889b1fd72aa95224d`.
- Remote: `origin=https://github.com/hunger-Eric/open-geo-console.git`.
- Remote currently has only `main` at
  `2a85133c3a39aee735c906590d74cca8f7d0f873`; the task branch does not yet
  exist remotely. Neither local nor remote `main` may change.
- Linked Vercel project/team:
  `prj_WVpdlJfsEp0YyWM2W54w8oBy985S` /
  `team_PbYYV2K2zBjTeThfavXStTOI`.
- Current fixed-site deployment/rollback Web identity:
  `dpl_J71XhBtERHciEMEd8DjWNc8SWPYM`, Preview, READY.
- Current and rollback Worker image:
  `open-geo-console:staging-95e7fb2-paid-report-overlay-v1`, exact image
  `sha256:95a62dcdfc1f91ff834e67d642609c682e79d9a550660073a6ef374bcfb4e83e`.
- Current running Staging containers are
  `open-geo-console-staging-worker-free-1` and
  `open-geo-console-staging-worker-deep-1`, both on the preceding image.
- E: free space at audit was 55,004,557,312 bytes; Docker images used 32.19 GB
  and build cache used 21.64 GB.
- `package.json`, `package-lock.json`, `apps/web/package.json`,
  `Dockerfile.worker`, browser/system dependencies and base-image inputs are
  unchanged. A full Worker build is forbidden.
- The merged Staging configuration is currently the known half-switch:
  SenseNova `deepseek-v4-flash` and AnySearch credentials are present, but
  `OGC_PROVIDER_PROFILE` is missing and legacy assertions still name MiMo.
- Staging has no installed or active AnySearch authority. Existing active MiMo
  rollback authority is
  `public-search-authority-101c9dbb38db639d7f5b4207f8eb14e9832008672df617858239b6770b546c6e`.
- The historical failed report
  `5cddd8e2-df16-4289-87a3-21914e527a61` remains forbidden from repair,
  replay, reopening, cloning or acceptance use.
- `apps/web/.tmp-preview/**`, `.data/candidate-worktree/**` and
  `.data/deploy-worktree-readmode/**` remain excluded and untouched.

## Exact tracked Git candidate allowlist

The Git operator may stage exactly the following 46 implementation and
scope/history paths, and no others:

- `.env.example`
- `AGENTS.md`
- `README.md`
- `apps/web/src/db/commercial-orders-v4.postgres.test.ts`
- `apps/web/src/provider-profile/runtime.test.ts`
- `apps/web/src/provider-profile/runtime.ts`
- `apps/web/src/public-source-forensics/production-runtime.test.ts`
- `apps/web/src/public-source-forensics/production-runtime.ts`
- `apps/web/src/recommendation-forensics/active-runtime-reachability.test.ts`
- `apps/web/src/recommendation-forensics/product-availability.test.ts`
- `apps/web/src/recommendation-forensics/product-availability.ts`
- `apps/web/src/report-v4/mimo-provider.test.ts`
- `apps/web/src/report-v4/mimo-provider.ts`
- `apps/web/src/report-v4/mimo-site-synthesis-provider.test.ts`
- `apps/web/src/report-v4/mimo-site-synthesis-provider.ts`
- `apps/web/src/report-v4/model-runtime-config.test.ts`
- `apps/web/src/report-v4/model-runtime-config.ts`
- `apps/web/src/report-v4/openai-compatible-provider.test.ts`
- `apps/web/src/report-v4/openai-compatible-provider.ts`
- `apps/web/src/scripts/batch-drain.ts`
- `apps/web/src/scripts/probe-public-search.test.ts`
- `apps/web/src/scripts/probe-public-search.ts`
- `apps/web/src/scripts/report-v4-staging-preflight.test.ts`
- `apps/web/src/worker/processor.test.ts`
- `apps/web/src/worker/processor.ts`
- `apps/web/src/worker/report-v4-admission-production.test.ts`
- `apps/web/src/worker/report-v4-core-production.ts`
- `apps/web/src/worker/report-v4-enhancement-production.postgres.test.ts`
- `apps/web/src/worker/report-v4-enhancement-production.ts`
- `apps/web/src/worker/report-v4-free-teaser.test.ts`
- `apps/web/src/worker/report-v4-free-teaser.ts`
- `apps/web/src/worker/report-v4-oversized-token-acceptance-probe.test.ts`
- `apps/web/src/worker/report-v4-startup-readiness.test.ts`
- `apps/web/src/worker/report-v4-startup-readiness.ts`
- `compose.yaml`
- `config/model-profiles/report-v4-sensenova-deepseek-v4-flash-v1.json`
- `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md`
- `docs/ACTIVE-CHANGE-SCOPE.md`
- `docs/COMMERCIAL-OPERATIONS.md`
- `docs/DECISIONS.md`
- `docs/PROTECTED-STAGING-OPERATIONS.md`
- `docs/operations/public-search-surface-certification.md`
- `packages/ai-report-engine/src/model-profile-registry.test.ts`
- `packages/ai-report-engine/src/model-profile-registry.ts`
- `scripts/start-report-v4-staging-workers.ps1`
- `scripts/start-workstation-workers.ps1`

No additional tracked file edit is allowed. The only tracked changes after
approval are the mechanical `FROZEN` to `APPROVED` status update before the
candidate commit and the scope/history closeout after Gate 3.

## Git actions

1. Reconfirm cwd, branch, parent HEAD, remotes, worktrees, full diff, secrets,
   allowlist and budgets. Stop on any unexplained change.
2. Reuse the completed local evidence: 20 deterministic test files / 266 tests,
   scoped ESLint with zero errors, `git diff --check`, secret-pattern scan, and
   the complete workspace/Next.js build. No provider or database test is
   inferred from that evidence.
3. Stage only the exact 46 paths, run cached diff/whitespace/secret checks, and
   create exactly one commit with message
   `feat: unify provider profile routing` and parent equal to the baseline HEAD.
4. Push exactly once to new remote branch
   `origin/codex/delivery-root-fix` without force, merge, rebase, tag, PR,
   remote deletion or any `main` update.
5. The canonical worktree must remain the sole clean candidate source at the
   committed SHA. Do not create, detach, remove or use another worktree.

## Staging-only configuration writes

- Update only ignored `apps/web/.env.staging.local` to select
  `sensenova_anysearch` and the matching locked model profile.
- Update only ignored `apps/web/.env.public-search.staging.local` so the legacy
  adapter assertion, if retained, is `anysearch`.
- Regenerate only `.data/workstation-docker/staging.env` and its byte-stable
  Staging commerce projection using
  `scripts/start-workstation-workers.ps1 -PrepareOnly -PrepareStagingOnly`.
  Verify secrets only as present/absent and never print values. The regenerated
  Worker environment must contain the selected profile and no nonblank stale
  MiMo V4 routing values.
- Upsert only these branch-scoped Vercel Preview variables for Git branch
  `codex/delivery-root-fix`:
  `OGC_PROVIDER_PROFILE=sensenova_anysearch`,
  `OGC_REPORT_V4_MODEL_PROFILE_ID=report-v4-sensenova-deepseek-v4-flash-v1`,
  `OGC_PUBLIC_SEARCH_ADAPTER=anysearch`,
  `OGC_PUBLIC_SEARCH_RUNTIME_ENABLED=true`,
  `OGC_PUBLIC_SEARCH_LOCALE=zh-CN`, and
  `OGC_PUBLIC_SEARCH_REGION=CN`.
- Generate one new cryptographically random certification signing secret
  without printing it; use it only in the release process and store the same
  value as branch-scoped Vercel Preview Sensitive variable
  `OGC_PUBLIC_SEARCH_CERTIFICATION_SIGNING_SECRET`. Upsert matching non-secret
  branch-scoped values
  `OGC_PUBLIC_SEARCH_CERTIFICATION_SIGNING_KEY_ID=provider-profile-20260803`
  and `OGC_PUBLIC_SEARCH_CERTIFICATION_SIGNING_VERSION=v1`. Do not overwrite
  or rotate another branch/environment's signing authority.

## AnySearch certification and exact external-call budget

Approval explicitly accepts a **Protected-Staging-only business risk**: the
official AnySearch legal page currently says its legal agreement is not yet
published. This scope may not create Production authority. The private
certification record must transparently use these official references and
must not claim stronger rights than they state:

- terms: `https://www.anysearch.com/legal?type=tos` (agreement unpublished);
- commercial use: `https://anysearch.com/pricing` (Free small-project and
  Enterprise deployment tiers);
- storage/display: `https://anysearch.com/faq` (REST structured JSON and query
  non-retention; no separate output-display licence was located).

The release operator may:

1. Run exactly one AnySearch certification command for `zh-CN` / `CN`. It
   performs exactly three real AnySearch requests and writes one signed private
   artifact at
   `.data/public-search-certification/anysearch-provider-profile-20260803.json`.
2. Install exactly that artifact once as one inactive deterministic Staging
   authority, then activate exactly that authority once. Existing MiMo
   authority stays installed and active for rollback; no other row changes.
3. Run exactly one secret-safe generative-answer probe with question
   `采购跨境物流服务时，应核验哪些公开证据？`. It performs one additional
   AnySearch request and one SenseNova `deepseek-v4-flash` request, prints no
   answer prose or credentials, and creates no report/job/order.

Total authorized live provider budget is therefore exactly four AnySearch
requests plus one SenseNova request, with no retry after a typed failure.

## Protected Staging Gates 1-3

1. Before mutation, read the Staging marker/schema and exact queue counts.
   Require zero claimable, running, expired-recoverable or
   exhausted-terminalizable work. Database access is read-only except for the
   single authority installation and activation above.
2. After the branch push, reuse an existing READY candidate Preview only if its
   independent `gitCommitSha` and `ogcGitSha` both equal the candidate full SHA;
   otherwise allow exactly one new Preview. Never create two Previews.
3. Build exactly one thin source-overlay Worker image from the current exact
   rollback image. The deterministic tag is
   `open-geo-console:staging-<candidate-short>-provider-profile-overlay-v1`.
   The inline temporary Dockerfile may copy only `apps/`, `packages/`, and the
   exact new locked JSON under `config/model-profiles/`; it must label the full
   candidate SHA. No `npm ci`, dependency/browser/OS install, full build,
   `docker cp`, running-container edit or retry is allowed.
4. Recreate exactly `staging-worker-free` and `staging-worker-deep` once using
   the candidate image and regenerated environment. Do not restart or recreate
   Staging commerce or any Production service. Verify exact image ID/revision,
   `sensenova_anysearch`, tiers, Staging identity, health/readiness, zero restart
   count and zero claimed work.
5. Only after Web and both Workers share the candidate SHA, move the fixed
   Protected Staging alias exactly once to the READY candidate Preview.
6. Run Gate 3 smoke only: authenticated `/zh`, test-mode commerce catalog,
   exact Web/Free/Deep SHA identity, and before/after database counts proving
   no report, crawl, model/search row, order, payment, refund, email or customer
   artifact was created by smoke. Browser QA may not submit a URL.
7. An independent read-only reviewer must accept Gates 1-3. Then stop and hand
   the fixed URL to the user for their own test; Gate 4 is not authorized.

## Exact image retention and cleanup

After the candidate Workers are healthy, retain only the candidate image and
rollback image `95a62dcd...`. The release operator may remove the following
exact older Staging image IDs only after rechecking that no container references
them; a referenced image is skipped and reported, never force-removed:

- `sha256:b08ea493fc2a87dc4c49c5263680a21a8627ee713c08be027bac5cea64be2032`
- `sha256:23c9cb696e0fd62986862a355b16eaef60f4aa391111bd36ce59c474e7d056bb`
- `sha256:5cb3a2b3a929c0f44b7d1b97e2252d7c94e4b154af08bddc0ef87a1743cac8e4`
- `sha256:d6a730bc9d35ddcf75697b13004e3613bf61b4536a914c00f427ecd2dde2f247`
- `sha256:7b08c1e1a4778f8f0581cdf550571931202cc2df94cc49c772c25af9dabb8e20`
- `sha256:26bb8f778d05d3b30fa948087d6ddee30ed456797f943d227bf9c5f2ff7e624b`
- `sha256:901be87958868cdf32dbb2a4b51e6aa111f37780d06616c4d2dfa06a4e3e1650`
- `sha256:3f436e73870a2b8c22d10b12413e2acf3b06bfe9a202ae2035497b7e3f448039`
- `sha256:4a28445023a7211605ae47f4c30189d2f797872db679aab0e2627e909505f56a`
- `sha256:5ef0fecd18b5d010ce73acfed077f3083bb8545faa670c9a1b84ed4cd4b264c4`
- `sha256:0b62fd4561c20adc38139774e16785b55fa00050d85c58ec9e4f486a61dc7dfe`
- `sha256:02b474693b25bd91b50fa127821d56b2d43261667785b6e01ff4b786a2590064`
- `sha256:1cdc060d597c70b5d1ee0670a90672608da18b906303ffb586bddea2fe840c29`
- `sha256:8a62a930f5a590a340b4db10cca83084b8f6674b457b0de500d1a9ce356f7695`
- `sha256:ea1d552f5d97d384dd1327eee464165ed73b4be35e0e7cfc2c41f48a5fbe6797`
- `sha256:748e2675f2801b8633118f472c4dc749c8adc595b64e74b6996c4955d47480fa`

No broad Docker prune, volume deletion, builder prune, Production image cleanup
or unrelated container action is allowed. Record before/after free space,
Docker usage, exact image/container references and net bytes.

## Rollback authority

- Before the fixed alias moves, any failure stops without deployment retry;
  preserve failed artifacts as evidence.
- If candidate Workers were recreated but not accepted, restore their exact
  previous image `95a62dcd...` and original runtime-env bytes once.
- If Gate 3 fails after alias cutover, restore both Workers and the fixed alias
  once to image `95a62dcd...` and deployment
  `dpl_J71XhBtERHciEMEd8DjWNc8SWPYM`, then stop.
- The candidate AnySearch authority may remain installed/active because it is
  identity-scoped and MiMo rollback authority remains independently active;
  no destructive authority delete/deactivation is authorized.

## Evidence and closeout writes

- Write one secret-free, access-restricted, idempotent release ledger at
  `.data/protected-staging-release-ledger/<candidate-full-sha>.json` recording
  candidate/current/rollback identities, Vercel action, authority version,
  provider-call counts, Worker image/container IDs, alias action, database
  before/after counts, Docker/disk deltas and terminal status.
- After Gate 3, append the result to
  `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md` and reduce this file to `Status: NONE`.
  These local closeout edits are not pushed because a second push could create
  an unauthorized second Preview; report the two-document local dirty state.
- Keep remote task branch and candidate commit for the user's test. No merge,
  PR, tag, branch deletion or `main` closeout is authorized.

## Explicitly forbidden

- No Production deployment, Production configuration, Production database,
  Production Worker, Production commerce or Production image action.
- No report submission, crawl, report/job/order creation, payment, refund,
  email, customer artifact, historical mutation, replay, repair or Gate 4.
- No schema/migration/dependency/prompt/report-contract/state-machine/UI change.
- No extra tracked edit, extra commit/push/Preview/provider call/authority row,
  Docker build or alias move beyond the exact budgets above.
- Never print, commit or place secrets in the ledger, logs or chat.

## Stop conditions

- The user does not explicitly accept the stated AnySearch staging-only legal
  risk and this complete action list.
- Any Git path, baseline, remote, worktree, secret scan or budget differs.
- Staging marker/schema/queue state is unsafe, AnySearch certification or
  generative answer probe fails, or exact authority identity cannot be proven.
- Target free space falls below 20 GiB, rollback identity is missing, the thin
  image build fails, a Worker claims work/restarts/fails readiness, or Web and
  Workers do not share one full SHA.
- Candidate Preview identity is ambiguous or Gate 3 produces any business/data
  side effect. Stop or perform the single authorized rollback; never improvise
  a repair or retry.

## Approval gate

Explicit approval of this FROZEN scope authorizes all and only the actions
above, including the stated staging-only AnySearch legal risk, four AnySearch
requests, one SenseNova request, one AnySearch authority install/activation,
one Git commit/push, at most one Preview, one thin image build, two Staging
Worker replacements, one alias cutover, conditional exact rollback, and the
listed unreferenced-image removals. Approval does not authorize the user's
later report test; the user performs that themselves after handoff.
