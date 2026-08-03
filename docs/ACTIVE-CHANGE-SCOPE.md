# Active Change Scope Lock

Status: `APPROVED`

This is the single approved recovery authority after the 2026-08-03 unified
Provider Profile release stopped before push. The user explicitly approved this
exact FROZEN scope on 2026-08-03. The complete remaining release surface is
locked here so no further piecemeal permission request is needed if every gate
passes.

## User-observable objective

Push the already verified unified Provider Profile candidate and deploy that
exact recovery SHA to the fixed Protected Staging site with both Staging
Workers using `OGC_PROVIDER_PROFILE=sensenova_anysearch`. Install and activate
the required AnySearch Staging authority first, stop after technical Gate 3,
and hand `https://open-geo-console-staging-itheheda.vercel.app` to the user for
their own new-report test. This scope does not authorize that report submission.

## Current baseline and retained state

- Canonical worktree only: `E:/project/open-geo-console` on branch
  `codex/delivery-root-fix`, HEAD
  `62352e8bb0397e8edd7d3e00fdcc54456c9874f4` (the verified 46-path feature
  commit), parent `24a2619d0e56450bae0305a889b1fd72aa95224d`.
- Remote `origin=https://github.com/hunger-Eric/open-geo-console.git` has
  `main` at `2a85133c3a39aee735c906590d74cca8f7d0f873`; the task branch is absent.
  Local and remote `main` must not change.
- The only tracked working-tree changes are the prior fail-closed closeout in
  `docs/ACTIVE-CHANGE-SCOPE.md` and
  `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md`. No implementation path is dirty.
- `apps/web/.tmp-preview/**`, `.data/candidate-worktree/**`, and
  `.data/deploy-worktree-readmode/**` must not be read as build sources,
  edited, removed, committed, or otherwise used.
- Ignored Staging inputs and generated Worker environment already select
  `sensenova_anysearch`, SenseNova `deepseek-v4-flash`, AnySearch, `zh-CN` and
  `CN`; required provider credentials are nonblank. Existing Free/Deep Workers
  have not been restarted and remain running with restart count zero on exact
  rollback image
  `sha256:95a62dcdfc1f91ff834e67d642609c682e79d9a550660073a6ef374bcfb4e83e`.
- Fixed-site rollback Web deployment is
  `dpl_J71XhBtERHciEMEd8DjWNc8SWPYM`, Preview, READY.
- Linked Vercel project is `prj_WVpdlJfsEp0YyWM2W54w8oBy985S`, owned by
  team slug `itheheda-6857s-projects`. The branch currently has zero scoped
  Preview variables. The previous failed command incorrectly supplied the
  `team_...` ID to the CLI's slug-oriented `--scope` option.
- Current E: free space is 54,882,361,344 bytes; Docker images use 32.19 GB
  and build cache 21.64 GB. Dependency/base-image inputs are unchanged, so a
  full Worker build is forbidden.
- Staging has no AnySearch certification artifact or authority. The existing
  active MiMo rollback authority stays installed and active.
- Historical report `5cddd8e2-df16-4289-87a3-21914e527a61` remains forbidden
  from repair, replay, reopening, cloning, or acceptance use.

## Exact tracked-file and Git authority

- Before release, change only this file's status from `FROZEN` to `APPROVED`.
- The Git operator may create exactly one documentation-only recovery commit
  containing only `docs/ACTIVE-CHANGE-SCOPE.md` and
  `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md`, with parent
  `62352e8bb0397e8edd7d3e00fdcc54456c9874f4` and message
  `chore: authorize provider profile staging recovery`.
- No production/configuration/test file may change. The complete recovery
  candidate is the new documentation-only commit; all runtime source must be
  byte-identical to feature commit `62352e8b...`.
- Push exactly once, without force, to new branch
  `origin/codex/delivery-root-fix`. No merge, rebase, tag, PR, branch deletion,
  `main` update, extra commit, or extra push is allowed.
- Diff budget before the recovery commit: exactly two tracked documentation
  paths and zero production/configuration/test lines. Cached whitespace and
  secret scans must pass.

## Vercel branch configuration recovery

- Use the verified linked project explicitly with
  `--project prj_WVpdlJfsEp0YyWM2W54w8oBy985S`; omit `--scope` entirely.
- The first write must be the real target
  `OGC_PUBLIC_SEARCH_ADAPTER=anysearch` for Preview branch
  `codex/delivery-root-fix`, using `--no-sensitive --force --yes`. If it fails,
  stop with no retry or alternate path.
- If it succeeds, upsert only these additional branch-scoped Preview values:
  `OGC_PROVIDER_PROFILE=sensenova_anysearch`,
  `OGC_REPORT_V4_MODEL_PROFILE_ID=report-v4-sensenova-deepseek-v4-flash-v1`,
  `OGC_PUBLIC_SEARCH_RUNTIME_ENABLED=true`,
  `OGC_PUBLIC_SEARCH_LOCALE=zh-CN`, `OGC_PUBLIC_SEARCH_REGION=CN`,
  `OGC_PUBLIC_SEARCH_CERTIFICATION_SIGNING_KEY_ID=provider-profile-20260803-recovery-v1`,
  and `OGC_PUBLIC_SEARCH_CERTIFICATION_SIGNING_VERSION=v1` as non-sensitive;
  plus one newly generated random
  `OGC_PUBLIC_SEARCH_CERTIFICATION_SIGNING_SECRET` as sensitive.
- Generate the signing secret once without printing or persisting it in an env
  file. Reuse it only in the same release process for certification/install
  verification and the single branch-scoped Vercel Sensitive value.
- After all writes, list only the target branch's variable names/targets and
  confirm the exact nine-name set without reading secret values.
- If a later variable write fails, remove only the branch-scoped variables
  successfully written by this attempt, verify the branch set is empty, and
  stop. No retry, Production/Development variable, other branch, team, project,
  or inherited Preview value may be changed.

## AnySearch certification, authority, and provider budget

The user previously accepted, and approval of this recovery scope reaffirms,
the Protected-Staging-only legal risk that the AnySearch agreement is not
published/available as a complete service contract. The certification must use
only these references and must not claim broader rights:

- terms: `https://www.anysearch.com/legal?type=tos`;
- commercial use: `https://anysearch.com/pricing`;
- storage/display: `https://anysearch.com/faq`.

The release operator may perform exactly these actions, in this order:

1. Recheck Staging database marker/schema and require zero claimable, running,
   expired-recoverable, and exhausted-terminalizable jobs.
2. Run one AnySearch certification for `zh-CN` / `CN`, exactly three live
   AnySearch requests, writing only
   `.data/public-search-certification/anysearch-provider-profile-20260803-recovery.json`.
3. Install exactly that signed artifact once as one inactive deterministic
   Staging authority, then activate exactly that authority once. Verify the
   complete adapter/provider/product/model/version/surface/locale/region
   identity and that exactly one matching AnySearch authority is active. The
   separate MiMo rollback authority remains unchanged.
4. Run `npm run generative-answer:staging:probe` exactly once with its fixed
   secret-safe operation. It makes one additional AnySearch request and one
   SenseNova `deepseek-v4-flash` request, prints no answer prose or credentials,
   and creates no report/job/order.

Total live provider budget is exactly four AnySearch requests and one
SenseNova request. Any typed failure stops immediately; no provider retry,
fallback, substitute query, or second artifact is authorized.

## Protected Staging deployment Gates 1-3

1. After configuration, authority and probe pass, push the exact recovery
   candidate once. Accept only the Git-integrated Preview created by that push;
   do not run a second/manual Preview deployment. Require READY plus independent
   `gitCommitSha` and `ogcGitSha` equal to the full recovery SHA.
2. Record disk/Docker/container/image state again. Build exactly one thin
   source-overlay image from rollback image `95a62dcd...`, tagged
   `open-geo-console:staging-<recovery-short>-provider-profile-overlay-v1`,
   copying only `apps/`, `packages/`, and the exact locked JSON under
   `config/model-profiles/`, with the full recovery SHA label. No `npm ci`,
   browser/OS/dependency install, full build, `docker cp`, running-container
   edit, or build retry is allowed.
3. Recreate exactly `staging-worker-free` and `staging-worker-deep` once with
   the candidate image and existing generated Staging environment. Do not
   restart/recreate Staging commerce or any Production service. Require exact
   image/revision/profile/tier/Staging identity, restart count zero, readiness,
   and zero claimed work.
4. Only after Web and both Workers share the recovery SHA, move the fixed
   Protected Staging alias exactly once to that READY Preview.
5. Browser QA may perform only Gate 3 smoke: authenticated `/zh`, test-mode
   catalog, and exact Web/Free/Deep identity, with before/after database counts
   proving no report, crawl, model/search row, job, order, payment, refund,
   email, or customer artifact was created. It may not submit a URL.
6. An independent read-only reviewer must accept Gates 1-3. Then stop and hand
   the fixed URL to the user. Gate 4/new-report creation remains user-owned.

## Image retention, rollback, and evidence

- Retain only the candidate image and rollback image `95a62dcd...` for this
  Staging line. After verifying no container references them, remove only these
  16 exact older Staging image IDs; skip and report any referenced image:
  `sha256:b08ea493fc2a87dc4c49c5263680a21a8627ee713c08be027bac5cea64be2032`,
  `sha256:23c9cb696e0fd62986862a355b16eaef60f4aa391111bd36ce59c474e7d056bb`,
  `sha256:5cb3a2b3a929c0f44b7d1b97e2252d7c94e4b154af08bddc0ef87a1743cac8e4`,
  `sha256:d6a730bc9d35ddcf75697b13004e3613bf61b4536a914c00f427ecd2dde2f247`,
  `sha256:7b08c1e1a4778f8f0581cdf550571931202cc2df94cc49c772c25af9dabb8e20`,
  `sha256:26bb8f778d05d3b30fa948087d6ddee30ed456797f943d227bf9c5f2ff7e624b`,
  `sha256:901be87958868cdf32dbb2a4b51e6aa111f37780d06616c4d2dfa06a4e3e1650`,
  `sha256:3f436e73870a2b8c22d10b12413e2acf3b06bfe9a202ae2035497b7e3f448039`,
  `sha256:4a28445023a7211605ae47f4c30189d2f797872db679aab0e2627e909505f56a`,
  `sha256:5ef0fecd18b5d010ce73acfed077f3083bb8545faa670c9a1b84ed4cd4b264c4`,
  `sha256:0b62fd4561c20adc38139774e16785b55fa00050d85c58ec9e4f486a61dc7dfe`,
  `sha256:02b474693b25bd91b50fa127821d56b2d43261667785b6e01ff4b786a2590064`,
  `sha256:1cdc060d597c70b5d1ee0670a90672608da18b906303ffb586bddea2fe840c29`,
  `sha256:8a62a930f5a590a340b4db10cca83084b8f6674b457b0de500d1a9ce356f7695`,
  `sha256:ea1d552f5d97d384dd1327eee464165ed73b4be35e0e7cfc2c41f48a5fbe6797`,
  `sha256:748e2675f2801b8633118f472c4dc749c8adc595b64e74b6996c4955d47480fa`.
- No broad Docker/image/builder/volume prune is allowed. Production images and
  containers are untouchable. Record before/after free space, `docker system
  df`, image IDs/sizes, container references, and net bytes.
- Before alias movement, any failure stops without deployment retry. If the
  candidate Workers were recreated but not accepted, restore both once to
  image `95a62dcd...` and the exact prior runtime-env bytes.
- If Gate 3 fails after alias cutover, restore both Workers once and restore the
  alias once to deployment `dpl_J71XhBtERHciEMEd8DjWNc8SWPYM`, then stop.
- The installed AnySearch authority/artifact may remain because this was
  explicitly requested and is identity-scoped. No authority delete,
  deactivation, historical mutation, or MiMo change is authorized.
- Write one secret-free ignored ledger at
  `.data/protected-staging-release-ledger/<recovery-full-sha>.json` with all
  identities, call counts, mutations, gates, rollback data, and terminal state.
- At terminal success/failure, append one record to
  `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md` and reduce this file to `Status: NONE`.
  These two local closeout edits remain uncommitted/unpushed; report them.

## Explicitly forbidden and stop conditions

- No Production action; no report submission, crawl, job/order/payment/refund/
  email/customer artifact; no historical repair/replay; no schema, migration,
  dependency, prompt, report contract/structure, state-machine, payment, email,
  or UI change.
- No extra provider call, authority row, Vercel variable/branch/project,
  Preview, commit/push, Docker build/service, alias move, or external write.
- Stop on any baseline/diff/secret/worktree/remote mismatch, unsafe queue,
  certification/probe/authority failure, unexpected Vercel branch state,
  Preview identity ambiguity, less than 20 GiB free space, missing rollback,
  image/build/readiness/restart/SHA failure, or any Gate 3 business/data effect.
  Use only the exact cleanup/rollback above; never improvise or retry.

## Approval gate

Explicit approval of this FROZEN authorizes all and only the actions above:
one documentation recovery commit and push, nine branch-scoped Preview variable
upserts with exact failure cleanup, four AnySearch requests, one SenseNova
request, one AnySearch authority install/activation, one Git-integrated Preview,
one thin image build, two Staging Worker replacements, one alias cutover, exact
conditional rollback/cleanup, Gate 3 smoke/review, ledger and local closeout
documents. It accepts the stated Staging-only AnySearch contract risk. It does
not authorize Production or the user's later report test.
