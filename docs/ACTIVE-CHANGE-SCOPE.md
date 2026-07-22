# Active Change Scope Lock

Status: `APPROVED` - the user explicitly requested on 2026-07-22 that repeated
approval gates be removed for bounded verification maintenance. Under the
project's approval-amortization rule, the exact test-only correction below is
recorded as an approved verification amendment. The seven-table V42 guard's
non-skipped disposable-PostgreSQL regression already passes 2/2; production
behavior and all external-action boundaries remain unchanged.

### Approved verification amendment - restore historical fixtures and V42 chains

- In `schema-v38.postgres.test.ts`, construct the through-V37 prefix as
  `DATABASE_MIGRATIONS.length - databaseMigrationsAfter(37).length`; in
  `schema-v39.postgres.test.ts`, use the equivalent target version 38. This
  restores the versions named by the tests without changing fixture rows,
  product semantics, migrations, or production behavior. The existing length-
  subtraction fixtures currently execute seven statements beyond their named
  versions.
- In `schema-v39.postgres.test.ts`, replace only the two assertions for the
  nonexistent `phase_authority_incomplete` code with a bounded rejection matcher
  for `incomplete`, `non-canonical`, `fingerprint`, `contractVersion`, or
  `exact payload object issued`. Preserve the rejection requirement and the
  before/after zero-write assertion.
- Append `V42_DATABASE_MIGRATIONS` only to the exact forward-chain imports and
  expectations in `schema-v32.postgres.test.ts`,
  `schema-v34.postgres.test.ts`, `schema-v35.postgres.test.ts`,
  `schema-v36.postgres.test.ts`, and `schema-v37.postgres.test.ts`.
- Restore the declared historical schema boundary in
  `schema-v31.postgres.test.ts` and `schema-v32.postgres.test.ts` with
  `databaseMigrationsAfter(30)`. Keep `schema-v30.postgres.test.ts` on the
  current schema and add only the required immutable V34 diagnosis input object
  to its existing diagnosis rows. No fixture identity, scenario, or expected
  product behavior changes.
- The mechanical test allowlist remains unchanged. The measured test-only diff
  is `+97/-109`; its approval-amortized tracking budget is `+117/-131` (less
  than 20 percent headroom). Any production-code, fixture-identity, scenario,
  migration, or product-behavior change still fails closed.
- Rerun the five static forward-chain tests, the non-skipped
  V38/V39 PostgreSQL tests, the complete related PostgreSQL/schema group, and
  then the already required full repository verification.

### Proposed correction - preserve all seven existing guard surfaces

- Keep the existing seven triggers. Do not remove or weaken either V20 guard.
- Add explicit content-only payload cases for `market_source_passages`
  (`exact_excerpt` and the four matched-term arrays) and
  `market_provider_claims` (customer-visible provider/role/capability/scope/
  excerpt/rejection content). Continue ignoring structural IDs, hashes,
  versions, model identity, status, ordering, scores, and timestamps.
- Extend `apps/web/src/db/schema-v42.postgres.test.ts` to require the exact
  seven trigger tables, allow `MiMo` only in structural fields, and reject it
  in both newly covered content surfaces.
- The source allowlist remains only `apps/web/src/db/migrations.ts`,
  `apps/web/src/db/index.ts`, and
  `apps/web/src/db/schema-v42.postgres.test.ts`. Correct their combined hard
  budget from `+190/-20` to `+240/-20`; no other production behavior changes.
- The earlier mechanical latest-schema budget was `+70/-65`; the approved
  verification amendment above supersedes it with measured `+97/-109` and a
  tracking budget of `+117/-131`. The focused
  disposable-PostgreSQL guard test passed before wider validation resumed.

## Proposed delta - scope shared-market identity checks to content fields

### Objective and exact stopped baseline

- Fix the deterministic false positive in
  `ogc_reject_private_identity_in_shared_market_data()`: the current function
  compares every historical identity exclusion with `to_jsonb(NEW)::text`, so
  historical exclusion `MiMo` matches structural provider metadata such as
  `surface_id=mimo-native-web-search` before a new market snapshot can be
  created.
- Preserve the guard's security purpose. It must continue rejecting a customer
  identity when that identity appears in actual shared question, query,
  observation, sanitized-error, or source-evidence content. It must ignore only
  non-content structural fields such as IDs, hashes, provider/surface/version
  identity, status, ordering, timestamps, costs, and lease metadata.
- Baseline source is exact commit
  `8016adc3722264a7e311712f8439cc696cd755f5`. Stopped report
  `3b007f6d-a776-4139-b3b1-cf10907fddcd`, completed Free job
  `66e3b2f3-8a73-4d01-8e82-0b2615502a6e`, and failed V4 pre-admission job
  `fb41f164-847b-4503-ac28-5e4dd89e52c5` remain immutable. Do not retry,
  reopen, repair, replay, clone, delete, or use them as acceptance authority.

### Exact source allowlist and budget

- `apps/web/src/db/migrations.ts`
- `apps/web/src/db/index.ts`
- `apps/web/src/db/schema-v42.postgres.test.ts` (new)
- `AGENTS.md`, limited to the user-requested approval-amortization policy hunk;
  the pre-existing Docker discipline hunk remains excluded from this commit
- `docs/ACTIVE-CHANGE-SCOPE.md` for this lock and final freeze only
- `docs/operations/evidence/2026-07-22-free-teaser-v4-paid-v3-staging-acceptance.md`
  for non-secret final evidence only
- Maximum production/test source diff across the three TypeScript files:
  `+240/-20` lines. No provider adapter, prompt, report contract, Worker graph,
  route, UI, payment, email, crawler, Dockerfile, Compose, package manifest,
  lockfile, environment-source, existing row, or historical migration rewrite
  is allowed.

#### Approved test-only allowlist correction

The following existing tests may change only hard-coded latest-version
assertions from 41 to 42 and terminal `databaseMigrationsAfter` expectations.
No fixture, scenario, database mutation, product assertion, or runtime behavior
may change. Measured combined diff is `+69/-64`; the corrected hard limit is
`+70/-65` lines:

- `apps/web/src/db/index.test.ts`
- `apps/web/src/db/report-v4-acceptance-ledger.test.ts`
- `apps/web/src/db/schema-v18.postgres.test.ts`
- `apps/web/src/db/schema-v19.postgres.test.ts`
- `apps/web/src/db/schema-v20.postgres.test.ts`
- `apps/web/src/db/schema-v21.postgres.test.ts`
- `apps/web/src/db/schema-v23.postgres.test.ts`
- `apps/web/src/db/schema-v25.postgres.test.ts`
- `apps/web/src/db/schema-v26.postgres.test.ts`
- `apps/web/src/db/schema-v27.postgres.test.ts`
- `apps/web/src/db/schema-v28.postgres.test.ts`
- `apps/web/src/db/schema-v29.postgres.test.ts`
- `apps/web/src/db/schema-v30.postgres.test.ts`
- `apps/web/src/db/schema-v31.postgres.test.ts`
- `apps/web/src/db/schema-v32.postgres.test.ts`
- `apps/web/src/db/schema-v34.postgres.test.ts`
- `apps/web/src/db/schema-v35.postgres.test.ts`
- `apps/web/src/db/schema-v36.postgres.test.ts`
- `apps/web/src/db/schema-v37.postgres.test.ts`
- `apps/web/src/db/schema-v38.postgres.test.ts`
- `apps/web/src/db/schema-v39.postgres.test.ts`
- `apps/web/src/db/schema-v41.postgres.test.ts`

### Deterministic repair and verification

1. Add schema V42 as a forward-only replacement of the trigger function; do
   not edit V18 history. Build per-table content payloads from an explicit
   allowlist and fail closed for an unexpected trigger table.
2. Add PostgreSQL regression coverage proving a historical exclusion `MiMo`
   does not reject structural `mimo-native-web-search` metadata, while the same
   exclusion in each applicable content surface is still rejected. Verify the
   exact seven trigger tables remain attached.
3. Run the focused V42 PostgreSQL test, all market-snapshot/public-source and
   migration/schema tests, repository `npm test`, `npm run lint`, and
   `npm run build`. Before commit, prove the complete diff matches this
   allowlist and budget. One local commit is allowed; no push, merge, PR, or tag.

### One replacement runtime and acceptance allowance

1. Materialize one clean exact-commit export without creating a Git worktree,
   create one exact-commit Vercel Preview with full revision metadata, and one
   source-only thin Worker overlay
   from current image
   `sha256:c66803a29a21738cb23ed2b4c839c62d336f5776d04823eac8f097e8e3215880`
   using `--pull=false`. No `RUN`, dependency install, browser install, network
   install, or OS package change is allowed; added size must be at most 512 MiB
   and E: must retain at least 8 GiB free.
2. Recreate only the two Staging Workers, verify exact image/revision/tier,
   `staging / preview / test`, schema 42 and readiness, then move the fixed
   protected-Staging alias once to the exact Ready Preview. Do not repeat either
   already passing provider probe.
3. After replacement containers are verified, remove only the superseded
   unreferenced current test image above. Never remove the rollback image,
   staging/production images still in use, volumes, or build cache; no broad
   prune is allowed.
4. Submit exactly one new forced report for `https://shun-express.com/`. Preserve
   all old rows. Allow only its normal graph and verify the complete Free V4
   teaser, including full Q1, locked Q2/Q3/remediation, and absence of locked
   prose from HTML and serialized props.
5. Create exactly one `recommendation_forensics_v1` Airwallex Sandbox checkout
   and complete exactly one Sandbox payment. Only its signed Webhook may create
   entitlement, credit, and Paid V3 work. Allow at most two order-scoped Staging
   commerce reconciliations; pause only for CAPTCHA, interactive account, or
   3DS/OTP approval.
6. Final acceptance requires commercial `completed`, zero refund, settled
   credit, redirected test email, matching Free/Paid question and Q1 identities,
   and accessible Paid V3 HTML with answer -> owned sources -> diagnosis order.

### Stop and rollback boundaries

- Stop for any out-of-allowlist source need, security regression, schema other
  than 42, production identity, secret exposure, E: below 8 GiB, second new
  report/order/payment, unexpected refund, or need to mutate an existing row.
- Before the replacement report is created, rollback may restore only the
  current exact Preview alias, current two Worker containers, and schema-safe
  runtime selection. After report/order creation, preserve all new rows as
  immutable evidence; no manual repair, replay, synthetic payment, or deletion.

---

## Stopped approved scope - immutable evidence

Status: `APPROVED` - the user explicitly approved the exact one-Preview
metadata-correction delta on 2026-07-22. Reuse of the accepted commit, image and
passing provider evidence plus the remaining one-report Sandbox acceptance
allowance is authorized only under the boundaries below.

## Pending delta - replace the metadata-incomplete Preview once

- Reuse exact commit `8016adc3722264a7e311712f8439cc696cd755f5`, its
  already accepted tests/build, clean detached worktree and thin image ID
  `sha256:c66803a29a21738cb23ed2b4c839c62d336f5776d04823eac8f097e8e3215880`.
  No source edit, commit, test rerun, Docker build, public-search probe or
  generative-answer model request is authorized by this delta.
- Preserve metadata-incomplete Ready Preview
  `dpl_65XXndxjjJPZWgqNTQ3hzHkTU1cw` as immutable evidence. Create exactly one
  replacement Preview from the same clean exact-HEAD worktree with pinned
  `vercel@55.0.0` and all three non-secret deployment metadata assignments:
  `gitCommitSha=8016adc3722264a7e311712f8439cc696cd755f5`,
  `githubCommitSha=8016adc3722264a7e311712f8439cc696cd755f5`, and
  `ogcGitSha=8016adc3722264a7e311712f8439cc696cd755f5`.
- Require read-only API inspection to prove the replacement is `READY`, target
  `preview`, and all three metadata values are exact. No production target,
  project setting, environment variable, push, merge, PR, tag, deletion or
  third Preview is authorized.
- After that proof, change only `OGC_DEPLOYMENT_VERSION`, recreate only the two
  Staging Workers from the already accepted thin image, and repeat only local
  image/revision/tier/marker/schema/readiness checks. Do not repeat either model
  probe; reuse the passing public-search evidence and the repaired live probe
  result (`answerNonblank=true`, 20 sources, no refusal).
- Then move the fixed protected-Staging alias once to the replacement Preview
  and continue the already approved single browser report, Free teaser,
  Airwallex Sandbox payment, Paid V3, commerce and HTML acceptance steps below.
- If replacement deployment metadata or Worker identity fails, restore only
  the one environment line, the two rollback Workers and fixed alias. Preserve
  both Preview records and both retained images; no retry or third Preview.

---

## Active scope - repair the no-argument probe contract and finish one acceptance flow

### Objective and baseline

- Repair the root command-contract defect so the checked-in command
  `npm run generative-answer:staging:probe` is a complete, runnable protected-
  Staging probe without caller-supplied customer data.
- Preserve strict rejection of partial, duplicate, oversized, or unknown
  explicit arguments. The zero-argument path may use only one frozen generic
  public buyer question with locale `zh-CN` and region `CN`.
- Replace the opaque catch-all result with a fixed secret-safe failure stage
  (`command`, `staging_guard`, `provider_resolution`, `provider_request`, or
  `unexpected`). Raw errors, prompts, answers, source titles/URLs, response IDs,
  database fingerprints, credentials and customer data remain forbidden.
- Baseline branch is `codex/v4-answer-optimization-scope-reset` at local commit
  `abb5b9ce711ec05149c86fd41a91b50471472a41`. Existing dirty/untracked files,
  including the uncommitted Docker-discipline rule and historical evidence,
  remain preserved and outside runtime source except for the two allowlisted
  source files below.
- The fixed Staging alias remains on Ready rollback Preview
  `dpl_CMPQzDZc3pGHW1As6MrdNQe1i7M6`; the two Staging Workers remain on rollback
  image ID `sha256:f3b65393e41b66bd13b3d14ceb31d6a17b83cae7d9a7e1e630bc9129ef755ad9`.
  No prior report, order, job, checkout, payment or historical row is authority
  for the new acceptance run.

### Exact source allowlist and diff budget

- `apps/web/src/scripts/probe-generative-answer.ts`
- `apps/web/src/scripts/probe-generative-answer.test.ts`
- `docs/ACTIVE-CHANGE-SCOPE.md` for this lock and final freeze only
- `docs/operations/evidence/2026-07-22-free-teaser-v4-paid-v3-staging-acceptance.md`
  for non-secret final evidence only
- Maximum production/test source diff across the two TypeScript files:
  `+180/-30` lines. No package manifest, lockfile, dependency, database schema,
  migration, provider adapter, prompt, report contract, Worker graph, route,
  UI, payment, email, crawler, Dockerfile, Compose file, or environment-source
  change is allowed.
- One local commit is allowed after the full diff matches this allowlist. No
  push, merge, PR or tag is authorized.

### Deterministic acceptance before external action

1. Prove the zero-argument parser returns the exact frozen generic probe input,
   while a complete explicit triple remains supported and all partial/unknown/
   duplicate/oversized forms still fail closed.
2. Prove the no-argument command reaches `prepare`, provider resolution and
   `answerWithSources` in that order with the frozen input.
3. Prove every failure stage serializes only the fixed error token and stage;
   inject secret-bearing errors and assert none of their content escapes.
4. Keep both existing npm script strings unchanged, including their merged
   ignored Staging env path.
5. Run the focused probe tests, all tests affected by the runtime resolver and
   MiMo generative adapter, repository `npm test`, `npm run lint`, and
   `npm run build`. Any source failure is repaired only inside the two-file
   allowlist; no external provider retry is consumed by deterministic testing.

### Exact deployment, image and disk allowance

1. After deterministic acceptance, create the one local commit and a clean
   exact-HEAD temporary worktree. Create at most one new Vercel Preview for that
   exact commit; prove `Ready / preview` and exact revision metadata before any
   alias movement.
2. Build exactly one source-only thin Worker image from the accepted rollback
   image with `--pull=false`. Its definition may contain only `ARG`/`FROM`, the
   exact revision label, `COPY apps /app/apps`, and
   `COPY packages /app/packages`; no `RUN`, dependency, browser, network or OS-
   package installation is allowed. Added size must be no greater than 512 MiB
   and E: must retain at least 8 GiB free.
3. Change only the ignored merged Staging env's `OGC_DEPLOYMENT_VERSION` line
   and recreate only `staging-worker-free` and `staging-worker-deep`. Verify
   exact image/revision/tier, `staging / preview / test`, schema 41 and project
   readiness without printing secrets.
4. After the replacement Workers are verified, remove only superseded stopped-
   run image ID
   `sha256:18717bc746d77fea11d6672865f7e2b3fdf7e0dd22794d1532168b26416657dc`
   if and only if no container references it. Retain the accepted rollback
   image and the new current image. No broad prune, volume deletion, build-cache
   prune, production/staging-base image deletion, or unrelated cleanup is
   authorized. Record before/after E: free space and `docker system df`.

### Exact live verification and one-report allowance

1. Reuse the already passing public-search probe evidence; do not repeat it.
   Run the repaired no-argument generative-answer Staging probe once. It must
   return `staging`, `xiaomi-mimo`, `mimo-v2.5-pro`, `native_web_search`, a
   nonblank answer, at least one source domain, and no refusal.
2. If that invocation exposes a new safe stage rather than passing, perform
   read-only diagnosis without another model request. A second invocation is
   allowed only after a deterministic repair within the same two-file
   allowlist proves the first invocation did not reach `provider_request`.
   Provider, credential, network, adapter, configuration or runtime changes
   remain a stop-and-new-scope boundary.
3. Only after the repaired probe passes, move the fixed protected-Staging alias
   once to the new exact-commit Ready Preview and verify the same deployment ID.
4. Through one authenticated real-browser session, submit exactly one
   forced-new scan for `https://shun-express.com/`; do not reuse, reopen, repair,
   replay, clone or delete any historical report/job.
5. Verify the Free V4 teaser, including full Q1 and locked Q2/Q3/remediation,
   and prove locked prose is absent from HTML and serialized props.
6. Create exactly one `recommendation_forensics_v1` Airwallex Sandbox checkout
   and complete exactly one Sandbox payment. Only its signed Webhook may create
   entitlement, credit and Paid V3 work. Pause only if hosted checkout requires
   the user's interactive account or 3DS approval.
7. Allow the normal realtime graph and at most two order-scoped Staging commerce
   reconciliations. Verify commercial `completed`, zero refund, settled credit,
   redirected test email, shared Free/Paid question and Q1 identities, and the
   accessible Paid V3 HTML ordering and content contract.

### Rollback, stop and final evidence

- Before report creation, a failure may restore only the deployment-version
  line, the two Staging Workers from the accepted rollback image, and the fixed
  alias to `dpl_CMPQzDZc3pGHW1As6MrdNQe1i7M6`. After report/order creation,
  preserve every new row as immutable evidence; no repair, replay, deletion,
  synthetic payment or refund is authorized.
- Stop for a source file outside the allowlist, diff-budget breach, production
  identity, schema mismatch, secret exposure, E: below 8 GiB, second report/
  order/payment attempt, unexpected refund, or required provider/config/
  credential/network/business-logic change.
- Final acceptance still requires both an accessible real Paid V3 HTML report
  and commercial `completed`. Freeze this scope with exact identities, commands,
  disk numbers and non-secret outcomes when work ends.

---

## Archived stopped thin-overlay scope - read-only evidence

Status: `FROZEN` - the resumed thin-overlay run stopped before report creation
on 2026-07-22 because its one authorized generative-answer probe failed. The
runtime and fixed Staging alias were restored to the recorded rollback
authorities. No retry, report, browser, checkout, payment, commerce pass, or
further external action is authorized without a new explicit scope decision.

## Archived scope - resume the complete test through a thin source overlay

### Exact authority and unchanged candidate

- Target remains `https://shun-express.com/` through only
  `https://open-geo-console-staging-itheheda.vercel.app`.
- Runtime source remains local candidate commit
  `abb5b9ce711ec05149c86fd41a91b50471472a41` on branch
  `codex/v4-answer-optimization-scope-reset`. No source, dependency, schema,
  Dockerfile, provider, product, or report-contract change is authorized.
- The existing candidate Web deployment is Preview
  `dpl_32yGAqrY3h9k9ELhuA2TuAxuCg89`, URL
  `https://open-geo-console-r9f13o6xa-itheheda-6857s-projects.vercel.app`.
  Read-only inspection on 2026-07-22 proved target `preview` and status `Ready`.
  No new Vercel deployment may be created.
- The fixed Staging alias currently resolves to rollback Preview
  `dpl_CMPQzDZc3pGHW1As6MrdNQe1i7M6`, URL
  `https://open-geo-console-rh74n285h-itheheda-6857s-projects.vercel.app`, also
  inspected as `Ready / preview`.
- The exact accepted Worker base and rollback image is
  `open-geo-console:staging-a5825d637eb839e7dc1606c5e400412fb5962e52`, image ID
  `sha256:f3b65393e41b66bd13b3d14ceb31d6a17b83cae7d9a7e1e630bc9129ef755ad9`,
  OCI revision `a5825d637eb839e7dc1606c5e400412fb5962e52`. Existing Staging containers
  `547876b72cbb` (free) and `00b3c7c5b3cc` (deep) still reference that image and
  are in pre-existing restart loops. Production containers and images are
  forbidden.
- The candidate image tag
  `open-geo-console:staging-abb5b9ce711ec05149c86fd41a91b50471472a41`
  does not exist. The previous two full builds produced zero image, changed no
  runtime environment, and replaced no container.
- `git diff` proves zero changed dependency manifests between base and candidate.
  The exact candidate `apps/` and `packages/` trees contain 791 blobs totaling
  7,434,803 bytes (7.09 MiB). E: had 10.73 GiB free at the 2026-07-22 preflight;
  Docker reported 92.3 GB of images and 14.51 GB of build cache.
- Neither provider probe, browser submission, report, checkout, Sandbox payment,
  commerce pass, nor email allowance from the prior scope was consumed.
- Existing dirty/untracked files remain untouched. The uncommitted `AGENTS.md`
  disk-discipline rule and this scope/evidence documentation are not runtime
  candidate inputs and must not enter the image context.

### Exact thin-overlay and runtime allowance after approval

1. Export only commit `abb5b9ce711ec05149c86fd41a91b50471472a41` to one clean,
   temporary, exact-HEAD worktree. Use the existing ignored merged Staging env
   by local junction without copying or printing secrets. Remove only this
   agent-created worktree and its junctions at closeout.
2. Build exactly one thin local image with `--pull=false`, using the accepted
   base image above. The build definition may contain only `ARG`/`FROM`, the
   candidate OCI revision label, `COPY apps /app/apps`, and
   `COPY packages /app/packages`. It must contain no `RUN`, package manager,
   network, browser, operating-system package, root-manifest, dependency, or
   secret instruction. No repository Dockerfile or source file may change.
3. Tag only
   `open-geo-console:staging-abb5b9ce711ec05149c86fd41a91b50471472a41`.
   Before any container mutation, prove its base lineage, OCI revision, absence
   of `RUN` history after the base, source identities, and unique added size no
   greater than 512 MiB. E: must retain at least 8 GiB free. Any violation stops
   before runtime mutation.
4. Change only the single `OGC_DEPLOYMENT_VERSION` line in the ignored merged
   Staging env to the candidate SHA. With Compose project `open-geo-console`,
   recreate only `staging-worker-free` and `staging-worker-deep` from the thin
   image. Prove exact image ID/revision, tier, `staging / preview / test` markers,
   schema V41 database marker, required non-empty secret names, and project
   readiness logs without printing secret values.
5. Run at most one redacted public-search probe and one redacted
   generative-answer probe from the merged Staging runtime. Either failure is a
   permanent stop; no manual provider retry is authorized.
6. Re-inspect candidate Preview `dpl_32yGAqrY3h9k9ELhuA2TuAxuCg89`. Only after
   Worker and probe gates pass, move only the fixed protected-Staging alias once
   to that existing Preview and prove the alias resolves to the same Ready ID.
   No new Preview, production alias, push, merge, PR, or tag is authorized.

### Exact one-report and Sandbox allowance

1. Through one authenticated real-browser session, submit exactly one
   forced-new scan for `https://shun-express.com/`. Never reuse, reopen, repair,
   clone, delete, or replay a historical report or job.
2. Allow only that report's normal free job/checkpoints to create the three
   questions, three observations, full Q1 answer/sources/diagnosis and server-
   enforced Free V4 teaser. No manual claim, job replay, or second submission.
3. Verify visible technical score/ratings, three-question AI absence metrics,
   full Q1 answer/sources/diagnosis, locked Q2/Q3 titles, locked remediation
   preview and CTA. Locked prose must be absent from HTML and serialized props.
4. From that teaser create exactly one `recommendation_forensics_v1` Airwallex
   Sandbox checkout and complete exactly one Sandbox payment. Only its signed
   Webhook may create the entitlement, credit and Paid V3 job. Real-money
   commerce and synthetic payment events are forbidden. Pause for the user if
   hosted checkout requires interactive account or 3DS approval.
5. Let only the normal realtime checkpoint graph complete Q2/Q3 and all three
   bound diagnoses. Run Staging commerce reconciliation only when needed for
   this order, at most twice. Verify `completed`, zero refund, settled credit,
   redirected test email, and an active HTML report through the exact
   `staging-access` report/order pair.
6. Prove free and paid records share the exact question-set and Q1 identities.
   Inspect paid HTML ordering as answer -> owned sources -> per-question
   diagnosis, with cross-question source selection later and secondary.

### Disk, rollback, evidence and stop rules

- Before and after the thin build and container switch, record E: free space,
  `docker system df`, candidate/base image IDs and sizes, container references,
  and net bytes added. Do not run any prune command or delete any existing image,
  container, volume, or build cache in this scope. The accepted base remains the
  sole rollback image.
- Before report creation, any failure may restore only the single deployment
  version line, the two named Staging containers from the accepted base image,
  and the fixed alias to `dpl_CMPQzDZc3pGHW1As6MrdNQe1i7M6`. After report or
  order creation, preserve all new rows as immutable evidence; no repair,
  replay, refund, deletion, or reuse is authorized.
- Stop on any unexpected image instruction or size, E: below 8 GiB, production
  identity, non-Staging database marker, source/SHA mismatch, missing required
  secret name, failed probe, second report/order/payment attempt, unexpected
  refund, or need to change code/config/schema/provider behavior.
- Store browser screenshots/traces only under ignored `output/playwright/`.
  Update only
  `docs/operations/evidence/2026-07-22-free-teaser-v4-paid-v3-staging-acceptance.md`
  with non-secret identities, hashes, statuses and checks. Do not record tokens,
  cookies, credentials, raw provider responses, unhashed IPs or customer email.
- Final acceptance still requires the real accessible Paid V3 HTML report and
  commercial `completed` outcome. A Preview, thin image, Worker readiness, probe,
  teaser, checkout or paid job alone is not completion.

---

The stopped full-image scope below is retained as historical evidence only and
has no authority for this resumed test.

Status: `FROZEN` - execution stopped on 2026-07-22 after two zero-image Docker
build failures at the same Debian package-index network boundary. The fixed
Staging alias was restored to the recorded rollback Preview before any probe,
report, checkout, payment, email, or database write. No further external action
is authorized without a new explicit scope decision.

## Active scope - one complete Free-Teaser V4 to Paid V3 Staging report

### Frozen source and current runtime authority

- Target: `https://shun-express.com/` through the fixed protected test site
  `https://open-geo-console-staging-itheheda.vercel.app` only.
- Candidate source baseline: branch `codex/v4-answer-optimization-scope-reset`,
  HEAD `a5825d637eb839e7dc1606c5e400412fb5962e52`, tracked code/test patch hash
  `32ae24913f95a4240669920b9899386f6ddc6673`, plus these five new-file Git blob
  hashes: teaser component `814deeda36760ec75d5359b609a0fa44a38de475`,
  teaser test `06000f9f12319af348178a34dc7c54c7159970b6`, V41 test
  `71f986a7385e1eea039f4d6e7705a3615f9f3e51`, teaser Worker
  `5351e1ca7175c98ef4361393c5569d3470debae8`, and teaser Worker test
  `ba0c24a757495ad219a2c89cf504fa119bf301e4`. Only those 51 implementation/test
  paths plus this scope document may enter the candidate commit; every unrelated
  dirty or untracked path remains excluded.
- Approved candidate commit: `abb5b9ce711ec05149c86fd41a91b50471472a41`.
  All external actions below must bind to this exact commit.
- Current Web rollback authority: Preview
  `dpl_CMPQzDZc3pGHW1As6MrdNQe1i7M6`, URL
  `https://open-geo-console-rh74n285h-itheheda-6857s-projects.vercel.app`.
- Current Worker rollback authority: image
  `open-geo-console:staging-a5825d637eb839e7dc1606c5e400412fb5962e52`, ID
  `sha256:f3b65393e41b66bd13b3d14ceb31d6a17b83cae7d9a7e1e630bc9129ef755ad9`.
- Read-only preflight already proves Staging marker fingerprint
  `7223dda0037deca3`, schema V41, Preview/test-commerce identity, public-search
  runtime enabled, and two running Staging Worker lanes. No schema migration or
  database-marker write is needed or authorized.

### Exact deployment allowance after approval

1. Stage only the 52 task paths and create one local candidate commit. Do not
   push, merge, create a PR, tag, or include user-owned files. Record its full
   SHA here before any external mutation; the SHA must be derived only from the
   frozen source manifest above.
2. Export that commit into a clean temporary deployment context. Create exactly
   one Vercel Preview using existing remote build cache, verify `Ready`, then
   move only the fixed protected-Staging alias to it. Production aliases and
   deployments remain untouched.
3. Build exactly one immutable Worker image tagged
   `open-geo-console:staging-<candidate-full-sha>` with normal Docker cache (no
   `--no-cache`; dependency and Chromium layers should be reused). Recreate only
   `staging-worker-free` and `staging-worker-deep`, then prove image ID, revision
   label, tier, deployment profile, database marker, and readiness. Never copy
   files into a running container and never touch production containers/images.
4. Run at most one redacted public-search probe and one redacted generative-answer
   probe. A probe failure stops the run; there is no manual retry allowance.

### Exact one-report allowance after runtime alignment

1. Through an authenticated real browser, submit exactly one forced-new scan for
   `https://shun-express.com/`. Do not reuse, reopen, repair, clone, or delete a
   historical report/job.
2. Allow only that new free job and its persisted checkpoints to generate the
   three-question set, three public-search observations, Q1 answer/diagnosis and
   Free V4 teaser. No manual job replay or second submission is authorized.
3. Verify the free page contains technical score/ratings, three-question AI
   absence metrics, full Q1 answer/sources/diagnosis, locked Q2/Q3 titles, locked
   remediation preview and CTA; locked prose must be absent from HTML/serialized
   props.
4. Create exactly one `recommendation_forensics_v1` Airwallex Sandbox checkout
   from that teaser, complete exactly one Sandbox payment, and allow its signed
   Webhook to create exactly one Paid V3 fulfillment. Real-money commerce is
   forbidden. If hosted checkout requires interactive account or 3DS approval,
   pause for the user rather than substituting a synthetic payment event.
5. Let the existing realtime Worker/checkpoint graph complete Q2/Q3 and all
   three bound diagnoses. Run Staging commerce reconciliation only as needed for
   this order, at most twice, and verify `completed`, zero refund, settled credit,
   redirected test email, and an active customer HTML report accessible through
   the exact `staging-access` report/order pair.
6. Verify the free and paid records retain the identical question-set ID and Q1
   identity; inspect the paid HTML for answer -> owned sources -> per-question
   diagnosis ordering and the later secondary source-selection section.

### Test-site limits, stop, rollback and evidence

- Use only the fixed protected test site and its existing Staging model/search,
  database, Worker and Sandbox-commerce resources. Real-money payment, billing
  and production resources are forbidden. The Sandbox success event exists only
  because the normal Paid V3 job gate requires a verified test payment event; it
  does not debit funds. External work is bounded to one free report, one Sandbox
  unlock, the two named probes, and the provider calls checkpointed by those two
  jobs. No manual external-call retry is authorized.
- Stop on any production identity, non-Staging database marker, source-manifest
  mismatch, second scan/order/payment attempt, missing runtime secret name,
  failed provider probe, unexpected refund, or need to change code/config/schema.
- Before report creation, rollback may move the fixed alias once back to
  `dpl_CMPQzDZc3pGHW1As6MrdNQe1i7M6` and recreate only the two Staging Workers
  from the recorded prior image. After report/order creation, preserve all new
  rows as immutable evidence; do not repair, replay, refund, delete, or reuse
  them. Production is never a rollback target.
- Store screenshots/traces only under ignored `output/playwright/`. One new
  non-secret evidence file is allowed at
  `docs/operations/evidence/2026-07-22-free-teaser-v4-paid-v3-staging-acceptance.md`.
  It may record SHAs, deployment/image/report/order/job/artifact IDs, hashes,
  statuses and checks, but no credentials, access token, cookie, raw provider
  response, unhashed IP or customer email.
- Final acceptance requires the real accessible paid HTML report and commercial
  `completed` outcome. Tests, deployment, a free teaser, or a paid job alone do
  not constitute completion.

## Previous local implementation scope - Free-Teaser V4 + Paid V3 completion

Previous status: `LOCAL_VERIFIED` - implementation, tests, lint, build and diff
audit completed locally on 2026-07-22; no Staging acceptance was claimed.

### Objective and baseline

Complete the prospective product line specified by
`docs/superpowers/specs/2026-07-21-free-teaser-v4-paid-v3-report-redesign.md`:
new free reports become server-enforced V4 teasers; their checkout creates Paid
V3 source-forensics fulfillment that preserves the exact free question set and
Q1 answer. Repair the actual persistence and job-state boundaries instead of
treating the currently green tests as completion.

Baseline: branch `codex/v4-answer-optimization-scope-reset`, commit
`a5825d637eb839e7dc1606c5e400412fb5962e52`, pre-scope tracked-diff hash
`5718ab1f1245efbc6cec93b3ebf8203c3c71074e`. The tracked task-related partial
delta is 309 insertions and 31 deletions across 14 paths. The two untracked task
candidates have these SHA-256 fingerprints:

- `apps/web/src/components/combined-geo-report-v4-teaser.tsx`:
  `03999BD107BA0D13D7986755CB99CC925D59732370F26991B4487B59A2C5C440`
- `apps/web/src/worker/report-v4-free-teaser.ts`:
  `0ED23C40077DDBB1077F08E98B9911769F6269901AD5C5FC237129F7485B295C`

Those task partials may be corrected, replaced, or removed after approval.
Unrelated dirty/untracked paths are user-owned and must not be reset, stashed,
cleaned, edited, staged, or committed. The specification is read-only and has
SHA-256 `F123A22C6ECED421AF2158AED65885E6B1421F74958A10B8EDF3C755BAAF08C9`.

### Locked behavior allowlist

1. The existing exactly-once `v4_pre_admission` job is the free-teaser
   authority. Teaser generation runs after its exact Admission snapshot is
   persisted and before terminalization. Every expensive stage is checkpointed;
   a required teaser failure is never swallowed as non-fatal.
2. Persist one automatically confirmed three-question set, full Q1 answer with
   sources and locally bound diagnosis, and public-search observations for all
   three questions. Reuse existing question-set, market-observation, and scan-job
   checkpoint authorities. Do not add a `teaser_q1_answer` report column.
3. Compute brand/competitor metrics from the persisted three-question
   observations. Render score/ratings without detailed findings, full Q1,
   locked Q2/Q3 titles, issue-title preview with remediation locked, and CTA.
   Locked answers/findings/remediation must be absent from HTML and serialized
   props, not merely CSS-hidden.
4. Root report, section routes, and status polling share one persisted teaser
   readiness identity; an old completed homepage job cannot make a pending
   teaser appear complete.
5. Checkout uses generic `createPaymentOrder`, product
   `recommendation_forensics_v1`, the exact persisted question-set ID,
   public-search methodology, and report version 3. Remove only the V4 snapshot
   prerequisite. Questions are read-only; no edit/regenerate/confirm step.
6. Add forward-only schema V41 constraints accepting public-search versions 2
   and 3 while preserving V4 validity. Version 3 explicitly selects
   `combined_geo_report_v3`; environment defaults cannot redirect it.
7. Paid V3 reuses exact free Q1 only when question-set, provider, model/search,
   locale, region, and input identities match; mismatch fails closed. Q2/Q3 use
   the existing answer-first generation path.
8. `OpenGeoAnswerCardV3` gains optional `diagnosis`, not
   `modelDiagnosis`. Parse and bind every diagnosis reference to its containing
   question/card evidence. Historical V3 without diagnosis remains readable;
   new version-3 fulfillment requires all three completed diagnoses.
9. V3 diagnosis is resumable under V3 question-set identity, uses non-empty
   authorized target-site evidence, and cannot silently omit a failed card.
   Render each unit as answer -> its sources -> its diagnosis (three factors,
   target gap, three actions). Cross-question source selection remains later and
   secondary.
10. Historical V1/V2, existing paid V4, V4 contracts, payment/entitlement
    exactly-once boundaries, and 24-hour settlement policy remain unchanged.

### Exact production-file allowlist

Only these production paths may change after approval:

1. `packages/ai-report-engine/src/open-geo-answer-v3.ts`
2. `packages/ai-report-engine/src/combined-geo-report-v3.ts`
3. `packages/ai-report-engine/src/report-v4-diagnosis.ts`
4. `apps/web/src/worker/answer-first-v3.ts`
5. `apps/web/src/worker/report-v4-free-teaser.ts` (new)
6. `apps/web/src/worker/processor.ts`
7. `apps/web/src/db/business-questions.ts`
8. `apps/web/src/db/commercial-orders.ts`
9. `apps/web/src/db/jobs.ts`
10. `apps/web/src/db/schema.ts`
11. `apps/web/src/db/migrations.ts`
12. `apps/web/src/db/index.ts`
13. `apps/web/src/scripts/audit-recommendation-methodologies.ts`
14. `apps/web/src/app/api/reports/[id]/checkout/route.ts`
15. `apps/web/src/app/api/reports/[id]/status/route.ts`
16. `apps/web/src/components/commercial-checkout.tsx`
17. `apps/web/src/components/combined-geo-report-v4-teaser.tsx` (new)
18. `apps/web/src/components/combined-geo-report-v3-artifact.tsx`
19. `apps/web/src/report/combined-artifact-readiness.tsx`
20. `apps/web/src/app/[locale]/reports/[id]/page.tsx`
21. `apps/web/src/app/[locale]/reports/[id]/[section]/page.tsx`

No extra production helper is pre-authorized. If one becomes necessary, stop as
`DEVIATION_REVIEW_REQUIRED` and name the exact path and responsibility.

### Exact test-file allowlist

Only these tests may change or be created:

- `packages/ai-report-engine/src/open-geo-answer-v3.test.ts`
- `packages/ai-report-engine/src/combined-geo-report-v3.test.ts`
- `packages/ai-report-engine/src/report-v4-diagnosis.test.ts`
- `apps/web/src/worker/answer-first-v3.test.ts`
- `apps/web/src/worker/report-v4-free-teaser.test.ts` (new)
- `apps/web/src/worker/processor.test.ts`
- `apps/web/src/worker/processor-contract.test.ts`
- `apps/web/src/db/jobs.test.ts`
- `apps/web/src/db/product-contract.test.ts`
- `apps/web/src/db/public-source-commerce.test.ts`
- `apps/web/src/db/public-source-commerce.postgres.test.ts`
- `apps/web/src/db/index.test.ts`
- `apps/web/src/db/schema-v41.postgres.test.ts` (new)
- `apps/web/src/app/api/reports/[id]/checkout/route.test.ts`
- `apps/web/src/app/api/reports/[id]/status/route.test.ts` (new if absent)
- `apps/web/src/components/commercial-checkout.test.ts`
- `apps/web/src/components/combined-geo-report-v4-teaser.test.tsx` (new)
- `apps/web/src/components/combined-geo-report-v3-artifact.test.tsx`
- `apps/web/src/report/combined-artifact-readiness.test.tsx`

The existing `schema-v18`, `v19`, `v20`, `v21`, `v23`, `v25`,
`v26`, `v27`, `v28`, `v29`, `v30`, `v31`, `v32`, `v34`,
`v35`, `v36`, `v37`, `v38`, and `v39` PostgreSQL tests may receive
only the mechanical current-version expectation change from 40 to 41.

User authorization update (2026-07-22): the migration-chain assertions in
`schema-v32`, `schema-v34`, `schema-v35`, `schema-v36`, `schema-v37`,
`schema-v38`, `schema-v39`, and `report-v4-acceptance-ledger.test.ts` may be
updated only to include V41 in `databaseMigrationsAfter(...)` expectations.
No production behavior or other assertion changes are authorized by this
update.

### Diff budget

- production: at most `+1,900/-650`
- focused/new tests: at most `+2,200/-650`
- schema-version mechanical and authorized migration-chain tests: at most `+42/-36`
- this scope and evidence: at most `+230/-20`
- total change-owned delta: at most `+4,349/-1,320`

The partial task delta counts inside these limits. Before commit, audit every
changed and untracked path against the allowlist.

### Forbidden actions

No crawler frontier/safety changes, V4 Core/Enhancement or paid-V4 contract
changes, historical migration/replay/replacement, price or provider-protocol
changes, refund/SLA/email/auth/token changes, dependency/lockfile/env/secret
changes, Docker/topology/deployment changes, or unrelated docs/assets. Do not
add CSS-only secrecy.

No commit, push, deployment, live crawl, model/search call, checkout, payment,
refund, email, or staging/production mutation is authorized. Staging E2E needs
a later exact delta approval identifying candidate commit/image/Preview, one new
target report, one sandbox order, cost ceiling, stop conditions, and rollback.

### Deterministic acceptance

Prove with focused tests and repository evidence:

- exactly-once/resumable free question set, identical Q1, three observations,
  bound diagnosis, and ready checkpoint after Admission;
- no repeated completed external stage and no false-ready teaser on failure;
- four teaser hooks and zero locked prose leakage;
- consistent root/section/status states and access control;
- V3 order with exact question-set ID and no V4 snapshot/edit gate;
- disposable PostgreSQL V40 -> V41 migration accepting valid V2/V3 and V4,
  rejecting invalid identities, and rewriting no historical row;
- exact-identity Q1 reuse, Q2/Q3 generation, three resumable bound diagnoses,
  non-empty target evidence, and fail-closed completion;
- per-question answer/source/diagnosis ordering and historical V3 readability;
- historical V2/V3/V4 commerce/artifact/settlement regressions remain green.

Final checks: focused tests, PostgreSQL V41 test, `npm test`, `npm run lint`,
`npm run build`, `git diff --check`, path/numstat audit, forbidden/secret
scan, and dirty-worktree comparison. Anything outside this lock is
`DEVIATION_REVIEW_REQUIRED`.

---

The sections below are archived evidence and have no authority for this change.

Status: `FROZEN` - test and lint repair complete (2026-07-21). All acceptance
checks passed: npm test 0 failures, npm run lint 0 errors, npm run build success.

## Archived scope - test and lint repair

### Objective and baseline

Repair 12 failing unit tests and 2 ESLint errors discovered by full code scan.
No production behavior changes; only test expectations, test mocks, unused imports,
and `as any` casts are touched.

### Allowed files

1. `apps/web/src/db/product-contract.test.ts` — update version expectation 2→3
2. `apps/web/src/app/api/reports/[id]/checkout/route.test.ts` — rewrite mocks/assertions to match refactored route
3. `apps/web/src/app/[locale]/reports/[id]/page.tsx` — replace `as any` with typed casts
4. `apps/web/src/components/combined-geo-report-v4-teaser.tsx` — remove unused imports/parameter

### Forbidden subsystems

Worker, crawler, AI engine, payment gateway, database schema, deployment.

### Diff budget

< 250 lines changed across the four files above.

### Acceptance checks

- `npm test` passes with 0 failures
- `npm run lint` passes with 0 errors
- `npm run build` succeeds

---

## Archived scope - bounded representative V4 admission (FROZEN)

Status: `FROZEN` - contract B implementation and deterministic repository
verification are complete. No commit or external action was authorized or
performed; any further change requires a new exact approval.

## Active scope - bounded representative V4 admission

### Objective and baseline

Make V4 admission stop collecting an entire website once it has representative
report evidence. Bound every initial and dynamically discovered URL frontier,
prevent large families of similar pages from dominating reads, preserve useful
partial evidence, and let the existing checkout/Core path consume a truthful
`completed_limited` snapshot.

Baseline is commit `05bb1e21bcd275de594a578bb9900b15ee66bfe4` on branch
`codex/v4-answer-optimization-scope-reset`. At approval time the four candidate
production/test files below have no working-tree diff. All other modified and
untracked paths are pre-existing user-owned work and must not be reset, cleaned,
edited, staged, or committed. This scope file had a pre-existing `+72/-2`
user-owned delta and SHA-256
`706A98C8BEEEA1682B0981E5D9D74CA7059D7BF9C7934613FDA0AF8DCF2A9200`; all prior
content is retained below as archived read-only evidence.

Verified unchanged contracts:

- ordinary Deep selection remains at most 50 analyzable bodies;
- contract B permits at most 51 candidate reads only to preserve truthful proof
  of the existing 51st-unique-body `custom_service` boundary;
- checkout and Core already accept an analyzable `completed_limited` snapshot;
- customer output remains exactly three ordered questions, each shown as
  question, synthesized answer, and concise source links.

### Exact behavior allowlist

Only these behaviors may change:

1. Enforce one global V4 candidate-read budget of 51. Before selecting or
   starting the next candidate, compute `remaining = 51 - visited URL count`.
   No candidate beyond that remainder may reach the collector.
2. Recompute the representative frontier over the complete pending union after
   every discovery step and after checkpoint recovery.
3. Apply one generic cap of three representatives per identical
   `(pageType, templateKey)` bucket. This applies equally to news, blog posts,
   product details, help articles, case studies, and other repeated templates.
   It must not contain a site, host, `/news`, query-key, language, or copy
   special case. Distinct page types and distinct templates remain eligible.
4. Persist valid candidates omitted by the representative or global budget as
   non-analyzable `policy_excluded` evidence and never fetch them.
5. Stop before queue exhaustion once persisted unique readable bodies include
   deterministic representative evidence for the homepage, company identity,
   and primary product/service activity, and the remaining queue contains no
   unsampled high-value representative bucket. Repeated news/article/account/
   legacy candidates do not keep admission alive.
6. Preserve the existing 51st-unique-body `custom_service` result when a
   genuinely diverse representative frontier reaches it. Otherwise, zero unique
   readable bodies yields `unavailable`; one through 50 readable bodies with a
   page failure, robots denial, timeout/deadline residue, budget omission, or
   evidence-ready early stop yields deliverable `completed_limited`.
7. Preserve URL safety, normalization, immutable provenance, content-hash
   deduplication, checkpoint validation/restart determinism, caller/lease
   cancellation, collector behavior, and the ten-minute maximum. Do not increase
   any timeout.

### Exact tracked-file allowlist and budgets

Only these files may be edited:

1. `apps/web/src/worker/report-v4-admission-runtime.ts`: at most `+170/-55`.
2. `apps/web/src/worker/report-v4-admission-runtime.test.ts`: at most
   `+300/-70`.
3. `packages/site-crawler/src/selection.ts`: at most `+70/-25`, limited to
   the generic per-template representative cap/API required by focused red tests.
4. `packages/site-crawler/src/selection.test.ts`: at most `+120/-35`.
5. `docs/ACTIVE-CHANGE-SCOPE.md`: after approval, only status, unit results,
   exact numstat, and deviation verdicts may change; this scope's delta is at
   most `+170/-10` relative to the pre-scope fingerprint above.

Maximum change-owned production delta is `+240/-80`; tests `+420/-105`; scope
`+170/-10`; total `+830/-195`. No other path may have a change-owned diff.

### Forbidden subsystems and actions

Do not edit or mutate database schema/migrations, snapshot persistence format,
commercial orders, checkout, payments, refunds, credits, entitlements, Worker
job state machines, Core/orchestrator/question-answerer/source-audit logic,
model prompts/transport, report versions, report UI/source display, email,
tokens, dependencies/lockfiles, historical data/evidence, deployment files, or
staging/production state. Do not add recovery, replay, correction, migration,
compatibility, or target-specific behavior. No timeout increase is allowed.

No push, deployment, live crawl, report generation, checkout, payment, or
historical mutation is authorized by this scope.

### Deterministic acceptance

Tests must prove without live network access:

- more than 10,000 initial or dynamically discovered URLs start at most 51
  candidate reads across the full run and checkpoint resume;
- each `(pageType, templateKey)` retains at most three representatives,
  including recursive `/news?s=/news...`-shaped fixtures, without
  target-specific logic;
- over-budget/non-representative URLs are persisted as `policy_excluded` and
  are never passed to the collector;
- after 23 unique readable bodies contain home, company-identity, and primary
  business evidence, Admission finalizes without draining remaining news,
  account, legacy, or unbounded category candidates;
- one member/account-shaped failure, several timeouts, or robots denial yields
  `completed_limited` when readable evidence exists; only zero readable bodies
  yields `unavailable`;
- the 51st unique readable body still yields `custom_service`, while an
  ordinary Deep report contains no more than 50 bodies;
- checkpoint recovery reproduces the same remaining budget, representative
  queue, exclusions, terminal status, and read count;
- existing checkout/Core `completed_limited` and exactly-three-question/source
  display contracts pass without editing their files;
- no timeout increases and no forbidden path changes.

Required checks are the focused admission and selection tests, existing V4
orchestrator and question-answerer regression tests, `npm run lint`,
`npm run build`, full `npm test`, `git diff --check`, complete path/numstat
audit, and dirty-worktree comparison. Any need outside this allowlist or budget
is `DEVIATION_REVIEW_REQUIRED` and stops without commit.


### Completion evidence - 2026-07-21

- Implemented contract B: 51 candidate-read ceiling, three representatives per
  `(pageType, templateKey)`, checkpoint-safe recompression, evidence-ready early
  terminalization, truthful policy exclusions, and deliverable
  `completed_limited` coverage.
- Focused admission/selection: 56 tests passed. Downstream Admission/Core/
  three-question/checkout regression selection: 64 passed and 4 conditional
  PostgreSQL tests skipped. Final lint and full workspace/Next.js build passed.
- Full Vitest: 292 files passed, 43 skipped; 2,668 tests passed, 177 skipped;
  zero failures. The 10,001-link fixture passed without a timeout increase.
- Final `git diff --check` passed. Production diff search found no target-domain,
  member-subdomain, `/news`, timeout, or deadline special case.
- Change-owned production/test paths remain within the approved budgets. The
  scope delta is within its pre-scope `+170/-10` budget; pre-existing and
  concurrent user-owned dirty files were preserved.
- No file was staged or committed. No push, deployment, live crawl, report,
  checkout, payment, replay, or historical mutation occurred.

## Archived prior scope - read-only evidence, no authority for this change

Status: `FROZEN` — the DoH-enabled probe also returned `probe_failed`, rollback is verified again, and no retry, alias movement, report, or payment is authorized

## Pending deviation delta — allow the documented non-secret DoH resolver in the probe container and rerun the probe once

Deployment verdict on 2026-07-21: `DEVIATION_REVIEW_REQUIRED`. The resumed
sequence for replacement commit
`05bb1e21bcd275de594a578bb9900b15ee66bfe4` passed every deterministic gate, the
independent predeployment checker returned `CONFORMANT`, one image
(`sha256:c30b30bc32a7049e93a493d88b9e3bffd6c72a9570c98458fe2be727da44ce6c`,
tag `open-geo-console:staging-05bb1e21bcd275de594a578bb9900b15ee66bfe4`) and
one Ready protected Preview (`dpl_2uUMrYTVPkhPcbb9HEHkrUdMhHw5`, exact-SHA
metadata) were created, and both Staging Workers ran on the exact image with
fresh exact-SHA presence and zero active leases. The single authorized probe
container returned only `probe_failed` within seconds.

Read-only diagnosis found the failure environmental, not logical: the
workstation proxy resolves public DNS into the reserved Fake-IP range
`198.18.0.0/15`, which `packages/site-crawler/src/security.ts:155` must keep
blocking; the persistent Workers already carry the documented non-secret
remedy `OGC_PUBLIC_DNS_DOH_URL=https://cloudflare-dns.com/dns-query`
(`docs/PROTECTED-STAGING-OPERATIONS.md`), while the probe container did not,
so its first website read was rejected by the URL-safety boundary. The probe
performed zero successful website reads and zero business writes. The
authorized rollback ran to completion: the deployment marker and both Workers
returned to the `5a6ac0d...` image, the 68-table business fingerprint is
byte-identical before and after, production identities are unchanged, the
fixed alias never moved, both staging image tags are preserved, and the
detached worktree was removed.

If explicitly approved, this delta authorizes only:

- reuse of the existing image and the existing Ready Preview; no new commit,
  image build, Preview deployment, project-environment mutation, or push;
- one `OGC_DEPLOYMENT_VERSION` change to
  `05bb1e21bcd275de594a578bb9900b15ee66bfe4` in
  `.data/workstation-docker/staging.env` and one `--no-deps --no-build`
  force-recreate of exactly `staging-worker-free` and `staging-worker-deep`
  from the exact image, with the same image/tier/marker/readiness/presence and
  zero-claimable/zero-lease verification as before;
- exactly one replacement probe container invocation identical to the previous
  one except for adding the single non-secret variable
  `OGC_PUBLIC_DNS_DOH_URL=https://cloudflare-dns.com/dns-query` (the same value
  the Staging Workers already use); every other probe constraint is unchanged:
  no env file, no `DATABASE_URL`, no secrets, no report/job/order identity, at
  most 80 target reads, at most 600,000 ms, expected site key
  `shun-express.com`, expected text `凌顺国际物流`, exactly 23 unique
  analyzable bodies, terminal `completed`;
- the same before/after 68-table business fingerprint comparison and
  production identity check, and, only after a passing probe and fingerprints,
  the single fixed-alias move and its verification, plus one fresh final
  checker audit.

The rollback rule is unchanged: any failure before alias movement restores the
marker and recreates both Workers from the `5a6ac0d...` image once, then stops
permanently. Everything else remains forbidden: no code edit, no new report or
free scan, no checkout/order/payment/model/email/token/credit/artifact event,
no historical mutation, no second probe, and no production mutation.

Outcome on 2026-07-21: `DEVIATION_REVIEW_REQUIRED` — permanent stop. Both
Workers were recreated on the exact `05bb1e2...` image with fresh exact-SHA
presence and zero active leases, then the single authorized DoH-enabled probe
again returned only `probe_failed` (about 26 seconds, earlier than any
expectation mismatch could surface). The rollback ran to completion: marker
and both Workers restored to the `5a6ac0d...` image, the 68-table business
fingerprint byte-identical before and after, production identities unchanged,
fixed alias unmoved, both image tags preserved. The DoH variable alone is not
sufficient for the probe container; the next delta must diagnose the probe's
hidden failure without further live reads.

## Completed deviation delta — preserve safe fetch and replace the undeployed local commit once (done)

Deployment checker verdict: `DEVIATION_REVIEW_REQUIRED`. Commit
`911181c1d42e341823418f80deb8c1bdfce8076f` is locally conformant except that
the probe injects Node global `fetch`, bypassing the crawler's `createSafeFetch`
DNS pinning, redirect, response-size/content-type, and final-URL boundary. No
image, Preview, Worker, live-site read, alias, report, checkout, or payment has
occurred from that commit.

If explicitly approved, this delta authorizes only:

- edits to the two existing probe paths and this scope; no crawler-runtime,
  safe-fetch, dependency, Docker, Vercel, database, commerce, or other file;
- construction of the raw reader with `createSafeFetch({ beforeRequest })`,
  with the shared raw/browser budget claimed before each underlying website
  request/render while retaining the global AbortSignal and elapsed deadline;
- injected deterministic tests proving the safe-fetch factory is used, the
  global-fetch bypass is absent, redirect/raw/browser operations share the
  active cap, and the `(maxReads + 1)` underlying operation never starts;
- the existing absolute budgets (`probe <=240`, test `<=300`, scope `<=560`,
  total `<=1,395`) and all existing no-commerce/fail-closed checks;
- one bounded `worker` revision, one fresh `planner` checker, then exactly one
  `git commit --amend --no-edit` replacing undeployed `911181c1...`; the final
  commit must keep parent `5a6ac0d...`, the same seven paths, and message
  `fix: bound v4 admission dynamic frontier`. No second commit or further amend;
- rerunning every committed-state gate and a fresh predeployment checker.

Only after that checker returns `CONFORMANT` may the previously approved
clean-worktree/image/Preview/two-Worker/single-probe/alias sequence resume with
the replacement SHA. Its counts, rollback, zero-business-effect rules, and
report/payment freeze remain unchanged. A third production/test file, budget
overflow, unsafe fetch path, failed gate, or another commit need is a stop.

Safe-fetch delta checker: `CONFORMANT` before the single authorized amend.

The unique Preview remains Ready and protected but unaliased; the fixed Staging alias never moved.
The unique probe returned only `probe_failed`; old Workers, marker, business fingerprint, zero-job state, and production identities were restored and verified.

## Current scope — commit and deploy the V4 frontier repair, then run one no-commerce protected-Staging proof

### Objective, authority, and exact starting state

Commit only the already accepted V4 dynamic-frontier repair plus one generic,
database-free V4 admission probe; build and deploy that exact commit to one
protected Preview and the two Staging Worker services; then run the probe once
against `https://shun-express.com/` without creating a report, job, order,
checkout, payment, artifact, token, email, refund, or credit event.

Authority is the user's 2026-07-20 instruction to perform the exact commit/build/
deployment and protected-Staging no-commerce verification, while reserving the
only new report and payment for a later separate approval. The governing plan
remains `docs/superpowers/plans/2026-07-20-v4-admission-dynamic-frontier-repair.md`,
Units 6–7. This scope does not authorize the later report/payment portion of
Unit 7.

Repository starting state:

- branch: `codex/v4-answer-optimization-scope-reset`;
- Git HEAD/baseline: `5a6ac0d24574581342d7bc45ca4867e44094a366`;
- accepted uncommitted repair paths and current numstat: `discovery.ts +18/-4`,
  `discovery.test.ts +9/-0`, admission runtime `+41/-13`, admission runtime test
  `+155/-8`, and this scope `+313/-2`;
- no path is staged; every other modified/untracked path remains pre-existing,
  user-owned, and excluded from the commit;
- accepted deterministic evidence: lint/build, 2,635 full tests, focused
  PostgreSQL 14 tests, traceability/matrix, read-only Staging `db:audit`, diff
  check, CodeGraph, and independent final checker `CONFORMANT`;
- `report:v4:acceptance` remains correctly fail-closed at 20 implemented / 0
  protected-environment verified and must not be weakened.

Protected-Staging starting state:

- database marker `staging`, schema/current schema `40/40`, no claimable job,
  no actively leased job, and one recent free plus one recent deep presence;
- fixed alias `open-geo-console-staging-itheheda.vercel.app` resolves to Ready
  Preview `dpl_FbWc3HYAFLJyqqDwewdViPwq3JMP` /
  `open-geo-console-g1ab1uql7-itheheda-6857s-projects.vercel.app` and anonymous
  access returns the protected-authentication 302;
- free/deep containers `133245956c8e...` / `56b581bca176...` use image
  `sha256:9943d450435fdea586fa382ecb513cfb0c2f7e2112f2f9d7a23fda8e2794f0b1`,
  OCI/runtime revision `5a6ac0d24574581342d7bc45ca4867e44094a366`;
- merged Staging runtime contains exactly one nonblank deployment marker and
  each required profile/model/token variable; no value or secret may be shown.

Production non-change baseline is deployment
`dpl_3cx4ntaHcXquqJgRyj9E3tBX96BW`, free/deep containers
`e137f4e57d0d...` / `13ccba729da8...`, and commerce container
`be94b86e9feb...`. Production mutation count is exactly zero.

### Exact tracked-file allowlist and diff budgets

Only these paths may enter the one commit, relative to baseline HEAD:

1. `packages/site-crawler/src/discovery.ts`: at most `+25/-10`.
2. `packages/site-crawler/src/discovery.test.ts`: at most `+20/-5`.
3. `apps/web/src/worker/report-v4-admission-runtime.ts`: at most `+60/-25`.
4. `apps/web/src/worker/report-v4-admission-runtime.test.ts`: at most `+190/-20`.
5. `apps/web/src/scripts/staging-v4-admission-no-commerce-probe.ts`: new,
   at most `+240/-0`.
6. `apps/web/src/scripts/staging-v4-admission-no-commerce-probe.test.ts`: new,
   at most `+300/-0`.
7. `docs/ACTIVE-CHANGE-SCOPE.md`: at most `+560/-20`; after approval only its
   status, exact identities, unit/checker verdicts, and results may change.

Budgets: production/scripts at most `+325/-35`; tests at most `+510/-25`;
scope at most `+560/-20`; total at most `+1,395/-80`. No package script,
dependency, lockfile, Dockerfile, Compose file, schema, migration, Web route,
commerce, report persistence, state-machine, acceptance registry, security,
historical evidence, project-state/task/decision, or plan edit is allowed.

### Allowed probe behavior

The new probe must be generic and testable with injected discovery, collector,
clock, and output dependencies. Its production entrypoint must:

- require `OGC_DEPLOYMENT_PROFILE=staging`, `VERCEL_ENV=preview`, and
  `COMMERCE_MODE=test`;
- compose the existing `discoverReportV4AdmissionSite`,
  `createReportV4AdmissionCollectorDependencies`, and
  `createReportV4AdmissionRunner` with only in-memory checkpoint/snapshot
  repositories;
- never import or call a report/job/order/commerce repository, never accept a
  report/job/order identity, and fail if `DATABASE_URL` is present;
- count raw HTTP and browser reads, elapsed time, candidate/analyzable/excluded
  pages, distinct content hashes, terminal status, and generic expected-text
  matches; output only one bounded non-secret JSON object;
- accept generic CLI expectations, while the sole live invocation is fixed to
  target `https://shun-express.com/`, expected site key `shun-express.com`,
  expected text `凌顺国际物流`, exactly 23 unique analyzable bodies, terminal
  `completed`, at most 80 counted network/browser reads, and at most 600,000 ms;
- fail on `completed_limited`, `custom_service`, `unavailable`, identity/count/
  bound mismatch, recursive frontier growth, or any unresolved eligible work.

No Shun hostname, route, or parameter may be hard-coded in reusable crawler or
admission production code. The target-specific values exist only in the
operator command recorded by this scope.

### Units, executor/checker gates, and deterministic checks

1. One bounded `worker` executor implements only the probe/test allowlist and
   runs its red/green tests plus the existing focused crawler/admission suites.
2. A fresh `planner` checker must return `CONFORMANT` before any stage, commit,
   image build, Preview deployment, marker edit, container recreation, alias
   mutation, or live-site read.
3. The root agent audits the complete allowlist/budget, stages exactly the seven
   paths above, and creates exactly one local commit with message
   `fix: bound v4 admission dynamic frontier`. No amend, merge, rebase, tag,
   branch switch, push, PR, or second commit is authorized.
4. From the committed SHA run lint, build, full tests, probe tests, focused
   crawler/admission tests, traceability, matrix, diff check, CodeGraph, and
   verify `report:v4:acceptance` still fails only for the unchanged 20 unverified
   protected-environment entries.
5. A fresh independent predeployment checker must return `CONFORMANT` before
   external mutation. A final fresh checker audits deployment/probe evidence.

Probe implementation gate: the bounded executor's two-file probe revision
passed `20/20` probe tests, `7` focused files / `158` tests, Web lint, and diff
check. The fresh independent probe checker returned `CONFORMANT` before staging.

### Exact clean-source, build, Preview, Worker, and probe operations

After all predeployment gates pass, the following sequence is authorized once:

1. Create one detached clean worktree at
   `E:\project\open-geo-console-deploy-<commit-short-sha>` for the exact commit.
   It must be clean before use. Add hard links only for the existing ignored
   `.vercel/project.json` project link; do not copy secrets or user dirty files.
2. Build exactly one image from that clean source using `Dockerfile.worker`, tag
   `open-geo-console:staging-<full-commit-sha>`, and set both build argument and
   OCI revision label to the full SHA. No second successful image build or tag
   is allowed.
3. Create exactly one Vercel Preview from the clean worktree with deployment
   build/runtime `OGC_DEPLOYMENT_VERSION=<full-commit-sha>` and non-secret
   revision metadata. Do not use `--prod`, push, mutate project environment,
   disable authentication, or move the fixed alias yet. A deployment that is
   not Ready, exact-revision, and anonymously protected is a stop.
4. Immediately before Worker recreation, repeat read-only Staging marker/schema,
   zero-claimable, zero-active-lease, business-row fingerprint, env-name/nonblank,
   current container/image, and production identity checks. Drift is a stop.
5. Change only the single ignored `OGC_DEPLOYMENT_VERSION` line in
   `.data/workstation-docker/staging.env`, then force-recreate exactly
   `staging-worker-free` and `staging-worker-deep` with `--no-deps --no-build`
   and the exact image. Verify image ID/OCI SHA, tier, staging/preview/test
   markers, nonblank required variable names, readiness logs, presence, and
   zero claimable/active jobs. Normal presence registration/heartbeats are the
   only allowed Staging database writes before the probe.
6. Run exactly one ephemeral `--rm --init` probe container from the exact image,
   with only the three non-secret staging/profile markers and deployment SHA.
   Do not pass an env file, `DATABASE_URL`, model/payment/email/object-storage
   secrets, report/job/order IDs, or a Worker command. The probe may perform at
   most the fixed 80 Shun website reads and zero model/search/provider calls.
7. Prove before/after Staging business fingerprints unchanged for reports,
   jobs, snapshots, questions, orders, payment events, credits, artifacts,
   tokens, emails, refunds, and acceptance rows. Worker presence timestamps are
   excluded from the fingerprint. Also recheck production identities unchanged.
8. Only after the probe and fingerprints pass, point the fixed protected alias
   exactly once to the new Ready Preview. Verify direct and alias authentication,
   exact deployment identity/SHA, and zero business effects. Do not invoke a
   scan/report route.
9. Remove the exact detached worktree after resolving and validating its path.
   Preserve both old and new staging image tags; remove no staging/production
   image, volume, deployment, cache, user file, or evidence.

Allowed expensive/external counts: one commit, one detached worktree add/remove,
one image build, one Preview deployment, one two-service Staging recreation,
one live no-commerce probe, one fixed-alias change, at most four read-only
Staging audits/fingerprints, and at most four production identity comparisons.

If Preview, Worker, or probe verification fails before alias movement, restore
the original deployment marker and recreate the two Staging Workers once from
the original `5a6ac0d...` image, then stop. This single rollback is authorized
only to restore the recorded baseline; it does not authorize another build,
deployment, alias change, or probe. Because alias movement is last, no alias
rollback should be needed; any post-alias mismatch is a stop-and-report event.

### Forbidden actions and deviation brakes

Exactly zero new report, free scan, V4 job, checkout, order, payment, Webhook,
Core, diagnosis, model/search call, email, token, refund, credit, artifact,
acceptance-session write, cleanup, replay, repair, resume, historical mutation,
schema operation, production mutation, push, or ordinary/FIFO/drain/batch
acceptance Worker is authorized. Do not run `run-report.bat`.

Do not stage, commit, copy into the clean worktree, clean, reset, stash, move, or
delete any pre-existing user dirty/untracked path. No historical report or
snapshot may be reopened, restored, cloned, or used as new authority.

Stop with `DEVIATION_REVIEW_REQUIRED` before external mutation if implementation
needs another file/behavior or budget, if deterministic acceptance regresses,
if exact commit/image/Preview/runtime identities diverge, if any claimable or
active job appears, if the clean worktree is not exact, or if a secret would be
copied/logged. After mutation, any failed health/readiness/fingerprint/probe,
non-`completed` result, non-23 body count, identity mismatch, recursion/read/time
overflow, business write, or production drift triggers the rollback rule above
and then a permanent stop. No retry is inferred.

This scope remains `FROZEN` until the user explicitly approves this exact
seven-path allowlist, budgets, one commit, clean worktree, image/Preview/Worker/
alias mutations, single no-commerce probe, rollback, zero report/payment, and
deviation brakes. Approval of this scope still does not authorize the later one
new report or CNY 199 Sandbox payment.

## Frozen completed scope — deterministic V4 admission code Units 1–5

Deterministic closeout on 2026-07-20:

- Unit checkers: Units 1, 2, 3, and 4 `CONFORMANT`; Unit 3's first `REVISE_WITHIN_PLAN` was repaired and independently rechecked `CONFORMANT`.
- `lint`, `build`, full `npm test` (`291` passed files / `2,635` passed tests), focused crawler/Worker suites, and focused PostgreSQL (`4` files / `14` tests) passed.
- V4 traceability and matrix passed with `20` implemented requirements; V4 acceptance remained correctly fail-closed because all `20` are not yet protected-environment `verified`.
- Read-only Staging `db:audit`, `git diff --check`, forbidden-behavior/budget audit, and CodeGraph sync/status passed.
- No test database residue, stage, commit, push, deployment, report, payment, Worker claim, replay, repair, or historical mutation occurred.

## Frozen completed scope details — V4 admission dynamic candidate-frontier repair

### Authority, objective, and baseline

Repair the V4 pre-payment admission collector so semantically equivalent
dynamic URLs cannot expand an unbounded fetch frontier. The generic repair must
retain meaningful distinct route/query variants and truthful immutable
exclusion provenance, apply deterministic representative compression to both
initial and dynamically discovered candidates, preserve checkpoint/restart
order, and keep genuinely unresolved eligible transient/deadline work
fail-closed.

This scope authorizes only deterministic code/test Units 1–5 of:

- plan:
  `docs/superpowers/plans/2026-07-20-v4-admission-dynamic-frontier-repair.md`;
- approved product design:
  `docs/superpowers/specs/2026-07-16-two-stage-geo-report-generation-design.md`;
- V4 consolidation design:
  `docs/superpowers/specs/2026-07-19-v4-baseline-consolidation-complete-report-design.md`.

Exact repository baseline:

- repository: `E:\project\open-geo-console`;
- branch: `codex/v4-answer-optimization-scope-reset`;
- Git HEAD: `5a6ac0d24574581342d7bc45ca4867e44094a366`;
- CodeGraph: current at Unit 0, `771` files, `11,191` nodes, `33,545`
  edges;
- pre-Unit-0 scope working-tree SHA-256:
  `DA3C5245588E0A89FF742F58814287065DBDA805EEA7125E0951C6F5CCAE1A85`;
- pre-Unit-0 scope Git blob:
  `9b2c9a3788f89070ffeee26f76deb7cb5f6adba2`.

The immutable failure authority is:

- report `77d7577d-fbe7-4dec-b70b-912982394ff8`;
- completed free job `4bd9f940-6da7-44dc-8fc0-d7a8e7f83548`;
- completed V4 admission job `a80205fb-4794-48e8-b045-606e759a7c29`;
- snapshot
  `report-v4-site-33de08ce1642b15b6dc82b65f30ebb923571ac1a199eb7b73d6f363e119bcc46`;
- snapshot `completed_limited`, `116 / 23 / 93`, captured-to-terminal
  `604.213s`;
- page evidence: `23` analyzable rows with `23` distinct body hashes;
  `duplicate_content=78`, `policy_excluded=8`, `deadline_exceeded=5`,
  `raw_fetch_failed=1`, `robots_denied=1`;
- recursive evidence: `81` `/news` rows with only identical `s=/news` values,
  comprising `74` duplicate exclusions, `2` analyzable rows, and all `5`
  deadline rows, spanning query depths `1..27`;
- sole raw-fetch failure: `https://member.shun-express.com/`;
- current commercial effects: orders/payment events/refunds/credits/artifacts/
  tokens/emails all `0`; question checkpoints `0`; exactly the two named jobs.

One pre-payment question-set row exists for the report and is read-only. It is
not payment, Core, diagnosis, artifact, or replay authority and is outside this
repair.

Unit 0 also verified the live non-change baseline:

- Staging database marker is `staging`; fresh free/deep Worker presence is
  `5a6ac0d24574581342d7bc45ca4867e44094a366`;
- Staging free/deep containers are respectively
  `133245956c8e7c676fbbe4e12765b14d667a6736e1f04e39b29679bd438ab334`
  and
  `56b581bca176838b2d0ad7c1c7b50597de29bd435ed1ca4a16d9850672b7176f`,
  both on image
  `sha256:9943d450435fdea586fa382ecb513cfb0c2f7e2112f2f9d7a23fda8e2794f0b1`
  with matching OCI revision;
- protected Preview `dpl_FbWc3HYAFLJyqqDwewdViPwq3JMP` is Ready and
  `open-geo-console-staging-itheheda.vercel.app` resolves to that deployment;
- production deployment remains `dpl_3cx4ntaHcXquqJgRyj9E3tBX96BW`; production
  database marker is `production`; production free/deep/commerce container
  identities remain
  `e137f4e57d0d2490f6263c2a92a816f6154ab2347cf6acaaa08aa6a11af70cee`,
  `13ccba729da8b36a82193ae46d706ff7f0a49afaedfacba69f1aae36e9e79d67`,
  and
  `be94b86e9febd2621793d800f528ceb5253f8e3aa144dbb38e8abc5456e54663`.

These live identities are read-only evidence. Their continued existence does
not authorize stopping, restarting, rebuilding, deploying, claiming, draining,
or mutating them.

### Exact file allowlist and per-file diff budgets

No source, test, documentation, configuration, generated, asset, or runtime
file outside this list may be edited.

Production code:

1. `packages/site-crawler/src/discovery.ts`: at most `+40/-15`.
2. `packages/site-crawler/src/selection.ts`: at most `+70/-25`.
3. `apps/web/src/worker/crawler-runtime.ts`: at most `+100/-35`.
4. `apps/web/src/worker/report-v4-admission-runtime.ts`: at most `+150/-50`.

Tests:

5. `packages/site-crawler/src/discovery.test.ts`: at most `+90/-10`.
6. `packages/site-crawler/src/selection.test.ts`: at most `+130/-15`.
7. `apps/web/src/worker/crawler-runtime.test.ts`: at most `+220/-25`.
8. `apps/web/src/worker/report-v4-admission-runtime.test.ts`: at most
   `+300/-35`.
9. `apps/web/src/worker/report-v4-admission-production.test.ts`: at most
   `+130/-15`.
10. `apps/web/src/db/recovery-state.postgres.test.ts`: at most `+70/-10`,
    test-only, and only to prove the existing JSONB checkpoint round trip and
    restart order. It may not authorize a persistence-format, schema, or
    production database change.

Scope lock:

11. This current section of `docs/ACTIVE-CHANGE-SCOPE.md`: at most
    `+320/-10` relative to Git HEAD. After explicit approval, only its status,
    unit verdicts, and final deterministic acceptance result may change.

Budgets relative to Git HEAD:

- production total: at most `+360/-125`;
- tests total: at most `+940/-110`;
- code plus tests total: at most `+1,300/-235`;
- scope-lock current section: at most `+320/-10`;
- entire agent-owned task diff: at most `+1,620/-245`.

Existing user-owned modifications and untracked paths do not consume the
agent-owned budget, but they must remain byte-for-byte untouched and must never
be staged or claimed as this task's work. Any overlap or inability to separate
ownership is a stop condition.

### Allowed behavior changes

1. Introduce one generic admission-candidate normalization contract shared by
   initial and dynamic discovery. It may remove fragments and existing tracking
   parameters, deterministically collapse identical repeated query key/value
   pairs, and canonicalize already accepted same-site apex/`www` identity.
2. Omit recursive query growth when a child differs from its source only by an
   additional identical occurrence of a query pair already present. The rule
   must not hard-code a hostname, `/news`, `s`, or any target-specific value.
3. Preserve meaningful paths, effective ports, same-site validation, and
   distinct meaningful query values, including pagination/replacement
   candidates needed by a bounded representative crawl.
4. Apply the existing page-type/template representative policy to the union of
   the persisted pending queue and newly discovered candidates after each
   discovery step. Homepage priority, visited rows, persisted page evidence,
   replacement capacity, and deterministic restart order remain stable.
5. Count only unique analyzable body hashes toward the 51-page custom-service
   boundary. Candidate count, URL count, duplicate bodies, or exclusions may
   never stand in for the 51st unique body.
6. Preserve exactly one truthful immutable exclusion/provenance row when a
   candidate is omitted by policy. Do not fabricate analyzable content, a body
   hash, or successful read evidence.
7. Use existing generic `login_required`, `captcha_required`, `paywalled`, and
   policy-exclusion semantics for proven authenticated/utility surfaces. Do
   not special-case `member.shun-express.com` or relabel an unexplained
   transient fetch failure as benign.
8. Terminal semantics remain: exhausted bounded frontier with `1..50` unique
   analyzable bodies and no unresolved eligible residue is `completed`; zero
   is `unavailable`; the 51st unique body is `custom_service`; unresolved
   eligible transient/deadline work remains `completed_limited`.
9. Browser fallback remains at most once under the existing collector contract.
   SSRF, DNS pinning, redirect, robots, content-type, body-size, locale, and
   report-contract boundaries may not weaken.

### Unit boundaries and agent protocol

- Unit 1 edits tests only and proves the current implementation fails on the
  real recursive frontier, bounded fetch/queue assertions, meaningful query
  preservation, checkpoint restart, duplicate provenance, generic authenticated
  surface, genuine eligible transient failure, and the 50/51 boundary.
- Unit 2 implements only shared candidate normalization/recursive-growth
  rejection selected by the red tests.
- Unit 3 implements only deterministic whole-frontier representative queue
  compression and checkpoint/restart stability.
- Unit 4 integrates existing generic exclusion semantics and preserves strict
  terminal behavior.
- Unit 5 performs deterministic repository acceptance and only repairs
  allowlisted regressions caused by Units 2–4.

For Units 1–5, the root agent orchestrates and verifies. Each unit uses one
bounded `worker` executor (`gpt-5.6-terra`, medium effort) for allowlisted edits
and a fresh independent `planner` checker (`gpt-5.6-sol`, high effort) after the
executor stops. Maximum concurrency remains three threads and depth one. The
checker rereads this scope and the plan, inspects the real complete diff and
test evidence, and returns only `CONFORMANT`, `REVISE_WITHIN_PLAN`, or
`DEVIATION_REVIEW_REQUIRED`. A scope-contained revision is automatic. Two
revisions that do not reduce the same failed acceptance items and require a
different design trigger the deviation brake.

### Required tests and deterministic acceptance

The focused red/green suites are:

```powershell
npm test -- packages/site-crawler/src/discovery.test.ts packages/site-crawler/src/selection.test.ts packages/site-crawler/src/analyzable-site.test.ts
npm test -- apps/web/src/worker/crawler-runtime.test.ts apps/web/src/worker/report-v4-site-collector.test.ts apps/web/src/worker/report-v4-admission-runtime.test.ts apps/web/src/worker/report-v4-admission-production.test.ts
npm test -- apps/web/src/db/recovery-state.postgres.test.ts apps/web/src/db/report-v4-site-snapshots.postgres.test.ts apps/web/src/db/commercial-orders-v4.postgres.test.ts apps/web/src/db/report-v4-acceptance-authority-phase-snapshot.postgres.test.ts
```

The exact recursive fixture must emit the three meaningful `/news` pagination
variants and append the same query pair for at least 30 generations. Its news
family must remain at no more than three physical fetches and three pending/
persisted representative candidates regardless of recursion depth. A separate
fixture must prove distinct query values remain discoverable. Checkpoint reload
must reproduce the same queue, order, known/visited identity, page evidence,
and final status.

Unit 5 must run:

```powershell
npm run lint
npm run build
npm test
npm run report:v4:traceability
npm run report:v4:matrix
npm run report:v4:acceptance
npm run db:audit
git diff --check
codegraph sync
codegraph status
```

Acceptance also requires a forbidden-literal/behavior search proving no target
hostname/path/parameter hard-code, schema/migration/dependency, historical
repair, commerce, or security weakening entered the diff, plus a complete
allowlist and `git diff --numstat` budget audit.

### Allowed local and external operations; exact expensive-action budget

Before scope approval, the only mutation is this Unit 0 scope edit. After exact
approval, Units 1–5 may perform only allowlisted file edits and deterministic
local verification.

Allowed read-only operations after approval:

- repository, Git, CodeGraph, process, Docker, Vercel identity, Staging marker,
  target immutable tuple, and production non-change queries;
- at most two final read-only Staging database audits and two final read-only
  production identity/marker comparisons.

Allowed isolated test operations after approval:

- inspect, then start at most once the existing loopback-only PostgreSQL 17
  test container
  `37faf043ab4726fec76e91c1f9680bb55cd1dc82dc7e7b2aa5e4622712865e28`
  (`ogc-v18-test-db`, host `127.0.0.1:55439`), only when its identity and
  loopback binding still match;
- create/drop at most eight disposable test databases through that container,
  covering one focused run and at most one scope-contained rerun;
- stop that exact test container at most once, and only if this task started it;
- run `codegraph sync` at most twice after edits, followed by read-only status/
  affected inspection.

Every other expensive/external-action count is exactly zero: Docker image
build/pull/tag/remove, Staging or production container/process stop/start/
recreate, Preview/deployment/alias/env mutation, live website crawl, model
call, report creation, checkout, payment, Webhook, Worker claim/drain/replay,
commerce/refund/email run, database business-row write, schema operation,
artifact/token creation, commit, stage, push, merge, PR, tag, or production
change.

Units 6 and 7 remain separately frozen. Code-scope approval does not authorize
any protected-Staging probe, deployment, image, new report, checkout, payment,
or paid acceptance. Each would require a later exact scope and separate user
approval.

### Forbidden files, subsystems, and actions

- No edit to `apps/web/src/worker/report-v4-admission-production.ts`,
  `report-v4-site-collector.ts`, security/safe-fetch code, schema/migrations,
  database repositories, commerce, checkout, Airwallex/provider adapters,
  price/currency, questions/prompts, Core, diagnosis, artifact, token, email,
  customer HTML, deployment/runtime config, dependencies, lockfiles, or V1–V3
  compatibility.
- No hostname, route, or query-parameter special case for the target fixture in
  production code.
- No replay, repair, recovery, requeue, reopen, clone, delete, update, or use as
  substitute authority for any historical report, job, snapshot, order,
  payment, credit, artifact, token, email, refund, reservation, or question set.
- Do not run `run-report.bat`, an ordinary FIFO/drain/batch/realtime/persistent
  Worker for acceptance, a broad workstation Worker starter, or any exact
  Worker against a business tuple.
- Do not edit, stage, clean, reset, stash, move, delete, or claim ownership of
  any pre-Unit-0 dirty/untracked path other than this scope file. This includes
  the modified V4 acceptance PostgreSQL test, `PROJECT-STATE.md`, `TASKS.md`,
  `DECISIONS.md`, both Shun evidence files, the old consolidation plan, all
  untracked `assets/`, Qoder files, `run-report.bat`, restoration evidence and
  plans, V3 plans, report-execution plans, and the new dynamic-frontier plan.

### Deviation brakes and approval lifecycle

Stop with `DEVIATION_REVIEW_REQUIRED` before proceeding if work needs an
unlisted file/behavior, exceeds any per-file or total budget, changes checkpoint
format/version or persistence schema, changes the V4 product/customer outcome,
weakens eligible transient/deadline failure, hard-codes the target, weakens
robots/SSRF/cross-site security, changes the 51st-unique-body boundary, touches
an existing dirty path, requires a dependency, or requires any nonzero external
action not listed above.

This exact current section remains `FROZEN`. The user must explicitly approve
this objective, baseline SHA, eleven-file allowlist, behavior boundary,
per-file and total budgets, deterministic checks, isolated-test operations,
zero Staging/production mutation budget, and deviation brakes before any
production-code or test edit. After approval, change only the top status to
`APPROVED` and execute Units 1–5 continuously. At deterministic closeout return
the status to `FROZEN`; do not infer Unit 6/7 authority.

## Frozen superseded scope — repair false-limited V4 admission, then create one replacement report

### Exact objective and baseline

Fix the verified V4 pre-admission defect that made a representative deep crawl
of `https://shun-express.com/` expand to 138 candidates and become
`completed_limited` despite 23 unique analyzable bodies. Preserve exclusion
provenance and robots compliance, but make completion describe the bounded
eligible representative frontier rather than the existence of any excluded
URL. After deterministic and protected-Staging gates pass, create, pay, and
accept exactly one replacement V4 deep report for the same site.

- Code baseline: `codex/v4-answer-optimization-scope-reset` at
  `bd403f77b30b01c6c5a8378d0fc05b63ee56ee71`.
- Failed no-commerce attempt: report `010afe2d-231e-4488-a8b3-eeb281595a88`,
  free job `58bad9b0-0b6f-4554-81f0-ebc5f0f200e6`, admission job
  `7bfb1ddd-5ae1-4fb3-9218-197a1def08dd`, snapshot
  `report-v4-site-7e524098baf744a6123f6dbd49fa86a4acf7a86982673b8f7cb1ee3df8fab253`.
- The failed attempt and all earlier polluted/failed/smoke lineages are
  immutable. It has zero orders and zero payment events and is not a payment
  or fulfillment authority.
- Approved design remains
  `docs/superpowers/specs/2026-07-19-v4-baseline-consolidation-complete-report-design.md`.
- This remediation supersedes only the design's exact one-shot execution method
  for the new acceptance run: the restored customer path must be proven through
  the exact-SHA persistent PostgreSQL Workers that automatically claim the
  browser-created tuple. All other design decisions, identities, questions,
  deadlines, state-machine, commerce, production, and acceptance boundaries
  remain binding.
- Remediation plan:
  `docs/superpowers/plans/2026-07-20-v4-admission-representative-crawl-remediation.md`.

### Allowed files and per-unit diff budgets

Only these production/test files may change:

1. `apps/web/src/worker/crawler-runtime.ts` and
   `apps/web/src/worker/crawler-runtime.test.ts`: U2 at most `+180/-90`.
2. `apps/web/src/worker/report-v4-admission-runtime.ts` and
   `apps/web/src/worker/report-v4-admission-runtime.test.ts`: U3 at most
   `+150/-80`.
3. `apps/web/src/worker/report-v4-admission-production.test.ts`: U3 at most
   `+80/-20`; production implementation may not change here.
4. `packages/site-crawler/src/discovery.ts`, `discovery.test.ts`,
   `selection.ts`, and `selection.test.ts`: U2 at most `+180/-100`, and only
   when a failing focused test proves the shared canonical/representative
   boundary belongs in this package rather than the Worker adapter.
5. This current scope section in `docs/ACTIVE-CHANGE-SCOPE.md`: at most
   `+190/-10` relative to the preceding frozen scope state.
6. `docs/superpowers/plans/2026-07-20-v4-admission-representative-crawl-remediation.md`:
   at most 90 lines.
7. `docs/operations/evidence/2026-07-20-shun-express-complete-v4-report.md`:
   at most 110 lines.
8. Concise stable-fact updates to `docs/PROJECT-STATE.md`, `docs/TASKS.md`, and
   `docs/DECISIONS.md`: each at most `+30/-15`.

Total production diff budget: `+330/-170`. No schema, migration, dependency,
commerce, checkout, payment provider, prompt, question, price, customer HTML,
email, token, credit, artifact, Core, diagnosis, or production-runtime file may
change.

### Allowed behavior changes

1. V4 admission applies one canonical same-site identity to apex/`www`
   variants without changing the submitted report URL or cross-site safety.
2. Dynamic discovery obeys the same robots and HTML eligibility boundary as
   initial discovery. Robots-denied candidates may be retained once as
   immutable policy evidence but may not consume the fetch frontier.
3. Equivalent or recursively growing query variants and repeated URL
   candidates may not expand the frontier indefinitely. The existing
   representative page-type/template selection is used or extended only as
   needed to keep the crawl bounded while retaining the 51st unique-body
   custom-service boundary.
4. Exact duplicate bodies remain immutable `duplicate_content` exclusions and
   do not count as analyzable pages. Benign policy, duplicate, or permanently
   invalid optional-link exclusions alone do not downgrade an otherwise
   exhausted representative crawl.
5. Any unresolved eligible candidate at the ten-minute product deadline, or
   unresolved transient fetch/render failure, still produces
   `completed_limited`/`unavailable`; the fix may not relabel unfinished work
   as complete.
6. Checkout remains fail-closed until the snapshot is exactly `completed` for
   this acceptance. The generic checkout error copy and commerce eligibility
   code do not change.

### Required tests and deterministic gates

- Add a Shun-shaped deterministic fixture containing apex/`www` aliases,
  `/?route/` robots-denied links, stale optional `.html` links, repeated news
  queries, duplicate bodies, and distinct route bodies.
- Prove finite candidate growth, robots compliance, unique-body counting,
  duplicate provenance, 51st-unique-body custom-service behavior, and strict
  `completed` versus deadline/transient `completed_limited` semantics.
- Run the focused site-crawler, crawler-runtime, site-collector, admission
  runtime/production, commercial-order, and V4 acceptance PostgreSQL suites.
- Run `npm run lint`, `npm run build`, `npm test`, V4 traceability/matrix/
  acceptance, `npm run db:audit`, `git diff --check`, and an allowlist/budget
  audit. Independent checker must return `CONFORMANT` for U1-U5.

### Allowed expensive external actions

Only after deterministic gates and an independent U3 checker pass:

1. Build one integrated Staging image labeled with the new complete Git SHA;
   create one protected Preview from that SHA; align fixed alias, image,
   Worker runtime marker/presence, and database marker. Production is read-only.
2. Stop/recreate only the precisely identified Staging free/deep Worker
   containers needed to move them to that exact image. Remove only superseded,
   unreferenced Staging test images named in the evidence record.
3. Submit exactly one replacement Chinese `forceFresh=true`
   `https://shun-express.com/` report after zero-claimable/recoverable gates.
4. Allow only its automatic free and V4 pre-admission jobs. Admission must be
   exactly `completed`, within ten minutes, with the LingShun identity and at
   most 50 unique analyzable bodies, before checkout.
5. Persist the same three locked questions and perform exactly one CNY 199
   Airwallex Sandbox checkout/payment. Only the verified signed Webhook may
   create entitlement, reserved credit, and the exactly-once Core job. The
   same transaction must create exactly one Core dispatch outbox item and one
   unsent `payment_confirmed` email intent.
6. Allow only the persistent exact-SHA state machine to run that report's Core
   and diagnosis work, using the prior 20/15-minute boundaries. Successful
   Core terminalization must create exactly one exact-target access token and
   one unsent `report_ready` email intent. No email send is authorized.
7. Inspect the authorized HTML at desktop and 390px mobile, push the integrated
   branch, but do not merge or deploy production.

### Forbidden actions and drift brakes

- No replay, repair, recovery, requeue, reopen, clone, delete, or mutation of
  report `010afe2d-231e-4488-a8b3-eeb281595a88` or any older lineage.
- No payment for the failed report; no more than one replacement report and
  one new checkout/payment. If the replacement admission is not exactly
  `completed`, or Core/diagnosis becomes failed, `completed_limited`, or
  `repair_wait`, stop permanently. This one replacement is the final
  authorized attempt; failure permits no later report or payment.
- No operator/exact/FIFO/drain Worker, manual Webhook, manual entitlement,
  broad commerce/email/refund run, production mutation, schema/commerce/UI/
  provider/prompt change, `run-report.bat`, merge, tag, or production deploy.
- Stop with `DEVIATION_REVIEW_REQUIRED` if a fix needs a non-allowlisted file,
  changes the 51-body boundary, weakens robots/SSRF/cross-site safety, treats
  deadline residue as complete, changes customer-visible questions/price/
  layout, or requires more external actions.

### Approval lifecycle

This new scope is `FROZEN`. No production code, process, deployment, report, or
payment action may occur until the user explicitly approves this exact section.
After approval, conformant work continues automatically; only a drift brake
returns to the user.

## Frozen failed scope — one complete paid Shun Express V4 report

### Exact objective and baseline

Create, pay, and accept exactly one new complete protected-Staging V4 deep
report for `https://shun-express.com/`. A free preview or runtime smoke report
is not the deliverable.

- Branch/SHA: `codex/v4-answer-optimization-scope-reset` at `bd403f77b30b01c6c5a8378d0fc05b63ee56ee71`
- Image ID: `sha256:e46c14a2b4b743d4ac3fa422ce74fcbd126c2f7552e1fa171fbcffb2dd4a30fb`
- Staging env raw SHA-256: `7e18b5f4ec4a33c37c962351cf6e52b21a1a890523bbb0a99e51bed7f473c4b6`
- Preview: `dpl_FHYqhkYMejCbZs5hgbbuU51c5Du5`
- Alias: `open-geo-console-staging-itheheda.vercel.app`
- Plan: `docs/superpowers/plans/2026-07-20-shun-express-complete-v4-report.md`

Historical polluted report `8446d645-8db1-45ce-8f4a-8016f7ed1b8f` / job
`58f10a1b-25af-4e7c-b7fa-7dee1b4947a4`, failed report
`f0133f5b-2eba-4d7f-b05a-a1786b2ea907` / jobs
`67a5913f-bdf2-4f75-92fe-888887aeffcb` and
`6139c15e-f395-4a76-8ca0-d355357636d5`, and smoke report
`f9b071d6-4685-4b69-9043-aad9421b8029` are immutable read-only evidence.

### Allowed files and diff budgets

No production code, test, config, schema, compose, dependency, prompt, question,
price, provider adapter, or customer-layout file may change.

1. `docs/ACTIVE-CHANGE-SCOPE.md`: current section only, `+170/-5`.
2. `docs/superpowers/plans/2026-07-20-shun-express-complete-v4-report.md`: at most 130 lines.
3. `docs/operations/evidence/2026-07-20-shun-express-complete-v4-report.md`: at most 220 lines.
4. `docs/PROJECT-STATE.md`, `docs/TASKS.md`, `docs/DECISIONS.md`: final stable facts only, each `+30/-15`.

Production/config/test diff budget: `+0/-0`.

### Allowed runtime and external actions

Only after approval and a conformant D1 preflight:

1. Keep the existing exact-SHA persistent Staging free/deep Workers running;
   do not recreate, restart, stop, or replace them.
2. Require zero pre-existing claimable and expired-running recovery jobs.
3. Browser-submit exactly one new Chinese `https://shun-express.com/` scan with
   `forceFresh=true`. This is the only newly authorized Shun Express report.
4. Allow the persistent Workers to process exactly one automatic free job and
   its exactly-once V4 pre-admission job. Each must claim within 30 seconds and
   complete within ten minutes, with no operator/exact/manual claim.
5. Admission must produce one immutable `completed` snapshot, unique analyzable
   body hashes, and the identity `深圳市凌顺国际物流有限公司` / `凌顺国际物流`, never
   顺丰 / 顺丰速运 / SF Express.
6. Persist exactly the three locked questions in the plan, without rewrite.
7. Create and complete exactly one CNY 199 Airwallex Sandbox checkout/payment.
   Only a verified signed Webhook may create entitlement, reserved credit, and
   the exactly-once Core job. The same transaction must create exactly one Core
   dispatch outbox item and one `payment_confirmed` email intent.
8. Allow only the persistent deep Worker and the existing state machine to run
   that exact Core job and its exactly-once diagnosis job. Core must claim
   within 30 seconds and fully complete within 20 minutes; diagnosis must claim
   within 30 seconds and fully complete within 15 minutes. Persisted automatic
   retries are allowed only within `max_attempts` and the same wall-clock
   boundary; manual replay is forbidden.
9. Successful Core terminalization must create exactly one exact-target access
   token and one `report_ready` email intent. Together with the Webhook intent,
   the lineage must contain exactly one `payment_confirmed` and exactly one
   `report_ready` intent. No email sending, broad commerce drain, or unrelated
   email pass is authorized.
10. Browser-inspect the authorized customer HTML at desktop and 390px mobile.

### Acceptance checks

- New report kind `combined_geo_report_v4`, methodology
  `two_stage_geo_report_v4`, version `4`.
- Admission snapshot exactly `completed`; Core and diagnosis jobs fully
  `completed`, never `completed_limited`.
- Exactly three substantive Chinese answers, each with at most five owned
  sources; no unavailable/refusal filler.
- Organization is 凌顺国际物流 and never 顺丰 / SF Express.
- Authorized HTML is HTTP 200 and visibly complete at desktop and mobile.
- Report, snapshot, question set, order, payment, credit, Core/diagnosis jobs,
  artifact, active pointer, token, and email intent form one unique lineage.
- Exactly one `payment_confirmed` and one `report_ready` email intent exist and
  remain unsent; exactly one Core dispatch outbox belongs to the paid lineage.
- Terminal jobs have no reserved credit; there is no active-artifact/order/job
  split and no queued/running/retry/repair residue for the lineage.
- Preview, image, Worker env/presence, runtime marker, and database marker match
  the full baseline SHA; production deployment and containers are unchanged.
- Staging DB audit and `git diff --check` pass; independent checker returns
  `CONFORMANT` for D1-D4.

### Forbidden actions

- No replay, recovery, repair, requeue, reopen, clone, delete, or mutation of
  any historical/failed/smoke report, job, snapshot, trial, order, or artifact.
- No second new Shun Express report, second checkout/payment, manual Webhook,
  manual entitlement/credit/job creation, operator replay, or exact Worker.
- No payment if admission is not exactly `completed` or identity is wrong.
- No production change, image/container mutation, Preview/deployment/alias/env
  mutation, schema/code/config/test change, broad Worker/commerce command,
  refund/email drain, cleanup, `run-report.bat`, merge, PR, tag, or push.

### Drift brakes

Stop immediately with `DEVIATION_REVIEW_REQUIRED` if any baseline identity
differs; any pre-existing claimable/recoverable job exists; a non-target job is
claimed; foundation/admission exceeds its deadline; admission is
`completed_limited`, `custom_service`, `unavailable`, failed, or wrong-identity;
payment/Webhook authority is not exact; Core/diagnosis is failed,
`completed_limited`, in any `repair_wait`, refunded, or outside its claim/
wall-clock boundary after bounded state-machine retries; commerce lineage
splits; production changes; or
completion requires another report, payment, replay, code change, or external
action. No second attempt is authorized.

### Approval lifecycle

This exact section remains `FROZEN` until the user explicitly approves it.
After approval, change only the top status to `APPROVED`, execute D1-D4
continuously with independent checker gates, then return to `FROZEN`.

## Frozen prior one-click restoration scope — completed authority

## Protected-Staging one-click report restoration

### Exact objective and baseline

Restore the protected-Staging user path in which a browser submission is
automatically claimed and produces a free report. The verified fault is the
absence of persistent Staging Worker consumers; this scope does not authorize a
free-report code rewrite.

- Branch: `codex/v4-answer-optimization-scope-reset`
- Git SHA: `bd403f77b30b01c6c5a8378d0fc05b63ee56ee71`
- Image: `open-geo-console:staging-bd403f77b30b01c6c5a8378d0fc05b63ee56ee71`
- Image ID: `sha256:e46c14a2b4b743d4ac3fa422ce74fcbd126c2f7552e1fa171fbcffb2dd4a30fb`
- Staging env raw SHA-256: `7e18b5f4ec4a33c37c962351cf6e52b21a1a890523bbb0a99e51bed7f473c4b6`
- Preview: `dpl_FHYqhkYMejCbZs5hgbbuU51c5Du5`
- Alias: `open-geo-console-staging-itheheda.vercel.app`
- Plan: `docs/superpowers/plans/2026-07-20-protected-staging-one-click-restoration.md`

The prior V4 acceptance scope remains terminal evidence. This current scope
does not reopen its shun-express report, V4 pre-admission job, payment authority,
or consumed external-action budgets.

### Allowed repository files and diff budgets

No production code, test, configuration, compose, schema, dependency, prompt,
or customer UI file may change.

1. `docs/ACTIVE-CHANGE-SCOPE.md`: current-scope section only, `+160/-5`.
2. `docs/superpowers/plans/2026-07-20-protected-staging-one-click-restoration.md`:
   new plan, at most 120 lines.
3. `docs/operations/evidence/2026-07-20-protected-staging-one-click-restoration.md`:
   new evidence record, at most 180 lines.
4. `docs/PROJECT-STATE.md`, `docs/TASKS.md`, `docs/DECISIONS.md`: only concise
   final runtime/result facts, each `+25/-10`.

Production/config/test diff budget: `+0/-0`.

### Allowed behavior and runtime actions

After approval and a conformant read-only preflight only:

1. Require zero pre-existing claimable PostgreSQL jobs for both `free` and
   `deep`, evaluated with the actual Worker claim predicate. Existing terminal
   and `repair_wait` rows remain immutable.
2. Create or recreate exactly one `staging-worker-free` and one
   `staging-worker-deep` Compose container with `--no-deps --no-build`, using
   only the accepted image and `.data/workstation-docker/staging.env`.
   The only mutation command is:

   ```powershell
   $env:OGC_APP_IMAGE='open-geo-console:staging-bd403f77b30b01c6c5a8378d0fc05b63ee56ee71'
   docker compose --profile workstation up -d --no-deps --no-build --force-recreate staging-worker-free staging-worker-deep
   ```
3. Leave both verified Staging services running with realtime PostgreSQL polling.
4. After container/image/env/marker/presence checks and an independent checker
   pass, submit exactly one protected-Staging smoke scan for
   `https://example.com/`, Chinese locale, `forceFresh=false`.
5. Permit only the crawl/model/database effects normally caused by that single
   free report and exactly one automatically created V4 pre-admission job. The
   deep Worker may process only that state-machine-created pre-admission job.
6. Permit existing state-machine-scheduled `retry_wait` transitions and retries
   for the two smoke jobs only, bounded by their persisted `max_attempts` and a
   ten-minute wall-clock limit per job. No manual retry/state mutation is allowed.
7. Capture authorized-browser HTTP and visible desktop/mobile evidence for the
   new free report. No customer screenshot file is required unless the evidence
   record can reference a browser observation without storing credentials.

### Verification and acceptance

- Git/worktree, complete image ID, OCI revision, container command/env, runtime
  deployment marker, database marker, Preview SHA, and fixed alias all match the
  full baseline SHA.
- Fresh database presence exists for both Staging tiers within two minutes.
- The sole smoke POST creates one new report and one free job and returns 202.
- The free job is claimed automatically within 30 seconds, without exact,
  FIFO-drain, batch, or operator commands, and reaches full `completed` within
  ten minutes with a technical payload.
- Authorized customer HTML returns HTTP 200 and shows completed content after
  hydration at desktop and mobile widths.
- Exactly one V4 pre-admission row is created for the smoke report, is claimed
  automatically within 30 seconds, and reaches execution state `completed`
  within ten minutes. Its immutable snapshot status may truthfully be
  `completed`, `completed_limited`, `custom_service`, or `unavailable`.
- At R4 closeout, neither smoke job may be claimable, running, or in
  `retry_wait`; the report must have zero checkout/order/payment/credit/Core/
  diagnosis/artifact/token/email/refund rows.
- `npm run db:audit`, `git diff --check`, runtime identity audit, Worker presence
  audit, and production before/after comparison pass.
- Independent checker returns `CONFORMANT` for R1, R2, R3, and R4.

### Forbidden systems and actions

- No new shun-express report, replay, recovery, repair, requeue, clone, deletion,
  payment, checkout, Core, diagnosis, token, email, refund, or historical-row
  mutation.
- No production process/container/deployment/database mutation.
- No image build, pull, tag, removal, container cleanup, Vercel deployment,
  alias move, environment-file write, database marker write, or schema change.
- No source/test/config/compose change and no `run-report.bat`.
- No ordinary Worker may start if any pre-existing claimable free or deep job is
  present. No job may be selected manually.
- No second smoke submission, even if the first fails or is reused.
- No push, merge, PR, tag, or production deployment.

### Drift brakes

Stop with `DEVIATION_REVIEW_REQUIRED` before mutation if any baseline identity
differs, the smoke target would be reused, or either tier has a pre-existing
claimable job. Stop after mutation without a retry if a wrong job is claimed, a
container uses a mismatched image/env/marker, the smoke free job reaches
`failed`/`repair_wait` or exceeds ten minutes, the deep job reaches
`failed`/`repair_wait` or exceeds ten minutes, either job remains nonterminal at
closeout, commerce rows appear, production changes, or another report/action
would be required. Ordinary implementation/test/tool failures may
be repaired only when they do not expand these exact actions or budgets.

### Approval and lifecycle

This section remains `FROZEN` until the user explicitly approves this exact
scope. After approval, change only the top status to `APPROVED`, execute R1-R4
continuously, and return to `FROZEN` at closeout. A user request such as “修复”
alone is not approval of this newly written allowlist.

## Frozen prior V4 scope — read-only historical authority

Approval authority: explicitly approved by the user on 2026-07-20 after reviewing this exact document. The allowlist, budgets, external-action limits, immutable authorities, acceptance gates, and deviation brakes below are now binding. On 2026-07-20, after independent reproduction of the Unit 6 JSONB double-serialization defect, the user also explicitly approved the exact Unit 6A expansion recorded below. After the full suite exposed the directly contradictory stale unit mock, the user explicitly approved adding that single test file under its locked budget and behavior. After the sole prebuilt Preview failed authenticated health with the independently confirmed Next 16 CJS/ESM packaging error, the user explicitly approved exactly one additional source-built Preview under the locked retry conditions below. After the first browser scan submission proved to be a non-mutating historical-reuse attempt with no new report or job, the user explicitly approved exactly one second submission with verified `forceFresh=true`. After that submission exposed the exact stale regeneration reservation before any report/job insert, the user explicitly approved deleting only that exact reservation row and exactly one third and final submission under the locked predicates below. After the exact reservation deletion completed without changing the historical report/job, the user explicitly approved Approach A: the bounded Unit 7A protected-Staging forced-regeneration capacity fix and replacement runtime sequence recorded below. That third and final browser submission has now been consumed exactly once after its prerequisite checker gates passed; a fourth submission is forbidden.

On 2026-07-20, the user explicitly ratified the exact Unit 7A marker CRLF mechanical repair recorded below as an in-scope tool repair and confirmed that the existing runtime, Preview, and fixed-alias evidence remains valid. This retrospective approval is non-expansive and does not reopen any consumed external action.

On 2026-07-20, after the two independently proven zero-side-effect local exact-preview startup failures, the user explicitly approved the frozen Unit 8A exact Docker runtime boundary below. This approval authorizes only the single ephemeral invocation, accepted image, merged Staging env source, exact entrypoint, and exact tuple recorded there; it authorizes no fallback or additional retry.

On 2026-07-20, after independent proof that persisted/type/schema/exact-claim authority requires the V4 pre-admission job to use `tier=deep`, the user explicitly approved the frozen Unit 8B correction below. This approval changes only the impossible plan word `free` to the authoritative `deep` tuple and authorizes only the single exact Docker invocation recorded there.

## Objective and sole baseline

Selectively consolidate the approved V4 baseline and produce exactly one complete protected-Staging deep report for `https://shun-express.com/`, following only:

- Design: `docs/superpowers/specs/2026-07-19-v4-baseline-consolidation-complete-report-design.md`
- Planning/design commit: `5bc53de7866650b0d311d857aa3f3452c5812f5f`
- Code integration base: `fee9c822aedc3b4cde5c2ebe5cffffb239950fff`
- Branch: `codex/v4-answer-optimization-scope-reset`
- Plan: `docs/superpowers/plans/2026-07-19-v4-baseline-consolidation-complete-report.md`

The integrated runtime may carry only:

1. the approved V4 commercial-answer prompt and exact V4/free one-shot Workers already present at `fee9c82`;
2. optional `rewriteExample` language fallback from `4b8a450`;
3. unique analyzable-body-hash V4 admission from `17016df`;
4. atomic ready-Core publication/commercial terminalization and canonical V4 error persistence from selected `9d30ce9` hunks;
5. exact ready-Core re-entry from `e3c6841`;
6. reproducible protected-Staging V4 model/token/runtime readiness from `cecfeba` and the selected atomic-Core readiness hunks;
7. the explicitly approved Unit 7A protected-Staging forced-regeneration capacity correction, limited to the exact predicate, paths, and budget below.

Full cherry-pick is not authority. Every hunk must map to one item above and stay within the exact file and behavior allowlists below.

## Immutable and locked identities

- Historical contaminated report `8446d645-8db1-45ce-8f4a-8016f7ed1b8f` and free job `58f10a1b-25af-4e7c-b7fa-7dee1b4947a4` are read-only evidence. They may not be resumed, reopened, replayed, cloned, deleted, repaired, requeued, terminalized, or used as the new report.
- New target website: `https://shun-express.com/`.
- Required identity: `深圳市凌顺国际物流有限公司` / `凌顺国际物流`; `凌顺速运` may appear only as supported brand wording. `顺丰`, `顺丰速运`, and `SF Express` are prohibited target identities.
- Price/action: exactly one CNY 199 Airwallex Sandbox payment, authorized only for the one new report.
- Production is read-only and must remain byte/identity-equivalent at every observable deployment/container boundary.

Locked questions, with no rewrite or paraphrase:

1. 凌顺国际物流公开提供哪些具体的跨境运输、集运、仓储、清关支持和末端派送服务，分别覆盖哪些国家、地区和路线？
2. 对寄往台湾、菲律宾、阿联酋、沙特等路线的不同货物场景，应该选择哪些服务方案，各自有哪些时效、交付条件和限制？
3. 买家下单前应核实哪些事项，包括服务范围、报价与计费假设、禁限运要求、清关责任、末端派送条件以及主要风险？

## Exact code and test allowlist

No code, configuration, script, or test path outside this list may change.

### Unit 2 — optional rewrite fallback

1. `packages/ai-report-engine/src/analysis.ts`
2. `packages/ai-report-engine/src/index.test.ts`

Allowed behavior: clone the page analysis and omit only optional `rewriteExample` values whose bounded correction still violates the report language contract. Any required field or mixed violation remains fail-closed.

Budget: production `+45/-15`; tests `+40/-5`.

### Unit 3 — unique-body V4 admission

1. `apps/web/src/worker/report-v4-admission-production.ts`
2. `apps/web/src/worker/report-v4-admission-runtime.ts`
3. `apps/web/src/worker/report-v4-admission-runtime.test.ts`

Allowed behavior: count distinct exact cleaned analyzable-body SHA-256 values toward the 51-page boundary; persist duplicates as exclusions with provenance. URL/site/admission/snapshot meaning otherwise remains unchanged.

Budget: production `+35/-10`; tests `+40/-5`.

### Unit 4 — atomic Core publication and canonical errors

1. `apps/web/src/db/public-source-commerce.postgres.test.ts`
2. `apps/web/src/db/public-source-commerce.test.ts`
3. `apps/web/src/db/public-source-commerce.ts`
4. `apps/web/src/db/report-v4-artifact-revisions.test.ts`
5. `apps/web/src/db/report-v4-artifact-revisions.ts`
6. `apps/web/src/scripts/report-v4-staging-preflight.test.ts`
7. `apps/web/src/worker/processor.test.ts`
8. `apps/web/src/worker/processor.ts`
9. `apps/web/src/worker/report-v4-core-acceptance.test.ts`
10. `apps/web/src/worker/report-v4-core-acceptance.ts`
11. `apps/web/src/worker/report-v4-core-production.postgres.test.ts`
12. `apps/web/src/worker/report-v4-core-production.test.ts`
13. `apps/web/src/worker/report-v4-core-production.ts`
14. `apps/web/src/worker/report-v4-orchestrator.test.ts`
15. `apps/web/src/worker/report-v4-orchestrator.ts`
16. `apps/web/src/worker/report-v4-startup-readiness.test.ts`
17. `apps/web/src/worker/report-v4-startup-readiness.ts`
18. `scripts/start-report-v4-staging-workers.ps1`
19. `scripts/start-workstation-workers.ps1`

Allowed behavior:

- persist Core artifact as `ready`, then atomically activate artifact, publish report pointer, terminalize job/order/credit/refund/access/email, and append transition evidence in one transaction;
- exact idempotent re-entry for the same lineage and legitimate active diagnosis descendant only;
- normalize and persist a V4 runner error through the existing job state machine before the exact one-shot exits;
- add focused rollback, lineage, error, readiness, and compatibility tests.

Explicitly forbidden even inside these files: `recoverFailedPaidReportV4CoreForTerminalReplay`, any replay/reopen/requeue/recovery of a failed or terminal Core, demoting an active artifact, clearing an active report pointer for replay, deleting truthful refund/email state for replay, restoring spent credit for replay, operator-replay exports/fixtures/transitions, and all related hunks from `9d30ce9` or `6e0d3a8`.

Budget: production/config `+160/-70`; tests `+180/-70`. Exceeding either budget requires reapproval even if paths remain allowlisted.

### Unit 5 — exact ready-Core and Staging runtime readiness

1. `apps/web/src/db/report-v4-production-jobs.ts`
2. `apps/web/src/db/report-v4-production-jobs.test.ts`
3. `apps/web/src/scripts/report-v4-staging-preflight.test.ts` (already listed)
4. `scripts/start-workstation-workers.ps1` (already listed)

Allowed behavior: admit only exact pending/ready Core lineage; materialize required V4 profile and dedicated MiMo bindings inside Staging only; require the token-hash secret before presence/claim. No production fallback or production startup change.

Budget: ready-Core production `+10/-10`, tests `+30/-5`; runtime script `+30/-10`, preflight tests `+15/-5`.

### Unit 6 — conditional five-failure test repair

1. `apps/web/src/db/report-v4-acceptance-authority-phase-snapshot.postgres.test.ts`

This file may change only if the same five `report_v4_acceptance_events_details_check` failures reproduce and the defect is a stale test fixture for the already-selected V4 acceptance contract. Budget `+40/-40`. No production code, schema, migration, historical row, registry weakening, or acceptance weakening is authorized. If the fix requires another path, stop.

### Unit 6A — approved acceptance-ledger JSONB serialization correction

1. `apps/web/src/db/report-v4-acceptance-ledger.ts`
2. `apps/web/src/db/report-v4-acceptance-ledger.postgres.test.ts`
3. `apps/web/src/db/report-v4-acceptance-ledger.test.ts`

Allowed behavior: pass the already-validated `input.details` object directly to the postgres-js `$param::jsonb` boundary so the driver serializes it exactly once; add PostgreSQL regression coverage proving canonical `fault_injection` and `checkpoint_terminal` details persist as JSONB objects and satisfy the existing database constraint; update only the directly contradictory unit mock so `tx.json` is called exactly once with the validated object, the mock extracts the typed parameter `.value`, the JSONB parameter type remains OID `3802`, and all existing inserted, idempotency, hashing, and unrelated assertions remain unchanged.

Explicitly forbidden: no database schema, migration, constraint, ledger union/parser, canonical hashing, guard authority, event occurrence, acceptance meaning, historical row, or compatibility behavior change. Do not weaken or bypass `report_v4_acceptance_events_details_check`.

Budget: production `+5/-5`; PostgreSQL tests `+50/-10`; unit test `+10/-10`.

### Unit 7A — protected-Staging forced-regeneration capacity correction

1. `apps/web/src/db/scan-admission.ts`
2. `apps/web/src/db/staging-security.postgres.test.ts`

Allowed behavior: only when both protected Staging and `forceFresh=true` are already established, exclude from the free-regeneration capacity count a job whose `execution_state='repair_wait'` and whose `lease_owner`, `lease_expires_at`, `retry_not_before`, and `repair_deadline_at` are all `NULL`. All other active, leased, scheduled, non-`forceFresh`, and non-Staging admission semantics remain unchanged.

Explicitly forbidden: do not update, delete, requeue, reopen, repair, replay, or otherwise mutate any job row or state-machine field. Do not change ordinary free limits, production admission, reservation identity, trial authority, job claiming, or recovery behavior.

Budget: production `+15/-5`; focused PostgreSQL test `+60/-10`.

## Documentation, registry, and evidence allowlist

Only these non-code paths may change:

1. `docs/ACTIVE-CHANGE-SCOPE.md`
2. `docs/superpowers/plans/2026-07-19-v4-baseline-consolidation-complete-report.md`
3. `docs/PROJECT-STATE.md`
4. `docs/TASKS.md`
5. `docs/DECISIONS.md`
6. `docs/operations/evidence/2026-07-19-shun-express-v4-deep-report.md`
7. `docs/operations/evidence/report-v4-protected-staging-acceptance.json` (new machine projection of the same accepted run)
8. `docs/operations/evidence/2026-07-19-shun-express-v4-desktop.png` (new)
9. `docs/operations/evidence/2026-07-19-shun-express-v4-mobile.png` (new)
10. `config/report-contracts/combined-geo-report-v4.requirements.json`
11. `docs/REPORT-V4-COVERAGE-MATRIX.md`

Registry changes are limited to changing each of the 20 existing `status` values from `implemented` to `verified` after its exact automated and protected-Staging evidence passes. Contract, spec path, matrix path, IDs, titles, implementation paths, test paths, commands, runtime evidence paths, acceptance logic, and product meaning may not change. The matrix may change only as deterministic output from that status promotion.

The narrative evidence file is the sole human authority for this shun-express run. The JSON is its machine-verifiable projection required by the existing gate, and the PNGs are referenced visual evidence; they do not create additional business runs. No secret, cookie, password, raw provider token, raw report access token, or unhashed client IP may be written.

## Runtime file mutation allowlist

The original integrated runtime binding changed only `OGC_DEPLOYMENT_VERSION` to `683954c094a5d354c25ef909b396577d05fa6837`. The Unit 7A logical marker rebind is now complete at `OGC_DEPLOYMENT_VERSION=bd403f77b30b01c6c5a8378d0fc05b63ee56ee71`; no further marker write is authorized.

### Retrospectively approved Unit 7A CRLF tool repair

- Final `.data/workstation-docker/staging.env` facts are raw SHA-256 `7e18b5f4ec4a33c37c962351cf6e52b21a1a890523bbb0a99e51bed7f473c4b6`, marker-normalized SHA-256 `98806e5988cb1c77aaa2ba84512dec555899de3b143743c4469402d76359ce78`, reconstructed-old SHA-256 `3f6f0f1e38ba3f63899af97c9d168e6b185623253bc75cc35619e45110b583ef`, `4638` bytes, `66` keys, `66` LF bytes, and `66` CRLF pairs.
- The new full SHA occurs exactly once at byte offset `955`. Replacing only those 40 SHA bytes with `683954c094a5d354c25ef909b396577d05fa6837` reconstructs the exact pre-rebind hash, proving the final file differs from the approved baseline only in that 40-byte SHA value.
- Two patch attempts did not restore the missing CRLF byte. A final mechanical repair was allowed only after strict pre-repair-hash, byte-offset, and desired-hash assertions, and inserted exactly one `0x0D` immediately before the existing `0x0A` at the marker line ending. The user explicitly ratified those tool-level attempts and the guarded single-byte repair as one logical marker rebind.
- The accepted runtime is Git SHA `bd403f77b30b01c6c5a8378d0fc05b63ee56ee71`, Docker image `sha256:e46c14a2b4b743d4ac3fa422ce74fcbd126c2f7552e1fa171fbcffb2dd4a30fb`, Preview `dpl_FHYqhkYMejCbZs5hgbbuU51c5Du5`, and fixed alias `open-geo-console-staging-itheheda.vercel.app`; the user confirmed the existing runtime, Preview, direct-health, and alias evidence remains valid.
- Remaining authorized Unit 7A marker writes, Preview creations, and alias moves are each `0`. This exception authorizes no additional marker write, Preview, alias move, image action, report/payment action, or alternative mechanical write route; the separately locked R3 cleanup authority below is unchanged.

## Forbidden subsystems and changes

- Commits/behaviors: no `6e0d3a8` operator replay; no `d1b12e6` or `7911c80` limited/refunded-Core diagnosis enhancement; no wholesale `d9ee6a9`; no excluded hunk hidden inside an allowed file.
- No database schema/migration/DDL, provider adapter, price/currency, question wording, customer HTML layout, report contract/methodology/version, V1–V3 behavior, PDF surface, crawler policy outside unique-body dedup, payment Webhook authority, token format, rate limit, email/refund policy, production config, or dependency change.
- No `run-report.bat`; no ordinary FIFO, drain, batch, realtime/persistent Worker for the target; no broad `start-workstation-workers.ps1` or `start-report-v4-staging-workers.ps1` execution.
- No historical report/job/order/payment/credit/refund/artifact/token/email mutation; no compatibility, migration, replay, replacement, correction, presentation refresh, recovery, or operator repair.
- No user-owned `assets/`, Qoder files, `run-report.bat`, the V3 plan, unrelated worktree, unrelated Docker image/container, or unrelated dirty file may be touched, staged, cleaned, reset, stashed, moved, or deleted.
- No production deploy, alias movement, image/container/service action, Worker stop/start, database write, report scan, model call, payment, refund, or email execution.

## Exact verification commands

Focused verification includes the directly changed test files plus:

```powershell
npm test -- packages/ai-report-engine/src/index.test.ts
npm test -- apps/web/src/worker/report-v4-admission-runtime.test.ts apps/web/src/worker/report-v4-admission-production.test.ts apps/web/src/worker/report-v4-site-collector.test.ts
npm test -- apps/web/src/db/public-source-commerce.test.ts apps/web/src/db/public-source-commerce.postgres.test.ts apps/web/src/db/report-v4-artifact-revisions.test.ts apps/web/src/db/report-v4-production-jobs.test.ts apps/web/src/worker/processor.test.ts apps/web/src/worker/report-v4-core-acceptance.test.ts apps/web/src/worker/report-v4-core-production.test.ts apps/web/src/worker/report-v4-core-production.postgres.test.ts apps/web/src/worker/report-v4-orchestrator.test.ts apps/web/src/worker/report-v4-startup-readiness.test.ts apps/web/src/scripts/report-v4-staging-preflight.test.ts
npm test -- apps/web/src/worker/exact-job.test.ts apps/web/src/worker/exact-preview-job.test.ts apps/web/src/db/jobs-targeted-claim.postgres.test.ts
npm test -- apps/web/src/db/report-v4-acceptance-ledger.postgres.test.ts
npm test -- apps/web/src/db/report-v4-acceptance-authority-phase-snapshot.postgres.test.ts
npm test -- apps/web/src/db/staging-security.postgres.test.ts
npm run report:v4:traceability
npm run report:v4:matrix
npm run report:v4:acceptance
npm run lint
npm run build
npm test
npx tsx --tsconfig apps/web/tsconfig.json --env-file=.data/workstation-docker/staging.env apps/web/src/scripts/db-audit.ts
git diff --check
codegraph sync
codegraph status
```

Post-live verification also requires:

```powershell
npm run report:v4:staging:verify --workspace apps/web
npm run report:v4:traceability
npm run report:v4:acceptance
npx tsx --tsconfig apps/web/tsconfig.json --env-file=.data/workstation-docker/staging.env apps/web/src/scripts/db-audit.ts
```

PostgreSQL suites use a disposable loopback-only PostgreSQL 17 database or the explicitly sanctioned test admin URL. Staging/production business databases are never substituted for destructive tests.

## Exact expensive and external actions

The following actions are authorized only after this scope becomes `APPROVED`, in the listed order, and only after the preceding deterministic/checker gate is conformant.

### 1. Worker containment

- Revalidate current Windows process PID `19532`, start `2026-07-19 14:18:48 +08:00`, exact command suffix `--env-file=../../.data/workstation-docker/staging.env --import tsx src/scripts/staging-worker.ts free`, active staging marker `4b8a450…`, recent matching database presence, and child PID `25160` before stopping that exact process tree.
- If the PID changed, at most one replacement process tree may be stopped only when all the same executable, cwd/project, command, env-file, tier, staging marker, start-time capture, and recent-presence predicates match. A PID alone is insufficient.
- No production, Codex, CodeGraph, Docker Desktop, WSL, unrelated Node, deep Worker, or nonmatching process may be stopped.

### 2. Original integrated runtime and approved Unit 7A replacement runtime

- Build exactly one new image tag `open-geo-console:staging-<full-integrated-runtime-sha>` from a clean exact-SHA source, with OCI revision label equal to the full SHA. Build retries are allowed only before any tag/image is successfully created and must not create another accepted image identity.
- Use only Vercel project `prj_WVpdlJfsEp0YyWM2W54w8oBy985S` (`open-geo-console`), WSL's existing credential store, and pinned `vercel@55.0.0`. Do not print/extract/copy credentials.
- The first and only prebuilt Preview is immutable failed evidence: `dpl_Gv1si4s2aXeCbyQkCJrSFeXmWxXT`. It returned HTTP 500 because the prebuilt launcher required an ESM Next 16 middleware artifact.
- The originally approved source-built Preview is immutable healthy evidence: `dpl_92syRCQfR2XJfLmzjEJU2sQgVZPC`, sourced from `683954c094a5d354c25ef909b396577d05fa6837`. Its one authorized alias move already completed.
- After Unit 7A tests and independent review pass, create exactly one new commit containing only the Unit 7A production/test diff. Build exactly one replacement image tag `open-geo-console:staging-<full-Unit-7A-SHA>` with matching OCI revision; no second replacement image is authorized.
- After the replacement image passes inspection, rebind only `OGC_DEPLOYMENT_VERSION` in `.data/workstation-docker/staging.env` once to the full Unit 7A SHA and verify all other bytes are unchanged.
- Create exactly one new source-built Preview, without `--prebuilt`, from the clean exact Unit 7A SHA using the same project and pinned CLI. Total created Preview count may become three; a fourth deployment is forbidden.
- Preserve both earlier Previews; do not delete, replace, promote, or roll them back. No `--prod`, other project, or production alias action is allowed.
- If the Unit 7A Preview fails creation, exact source-SHA inspection, authenticated `/zh -> /` navigation, authenticated `/` health, middleware checks, or full image/runtime/database-marker equality, stop without another deployment.
- Move only `open-geo-console-staging-itheheda.vercel.app` exactly once more, and only after the direct Unit 7A Preview is Ready and all authenticated runtime checks pass.

### 3. Exact cleanup after replacement verification

After fresh full-ID/reference checks and only after the new image is verified, remove exactly:

- exited container `a3ff80cfa1daf2bc01cd956ba7fbc7baae6a1e45171a1931da26e92e643b232c` (`open-geo-console-staging-worker-deep-1`);
- exited container `a9d112717f0f615774fc3286d54706ea8aa42d6f715c60b30946361f95b7ee0b` (`open-geo-console-staging-worker-free-1`);
- then, if unreferenced, image `sha256:0f4752442cfdb5a53eef22a0bf3b66a8e30945f526dd064445d246df352e91a5` (`staging-4b8a450d7a4163452982388d48ded7938bf699e1`);
- and, if still unreferenced, image `sha256:a223662ed15c392a5a07b13b8ea85adb77482fb5845011c8a210bf832b840ea4` (`staging-fee9c82`).

No other current or dangling image/container may be removed. In particular preserve every `staging-27b25d5…`, `staging-b5ea394…`, `staging-43357d…`, `staging-a13a023…`, `staging-4e30fdb…`, `staging-aee3690`, `prod-v25-11befe9`, `replacement`, and `local` image unless a future separately approved scope names it.

The cleanup above and R3 are complete. R3 removed only old integrated image `sha256:5645ab7a4784dc0e908abda0d73a2660569a05a33f001bf3bc0a9ba5c516362c` after fresh full-ID/container-reference inspection proved it unreferenced; no other image or container changed. No further runtime cleanup is authorized, and R3 does not reopen any consumed marker, Preview, alias, or replacement-image action.

The third and final protected-Staging browser submission was consumed exactly once after R3 and the independent Unit 7A checker were conformant. It returned HTTP 202 for exact `https://shun-express.com/` with `forceFresh=true` and created only report `f0133f5b-2eba-4d7f-b05a-a1786b2ea907`, free job `67a5913f-bdf2-4f75-92fe-888887aeffcb`, and regeneration reservation `dccd164a-03ad-4f8a-9d66-028afe1eeb55`. A fourth submission is forbidden.

### Approved Unit 8A exact-runtime boundary

- The first local exact-preview command attempt exited before importing the Worker entrypoint because the executor process could not spawn esbuild (`EPERM`). Independent read-only evidence proved zero claim, crawl, model, database, report, job, regeneration, historical-authority, or Worker-presence effect.
- The one checker-authorized mechanical retry imported the exact entrypoint but failed in `prepareWorkerStartup` before claim because `OGC_REPORT_V4_MODEL_PROFILE_ID` is absent from both local sources read by the npm command: `apps/web/.env.staging.local` and `.vercel/.env.preview.local`. A second independent read-only snapshot again proved the target job stayed `queued/admission` with zero attempts/transitions/errors, the report stayed pending without payload/artifact, pre-admission stayed zero, Worker presence stayed zero, and all historical hashes and timestamps stayed unchanged.
- The accepted merged runtime file `.data/workstation-docker/staging.env` contains exactly one non-empty locked model-profile key and is the `format: raw` env source used by the protected-Staging Docker services. The accepted replacement image remains `open-geo-console:staging-bd403f77b30b01c6c5a8378d0fc05b63ee56ee71`, image ID `sha256:e46c14a2b4b743d4ac3fa422ce74fcbd126c2f7552e1fa171fbcffb2dd4a30fb`, with OCI revision `bd403f77b30b01c6c5a8378d0fc05b63ee56ee71`.
- Approved authority: after fresh read-only image-revision, marker, database, exact-tuple, zero-presence, and zero-side-effect checks pass, allow exactly one ephemeral Docker invocation with `--rm`, working directory `/app/apps/web`, only the accepted replacement image, and only the existing `format: raw` merged Staging env file. Override the persistent image command with the exact one-shot entrypoint `node --import tsx src/scripts/staging-exact-preview-worker.ts 67a5913f-bdf2-4f75-92fe-888887aeffcb f0133f5b-2eba-4d7f-b05a-a1786b2ea907`.
- This approval permits zero file/env/image/marker/Preview/alias/database mutations, zero local-Node fallback, zero ordinary/FIFO/drain/persistent Worker, zero other job selection, and zero further launch retry. Any container startup failure, revision/env/database mismatch, non-target claim, target terminal failure, `completed_limited`, or unapproved `repair_wait` stops permanently. Once claimed, only a retry explicitly persisted by the target state machine may re-invoke the same tuple under a separately verified exact boundary.
- Approved diff budget: `+0/-0` production/test code; documentation may record this approval status, exact non-secret command/result, and checker evidence only. Approved expensive-action budget: one exact legacy-free target invocation; the two zero-side-effect startup failures do not authorize any additional report, payment, deployment, image, marker, alias, cleanup, or historical action.
- [x] The sole approved Docker invocation ran from `2026-07-20T08:00:01.5562871Z` through `2026-07-20T08:02:51.3184318Z`, exited `0`, and printed only `Exact preview free scan job 67a5913f-bdf2-4f75-92fe-888887aeffcb completed.` The free job completed without credit/error/retry/repair, the report completed at score `76`, the foundation identified `深圳市凌顺国际物流有限公司` / `凌顺国际物流` without SF identity, the trial pointer moved, regeneration cleared, and exactly one pre-admission job was created. The ephemeral container was removed; all other 59 containers retained normalized snapshot hash `80c5674fe9dfa47e25a3a0d59606bd6406d9e1b996e92c2bf90cdd2d5e338e19`; historical authority remained unchanged. Independent checker result: `CONFORMANT`.

### Approved Unit 8B pre-admission tier correction

- Before execution, pre-admission job `6139c15e-f395-4a76-8ca0-d355357636d5` belonged only to report `f0133f5b-2eba-4d7f-b05a-a1786b2ea907` and was `deep / recommendation_forensics_v1 / two_stage_geo_report_v4 / version 4 / combined_geo_report_v4 / v4_pre_admission / queued / admission`, with no credit, attempt, lease, retry, repair, or error. It is now terminal `completed` after the sole invocation recorded below, still with no credit, error, retry, or repair.
- Current TypeScript identity `ReportV4PreAdmissionJobIdentity`, PostgreSQL `scan_jobs_v4_pre_admission_check`, recommendation-forensics lane guard, and exact-job candidate/claim boundary all require tier `deep`. The locked plan/scope word `free` is factually impossible and would fail before claim; no free probe is authorized.
- Approved authority: correct only the Unit 8 pre-admission tuple tier from `free` to `deep`, then after fresh exact-SHA/image/env/database/tuple/zero-presence checks allow exactly one ephemeral `--rm --init` Docker invocation from accepted image `open-geo-console:staging-bd403f77b30b01c6c5a8378d0fc05b63ee56ee71`, with only `.data/workstation-docker/staging.env`, working directory `/app/apps/web`, and exact command `node --import tsx src/scripts/staging-exact-worker.ts 6139c15e-f395-4a76-8ca0-d355357636d5 f0133f5b-2eba-4d7f-b05a-a1786b2ea907 deep`.
- Approved budget: `+0/-0` production/test code; documentation may correct the one tier fact and record evidence. One exact V4 pre-admission invocation only; zero local fallback, free probe, other tuple, ordinary/persistent Worker, or extra startup retry. Any startup/revision/env/database mismatch, non-target claim, terminal failure, `completed_limited`, or unapproved `repair_wait` stops permanently. This approval changes no report contract, methodology, schema, provider, price, questions, customer layout, image, deployment, marker, alias, or production authority.
- [x] The sole Unit 8B invocation ran from `2026-07-20T08:26:36.1183523Z` through `2026-07-20T08:27:39.4322441Z`, exited `0`, and printed only `Exact deep scan job 6139c15e-f395-4a76-8ca0-d355357636d5 completed.` The ephemeral container was removed and the other 59 containers retained normalized snapshot hash `80c5674fe9dfa47e25a3a0d59606bd6406d9e1b996e92c2bf90cdd2d5e338e19`.
- Terminal evidence: the immutable snapshot is `unavailable`, with one homepage candidate, zero analyzable pages, and one `deadline_exceeded` exclusion with no content hash. The job is `completed` and the state machine persisted no retry, repair, or successor job. Checkout is blocked by the unavailable snapshot. Question rows remain zero because checkout GET normally creates them lazily; no payment, order, credit, artifact, token, email, Core, or diagnosis authority exists.
- Independent checker result: `DEVIATION_REVIEW_REQUIRED`. Continuing would require manual replay, a second report, or product/state-machine change. All are forbidden by this scope. The task is frozen permanently at this evidence boundary; no further report, scan, Worker, payment, commerce, deployment, cleanup, push, or production action is authorized.

### 4. Exactly one new report and its exact one-shots

- Preserve the first browser submission as immutable non-mutating evidence: it returned historical report `8446d645-8db1-45ce-8f4a-8016f7ed1b8f`, created zero reports/jobs, and changed no historical row.
- Preserve the second submission as immutable non-mutating evidence: verified `forceFresh=true`, returned HTTP 202 `active_regeneration`, created zero reports/jobs, and changed no historical row.
- The exact reservation deletion completed once: reservation `b629b4d5-9996-45bb-897a-a9349f683f86` matched report `8446d645-8db1-45ce-8f4a-8016f7ed1b8f` and job `58f10a1b-25af-4e7c-b7fa-7dee1b4947a4`; exactly one row was returned, and the historical report/job hashes and timestamps remained unchanged. No further reservation deletion or broad cleanup is authorized.
- [x] Browser-submitted the third and final protected-Staging scan for `https://shun-express.com/` only after the Unit 7A commit/image/marker/Preview/alias chain and independent checker were conformant. The force checkbox was visibly checked; the captured non-secret request fields were exact URL, locale `zh`, and `forceFresh=true`; the protected Preview returned HTTP 202.
- [x] The third submission created exactly one new report `f0133f5b-2eba-4d7f-b05a-a1786b2ea907`, one new free job `67a5913f-bdf2-4f75-92fe-888887aeffcb`, and one regeneration reservation `dccd164a-03ad-4f8a-9d66-028afe1eeb55`. Independent read-only PostgreSQL review confirmed reports `26 -> 27`, joined jobs `65 -> 66`, old/effective capacity `2 -> 3` / `0 -> 1`, zero recent Worker presence, and unchanged historical report/job hashes. Any fourth submission remains a permanent stop condition.
- Invoke the exact legacy-free one-shot only for `(new freeJobId, new reportId)`.
- [x] Invoked the exact V4 pre-admission one-shot once for `(6139c15e-f395-4a76-8ca0-d355357636d5, f0133f5b-2eba-4d7f-b05a-a1786b2ea907, deep)`; do not invoke it again and never run the impossible `free` tuple.
- Do not run any ordinary/persistent Worker. A state-machine-scheduled retry may re-invoke the same exact tuple only when its persisted transition authorizes it; no manual state change or replay.

### 5. Exactly one payment, Core, and diagnosis

- Create and complete one CNY 199 Airwallex Sandbox checkout for the new report. Only a verified signed Webhook may create paid entitlement/credit/Core authority.
- Invoke the exact Core one-shot only for the new deep job tuple.
- Invoke the exact diagnosis-enhancement one-shot only for the one enhancement job created by the successful full Core.
- Do not submit a second checkout/payment, fabricate Webhook state, manually replay, use limited-Core diagnosis compatibility, or drain historical commerce/email/refund queues.
- Commerce processing is permitted only if an existing exact-target operation can prove it will select only the new order/report's truthful queued item. Otherwise acceptance stops at the persisted email/refund intent and does not run broad commerce.

### 6. Browser evidence and final push

- Use the existing authenticated browser selected for the target URL. Inspect HTTP and visible desktop/mobile content and capture only the two allowlisted screenshots. Do not inspect cookies, local/session storage, profiles, passwords, or raw tokens.
- Allow one successful push to `origin/codex/v4-answer-optimization-scope-reset` after final independent acceptance. A failed push may be retried only when remote-ref inspection proves no update occurred. Do not push another branch, merge, open a PR, tag, or deploy production.

## Live acceptance gates

All must pass for the same new report identity:

- `kind=combined_geo_report_v4`, `methodology=two_stage_geo_report_v4`, version `4`;
- full Core `completed` and diagnosis `completed`, never `completed_limited`;
- exactly three substantive Chinese answers, each with at most five owned sources;
- organization is `凌顺国际物流`, never `顺丰` / `顺丰速运` / `SF Express`;
- no unavailable/refusal filler;
- authorized customer HTML returns HTTP 200 and passes 1440px desktop and 390px mobile visible inspection;
- report, immutable snapshot, order, provider payment, credit, Core/diagnosis jobs, artifact lineage, report pointer, access token, and email intent form one unique consistent identity chain;
- terminal jobs have no reserved credit and no active artifact is split from failed/running order/job state;
- Preview deployment, image label, runtime env deployment marker, database deployment marker, and acceptance evidence bind to the full integrated runtime SHA;
- the five PostgreSQL failures are green or proven absent without out-of-scope repair; focused tests, lint, build, full tests, traceability, Staging verifier, final acceptance, DB audit, diff check, and CodeGraph checks pass;
- production deployment remains `dpl_3cx4ntaHcXquqJgRyj9E3tBX96BW`; production deep container remains `13ccba729da8b36a82193ae46d706ff7f0a49afaedfacba69f1aae36e9e79d67` and production free container remains `e137f4e57d0d2490f6263c2a92a816f6154ab2347cf6acaaa08aa6a11af70cee`, both on image `sha256:ed17c0fe9e159834df2dc72a5f8a5d70314e2dcb3f6fd5b2b4a4f3174229e234`; production commerce container remains `be94b86e9febd2621793d800f528ceb5253f8e3aa144dbb38e8abc5456e54663` on image `sha256:028901e0e5e3f9287524573d62f10cdccc22fb9109bd21875a35e5c0709e1d3a`; and no production authority changed.

## Drift brakes

Return `DEVIATION_REVIEW_REQUIRED` and stop immediately if:

- any next action needs an unlisted path, behavior, commit hunk, schema, adapter, product meaning, question, price, layout, deployment target, cleanup target, or extra external side effect;
- any allowlisted file introduces an excluded replay/recovery/limited-Core behavior;
- two revisions fail to reduce the same acceptance failures and a new route is proposed;
- any ordinary/persistent or non-target Worker claims a job, or any runtime reports a mismatched revision;
- the new report enters terminal failed, `completed_limited`, or unapproved `repair_wait`;
- completing the work would require a second report, second payment, a fourth created Preview or any Preview beyond the explicitly approved Unit 7A source-built replacement, a second replacement image, manual replay, historical mutation, production mutation, or weakening an acceptance gate;
- exact cleanup identity/reference checks differ from this document;
- production identity differs from the read-only starting snapshot.

## Unit unlock and commit rule

Before every unit, the supervisor states its mapped scope clause, expected artifact, verification, and non-goal. After every unit, an independent checker rereads the design and this scope, then returns only `CONFORMANT`, `REVISE_WITHIN_PLAN`, or `DEVIATION_REVIEW_REQUIRED`.

Before every commit: run `git status --short --branch`, `git diff --check`, exact path/numstat budget audit, excluded-symbol/behavior search, and user-dirty-file audit. Only agent-owned allowlisted paths may be staged. Runtime code/test commits precede deployment; a final docs/evidence-only commit may follow live acceptance. At terminal closeout this scope returns to `FROZEN`.
