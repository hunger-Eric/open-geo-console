# Active Change Scope Lock

## Phase 3R3 LOCAL IMPLEMENTATION COMPLETE - repair deferred Q1 diagnosis structural correction

Status: `LOCAL_IMPLEMENTATION_COMPLETE`. On 2026-07-24 the user explicitly
approved this exact Phase 3R3 FROZEN allowlist with
`批准 Phase 3R3 FROZEN 范围并开始执行`. The bounded repair is complete:

- focused enhancer and Free-teaser tests: 22 passed;
- full suite in serial file mode: 2813 passed, 188 skipped;
- the affected PostgreSQL file independently passed 5/5 after two parallel
  full-suite runs exposed unrelated shared-database fixture races;
- `npm run lint`, `npm run build`, and `git diff --check`: passed;
- only the three allowlisted files changed and all diff budgets passed; and
- no deployment, model call, report mutation, payment, push, or remote action
  occurred.

### Read-only root-cause evidence

- Branch: `codex/v4-answer-optimization-scope-reset`.
- Exact clean baseline:
  `453f7bc2aa9345117953677f1740923dd8ff9534`
  (`docs: record Phase 3R2 staging stop`).
- Phase 3R2 report
  `d31a0f70-5500-4d9b-89aa-c484e93495da` and job
  `9ae1cc50-95c4-436c-a4a3-7cafac5cc9f7` remain immutable read-only
  evidence. They may not be retried, resumed, repaired, cloned, checked out,
  or used as a new acceptance authority.
- The repaired shared-snapshot path completed. The marker-bearing checkpoint
  persisted `q1AnswerDraft=true`, `q1DiagnosisDraft=false`, and
  `semanticReview=false`, then recorded four identical
  `Free teaser Q1 diagnosis did not complete.` failures at
  `grounded_answer_synthesis`.
- `generateFreeTeaser` invokes `enhanceReportV4QuestionDiagnosis` with
  `semanticValidation: "deferred"` for the marker path. The enhancer parses the
  first provider result, but linearly returns `failed` for every invalid
  deferred result before it classifies a correctable field or reaches the
  existing one-field correction boundary.
- This makes an incomplete or evidence-ref-invalid single field unrecoverable
  even though the same enhancer already supports exactly one same-provider,
  field-only correction behind a fresh token-budget gate.
- The corrected-candidate parser currently omits the caller's
  `semanticValidation` mode, so merely removing the early return would
  incorrectly re-enable legacy SEO/causal prose checks after correction.
- Raw diagnosis output and its exact invalid field were not persisted, and the
  outer Free-teaser error intentionally erased the parse detail. This scope
  does not invent that missing historical evidence. Its deterministic
  regression uses the proven contract class: one structurally incomplete
  diagnosis field under deferred semantic review.

### Exact objective and allowed behavior

Make the existing diagnosis enhancer apply its existing single field-only
correction to a deferred-semantic result only when the parse error is
structural/evidence-binding, belongs to one known correctable diagnosis field,
and the provider result is an object.

The repair must:

1. keep the current maximum of two provider attempts and use the same provider;
2. re-run the existing token-budget gate before the correction call;
3. send only the selected field, invalid value, sanitized parser reason, and
   the already bounded diagnosis evidence;
4. reparse the corrected candidate with the same `"deferred"` validation mode;
5. preserve unified semantic-review ownership of SEO/causal prose;
6. continue to reject internal instruction/provider-payload leakage locally
   with one provider call and no correction;
7. continue to fail closed for unknown top-level fields, non-correctable or
   multi-field invalidity, provider/budget failure, invalid correction shape,
   or a still-invalid corrected candidate; and
8. never persist or log raw provider output, prompts, credentials, or secrets.

### Exact file allowlist and diff budget

Production source:

- `apps/web/src/worker/report-v4-diagnosis-enhancer.ts`:
  at most 25 changed lines.

Deterministic test:

- `apps/web/src/worker/report-v4-diagnosis-enhancer.test.ts`:
  at most 80 changed lines.

Scope authority:

- `docs/ACTIVE-CHANGE-SCOPE.md`:
  this Phase 3R3 section plus terminal status only, at most 140 changed lines.

No other tracked or untracked source, test, fixture, dependency, schema,
configuration, runtime environment, script, evidence, or generated path may be
edited. The production and test budgets are hard bounds. Discovery of a need
to touch another production behavior or file is a stop-and-report condition.

### Forbidden scope

- No prompt/schema/model/profile/provider/endpoint/token-limit change.
- No semantic-review contract, annotation, receipt, Free-card, Paid V3,
  checkout, payment, credit, refund, email, access-token, artifact, database,
  migration, queue, retry-policy, lease, recovery, replay, or historical-data
  change.
- No Vercel action, Docker build/replacement/cleanup, browser submission,
  public-search request, real model call, Sandbox action, production action,
  push, merge, PR, tag, or remote mutation.
- No retry or mutation of either consumed Phase 3/3R2 report or job.

### Acceptance checks

Deterministic tests must prove:

1. a deferred result missing one known structural field requests exactly one
   correction and completes with `providerAttempts=2`;
2. the correction request identifies only that field and retains the bounded
   original evidence;
3. corrected output is reparsed under deferred semantics, so causal/SEO prose
   remains reserved for the unified semantic reviewer;
4. internal leakage still fails with exactly one provider call and no
   correction;
5. over-budget, invalid, or still-incomplete correction remains fail-closed;
6. existing legacy diagnosis behavior remains unchanged; and
7. the existing marked Free-teaser tests still prove deferred mode and exactly
   one later unified semantic review.

Run the focused enhancer and Free-teaser tests, full `npm test`, `npm run
lint`, `npm run build`, and `git diff --check`. Before a commit, compare the
complete diff to baseline `453f7bc2aa9345117953677f1740923dd8ff9534`,
require only the three allowlisted paths and budgets, and create at most one
local implementation commit. Do not push it.

Passing Phase 3R3 is local repair evidence only. A new Preview, Worker image,
replacement report, model call, Sandbox checkout, or continuation toward Paid
V3 requires a separate newly frozen deployment/canary scope and explicit user
approval.

## Phase 3R2 APPROVED - deploy the verified repair and run one replacement protected-Staging canary

Status: `DEVIATION_REVIEW_REQUIRED`. The user explicitly approved this exact
Phase 3R2 scope on 2026-07-24 with
`批准 Phase 3R2 FROZEN 范围并开始执行`. Execution deployed the exact candidate,
replaced only the two Staging Workers, and created the one authorized
replacement report. The repaired shared-snapshot path passed
`snapshot_resolution`, but the marker-bearing Free V4 job then failed
terminally at `grounded_answer_synthesis` after its bounded automatic attempts
all returned `Free teaser Q1 diagnosis did not complete.` No Free semantic
review, checkout, payment, Paid job, refund, production mutation, retry,
replacement, or push is authorized after this stop. Exact evidence is recorded
in
`docs/operations/evidence/2026-07-24-semantic-review-protected-staging-r2.md`.

### Objective, candidate, and hard boundary

- Branch: `codex/v4-answer-optimization-scope-reset`.
- Exact clean repair candidate:
  `fca651f61b5eed961379419b15a7bb4017979c46`
  (`fix: accept exact shared teaser snapshots`).
- Phase 3R1 local verification at that commit passed the two focused files
  `29/29`, full `npm test` with 302 files and 2,811 tests passed plus 46 files
  and 188 tests skipped, `npm run lint`, `npm run build`, and
  `git diff --check`.
- Objective: deploy exactly this immutable repair candidate to the existing
  protected Staging Web and Free/Deep Worker line, then create exactly one new
  `https://shun-express.com/` report and prove the normal persisted
  marker-enabled Free V4 -> Airwallex Sandbox -> Paid V3 flow, including exact
  shared-snapshot reuse, one Free semantic review, one Paid semantic review,
  and one complete accessible Paid HTML artifact.
- The previously consumed Phase 3 report
  `d5b85b92-2731-47da-ab9d-52793de179e5` and jobs
  `42f5ed0c-3309-4834-97a7-ed3d443736de` /
  `fa49626f-9c3a-478b-852c-b459443e9e1a` remain read-only. The pre-admission
  job remains in `repair_wait` at `snapshot_resolution`, and the report still
  has zero orders, payment events, refunds, credits, and Paid artifacts. It may
  not be retried, resumed, repaired, checked out, copied, or represented as the
  replacement canary.
- Production Web, aliases, database, Workers, commerce, configuration, data,
  reports, and payments remain read-only. The pre-existing production
  Free/Deep Worker restart loop remains explicitly out of scope.

### Current protected-Staging authority

Read-only inspection on 2026-07-24 established:

- fixed protected alias:
  `https://open-geo-console-staging-itheheda.vercel.app`;
- current Vercel Preview deployment:
  `dpl_DxnJQU23awMcPH6NbQHWiAbjJ8tD`,
  URL
  `https://open-geo-console-ffj9cztph-itheheda-6857s-projects.vercel.app`,
  target `preview`, status `READY`;
- current Staging Free/Deep image:
  `open-geo-console:staging-11927beb4f8fafd5eaddde5d0491dbcf4a44b849`,
  image ID
  `sha256:7d5f873f46ebfe173c6595c519e0979b63456021b7745970b745d1ecc367827e`,
  size 1,237,526,128 bytes and revision label
  `11927beb4f8fafd5eaddde5d0491dbcf4a44b849`;
- Staging Free container
  `cc650afd286a1a4d0cd65cd295f023fa61ad5aa7366ed7f9e75e977b7be01c77`
  and Deep container
  `50bd0804d6682d6b570b87a5b0327bb67d601b26ccfe521b8cc9ae9c63c998b6`
  are running with zero restarts on that exact image;
- retained older rollback:
  `open-geo-console:staging-df013fc63ae36c3c55214e9478dd2ee2bbaf1fd7`,
  image ID
  `sha256:ed721dacbbc02e4b7973b9d1fce555d8697a986a371f7d5513f0cb986af96761`,
  size 1,235,864,668 bytes;
- ignored Staging runtime configuration is `COMMERCE_MODE=test`,
  `OGC_DEPLOYMENT_PROFILE=staging`, and
  `OGC_DEPLOYMENT_VERSION=11927beb4f8fafd5eaddde5d0491dbcf4a44b849`;
- authoritative PostgreSQL marker is `staging`, schema version is `42`;
- E drive free space is 19,783,417,856 bytes; `docker system df` reports
  52.74 GB images, 23.53 GB local volumes, and 1.258 GB build cache.

Before any mutation, recheck every identity above, the exact candidate diff,
all container references, E drive free bytes, `docker system df`, database
marker/schema, current alias target, and absence of a pre-existing candidate
image/deployment. Any drift is a stop-and-report condition.

### Exact deployment and local-runtime mutations

No production/test source edit is allowed. The only tracked paths that may
change are:

- `docs/ACTIVE-CHANGE-SCOPE.md`;
- one new terminal evidence file at
  `docs/operations/evidence/2026-07-24-semantic-review-protected-staging-r2.md`,
  created only after external execution starts.

The existing clean detached worktree
`E:/project/open-geo-console/.data/semantic-review-phase3-candidate` may be
retargeted from `11927beb4f8fafd5eaddde5d0491dbcf4a44b849` to exact detached
`fca651f61b5eed961379419b15a7bb4017979c46`. Do not create another worktree,
branch, commit, merge, tag, PR, or remote ref. Preserve all other worktrees and
dirty/untracked material.

Vercel:

1. From that exact clean detached candidate worktree, create exactly one new
   Vercel **Preview** deployment. Never use `--prod`, promote, or a production
   alias.
2. Wait for `READY`; require exact candidate revision metadata, Preview/
   Staging deployment profile, protected Staging PostgreSQL marker/schema, and
   authenticated health/catalog success.
3. Move only
   `open-geo-console-staging-itheheda.vercel.app` to that exact READY Preview.
   Preserve the current deployment as the Web rollback. Do not delete either
   deployment.

Docker:

1. `package.json`, `package-lock.json`, `Dockerfile.worker`, base image,
   browser, system-package, and dependency inputs are unchanged. A full Worker
   build is forbidden.
2. Build exactly one thin source-overlay image from exact current image
   `sha256:7d5f873f46ebfe173c6595c519e0979b63456021b7745970b745d1ecc367827e`,
   copying only `apps/` and `packages/`, with tag
   `open-geo-console:staging-fca651f61b5eed961379419b15a7bb4017979c46`
   and OCI revision label
   `fca651f61b5eed961379419b15a7bb4017979c46`.
3. Do not run `npm ci`, browser/OS installation, the full Worker Dockerfile,
   `docker cp`, or an in-container edit.
4. Change only ignored
   `.data/workstation-docker/staging.env` value
   `OGC_DEPLOYMENT_VERSION` to the exact repair SHA. No credential or other
   environment value may change.
5. Recreate only
   `open-geo-console-staging-worker-free-1` and
   `open-geo-console-staging-worker-deep-1`. Require exact candidate image ID/
   label, `staging`/`preview` runtime/database markers, running state, zero
   restart count, and ready drain logs before submitting a URL.
6. Retain the new candidate image and former current
   `sha256:7d5f873f46ebfe173c6595c519e0979b63456021b7745970b745d1ecc367827e`
   as the sole rollback pair for this Staging line. After both replacement
   containers are verified, the older zero-reference rollback
   `sha256:ed721dacbbc02e4b7973b9d1fce555d8697a986a371f7d5513f0cb986af96761`
   may be removed after a fresh exact zero-reference check.

No other image, container, cache, layer, volume, network, service, or file may
be cleaned or changed. Broad Docker cleanup is forbidden. Record before/after
free bytes, `docker system df`, image IDs/sizes/labels, container references,
and exact bytes added/freed. A failed build, deployment, alias move, service
replacement, or cleanup stops before retry.

### Exactly one replacement canary

After exact Web/Worker/database parity is proven:

1. Through the protected application, submit exactly
   `https://shun-express.com/` once and create exactly one new report authority.
   One protected-Staging forced regeneration is allowed only if it is the
   normal UI requirement for that single submission. No second submission,
   alternate URL, direct API fabrication, or historical authority is allowed.
2. Let the normal persisted Free Worker run. Require the new V4 pre-admission
   root checkpoint marker `report-semantic-review-v1`.
3. Prove the repaired path is exercised: at least one selected completed shared
   snapshot must predate the new report and retain origin query IDs/
   `query_fanout_hash` different from the current report-local fanout, while
   its recomputed semantic cache identity, query plan, authority, attempts, and
   observations remain exact.
4. Require exactly one unified Free semantic-review call and a persisted,
   internally verified ready receipt before checkout.
5. Continue only that exact new report through at most one normal Airwallex
   **Sandbox** checkout. Sandbox transfers no real money. If the normal
   protected UI requires user interaction or a provider challenge, pause for
   the user; do not substitute a manual Webhook, database write, internal
   state patch, or alternate payment path.
6. Require the verified Sandbox Webhook to create exactly one Paid entitlement
   and one Paid V3 job, with exact report/question-set/site-snapshot and marker
   continuity from the Free authority.
7. Let the normal persisted Paid Worker run. Require exactly one unified Paid
   semantic-review call; one complete input/output/applied authority and final
   receipt persisted at the normal checkpoint boundary; unchanged read-only
   seeded Paid Q1; three substantive answers with question-owned sources and
   diagnoses; one complete accessible `combined_geo_report_v3` HTML artifact;
   settled test credit; commercial `completed`; and no refund.

Across this replacement canary, allow at most 40 total model/public-provider
invocations including automatic retries, 800,000 aggregate estimated input
and output tokens, and US$10 equivalent model spend. Existing stricter
operation caps remain controlling. Counts must be measurable from persisted
checkpoints, usage, and bounded logs. Crossing or being unable to establish a
cap stops before any retry or replacement.

### Acceptance and evidence

Acceptance requires one internally consistent new report/order/Sandbox event/
job/checkpoint/snapshot/receipt/artifact/access-token lineage, exact Web/Worker/
database candidate parity, exactly one Free and one Paid semantic-review call,
no semantic-program fallback, no terminal reserved credit, no refund, and an
authenticated browser read of the final complete HTML.

Evidence may contain only safe IDs, hashes, counts, statuses, timings, image/
deployment identities, URLs, and redacted screenshots. Never record
credentials, cookies, raw access tokens, raw provider payload secrets,
customer email plaintext, or unhashed client IPs. After a terminal pass or
stop, update this scope and the one R2 evidence file, then create at most one
local evidence-only commit. Do not push it.

### Stops and Phase 4 boundary

Stop as `DEVIATION_REVIEW_REQUIRED` before the next external action if any
identity, target, count, cap, marker, receipt, cache-reuse proof, deployment,
container, payment, credit, artifact, or production boundary differs; if the
new report enters terminal failure, `completed_limited`, or unapproved
`repair_wait`; or if continuing requires a retry, second Preview, second image
build, second report/scan/checkout/payment, job replay/recovery, historical
mutation, schema/dependency/provider change, manual Webhook, commerce drain,
refund/email action, broad cleanup, push, or production mutation.

Successful Phase 3R2 acceptance does not authorize Phase 4. Production
push/deploy, marker activation, Worker replacement, report generation, and
repair of the production Worker restart loop require a new exact production
scope and separate explicit approval.

## Phase 3R1 FROZEN - align Free semantic verifier with exact shared-snapshot reuse

Status: `COMPLETE`. The user explicitly approved this exact local-only repair
scope on 2026-07-24 with
`批准 Phase 3R1 FROZEN 范围并开始执行`. The implementation remained inside the
four-file allowlist with production `+6/-14` and combined tests `+62/-5`.
Focused verification passed 29/29 tests. One initial full-suite run had a
single unrelated concurrent PostgreSQL phase-capture timestamp failure; that
exact file then passed 5/5 alone, and the clean final full-suite rerun passed
302 files and 2,811 tests with 46 files and 188 tests skipped. `npm run lint`,
`npm run build`, and `git diff --check` passed. No external action occurred.

### Objective, baseline, and established root cause

- Baseline branch: `codex/v4-answer-optimization-scope-reset`.
- Exact clean baseline commit:
  `5ad211ba8574bc772f3ec8e8301781ebe81c9d01`.
- Phase 3 activation remains committed locally at
  `11927beb4f8fafd5eaddde5d0491dbcf4a44b849`; no commit has been pushed.
- Objective: make the marker-enabled Free teaser snapshot verifier accept an
  exact, completed shared public-search snapshot when its semantic query plan
  is identical but its immutable stored question/query lineage originated from
  another report, while preserving fail-closed rejection of any changed
  question, surface, authority, plan, query content, attempt linkage, or
  observation authority.

The current code establishes these separate identity domains:

1. `createMarketSnapshotIdentity` intentionally keys shared cache reuse by the
   normalized question, locale, region, surface identity, fanout version, exact
   query text/derivation/depth, and budget. It intentionally excludes
   report-local question IDs, question-set IDs, and query IDs.
2. Stored query IDs are snapshot-ledger identities created from the snapshot ID
   and the originating fanout query ID. The stored `query_fanout_hash` likewise
   records the originating fanout, including its report-local question and
   query identities.
3. `resolvePublicSourceSnapshot` deliberately reuses a cache-identical
   completed snapshot and materializes it for the current report by matching
   stored query order and exact query text, then projecting the current fanout
   query ID into the returned observations.
4. `verifyFreeTeaserSnapshotBundle` currently contradicts that contract by
   requiring the stored originating query IDs and `query_fanout_hash` to equal
   values recomputed from the current report. The Phase 3 canary therefore
   rejected two otherwise exact shared snapshots from 2026-07-22 and accepted
   the newly created third snapshot.

### Exact implementation allowlist and behavior

Production source:

- `apps/web/src/worker/report-v4-free-teaser.ts`

Tests:

- `apps/web/src/worker/report-v4-free-teaser.test.ts`
- `apps/web/src/worker/public-source-snapshot-resolver.test.ts`

Documentation:

- `docs/ACTIVE-CHANGE-SCOPE.md`

Maximum production-source diff: `+35/-20`. Maximum combined test diff:
`+120/-20`. Documentation is excluded from those budgets. No other tracked
path may change.

The production change may only realign
`verifyFreeTeaserSnapshotBundle` with the existing shared-cache contract:

- keep exact equality for the recomputed semantic cache identity, normalized
  question and question hash, locale, region, surface authority, surface ID and
  version, fanout version, snapshot kind, parent/candidate metadata, query-plan
  version, and completed status;
- validate the persisted query ledger by count and order, snapshot ownership,
  exact query text, query hash, and derivation rule against the current
  semantic fanout;
- treat persisted query IDs and `query_fanout_hash` as immutable provenance of
  the originating shared snapshot, not as current-report identities; require
  the origin hash and stored IDs to remain well-formed and internally unique,
  but do not require equality to current report-local IDs;
- derive the allowed query-ID set from the validated persisted query rows, then
  continue requiring every terminal attempt and every returned observation to
  bind to those exact stored rows and to the exact snapshot/authority;
- preserve the existing requirements for unique attempts/results, terminal
  attempt status, at least one attempt for every query, at least one successful
  attempt, successful ownership of every returned observation, and rejection
  of non-returned observations.

No query, attempt, observation, snapshot, report, checkpoint, or semantic-review
payload may be rewritten. No fallback, compatibility date, cache bypass,
force-refresh behavior, report-specific cache partition, or verifier skip may
be introduced.

### Required regression proof

The resolver test must construct two report-local canonical questions whose
question and query IDs differ but whose normalized question and complete
semantic query plan are identical. It must prove that:

- the second request reuses the first exact snapshot without another search;
- persisted snapshot/query/attempt/observation ledger IDs remain those of the
  first origin;
- returned observations are projected onto the second request's current query
  IDs; and
- a real semantic plan difference still produces a distinct snapshot.

The Free teaser test must supply an otherwise exact cached bundle whose stored
origin question/query identities and `query_fanout_hash` differ from the
current report while its cache identity and semantic plan match. It must prove
the semantic-review path proceeds exactly once. Existing or strengthened
negative cases must continue to stop before the semantic-review call when any
cache identity, question/surface/authority metadata, query order/text/hash/
derivation, attempt ownership/status, observation ownership/status, stored-ID
uniqueness, or origin-hash shape is corrupted.

After implementation, run:

- the two allowlisted focused test files;
- `npm test`;
- `npm run lint`;
- `npm run build`;
- `git diff --check`; and
- a complete diff/allowlist/budget review.

Only after all checks pass may exactly one local Phase 3R1 repair commit be
created. Do not push, merge, create a PR/tag, or alter any remote Git ref.

### Forbidden subsystems and external actions

Phase 3R1 is local-only. It does not authorize:

- edits to `packages/public-search-observer`, snapshot identity/fanout
  generation, the public-source resolver, database access, schema, migrations,
  model prompts/contracts, marker activation, commerce, artifacts, rendering,
  access control, deployment scripts, dependencies, or environment files;
- modification, deletion, refresh, replay, repair, or replacement of any
  historical/current Staging or production row, snapshot, report, job, order,
  checkpoint, artifact, token, credit, payment, refund, or email;
- a model/provider call, URL submission, scan, report, checkout, payment,
  Webhook, refund, email drain, Docker build/replacement/cleanup, Vercel deploy
  or alias change, Staging mutation, production mutation, push, or publication.

Any need to change the shared cache identity, fanout/query-ID generation,
resolver materialization, database semantics, or a path outside this allowlist
is a stop-and-report condition requiring a revised FROZEN scope and new
approval.

### Phase 3R2 boundary

Successful local Phase 3R1 verification does not authorize a replacement
canary. A separate Phase 3R2 scope must name the exact repair commit, protected-
Staging Web/Worker revisions, image and rollback identities, disk preflight,
one newly authorized replacement report, model/token/cost caps, and at most one
Sandbox checkout. It requires a separate explicit approval. Phase 4 production
activation remains unauthorized until that replacement canary fully passes.

## Phase 3 FROZEN - protected-Staging semantic-review activation and one fresh test-site canary

Status: `DEVIATION_REVIEW_REQUIRED`. On 2026-07-24 the user first authorized deployment, a real
model-backed run, and use of the user's dedicated test site without any real
payment, then explicitly approved this exact written Phase 3 scope with
`批准 Phase 3 FROZEN 范围并开始执行`. Local activation, verification, the bounded
protected-Staging replacement, and the one fresh canary are authorized only
within the allowlist, counts, identities, caps, and stop rules below.

Execution stopped fail-closed on 2026-07-24 after the single authorized report
entered unapproved `repair_wait` during `snapshot_resolution`. The new report
and root pre-admission marker were created, but no semantic-review receipt,
order, checkout, payment event, credit, Paid artifact, refund, or production
mutation occurred. Two of the three normally resolved public-search snapshots
were reused completed cache authorities from 2026-07-22 whose query text still
matched but whose persisted `query_fanout_hash` and deterministic query IDs no
longer matched the current verifier; the third, newly created snapshot matched.
No retry, replay, historical mutation, second report, checkout, payment, or
Phase 4 action is authorized. Exact evidence is recorded in
`docs/operations/evidence/2026-07-24-semantic-review-protected-staging.md`.

This is the separately gated protected-Staging phase required by
`docs/superpowers/specs/2026-07-23-report-semantic-review-staged-rollout-design.md`.
It must complete before a separate Phase 4 production-activation scope may be
approved. The user's production intent is not used to skip the protected-
Staging canary or combine Staging and production into one cutover.

### Objective, baseline, and hard boundary

- Baseline branch: `codex/v4-answer-optimization-scope-reset`.
- Exact clean baseline commit:
  `38ab4d78a7bc46b7a77eee3921b1a099be9677ab`.
- Exact activation candidate commit:
  `11927beb4f8fafd5eaddde5d0491dbcf4a44b849`. This is the sole local
  activation commit; it has not been pushed. Its changed paths and budgets are
  production `+3/-1`, test `+5/-1`, and this scope document only.
- Target application: the authenticated protected Preview at
  `https://open-geo-console-staging-itheheda.vercel.app`.
- Submitted target site: exactly `https://shun-express.com/`.
- Product lineage: one newly created Free V4 authority carrying
  `report-semantic-review-v1`, followed by its own normal Paid V3
  `combined_geo_report_v3` continuation.
- The Paid continuation may use exactly one Airwallex **Sandbox** checkout.
  Sandbox is test-environment authority and transfers no real money. No live
  provider payment, production order, production credit, production commerce,
  or real charge is authorized.
- Existing/historical reports, jobs, orders, checkpoints, artifacts, tokens,
  payments, credits, refunds, and emails are read-only and cannot be reused,
  repaired, replayed, reopened, cloned, or represented as this canary.
- Production Web, aliases, database, Workers, commerce service, configuration,
  and data remain read-only throughout Phase 3. The currently observed
  production free/deep Worker restart loop is recorded pre-existing evidence,
  not authority to repair or replace production in this phase.

### Exact local activation allowlist and budget

Production source:

- `apps/web/src/db/jobs.ts`

Test:

- `apps/web/src/db/staging-security.postgres.test.ts`

Documentation:

- `docs/ACTIVE-CHANGE-SCOPE.md`
- one new evidence record under
  `docs/operations/evidence/2026-07-24-semantic-review-protected-staging.md`
  only after external execution begins.

Maximum source diff: `+12/-4`. Maximum test diff: `+20/-4`.
Documentation is excluded from those budgets. No other tracked path may
change. The sole runtime behavior change is to pass the already implemented
literal `report-semantic-review-v1` creation option at the normal
Free-preview-to-V4-pre-admission enqueue call. It seeds only newly created
authorities; no environment fallback, timestamp rule, denylist, migration,
late marker write, historical update, schema/dependency/model-operation
change, or alternate activation source is allowed.

The PostgreSQL test must prove the normal terminalization transaction creates
exactly one pre-admission job whose initial checkpoint contains the marker,
while preserving its report identity, dispatch count, zero artifact, zero
credit, and zero payment effects. Focused tests, the affected disposable
PostgreSQL test, `npm test`, `npm run lint`, `npm run build`, and
`git diff --check` must pass before exactly one local activation commit. The
resulting clean full commit SHA becomes the candidate revision and must be
written into this section before any external mutation. Do not push, merge,
create a PR/tag, or alter any remote Git ref.

Candidate verification completed before external mutation: the two focused
unit files passed `15/15`; the disposable PostgreSQL suite passed `7/7` after
its fresh database received the required `staging` environment marker; the
disposable container was removed; full `npm test` passed 302 files and 2,810
tests with 46 files and 188 tests skipped; `npm run lint`, `npm run build`, and
`git diff --check` passed.

### Exact deployment identities and disk-safe Worker replacement

Read-only preflight on 2026-07-24 recorded:

- current Staging Worker image:
  `open-geo-console:staging-df013fc63ae36c3c55214e9478dd2ee2bbaf1fd7`,
  image ID
  `sha256:ed721dacbbc02e4b7973b9d1fce555d8697a986a371f7d5513f0cb986af96761`;
- initial rollback image:
  `open-geo-console:staging-8bb068e2a0f2e9f49a3f328c9e8f4490c4ea0b78`,
  image ID
  `sha256:0721a4b4698a8131e9d341e44207dabdbcdd5445441eacd3a9babcbd1ba2af39`;
- both current Staging Workers are running on the current image;
- E drive free space is `3,921,473,536` bytes and `docker system df`
  reports 92.39 GB of images, so a full Worker build is forbidden;
- `package.json`, `package-lock.json`, `Dockerfile.worker`, and base/browser/
  system dependency inputs are unchanged from the current Staging revision.

The candidate Worker tag is exactly
`open-geo-console:staging-<candidate-full-sha>`. Before build, recheck the
three image roles, references, free bytes, `docker system df`, candidate diff,
and dependency inputs. Build only one thin source-overlay image from the exact
current image, copying only `apps/` and `packages/`, and label it
`org.opencontainers.image.revision=<candidate-full-sha>`. Do not run
`npm ci`, browser installation, OS package installation, a full
`Dockerfile.worker` build, `docker cp`, or an in-container edit.

To make bounded room for that overlay, the following older Staging images may
be removed only after a fresh zero-container-reference check. No other image,
layer, cache, volume, or container may be cleaned:

- `open-geo-console:staging-99b04abf0d966d37338241ef08dc5849550bde0f`
  / `sha256:5f366092624a4ab57472cb8cd024a9776dfbc4f2ad104ba517df7723d3371f5d`
- `open-geo-console:staging-8d141d6b442612d3312b575162c4ef6516d4983e`
  / `sha256:4089deb19828a0473a55b4930f37729212477414fccd4941eb5086ae79f4ddab`
- `open-geo-console:staging-9bc2d5b18740c1dbc6eaa6ddba5903300b16f5ec`
  / `sha256:8c95a716d0f67fd35c5988e509547b442dee1b0d4d3726372f17ae72cc487890`
- `open-geo-console:staging-fcf97019d156909daeed0643533c21fd5ccca5eb`
  / `sha256:96abf96c63e162683f2050c788bac9aa15e2354233724852713db185cf5ca8af`
- `open-geo-console:staging-05bb1e21bcd275de594a578bb9900b15ee66bfe4`
  / `sha256:c30b30bc32a7049e93a493d88b9e3bffd6c72a9570c98458fe2be727da44ce6c`
- `open-geo-console:staging-5a6ac0d24574581342d7bc45ca4867e44094a366`
  / `sha256:9943d450435fdea586fa382ecb513cfb0c2f7e2112f2f9d7a23fda8e2794f0b1`
- `open-geo-console:staging-27b25d5ee83dc06457295a411258c130b8fcd600`
  / `sha256:b2aa28892250578a776b519958027c4098b6aea73709281a9761b1da35f4c908`
- `open-geo-console:staging-b5ea394cdcda0ea3f0d29d14c469ce4e62735ccc`
  / `sha256:1d704cdeb6f29566aeb65a940b8706d3ff0812a3716c4992b6f7265867c0e453`
- `open-geo-console:staging-43357d3e16a108697b0d8d9a78bec7c321488714`
  / `sha256:cb05a38db6682bb6bc938f714cb698697b9236d1fe1151cc095d3a0f548afbd4`
- `open-geo-console:staging-a13a023df81cbc6254e59ab6ed339bfe047bc46a`
  / `sha256:c61306696232facf908f29311a9542e85d589c367c2f28f0e2c237726aec160c`
- `open-geo-console:staging-4e30fdb91b0acbf670c8e220761af24e3951a8f0`
  / `sha256:7db1c3e3fdd0ef800c5913da1f47a98dc7fe6f3a5d1a349503b67226705c787f`
- `open-geo-console:staging-aee3690`
  / `sha256:76c603238eb8602f12b82ef2f869aba90a4332606fc722ba1ea940e39a22984a`

Deploy exactly one Vercel Preview from the clean candidate commit, wait for
`READY`, verify its revision/profile/database markers, and move only the fixed
protected-Staging alias to it. Recreate only
`open-geo-console-staging-worker-free-1` and
`open-geo-console-staging-worker-deep-1` on the exact candidate image. Verify
their container image IDs, OCI revision, Staging runtime/database markers, and
ready logs before any report submission. After candidate verification, retain
only the candidate and the former current
`sha256:ed721dacbbc02e4b7973b9d1fce555d8697a986a371f7d5513f0cb986af96761`
as rollback for this Staging line; the initial rollback
`sha256:0721a4b4698a8131e9d341e44207dabdbcdd5445441eacd3a9babcbd1ba2af39`
may then be removed after a fresh zero-reference check.

Record before/after drive free bytes, `docker system df`, every deleted and
created image ID/size, container references, the candidate/rollback identities,
and net bytes freed/added. A failed build or replacement stops before retry
until remaining space and exact retry authority are revalidated.

### One-shot canary, real-model cap, and acceptance

After exact Web/Worker parity is proven:

1. Create exactly one new report authority by submitting only
   `https://shun-express.com/` through the protected application. No historical
   report may satisfy the fresh-authority requirement.
2. Let the normal persisted Free Worker run. Its root pre-admission checkpoint
   must carry `report-semantic-review-v1`, make exactly one unified Free
   semantic-review call, and persist a verified ready receipt.
3. Continue only that report through exactly one Airwallex Sandbox checkout.
   A verified Sandbox Webhook must create the Paid entitlement/job and copy the
   marker from the exact Free authority. No direct database fabrication,
   manual Webhook, internal state patch, real payment, second checkout, or
   production commerce action is allowed.
4. Let the normal persisted Paid V3 Worker run. It must make exactly one unified
   Paid semantic-review call, persist the complete input/output/applied
   authority and final receipt in one checkpoint boundary, materialize one
   complete HTML artifact, settle its test credit, and reach commercial
   `completed` with no refund.

Across the single Free-to-Paid canary, allow at most 40 total real
model/provider invocations including retries, at most 800,000 aggregate
estimated input/output tokens, and at most US$10 equivalent model spend. The
normal pipeline's stricter per-operation caps remain in force. Crossing or
being unable to measure a cap stops before any manual retry or replacement.
There is no second report, second scan, second checkout, second payment, job
replay/recovery, direct provider probe, or ad-hoc model call.

Acceptance requires exact Free/Paid report and question-set continuity; one
Free and one Paid semantic-review receipt bound to the configured provider/
model and immutable evidence; unchanged read-only Paid Q1; three substantive
Paid answers with question-owned sources and diagnoses; complete accessible
HTML; no semantic-program fallback; no reserved terminal credit; no refund;
and one internally consistent report/order/Sandbox-event/job/checkpoint/
artifact/token lineage. Evidence may record only redacted IDs, hashes, counts,
statuses, timings, URLs, and visible screenshots; never credentials, cookies,
raw access tokens, raw provider payload secrets, or unhashed client IPs.

### Stops and Phase 4 boundary

Stop as `DEVIATION_REVIEW_REQUIRED` before the next external action if any
required path, behavior, deployment target, image, cleanup target, model cap,
report/order/payment count, or production surface is outside this lock; if
Web/Worker/database revisions differ; if an old authority would be reused; if
the target scan is unavailable; if marker continuity or either single-review
count fails; if the new report enters terminal failed, `completed_limited`, or
unapproved `repair_wait`; or if proceeding would require a second canary,
manual replay, historical mutation, real payment, refund/email drain, schema/
dependency/provider change, broad cleanup, push, or production mutation.

Successful Phase 3 acceptance does not itself authorize Phase 4. Production
push/deploy, production configuration/marker activation, production Worker
replacement, production report generation, and repair of the pre-existing
production Worker restart loop require a new exact production scope and a
separate explicit approval after this canary passes.

## ReportSemanticReview staged program - Phase 2B3 marker-present Paid V3 integration

Status: Phase 2B3a is `COMPLETE`; the exact Phase 2B3b scope is now
`APPROVED`. The completed 2B3a unit remains
limited to its default-legacy, runtime-unreachable production/test allowlist.
The Phase 2B3b implementation approval authorizes only the exact local
production/test allowlist and behavior below; it does not authorize marker
activation, a real provider call, artifact/job mutation outside disposable
tests, push, deployment, or external action. Phase 2B3a is committed locally at
`49b0ea34d3f270565e7ba5907adea18dfb312056`; no push is authorized.

### Authority, baseline, and safety decomposition

- Design authority:
  `docs/superpowers/specs/2026-07-23-report-semantic-review-staged-rollout-design.md`.
- Baseline branch: `codex/v4-answer-optimization-scope-reset`; clean baseline
  HEAD: `1cbb844e8a073708e3ad40c997610bcb732978c9`.
- Active product lineage: Free V4 teaser -> Paid V3
  `combined_geo_report_v3` only. V1/V2, formal Paid V4, corrections,
  replacements, artifact refresh, and historical authorities remain legacy
  and are not part of this phase.
- Phase 2A, 2B1, 2B2, and 2B3a are complete local prerequisites. Their
  completion does not approve the FROZEN Phase 2B3b implementation or activate
  the root marker.

The minimum correct Paid integration still crosses two different risk
classes: additive/default-legacy deferral and preparation seams, then the
marker-selected runtime review/checkpoint/artifact adoption. Combining them in
one approval would make a regression difficult to localize and could leave a
partially deferred Paid path without its sole semantic authority. Phase 2B3 is
therefore proposed as two separately approved, separately committed units
without changing the approved product architecture:

1. **Phase 2B3a** adds explicit, default-legacy Paid deferral/preparation seams
   and pure Paid manifest capability. No runtime caller may select them.
2. **Phase 2B3b**, only after 2B3a is complete and a new exact scope is
   drafted and approved, may let the immutable root marker select those seams
   and adopt exactly one unified Paid review before artifact materialization.

Phase 2B3a completion is recorded below. Phase 2B3b now has a separate exact
FROZEN scope and still has no implementation authority until that scope is
explicitly approved.

### Audited active-chain evidence and exclusions

The current Paid V3 Worker produces page analyses and the website foundation,
collects three answer/source results, constructs answer cards and source-
selection diagnosis, enhances all three per-question diagnoses, builds the
combined report, writes `pendingArtifactVerification`, then materializes and
terminalizes it. The following active seams can presently make semantic
decisions before the proposed unified review:

- page-analysis and website-synthesis language correction/deletion in
  `analysis.ts` and `synthesis.ts`;
- answer language and Q1 responsiveness, alias-based target/competitor
  diagnosis, and per-question diagnosis semantic repair in
  `answer-first-v3.ts`, `open-geo-answer-v3.ts`, and the V4 diagnosis route;
- source-selection causal/prose checks in
  `source-selection-diagnosis-v1.ts`;
- prohibited-claim validation reached before the combined parser because
  `public-source-forensics/report-builder.ts` calls
  `parseRecommendationForensicReportV2` while constructing the public-source
  draft, plus the later whole-report language gates reached through the V2
  base parser and `combined-artifact-readiness.tsx`;
- artifact-verification resume, which currently has no Paid semantic-review
  projection to verify before materialization.

Provider qualification, passage selection, entity resolution, source
eligibility, evidence grading, crawling, search fanout, and exact excerpt
binding also use deterministic rules, but the approved design explicitly
keeps those evidence-acquisition/integrity subsystems program-owned or out of
scope. They are not customer-prose acceptance gates and are forbidden here.
The retired V1/V2 `recommendation-forensic.ts` path is likewise excluded.

## Phase 2B3a - default-legacy Paid deferral and preparation seams

Status: `COMPLETE` - the user explicitly approved this exact Phase 2B3a scope
on 2026-07-23 with `批准 Phase 2B3a FROZEN 范围并开始执行`, and the bounded
implementation and independent review are complete. No production caller,
checkpoint, report, or artifact selects Paid deferred semantics in this unit.
Completion grants no authority for Phase 2B3b.

### Phase 2B3a objective

Add explicit `legacy | deferred` inputs and pure preparation/manifest helpers
needed by the later marker-present Paid path. Every new input defaults to
`legacy`; existing callers, prompts, retries, parser results, checkpoint JSON,
and artifact bytes remain unchanged. Deferred mode may suppress only
programmatic customer-prose meaning judgments. Structural, ownership, URL,
evidence, hash, cardinality, leakage, and excerpt-binding checks remain active.

### Exact Phase 2B3a production allowlist

- `packages/ai-report-engine/src/analysis.ts`
- `packages/ai-report-engine/src/synthesis.ts`
- `packages/ai-report-engine/src/report-semantic-review.ts`
- `packages/ai-report-engine/src/report-semantic-review-manifests.ts`
- `packages/ai-report-engine/src/open-geo-answer-v3.ts`
- `packages/ai-report-engine/src/source-selection-diagnosis-v1.ts`
- `packages/ai-report-engine/src/recommendation-forensic-v2-claims.ts`
- `packages/ai-report-engine/src/recommendation-forensic-v2.ts`
- `packages/ai-report-engine/src/combined-geo-report.ts`
- `packages/ai-report-engine/src/combined-geo-report-v2.ts`
- `packages/ai-report-engine/src/combined-geo-report-v3.ts`
- `apps/web/src/worker/public-source-forensics.ts`
- `apps/web/src/public-source-forensics/report-builder.ts`
- `apps/web/src/worker/answer-first-v3.ts`
- `apps/web/src/worker/source-selection-diagnosis.ts`
- `apps/web/src/report/combined-artifact-readiness.tsx`
- `docs/ACTIVE-CHANGE-SCOPE.md`

Maximum production-code diff across the sixteen named source files:
`+1,500/-320` lines. Documentation is excluded. No other production path may
change. In particular `processor.ts`, Free runtime routing, provider adapters,
model configuration/operation files, DB/schema/migrations, commerce,
terminalization, UI components, and activation code are forbidden.

### Exact Phase 2B3a test allowlist

- `packages/ai-report-engine/src/analysis.test.ts` (new)
- `packages/ai-report-engine/src/synthesis.test.ts` (new)
- `packages/ai-report-engine/src/report-semantic-review.test.ts`
- `packages/ai-report-engine/src/report-semantic-review-manifests.test.ts`
- `packages/ai-report-engine/src/open-geo-answer-v3.test.ts`
- `packages/ai-report-engine/src/source-selection-diagnosis-v1.test.ts`
- `packages/ai-report-engine/src/recommendation-forensic-v2.test.ts`
- `packages/ai-report-engine/src/combined-geo-report.test.ts`
- `packages/ai-report-engine/src/combined-geo-report-v2.test.ts`
- `packages/ai-report-engine/src/combined-geo-report-v3.test.ts`
- `apps/web/src/worker/public-source-forensics.test.ts`
- `apps/web/src/public-source-forensics/report-builder.test.ts`
- `apps/web/src/worker/answer-first-v3.test.ts`
- `apps/web/src/worker/source-selection-diagnosis.test.ts`
- `apps/web/src/report/combined-artifact-readiness.test.tsx`

Maximum test diff across the fifteen named test files: `+1,900/-350`. The two
new package tests provide focused coverage at the actual page-analysis and
website-synthesis APIs without expanding unrelated package-index fixtures. A
verification-only amendment may change only these named tests under the
repository rule and cannot add a runtime caller or weaken a gate.

### Locked Phase 2B3a behavior

1. Omitted and explicit `legacy` values must be identical at every seam,
   including prompts, model-call counts, retry/correction behavior, parsed
   values, hashes, checkpoints, prepared reports, and materialized HTML/PDF.
2. Deferred page analysis and website synthesis retain JSON shape, evidence
   quotes, URLs, finding/evidence ownership, bounds, cardinality, and leakage
   safety, but do not run language wordlists, terminology replacement,
   language-only correction calls, or optional-prose deletion.
3. Deferred generative answers retain typed status, safe URL, source,
   provider/model/search identity, timestamps, and hashes, but do not run
   language/character-ratio or Q1 responsiveness heuristics. Deferred answer
   card drafts do not recompute target/competitor meaning from aliases.
4. Deferred V4/source-selection diagnosis retains exact question/source/
   evidence ownership, enum/cardinality, excerpt binding, prohibited key
   safety, and hashes, but does not use prose regexes or local semantic field
   correction. This does not authorize inventing semantic placeholder data.
5. Deferred public-source builder, forensic, and combined parsing skip only
   prohibited-claim and final report-language/terminology judgments. The
   builder-to-`parseRecommendationForensicReportV2` call receives an explicit
   default-legacy seam before the combined parser is reached. All omitted and
   legacy calls still enforce the existing gate. Deferred mode still enforces
   the exact V3 contract, three questions/cards, all IDs and owners, safe URLs,
   hashes, evidence references, commercial identities, and artifact revision
   data.
6. Add one pure Paid V3 customer-prose manifest/application capability with
   exact ordered coverage and a complete non-prose hash. It may enumerate and
   mechanically replace declared paths only; it may not inspect wording to
   decide meaning or become reachable from a Worker.
7. Paid answer annotations must be sufficient to construct final Q2/Q3 target
   presence/position/roles and competitor IDs from verified model output. The
   catalog-bound reviewer contract must also cover every applicable source-
   selection conclusion, including contribution role, target state, factor
   classification, and action family/priority, each tied to exact question,
   source, profile, gap/factor, action, and evidence IDs. Program code may
   validate only enums, cardinality, exact catalog coverage/order, and ID
   ownership; it may not derive any of these semantic values from question
   ordinal, ownership category, text length, regex, keyword, or other
   heuristic. Missing, ambiguous, contradictory, unknown-ID, or cross-owner
   annotations fail closed.
8. Split V3 report preparation from materialization so a later caller can
   obtain one fully structured draft before HTML/PDF/storage. Existing
   `buildReadyCombinedArtifactV3` must keep its exact legacy order and result;
   no existing caller may use the new preparation entry point in 2B3a.
9. No root marker read, Worker route, semantic checkpoint/projection, review
   model invocation, receipt in a real report, artifact behavior change, or
   activation source is permitted.

### Phase 2B3a acceptance

1. Paired tests prove default/explicit legacy equality and deferred behavior
   for every named seam, including mixed-language brands and professional
   terms, Q1 nonresponsive-looking prose, causal-looking draft prose, and
   source-selection text.
2. Negative tests prove deferred mode still rejects malformed JSON, unsafe
   URLs, unknown/cross-owned IDs, changed questions, missing cards, unbound
   excerpts, hash/model mismatch, leakage, and prohibited structural keys.
3. Pure Paid manifest tests prove exact customer-prose coverage, immutable
   questions, catalog ownership, non-prose preservation, deterministic
   application, complete Q2/Q3 answer annotations, and exact catalog-bound
   source-selection contribution-role, target-state, factor-classification,
   and action-family/priority annotations; no model/network call is made.
4. Artifact tests prove the preparation seam performs no HTML/PDF/storage
   work and the unchanged legacy builder produces the same report and
   materialization sequence.
5. A repository-wide non-test search, accounting for the already approved
   Phase 2B2 Free deferred runtime, proves that no runtime caller passes
   `deferred` to any new or modified Phase 2B3a Paid seam. The audit must check
   callsites for page analysis, website synthesis, public-source builder and
   pipeline, generative answer-first, source-selection diagnosis, combined
   V1/V2/V3 parsing, and V3 preparation/materialization individually. No
   Worker imports or invokes the Paid manifest/application, and no production
   caller invokes the new V3 preparation entry point. Only omitted, defaulted,
   or explicitly `legacy` Phase 2B3a Paid behavior is reachable in production.
6. Run focused tests, `npm test`, `npm run lint`, `npm run build`, and
   `git diff --check`; compare complete paths and numstat to both budgets
   before one local commit. Do not push.

### Phase 2B3a implementation outcome

- Exact baseline: branch `codex/v4-answer-optimization-scope-reset`, HEAD
  `1cbb844e8a073708e3ad40c997610bcb732978c9`.
- The completed diff contains only the sixteen allowlisted production source
  files, fifteen allowlisted test files, and this scope document. Production
  numstat is `+591/-106`; test numstat is `+842/-11`, both within budget.
- All fifteen focused test files passed: `148/148`. The final full test run
  passed `301` files and `2,793` tests, with `46` files and `187` tests
  skipped. The isolated PostgreSQL acceptance file passed `5/5`.
- `npm run lint`, `npm run build`, and `git diff --check` passed.
- Repository-wide non-test callsite review confirmed that every Phase 2B3a
  Paid deferred seam remains production-unreachable: Paid callers omit the
  option or retain legacy behavior, no Worker imports or invokes the Paid
  manifest/application, and no production caller invokes the new V3
  preparation entry point. Existing explicitly approved Phase 2B2 Free
  deferred runtime is the sole accounted-for exception and is not a Paid
  activation path.
- No real model call, historical or business-database mutation, report/job
  creation or recovery, deployment, push, marker activation, or other external
  action occurred.
- Independent final review verdict: `CONFORMANT`. The Phase 2B3a local commit
  threshold was met; the later Phase 2B3b scope was separately approved for
  local implementation on 2026-07-23.

### Phase 2B3a hard stops and external actions

Stop as `DEVIATION_REVIEW_REQUIRED` if a runtime caller must select deferred
mode; any non-allowlisted production file is needed; legacy equality cannot be
proved; a schema, dependency, model operation/configuration, customer artifact,
checkpoint, commerce, historical-data, or external-action change is needed;
the production budget is exceeded; or two repairs do not reduce the failing
acceptance set before a new route is considered.

No live model call, crawl, report/job creation or recovery, database mutation
outside disposable tests, payment, credit, refund, email, Docker build,
deployment, push, publication, or marker activation is authorized.

## Phase 2B3b exact FROZEN gate - marker-present Paid V3 adoption

Status: `COMPLETE`. On 2026-07-23 the user first explicitly approved the
unified-review-output extension decision and requested this exact FROZEN scope,
then explicitly approved it with
`批准 Phase 2B3b FROZEN 范围并开始执行`. This authorizes local implementation,
debugging, verification, and one local commit only within the exact allowlist,
budgets, locked behavior, and acceptance set below. The implementation later
received an independent `CONFORMANT` verdict and authorization for exactly one
local commit without push, deployment, marker activation, Staging, production,
or live-model action.

Measured outcome:

- Production diff: `+2,029/-68` within the `+2,800/-650` ceiling.
- Test diff: `+1,837/-13` within the `+3,800/-850` ceiling.
- Exact allowlisted focus with
  `OGC_RUN_DISPOSABLE_RECOVERY_POSTGRES=1`: 12/12 files and 167/167 tests
  passed, including the disposable PostgreSQL recovery suite at 5/5; its
  test container was removed afterward.
- Full `npm test`: 302 files passed, 46 skipped; 2,810 tests passed, 188
  skipped. `npm run lint`, `npm run build`, and `git diff --check` passed.
- Independent final verdict: `CONFORMANT`; exactly one local Phase 2B3b
  commit authorized. Push, deployment, marker activation, protected-Staging,
  real model/report/payment runs, and production remain unauthorized.

### Phase 2B3b objective and exact baseline

For an ordinary Paid V3 `combined_geo_report_v3` job whose immutable root
checkpoint already carries `report-semantic-review-v1`, adopt exactly one
unified semantic review after the complete Paid draft inputs exist and before
HTML/PDF/storage or terminalization. The same call must review/correct all
existing Paid customer prose and return the complete evidence-bound
`SourceSelectionDiagnosisV1` draft that deferred mode cannot construct
programmatically. Pure application then builds Q2/Q3 `geoDiagnosis`, validates
the reviewed source-selection draft, prepares the final report, and persists
the report plus full review authority in one checkpoint write.

Marker-absent Paid V3 must retain its existing routing, prompts, model-call
counts, semantic heuristics, checkpoint payload, report, artifact bytes, and
terminalization sequence. This phase does not seed or activate the marker.

- Baseline branch: `codex/v4-answer-optimization-scope-reset`.
- Clean production baseline HEAD:
  `49b0ea34d3f270565e7ba5907adea18dfb312056`.
- The only pre-scope working-tree change is this scope document.
- Prerequisites: committed Phase 2B3a seams, immutable Phase 2A carrier, and
  completed marker-present Free Phase 2B2.
- Product lineage: ordinary Free V4 -> ordinary Paid V3
  `recommendation_forensics_v1` / `combined_geo_report_v3` only.
- V1/V2, formal Paid V4, corrections, replacements, artifact refresh,
  historical jobs/reports, and already-created marker-absent authorities remain
  legacy and out of scope.

### Exact Phase 2B3b production allowlist

1. `packages/ai-report-engine/src/report-semantic-review.ts`
   - Extend only the Paid output/receipt contract with a complete reviewed
     source-selection draft and its canonical hash.
   - Enforce exact ordered catalog coverage, ID/evidence ownership, expected
     provider/model identity, and cross-consistency between the draft and
     semantic annotations.
   - Do not change Free V4 output meaning or add a provider operation.
2. `packages/ai-report-engine/src/report-semantic-review-manifests.ts`
   - Add pure Paid V3 application and projection-verification helpers.
   - Apply declared field corrections, mechanically construct Q2/Q3
     `geoDiagnosis` from exact answer annotations, validate the reviewed
     source-selection draft through the existing deferred parser, and preserve
     every non-prose field.
3. `packages/ai-report-engine/src/combined-geo-report-v3.ts`
   - Carry a structurally parsed Paid semantic-review receipt on reviewed V3
     reports.
   - A receipt-bearing report uses deferred customer-prose parsing and verifies
     the Paid lifecycle/receipt shape; a receipt-absent report keeps the exact
     legacy parser behavior.
4. `apps/web/src/worker/answer-first-v3.ts`
   - Export/thread only the already-defined deferred answer-card draft and
     resume authority required by the Paid integration.
   - Marker-absent answer generation and checkpoint behavior remain unchanged.
5. `apps/web/src/worker/source-selection-diagnosis.ts`
   - Admit only the complete, already reviewed source-selection draft into the
     existing deferred structural/evidence validator.
   - It may not invoke the legacy constructor in marker-present mode.
6. `apps/web/src/worker/report-v4-free-teaser.ts`
   - Add marker-aware Paid seed extraction that re-parses and externally
     re-verifies the exact reviewed Free Q1 checkpoint/projection.
   - Free generation, metrics, prompts, review calls, and ready-state writes
     must not change.
7. `apps/web/src/report/combined-artifact-readiness.tsx`
   - Add receipt-aware reviewed-report preparation/materialization seams.
   - Marker-present materialization uses deferred structural parsing and the
     verified receipt; marker-absent legacy ordering and bytes remain unchanged.
8. `apps/web/src/worker/paid-v3-semantic-review.ts` (new)
   - Own exact Paid manifest/catalog construction, the single injected
     `websiteSynthesis` review invocation, Free Q1 continuity checks, pure
     application, final-report projection verification, and model-free resume
     verification.
9. `apps/web/src/worker/processor.ts`
   - Read only the immutable root marker, thread deferred mode through the
     already-prepared Paid seams, persist the reviewed projection atomically,
     and enforce pre-materialization and pre-terminalization re-verification.
10. `docs/ACTIVE-CHANGE-SCOPE.md`
    - Record only scope status, measured outcome, budgets, and acceptance
      evidence.

Maximum production-code diff across the nine named source files:
`+2,800/-650` lines. Documentation is excluded. This is a hard ceiling, not an
implementation target. No unlisted production file may change.

### Exact Phase 2B3b test allowlist

1. `packages/ai-report-engine/src/report-semantic-review.test.ts`
2. `packages/ai-report-engine/src/report-semantic-review-manifests.test.ts`
3. `packages/ai-report-engine/src/report-semantic-review-provider-adapter.test.ts`
4. `packages/ai-report-engine/src/combined-geo-report-v3.test.ts`
5. `apps/web/src/worker/answer-first-v3.test.ts`
6. `apps/web/src/worker/source-selection-diagnosis.test.ts`
7. `apps/web/src/worker/report-v4-free-teaser.test.ts`
8. `apps/web/src/report/combined-artifact-readiness.test.tsx`
9. `apps/web/src/worker/paid-v3-semantic-review.test.ts` (new)
10. `apps/web/src/worker/processor.test.ts`
11. `apps/web/src/worker/processor-contract.test.ts`
12. `apps/web/src/db/recovery-state.postgres.test.ts`

Maximum test diff across the twelve named test files: `+3,800/-850` lines. A
verification-only amendment may change only these named tests under the
repository rule and cannot weaken a gate, add a runtime caller, or change
production behavior.

### Locked semantic authority and application behavior

1. Root marker selection is the only route selector. Environment variables,
   nested objects, timestamps, job age, retry state, provider availability, or
   the presence of a partial projection may not infer or activate reviewed
   mode. Unknown marker values fail closed. A receipt-shaped report by itself
   is never sufficient to select the Worker generation, resume, preparation,
   or materialization route.
2. Marker-absent Paid V3 executes the exact pre-2B3b route. It must not contain
   a Paid semantic projection or receipt and must not invoke any new helper.
3. Marker-present page analysis, website synthesis, public-source draft
   construction, answer-first collection, per-question diagnosis, combined
   parsing, and artifact preparation use their approved deferred seams. They
   retain JSON/schema, URL, evidence, excerpt, ID, hash, leakage, and
   cardinality checks while suppressing only program-owned customer-meaning
   judgments.
4. The accepted marker-bearing Free checkpoint is re-read before any Paid
   answer or diagnosis call. Its root marker, report, question-set ID/content
   identity, Q1 question, answer result/card, sources, answer/source hashes,
   `geoDiagnosis`, V4 diagnosis, admission evidence identity, semantic input,
   output, applied projection, and receipt must reverify exactly.
5. Paid Q1 is read-only. Q1 provider calls and Q1 diagnosis-enhancer calls are
   exactly zero. Paid answer annotations and final Q1 content must agree with
   the accepted Free Q1 semantic authority; they cannot correct, replace, or
   reinterpret it.
6. Questions remain immutable. `duplicate`, `not_responsive`, `blocked`,
   missing, ambiguous, contradictory, unknown-ID, cross-owner, or reordered
   review results fail closed; the program may not rewrite a question and keep
   its previous evidence.
7. The one Paid review call uses the already locked `websiteSynthesis`
   operation/model identity. It both reviews/corrects the declared Paid prose
   and returns the complete source-selection draft. No second semantic model,
   field-level correction loop, local deletion repair, or fallback call is
   allowed.
8. The source-selection catalog is constructed only from exact question,
   source, evidence, target-page, profile, factor-slot, and action-slot
   identities. The model supplies every customer-prose and semantic value
   needed by the final diagnosis, including contribution role and summary,
   basis/confidence, factor classification and observation, target state and
   comparison, profile/audit/status, aggregate pattern prose, action
   family/priority/title/rationale, and limitation prose.
9. The reviewed source-selection draft must have exact catalog coverage/order
   and exact semantic agreement with its annotations. Its URLs, excerpts,
   evidence references, question/source/profile/action ownership, enums,
   cardinalities, and hashes are program-validated. The legacy
   `buildSourceSelectionDiagnosisV1` semantic constructor may not run, persist,
   materialize, terminalize, or serve as fallback for a marker-present job.
10. Pure application constructs Q2/Q3 target presence, first-sentence
    position, target roles, competitor IDs, cited ownership, and retest
    identity only from verified annotations plus exact structural catalogs. It
    may not use aliases, keywords, character counts, regexes, ordinal meaning,
    ownership-category shortcuts, or text length.
11. Every Paid customer-prose field that exists before the review call has
    exactly one ordered manifest entry with original-text hash, mutability,
    question owner, and allowed evidence/source IDs. Source-selection prose
    returned by the same call is covered by the canonical review/draft hash and
    catalog cross-verification. No unreviewed customer prose may be appended
    after the call except deterministic rendering of already verified values.
12. The final `CombinedGeoReportV3` carries the verified Paid receipt. Only a
    caller that has already verified the matching root marker and complete
    root-bound persisted projection may use that receipt to select deferred
    artifact parsing. Receipt absence selects legacy parsing; a detached,
    forged, or merely shape-valid receipt cannot bypass legacy semantic gates.
    After root-bound verification, the final reviewed artifact never re-runs
    language wordlists, terminology substitution, causal/ranking regexes,
    answer responsiveness, alias classification, or other programmatic
    semantic gates.

### Exact input, receipt, checkpoint, and artifact binding

The canonical Paid review input and persisted projection must bind:

- lifecycle, locale, target identity, expected provider/model, immutable three
  questions, exact ordered field manifest, sources, evidence, entities, answer
  subjects, and complete source-selection catalog;
- report/order/job/original-paid-job IDs, artifact contract/revision ID/revision,
  question-set ID and content identity, and root marker value;
- exact reviewed Free Q1 input/output/applied/receipt hashes, question, answer,
  diagnosis, source/evidence identities, answer/source hashes, and admission
  snapshot identity;
- answer-first identity, answer/source hashes, per-question diagnosis identity,
  public-source and provider-discovery checkpoint/snapshot identities;
- technical/AI foundation hashes, evidence-asset IDs/content hashes, commercial
  snapshot identities, and every non-manifest prepared-report field.

The verified receipt must bind the exact input hash, review hash, expected
provider/model, `pass|corrected` decision, ordered field-coverage hash,
applied-prose hash, annotations hash, source-selection-draft hash, unchanged
non-prose projection hash, and final reviewed-report-projection hash. The
canonical final reviewed-report projection is the complete final
`CombinedGeoReportV3` with its semantic-review receipt omitted. Its hash is
computed before the receipt is attached and is always recomputed from that
receipt-excluded projection, so the receipt never hashes itself.

The first `artifact_verification` checkpoint for a marker-present Paid job must
atomically contain:

- the exact corrected `CombinedGeoReportV3`;
- immutable commercial snapshot refs; and
- one complete Paid semantic projection containing the canonical input,
  parsed output, pure applied result/receipt, and final reviewed-report hash.

No HTML render, Chromium/PDF operation, storage write, artifact activation, or
terminalization may occur before that checkpoint write succeeds. The existing
checkpoint CAS/revision writer remains the only persistence boundary; no
schema, table, column, transaction meaning, or direct SQL update is added.

A resume from `artifact_verification` or `terminalization` must:

1. read the root marker and require the matching complete projection;
2. rebuild and reverify Free Q1 continuity, catalogs, input, output, applied
   receipt, non-prose projection, source-selection draft, and final report hash;
3. make zero search, page-analysis, synthesis, answer, diagnosis, reviewer, or
   source-selection semantic calls;
4. reverify immediately before
   `materializePreparedCombinedArtifactV3`; and
5. reverify the persisted report equals `ready.report` immediately before the
   unchanged terminalization function is called.

Marker-present partial projection, marker-absent projection, stale report,
missing receipt, or any identity/hash mismatch fails closed without artifact
or commercial success.

### Phase 2B3b acceptance matrix

1. **Contract completeness:** focused contract tests prove every Paid prose
   field and every required source-selection value has exactly one manifest,
   catalog, annotation, or reviewed-draft owner. Missing, extra, reordered, or
   cross-owned coverage fails.
2. **Legacy equality:** paired tests prove marker absence preserves exact
   routing, prompt/model counts, checkpoint writes, report object, parser
   behavior, materialization order, and artifact bytes at the integration
   seams. A repository non-test callsite audit must account for all deferred
   selections and show they are root-marker guarded.
3. **Free continuity:** marker-aware tests tamper individually with the Free
   marker, question set, Q1 text, answer/source hashes, source/evidence IDs,
   diagnosis, admission identity, model, input/output/applied projection, and
   receipt. Every case fails before a Paid model call. Valid Q1 answer and
   diagnosis call counts are zero.
4. **Single review:** a fresh marked Paid fixture invokes exactly one
   `websiteSynthesis` semantic review after all required drafts/catalogs exist.
   Transport exhaustion, malformed JSON, wrong model, blocked output,
   incomplete fields, or incomplete source-selection output produces no
   artifact side effect and no local repair/fallback.
5. **Pure application:** tests prove Q2/Q3 `geoDiagnosis` and the complete
   `SourceSelectionDiagnosisV1` equal only verified model annotations/output
   plus structural catalogs. Mixed-language brands and new professional terms
   pass without a program wordlist edit.
6. **Tamper rejection:** separate tests alter input hash, field order/text hash,
   evidence/source ownership, annotation, source-selection draft, applied
   prose, non-prose field, receipt, model identity, snapshot identity, artifact
   revision, and final report hash. All fail closed.
7. **Atomic checkpoint ordering:** mocked Worker integration proves the
   corrected report and full projection enter one successful
   `artifact_verification` checkpoint before any render/PDF/storage call.
8. **Persisted resume:** the allowlisted disposable PostgreSQL recovery test
   persists a genuine marker-present checkpoint through the existing CAS
   boundary, injects failure after that boundary, then resumes with zero model
   calls and the same report/projection. A fabricated in-memory checkpoint
   alone is insufficient evidence.
9. **Materialization and terminalization:** receipt/projection verification is
   observed immediately before materialization and again before terminalization;
   `ready.report` exactly equals the persisted report, while structural,
   evidence, safe-URL, HTML-completeness, PDF-readiness, and storage checks
   remain active.
10. **Repository gates:** all focused tests pass, followed by `npm test`,
    `npm run lint`, `npm run build`, and `git diff --check`. Before one local
    commit, compare every changed path and measured numstat with this allowlist
    and both budgets, then obtain one independent final `CONFORMANT` verdict.

### Forbidden subsystems, external actions, and stop rules

Forbidden production changes include schema/migrations, database transaction
meaning, commerce/payment/credit/refund/email/access, terminalization semantics,
crawling, search fanout, provider discovery, passage selection, eligibility,
evidence grading, entity resolution, provider adapters, provider/model
configuration, operation identity, environment activation, dependencies, UI
redesign, V1/V2, Paid V4, corrections, replacements, artifact refresh, and
historical authorities.

Authorized external actions: none. Tests may use mocks and an explicitly
disposable local PostgreSQL database only. The allowlisted PostgreSQL suite may
create and delete isolated test-only report/job/checkpoint fixture rows and
simulate recovery inside that disposable database; those rows are not customer,
historical, Staging, or production authorities. No live model call, crawl,
non-test report/job creation or recovery, business/Staging/production database
mutation, Sandbox payment, refund, email, Docker build, deployment, push,
publication, or marker activation is authorized.

After explicit approval of this exact FROZEN scope, ordinary implementation,
debugging, and verification inside the allowlist continue automatically. Stop
as `DEVIATION_REVIEW_REQUIRED` if any unlisted production file is required; the
contract cannot express the complete reviewed source-selection draft without a
second model call; marker-absent equality or model-free resume cannot be proved;
a forbidden subsystem/external action is needed; either hard budget is
exceeded; or two repairs do not reduce the failing acceptance set before a new
route is considered.

Passing all acceptance gates authorizes exactly one local Phase 2B3b commit.
It does not authorize push, deployment, marker seeding, protected-Staging, a
real report/model run, or Phase 3. Normal marker activation, candidate image,
protected-Staging Free -> Paid acceptance, Sandbox commerce, production
activation, legacy removal, and rollback-image policy remain separately scoped.

---

## ReportSemanticReview staged program - Phase 2B2 marker-present Free V4 integration

Status: `COMPLETE` - the approved marker-present Free V4 integration and exact
MiMo answer-deferral amendment are implemented and locally verified. This
completion authorizes neither marker activation nor Phase 2B3 Paid V3
integration.

### APPROVED Phase 2B2 amendment - explicit MiMo answer deferral

Status: `APPROVED` - explicit user approval for this exact amendment was
received on 2026-07-23. Only the two added paths and the already approved
explicit request-threading seams may change; the remainder of the frozen
amendment stays binding.

The current adapter calls the legacy language parser and uses a Chinese prompt
that rejects all English terms before the marked Free worker can perform its
explicit deferred parse. Mocked worker tests cannot prove this real boundary.
The minimum amendment adds exactly these paths:

- Production: `apps/web/src/public-search-adapters/mimo/generative-answer.ts`
- Paired test: `apps/web/src/public-search-adapters/mimo/generative-answer.test.ts`

The production addition is limited to explicitly threading the existing
`semanticValidation` request value through this adapter. Its default remains
`legacy`. Only an explicitly marked request may use a prompt that asks for
natural requested-locale prose while preserving appropriate brands and
professional terms, and may parse the returned answer with `deferred` semantic
validation. The marker-absent prompt, parser, correction retry, errors, source
handling, and transport behavior must remain exactly legacy. The amendment
must not use the structured-provider replacement route, add an operation or
configuration source, infer activation from locale/environment/nested state,
or perform a real external call.

Additional hard budgets: production `+60/-25`; paired test `+140/-40`.
Acceptance requires mocked proof that marked mixed-language brand and industry
terms are not rejected by character/language heuristics and that retry remains
limited to structural malformed output, plus exact unmarked legacy prompt,
parser, and retry regression. All existing Phase 2B2 acceptance remains in
force.

### Authority, baseline, and objective

- Design authority:
  `docs/superpowers/specs/2026-07-23-report-semantic-review-staged-rollout-design.md`.
- Baseline branch: `codex/v4-answer-optimization-scope-reset`; baseline HEAD:
  `dd3d644759e7664b0bd9565871001af61ea2a7ba`.
- Active target: inactive, marker-present Free V4 only. Normal production Free
  creation remains marker-absent; no environment, timestamp, nested checkpoint,
  implicit, or configuration activation source may be added.
- V1/V2, Paid V3/2B3, artifacts/UI, schema/migrations, payment/credit,
  historical jobs, Staging/deployment, and old-heuristic removal are excluded.

For a present root `report-semantic-review-v1` marker, run exactly one unified
review after the three questions, exact persisted observation snapshots/results,
Q1 answer/sources, and Q1 V4 diagnosis exist, and before the Free teaser is
ready. Apply only verified corrections/annotations, derive Free metrics by
deduplicated observation group, persist a fully verifiable review projection in
the Free checkpoint, and fail closed. Marker-absent Free jobs retain the exact
existing route, checkpoint, prose, metrics, model calls, and legacy semantics.

### Exact Phase 2B2 production allowlist

- `packages/ai-report-engine/src/report-semantic-review.ts`
- `packages/ai-report-engine/src/report-semantic-review-manifests.ts`
- `packages/ai-report-engine/src/generative-search-answer.ts`
- `packages/ai-report-engine/src/open-geo-answer-v3.ts`
- `packages/ai-report-engine/src/report-v4-diagnosis.ts`
- `packages/public-search-observer/src/business-questions.ts`
- `apps/web/src/db/business-questions.ts`
- `apps/web/src/worker/report-v4-free-teaser.ts`
- `apps/web/src/worker/processor.ts`
- `apps/web/src/worker/report-v4-diagnosis-enhancer.ts`
- `apps/web/src/report-v4/mimo-provider.ts`
- `docs/ACTIVE-CHANGE-SCOPE.md`

Maximum production-code diff across the eleven named source files: `+1,750/-350`
lines. Documentation is excluded. No other production path may change; in
particular `schema.ts`, model runtime/config, provider configuration, artifact,
Paid, commerce, route, UI, or migration files are forbidden.

### Exact Phase 2B2 test allowlist

- `packages/ai-report-engine/src/report-semantic-review.test.ts`
- `packages/ai-report-engine/src/report-semantic-review-manifests.test.ts`
- `packages/ai-report-engine/src/generative-search-answer.test.ts`
- `packages/ai-report-engine/src/open-geo-answer-v3.test.ts`
- `packages/ai-report-engine/src/report-v4-diagnosis.test.ts`
- `packages/public-search-observer/src/business-questions.test.ts`
- `apps/web/src/db/business-questions.test.ts`
- `apps/web/src/worker/report-v4-free-teaser.test.ts`
- `apps/web/src/worker/processor.test.ts`
- `apps/web/src/worker/report-v4-diagnosis-enhancer.test.ts`
- `apps/web/src/report-v4/mimo-provider.test.ts`

Maximum test diff across these files: `+2,500/-450`. A verification-only
amendment may alter only these named test files under the repository rule; it
cannot add a production path or weaken an acceptance gate.

### Locked Phase 2B2 behavior

1. Read only the immutable root marker already persisted on the current job and
   thread it explicitly through `withFreeTeaserAfterAdmission`; no activation
   call/source is permitted. Marker absence preserves existing behavior.
2. Marker-present observations must load and bind the exact persisted snapshot
   observations/results on retry. Do not call `measurePresence`; calculate
   target/competitor totals only from accepted reviewer annotations, deduped by
   observation ID. Missing legacy metrics must not cause observation replay.
3. Marker-present question confirmation retains exactly-three, bounds,
   privacy/contact/secret safety, neutralization, and identity/hash checks, but
   defers normalized-string semantic-distinctness to the unified reviewer.
4. Marker-present answer parsing/hashing and Q1 diagnosis use structural,
   ownership, URL, leakage, cardinality, and deterministic identity checks
   only. They must bypass character/language, alias, and other semantic
   heuristics. Unmarked behavior remains legacy.
5. The unified review owns all Free customer-prose semantics, including Q1
   relevance, target/competitor roles/positions/entities and diagnosis prose
   required by the later immutable Paid Q1. If the current contract lacks a
   needed structured datum, extend it only within this allowlist and bind it to
   exact question/source/evidence/observation IDs; never synthesize a semantic
   placeholder.
6. Marker-present V4 diagnosis regex checks and local correctable-field repair
   loops are bypassed. Structural priorities/cardinality, evidence ownership,
   URLs, and leakage safety remain enforced. Provider transport retry may
   remain; field-by-field semantic retry/deletion/fallback may not.
7. Invoke the existing injected MiMo structured mechanism with the exact locked
   `websiteSynthesis` model identity; no new operation, config snapshot,
   environment key, client, or real call. Tests use mocks only.
8. Before ready, verify and persist the actual corrected checkpoint projection
   plus review input/output/receipt sufficient to recompute marker/version,
   input/model identity, field/annotation coverage, hashes, non-prose hash,
   and every observation/question/source/evidence owner. A receipt alone is
   insufficient. Passing persisted reviews may be verified/reused; malformed,
   blocked, model-mismatched, or transport-failed review cannot become ready or
   fall back to legacy semantics.

### Phase 2B2 acceptance

1. Mocked marker-present Free E2E proves exactly one review after all required
   inputs, correction application, full checkpoint verification, annotation
   metrics, and immutable retry/reuse.
2. Tests prove marker-absent byte/checkpoint seam regression, no activation
   import/call, no legacy `measurePresence`, string-distinctness, answer
   language/character, alias diagnosis, diagnosis regex, or local semantic
   repair on the marked path.
3. Tests cover blocked/malformed/model-mismatch/transport failure, ownership
   tampering, stale/corrupt review data, no-ready fail-closed behavior, and
   required Free Q1 semantic data for later Paid continuity.
4. Run focused tests, `npm test`, `npm run lint`, `npm run build`, and
   `git diff --check`; search for runtime activation and non-allowlisted
   imports/references. Compare paths and numstat with both budgets before
   commit. Do not push.

### Automatic execution and hard stops

After explicit approval, ordinary scoped repair continues automatically. Stop
as `DEVIATION_REVIEW_REQUIRED` if any non-allowlisted path, activation source,
real provider/model call, model-operation/config/environment change, schema,
Paid/artifact/UI/commerce behavior, historical mutation, external action, or
budget expansion is required; if a full verifiable projection cannot be
persisted; or if two repairs do not reduce the acceptance set before a new
route is considered.

No live model call, crawl, report/job creation, database mutation outside
disposable tests, payment, credit, refund, email, Docker build, deployment,
push, or publication is authorized.

### Phase 2B2 implementation outcome

Status: `COMPLETE` - the inactive root marker now explicitly selects one
fail-closed Free V4 semantic review after the persisted three-question search,
Q1 answer, sources, and diagnosis exist. Marker-absent Free behavior remains on
the legacy path.

- The review projection persists and re-verifies the exact input, output,
  applied fields, receipt, model identity, field coverage, question/source/
  evidence/observation ownership, non-prose hash, and corrected ready data.
- Persisted observation snapshots are rebound to their cache, query, attempt,
  returned-result, and question authorities before any later model work.
  Metrics are derived only from accepted reviewer annotations grouped by
  persisted attempt ID.
- Marked answer and diagnosis drafts are structurally parsed and cross-bound to
  the current question set, target admission, sources, hashes, timestamps, and
  evidence before diagnosis/review continuation. A malformed partial state
  performs no later model call and cannot be written as ready.
- A reviewed checkpoint is parsed as ready and rebound to current external
  catalogs before `saveCheckpoint`. Blocked, malformed, model-mismatched,
  transport-failed, or stale review data fails closed.
- The explicit MiMo deferred request uses requested-locale natural-prose
  instructions that preserve appropriate brand and professional terms. Default
  and explicitly legacy requests retain the old prompt/parser/retry route.
- Changed-path audit found exactly 20 approved paths. Core production diff is
  `+771/-100` against `+1,750/-350`; core test diff is `+688/-22` against
  `+2,500/-450`. The MiMo amendment is `+14/-2` production and `+92/-0` test,
  within its separate budgets.
- Focused verification passed 12 files and 202 tests. Fresh full verification
  passed 299 files and 2,769 tests, with 46 files and 187 tests skipped by their
  existing rules. `npm run lint`, `npm run build`, and `git diff --check`
  passed. Independent final acceptance returned `CONFORMANT` with no blocker.
- No live provider/model call, crawl, report/job creation, historical mutation,
  database write outside disposable tests, payment, credit, refund, email,
  Docker build, deployment, push, publication, or marker activation occurred.
- This completion does not authorize Phase 2B3 Paid V3 integration, heuristic
  removal, protected Staging, production activation, or any external action.

---

## ReportSemanticReview staged program - Phase 2B1 offline reviewer core and manifests

Status: `COMPLETE` - the approved runtime-unreferenced offline reviewer core
and its local mock/fixture verification are complete. The user explicitly
approved the Phase 2B1 scope with `批准 Phase 2B1 FROZEN 范围并开始执行`. This
approval covers only Phase 2B1; Phase 2B2 and Phase 2B3 remain unapproved.

### Authority and baseline

- Design authority:
  `docs/superpowers/specs/2026-07-23-report-semantic-review-staged-rollout-design.md`.
- Active product lineage, when later activated: Free V4 pre-admission -> Paid
  V3 `combined_geo_report_v3` only. V1/V2, historical jobs/reports, formal
  Paid V4, payments, credits, database authority, deployment, and production
  activation are excluded.
- Baseline branch: `codex/v4-answer-optimization-scope-reset`.
- Baseline HEAD: `77b4d20de7104d1696df45e63071059a5122734f`.
- Existing Phase 1 and Phase 2A completion evidence remains historical and is
  not reopened by this scope.

### Phase 2B1 objective

Create a runtime-unreferenced offline reviewer core: extend the additive
`ReportSemanticReview` contract for catalog-bound structured semantic
annotations; build pure Free V4/Paid V3 manifests; build one provider-shaped
request/response adapter; and prove fixture/mock end-to-end review and pure
application. It must not run or be reachable from any real report lifecycle.

The structured result must cover exact catalog IDs for: Free observation/result
target/competitor/`ambiguous` classification; question distinctness; answer
relevance and entity roles; and evidence-use/source-selection annotations.
`ambiguous` is explicitly not a metric count. The program may validate only
structure, exact ID/catalog ownership, hashes, safe URLs, field coverage,
immutable ownership, and pure application integrity; it must not add lexical,
regex, character-ratio, substring, or other semantic inference.

### Exact Phase 2B1 production allowlist

- `packages/ai-report-engine/src/report-semantic-review.ts`
- `packages/ai-report-engine/src/report-semantic-review-manifests.ts` (new)
- `packages/ai-report-engine/src/report-semantic-review-provider-adapter.ts` (new)
- `packages/ai-report-engine/src/index.ts`
- `docs/superpowers/specs/2026-07-23-report-semantic-review-staged-rollout-design.md`
- `docs/ACTIVE-CHANGE-SCOPE.md`

Maximum production-code diff across the four `packages/ai-report-engine/src`
files: `+1,150/-90` lines. Documentation is excluded. No application, Worker,
database, report parser/builder, artifact, schema, configuration, dependency,
or model-profile/operation file may be modified.

### Exact Phase 2B1 test allowlist

- `packages/ai-report-engine/src/report-semantic-review.test.ts`
- `packages/ai-report-engine/src/report-semantic-review-manifests.test.ts` (new)
- `packages/ai-report-engine/src/report-semantic-review-provider-adapter.test.ts` (new)
- `packages/ai-report-engine/src/index.test.ts`

Maximum test diff across the four named test files: `+1,350/-120` lines. A
verification-only amendment may alter only these files under the repository's
existing test-only rule; it cannot add a production path or weaken a gate.

### Locked Phase 2B1 behavior

1. The adapter is a pure, injectable request/response boundary. Tests may use
   mock invokers only; implementation must not read environment variables,
   create a provider client, select a model operation, or issue network/model
   calls.
2. Free/Paid manifests enumerate customer prose and immutable catalogs without
   using wording heuristics. Exact question, source, evidence, observation, and
   result IDs must be supplied by caller-shaped input, not discovered from text.
3. Reviewer output is accepted only when every annotation references exact
   input catalog IDs with valid ownership and every field has exact ordered
   coverage. Unknown, duplicate, missing, cross-owner, or reordered IDs fail
   closed.
4. Pure application may mechanically derive Free target/competitor counts only
   from accepted exact classifications; `ambiguous` contributes to neither.
   It may not inspect text to create or alter classifications.
5. No runtime code may import any new/changed Phase 2B1 symbol. In particular,
   no Worker import/wiring, checkpoint mutation, report/artifact field,
   parser/builder integration, configuration snapshot, model operation,
   provider runtime/client, environment variable, or API route may change.
6. No real provider/model call, crawl, report/job creation, historical job
   mutation, database mutation, payment, credit, refund, email, Docker build,
   deployment, push, or publication is authorized.
7. Phase 2B2 (marker-present Free integration) and Phase 2B3 (marker-present
   Paid integration) are expressly unapproved. Marker-absent and
   marker-present runtime behavior must both remain untouched in this phase.

### Phase 2B1 acceptance

1. Focused tests cover catalog ID validity/ownership, exact annotation
   coverage/order, all three observation classifications, `ambiguous` exclusion,
   question distinctness, answer relevance/entity roles, evidence-use/source
   selection annotations, immutable ownership, manifest completeness, malformed
   responses, and a fixture/mock Free plus Paid end-to-end review/application.
2. Repository search proves no `apps/` production file imports the Phase 2B1
   symbols and no Worker/provider runtime/config/model-operation/checkpoint/report
   or artifact path is changed or newly references them.
3. Run focused package tests, `npm test`, `npm run lint`, `npm run build`, and
   `git diff --check`.
4. Before a local commit, compare complete changed paths and measured diffs to
   this allowlist and both budgets. Do not push.

### Automatic execution and hard stops

After explicit approval, ordinary scoped implementation/test repair continues
automatically. Stop as `DEVIATION_REVIEW_REQUIRED` if any code outside the
allowlist is required; if an app/Worker/provider-runtime/configuration/model
operation/checkpoint/report/artifact/schema/dependency change is needed; if a
real external call would be required; if the approved design or product
behavior must change; if either production budget is exceeded; or if two
consecutive repairs fail to reduce the acceptance set before a new route is
considered.

### Phase 2B1 implementation outcome

Status: `COMPLETE` - the additive review contract now carries immutable
observation/result text and hashes, catalog-bound two-axis target/competitor
annotations, answer-subject and field-level evidence ownership, annotation
receipt hashing, lifecycle-safe Free/Paid manifest wrappers, and one injected
offline review adapter. The implementation remains runtime-unreferenced.

- Cumulative changed-path audit from `77b4d20de7104d1696df45e63071059a5122734f`
  found exactly the nine Phase 2B1 allowlisted paths.
- Cumulative production package diff: `+265/-7` against the `+1,150/-90`
  hard budget. Cumulative named-test diff: `+105/-0` against `+1,350/-120`.
- Focused verification: four files and `93` tests passed; the
  `ai-report-engine` TypeScript build passed.
- Fresh repository verification: `299` test files passed and `46` skipped;
  `2754` tests passed and `187` skipped. `npm run lint`, `npm run build`, and
  `git diff --check` passed.
- Repository search found no `apps/` imports or references to Phase 2B1
  symbols. No Worker routing, checkpoint, report/artifact, schema,
  configuration, provider client, model operation, environment, or customer
  runtime path changed.
- No live model call, crawl, report/job creation, database mutation, payment,
  credit, refund, email, Docker build, deployment, push, or other external
  action occurred.
- This completion does not authorize Phase 2B2 marker-present Free V4
  integration, Phase 2B3 marker-present Paid V3 integration, protected
  Staging, production activation, or heuristic removal.

---

## ReportSemanticReview staged program - Phase 2A inactive checkpoint carrier

Status: `APPROVED` - on 2026-07-23 the user explicitly approved this exact
Phase 2A scope with "批准 Phase 2A FROZEN 范围并开始执行" after reviewing the
allowlist, budgets, locked behavior, and acceptance set. This approval does not
authorize Phase 2B, production activation, or any external action.

### Authority and baseline

- Design authority:
  `docs/superpowers/specs/2026-07-23-report-semantic-review-staged-rollout-design.md`.
- Approved carrier decision: optional `report-semantic-review-v1` at the root
  of the existing `scan_jobs.checkpoint` JSONB authority, seeded only when a
  job is created and immutable afterward.
- Active product lineage: Free V4 pre-admission -> Paid V3
  `combined_geo_report_v3` only.
- V1, V2, formal Paid V4, and all historical jobs remain unchanged.
- Baseline branch: `codex/v4-answer-optimization-scope-reset`.
- Baseline HEAD: `8d71aca5f2e25cf2c6ac68a63972d2c9b9cd5ddf`.

### Phase 2A objective

Add only the inactive, immutable checkpoint carrier needed by a later offline
semantic-review integration. Phase 2A may make the job-creation and checkpoint
persistence surfaces capable of carrying the marker, but the ordinary
production Free enqueue call must continue to omit it. Consequently, this
phase makes zero model calls and activates zero real Free or Paid jobs.

### Exact Phase 2A production allowlist

- `apps/web/src/db/report-semantic-review-activation.ts` (new)
- `apps/web/src/db/schema.ts`
- `apps/web/src/db/report-v4-admission-jobs.ts`
- `apps/web/src/db/jobs.ts`
- `apps/web/src/db/commercial-orders.ts`
- `docs/superpowers/specs/2026-07-23-report-semantic-review-staged-rollout-design.md`
- `docs/ACTIVE-CHANGE-SCOPE.md`

Maximum production-code diff across the five `apps/web/src/db` files:
`+420/-60` lines. Documentation is excluded. No other production/runtime path
may be modified.

### Exact Phase 2A test allowlist

- `apps/web/src/db/report-semantic-review-activation.test.ts` (new)
- `apps/web/src/db/report-v4-admission-jobs.test.ts`
- `apps/web/src/db/jobs.test.ts`
- `apps/web/src/db/commercial-orders-semantic-review.postgres.test.ts` (new)

Maximum test diff: `+850/-80` lines. A verification-only amendment may adjust
only these named test files under the repository's existing test-only rule; it
may not add another production file or weaken an acceptance gate.

### Locked Phase 2A behavior

1. Define one strict optional checkpoint field whose only accepted value is
   `report-semantic-review-v1`. Reject empty, unknown, non-string, nested, or
   alternate-version values when the carrier is inspected.
2. A Free V4 pre-admission job may receive the marker only as an explicit
   creation input. Persist it atomically in the initial `scan_jobs.checkpoint`
   JSONB value in the same insert that establishes the job identity.
3. The normal production call from free-preview terminalization must continue
   to omit the marker. Phase 2A must contain no active constant, environment
   lookup, timestamp boundary, deployment inference, site/job allowlist, or
   database fallback that turns it on.
4. The existing exactly-once Free insert may never upgrade an already-created
   marker-absent row or remove/change a present marker on a retry.
5. Every later checkpoint write must preserve the marker state from the
   persisted job row exactly. Adding, removing, or changing it after creation
   fails closed before the update commits. Marker-absent jobs otherwise retain
   their current checkpoint behavior.
6. Paid V3 job creation may copy a marker only from the unique completed or
   completed-limited Free V4 pre-admission job for the same report. A present
   marker additionally requires a ready Free teaser checkpoint whose
   `questionSetId` and `questionSetIdentity` match the exact locked Paid
   business-question-set row. Copy the marker into the Paid job's initial
   checkpoint within the existing verified-payment transaction.
7. If the Free marker is absent, Paid V3 creation preserves the current `{}`
   initial checkpoint and current behavior. If a marker is present but its
   lineage is incomplete or mismatched, creation fails closed; it must not
   silently drop the marker.
8. Paid fulfillment idempotency must verify that an already-created Paid job
   has the same marker state. It may not retrofit an existing job.
9. Do not change checkpoint recovery identity, stage transitions, payment or
   credit semantics, artifact contracts, report payloads, customer prose,
   model profiles, or provider routing.
10. Do not add a database column, constraint, trigger, migration, dependency,
    configuration variable, API input, administrator bypass, or historical
    data update.

### Phase 2A acceptance

1. Pure tests prove strict marker parsing, absent/present propagation, and
   rejection of invalid or mismatched versions.
2. Free enqueue tests prove explicit marker insertion, default absence,
   exactly-once retries without retrofit, and no marker passed by the normal
   production terminalization call.
3. Checkpoint tests prove marker-preserving writes succeed while late add,
   removal, and change fail before persistence; legacy marker-absent writes
   remain unchanged.
4. PostgreSQL tests prove one transactionally created Paid V3 job copies the
   marker only from exact ready Free/question-set lineage; absent lineage stays
   absent; mismatched lineage fails without creating a Paid job, credit side
   effect, or artifact revision.
5. Repository search proves there is no marker activation call, Worker branch,
   provider/model call, report/artifact field, environment switch, timestamp
   switch, or V1/V2 consumer.
6. Run focused Vitest/TypeScript checks, the relevant PostgreSQL test when its
   existing test database is available, `npm test`, `npm run lint`,
   `npm run build`, and `git diff --check`.
7. Before a local commit, compare the complete diff to this exact allowlist and
   both budgets. Do not push.

### Phase 2A implementation outcome

Status: `COMPLETE` - the inactive checkpoint-lineage carrier is implemented
locally and the normal production enqueue path remains marker-absent.

- Complete changed-path audit found exactly the five approved production files,
  four approved test files, and this scope document; no out-of-scope path.
- Measured production diff: `+223/-12` against the `+420/-60` hard budget.
- Measured test diff: `+420/-1` against the `+850/-80` budget.
- Focused verification: `29` tests passed. The `5` disposable PostgreSQL tests
  were discovered and skipped because neither the process nor the repository's
  local env files provide `OGC_TEST_DATABASE_ADMIN_URL`; no real database was
  used as a substitute.
- Repository verification: `297` test files passed and `46` skipped; `2747`
  tests passed and `187` skipped. `npm run lint`, `npm run build`, and
  `git diff --check` passed.
- Repository search found explicit carrier activation only in approved tests.
  The production free-preview terminalization call still supplies no activation
  option. No Worker, provider, model, report, artifact, environment, timestamp,
  V1, or V2 consumer was added.
- No live scan, model call, report generation, historical job mutation,
  payment, credit, database migration, deployment, push, or external action was
  performed.
- Phase 2A completion grants no authority for Phase 2B or activation.

### Automatic execution and hard stops

After explicit Phase 2A approval, conformant implementation and ordinary
scope-contained repair continue automatically. Stop as
`DEVIATION_REVIEW_REQUIRED` if implementation needs any non-allowlisted path,
database migration/schema meaning, production activation source, Worker or
provider integration, customer-output change, external action, historical-row
mutation, or production-code budget expansion.

No live scan, model call, report generation, job replay/recovery, database
mutation outside disposable tests, payment, credit, refund, email, Docker
build, deployment, push, or publication is authorized.

---

## ReportSemanticReview staged program - Phase 1 additive contract foundation

Status: `APPROVED` - on 2026-07-23 the user explicitly approved this exact
Phase 1 scope with "可以，开始执行" after reviewing the staged design and
allowlist. This approval covers only the additive, runtime-unreferenced
contract foundation and its local verification. It does not authorize any
later phase or external action.

### Approved design authority

- `docs/superpowers/specs/2026-07-23-report-semantic-review-staged-rollout-design.md`
- Active product path: Free V4 teaser -> Paid V3
  `combined_geo_report_v3` only.
- V1 and V2 product flows are retired and must remain unchanged.
- Baseline branch: `codex/v4-answer-optimization-scope-reset`.
- Baseline HEAD before the design/scope documentation diff:
  `be214b02be11d6fe4b80f565793b85eed90d3561`.

### Phase 1 objective

Create the additive, runtime-unreferenced `ReportSemanticReview` contract
foundation: types, canonical input/output hashing, strict parsing, exact field
coverage and ownership validation, non-prose integrity verification, and safe
application of corrections to mutable manifest fields.

Phase 1 must not wire the contract into a Worker, provider, checkpoint,
configuration snapshot, report builder, artifact parser/readiness gate, UI, or
runtime route. It makes zero model calls and changes zero customer output.

### Exact Phase 1 allowlist and budget

- `packages/ai-report-engine/src/report-semantic-review.ts` (new)
- `packages/ai-report-engine/src/report-semantic-review.test.ts` (new)
- `packages/ai-report-engine/src/index.ts`
- `packages/ai-report-engine/src/index.test.ts`
- `docs/superpowers/specs/2026-07-23-report-semantic-review-staged-rollout-design.md`
- `docs/ACTIVE-CHANGE-SCOPE.md`

Maximum production diff across `report-semantic-review.ts` and `index.ts`:
`+750/-10` lines. Maximum test diff across the two test files: `+950/-20`
lines. Documentation is excluded from these code budgets. No other path may be
modified.

### Locked Phase 1 contract behavior

1. Define one explicit review version for the future Free/Paid integration,
   but do not add an activation marker to any current configuration or job.
2. Canonical input contains lifecycle, locale, target identity, exact ordered
   field manifest, original text and hash, mutable/read-only state, exact
   question/evidence/source ownership, non-prose projection hash, and expected
   model identity.
3. Output contains exactly one result per field, original hash, decision,
   optional corrected text for mutable fields, evidence/source references,
   semantic issue codes/reason, retained original terms/reasons, report-level
   question-distinctness result, and overall decision.
4. Reject missing, duplicate, extra, reordered, wrong-hash, wrong-owner,
   unknown-ID, immutable-field, invalid-decision, or structurally invalid
   output. Applying accepted corrections must preserve the non-prose hash.
5. The contract may express model semantic decisions, but Phase 1 code must
   not implement lexical/regex/character-ratio/subsequence heuristics for
   language, relevance, brand legitimacy, causality, exaggeration, or evidence
   meaning.
6. The package export is additive. No existing export behavior, parser,
   report type, or artifact contract may change.

### Phase 1 acceptance

1. Tests cover pass, correction, blocked review, mixed-language/unseen terms,
   full field coverage, ordering, duplicate/extra paths, original hash,
   immutable correction, question/source/evidence ownership, retained-term
   reasons, model identity, non-prose hash, and malformed input/output.
2. A repository search proves no production file outside the package index
   imports or calls `ReportSemanticReview`.
3. Run focused package tests, `npm test`, `npm run lint`, `npm run build`, and
   `git diff --check`.
4. Before a local Phase 1 commit, compare the complete diff against this exact
   allowlist and both code budgets. Do not push.

### Automatic execution and hard stops

After explicit Phase 1 approval, conformant units continue automatically.
Ordinary scoped defects are repaired within the same unit. Stop as
`DEVIATION_REVIEW_REQUIRED` when any of the following occurs:

- a required path is outside this allowlist;
- a runtime import/wiring, provider/model call, checkpoint/configuration,
  customer-output, schema, dependency, external action, or historical-data
  change is required;
- two consecutive repairs do not reduce the failing acceptance set and a new
  route is being considered;
- the production diff budget is exceeded or the approved design must change.

No live scan, model call, job recovery/replay, database mutation, payment,
credit, refund, email, Docker build, deployment, push, publication, or report
generation is authorized.

### Phase 1 implementation outcome

Status: `COMPLETE` - the approved additive contract foundation is implemented
locally without runtime wiring.

- Complete changed-path audit: exactly the four approved code/test paths plus
  this scope file; no out-of-scope path.
- Measured production diff: `+745/-0` against the `+750/-10` hard budget.
- Measured test diff: `+423/-0` against the `+950/-20` budget.
- Focused TypeScript and Vitest verification: `86/86` tests passed.
- Repository verification: `296` test files passed and `45` skipped; `2730`
  tests passed and `182` skipped. `npm run lint`, `npm run build`, and
  `git diff --check` passed.
- Repository import search found zero production consumers outside the
  additive package-root export. No Worker, provider, model, checkpoint,
  configuration, report, artifact, UI, database, or external action changed.
- Phase 1 completion grants no authority for Phase 2 or any external action.

### Later phases are not authorized

- Phase 2: offline integration and immutable version-carrier proof.
- Phase 3: one separately approved protected-Staging candidate/report.
- Phase 4: separately approved future-job production activation.
- Phase 5: separately scoped removal of obsolete current-product heuristics
  after no active authority depends on them.

Each later phase requires a new exact `FROZEN` allowlist, budget, acceptance
set, and explicit user approval. Phase 1 approval cannot be reused.

### Phase 2 read-only carrier proof

Status: `DEVIATION_REVIEW_REQUIRED` - no Phase 2 production or test file has
been modified.

The approved design preferred the existing `report_v4_config_snapshots`
lineage and required read-only proof that Free V4 and Paid V3 already had a
shared immutable carrier capable of fixing the semantic-review version before
each job starts. The current active path does not satisfy that premise:

- `report-v4-admission-jobs.ts` creates the Free V4 pre-admission `scan_jobs`
  row without a configuration snapshot or initial checkpoint value, so the
  JSONB checkpoint begins as `{}`.
- `FreeTeaserCheckpointV1` records Admission, foundation, question-set,
  observation, answer, and diagnosis identities, but has no configuration or
  semantic-review contract identity. Its first value is written only after
  question generation has begun.
- `commercial-orders.ts` creates the Paid V3 `scan_jobs` row with the locked
  business-question-set ID but without a configuration snapshot or initial
  checkpoint value.
- Paid V3 later reloads the completed Free teaser checkpoint to seed Q1. That
  proves report/question/evidence continuity, but it is not a version authority
  fixed in the Paid job at creation time.
- `report_v4_config_snapshots` is bound to the formal V4 core-job/order
  lineage. The schema requires non-V4 (`combined_geo_report_v1` through V3)
  artifact revisions to keep `config_snapshot_id` null, so the existing V4
  snapshot cannot simply be attached to the active Paid V3 artifact.

Continuing with the preferred carrier would therefore require a new schema
meaning or a migration, while silently switching to a timestamp, environment
flag, deployment boundary, denylist, or implicit adoption rule is expressly
forbidden by the approved design.

The smallest conformant design revision is **checkpoint-lineage activation**:

1. Atomically seed `report-semantic-review-v1` into the existing JSONB
   checkpoint when a new Free V4 pre-admission job is created.
2. Treat absence as the immutable legacy behavior for already-created and
   in-flight Free jobs; never add the marker later.
3. When the Paid V3 job is created, load the exact completed Free checkpoint,
   verify its report/question-set lineage, and copy the same marker into the
   Paid job's initial JSONB checkpoint in the payment transaction.
4. Require later Free/Paid review receipts only when that job-bound marker is
   present. Never infer activation from wall-clock time or current environment.

This option needs no new database column and preserves historical rows, but it
changes the approved carrier architecture and therefore needs explicit user
approval before a Phase 2 `FROZEN` allowlist can be written.

The stronger alternative is a new relational activation authority shared by
the Free and Paid jobs, with a schema migration and database constraints. It
offers more database-level enforcement but materially expands the migration,
rollback, and verification surface.

No model call, live scan, job mutation, payment, database mutation, deployment,
push, or external action was performed during this proof.

---

## Archived monolithic ReportSemanticReview proposal

Status: `SUPERSEDED` - this initial all-at-once proposal is retained only as
audit history. Its allowlist and budgets confer no authority. The staged design
and the active Phase 1 `FROZEN` scope above replace it.

### Current baseline and preserved authority

- Branch `codex/v4-answer-optimization-scope-reset` at
  `be214b02be11d6fe4b80f565793b85eed90d3561` was clean when this scope was
  written. Existing committed scope and commerce history below this section
  are preserved unchanged.
- No production/runtime file, database row, report artifact, checkpoint, Paid
  job, model invocation, search observation, or protected-site state was
  changed by this audit.
- The rejected local repair is superseded: changing only
  `executiveSummary.overview`, `synthesis.ts`, a language whitelist, a regex,
  or a character ratio cannot satisfy this objective.
- Any existing Paid job remains evidence only. Resuming, repairing,
  terminalizing, replacing, or publishing it requires a later exact runtime
  authorization after the implementation and protected-Staging evidence pass.

### Read-only audit: current customer path

The selected current path is Free V4 teaser generation followed by Paid V3
`combined_geo_report_v3` fulfillment. The audit found these classes of
program-owned semantic judgment on that reachable path:

1. `report-language.ts`, `analysis.ts`, `synthesis.ts`,
   `generative-search-answer.ts`, `open-geo-answer-v3.ts`, and
   `combined-geo-report.ts` use word lists, character ratios, or repeated local
   correction passes to decide whether customer prose is natural and may
   delete prose that the program considers invalid.
2. `answer-first-v3.ts` uses provider/logistics regexes to decide whether Q1
   answers the question, and token overlap to select a supposedly relevant
   excerpt.
3. `open-geo-answer-v3.ts` and `report-v4-free-teaser.ts` infer target mentions,
   competitors, and customer-facing presence metrics from normalized substring
   matches.
4. `business-questions.ts` claims semantic distinctness after only normalized
   string equality, while other deterministic categorization and template
   choices are presented as semantic question quality.
5. `report-v4-diagnosis.ts`, `report-v4-customer-prose.ts`,
   `prohibited-claims.ts`, and `recommendation-forensic-v2-claims.ts` use
   regexes to judge SEO framing, causality, ranking, recommendation, language,
   and whether prose is customer-safe.
6. `source-selection-diagnosis-v1.ts` constructs customer explanations,
   evidence roles, gaps, patterns, and actions from length, digit, service-word,
   title, category, and substring heuristics.
7. `provider-claim-extraction.ts` asks a model to extract claims and then
   overrides its semantic result with an operating-mode synonym list and
   substring containment checks.
8. `public-source-forensics/report-builder.ts` goes beyond validation: domain
   presence and deterministic templates manufacture the customer verdict,
   comparison, exactly three priorities, vendor actions, acceptance criteria,
   and limitations before the final Paid artifact is assembled.
9. Final artifact readiness calls the same language gate again instead of
   verifying one authoritative semantic-review receipt.

The audit also found the same defect class in legacy or adjacent paths,
including `recommendation-forensic.ts`, V1 citation validation/opportunity
helpers, V1/V2 combined-answer language gates, the legacy production
recommendation builder, and provider passage/entity relevance scoring. The
user confirmed on 2026-07-23 that V1 and V2 are no longer in use. They are not
reachable as customer-prose validators in the selected Free V4 -> Paid V3
artifact lifecycle, are not a follow-on deliverable, and must remain unchanged.
Provider retrieval, passage ranking, and qualification are also separate from
the final customer-prose review and remain forbidden in this scope. This
distinction prevents a current-product repair from reviving or redesigning
retired product behavior and historical contracts.

### Locked ownership boundary

The model owns:

1. Natural language and whether translation is required.
2. Preservation of brands, product names, industry terms, mixed-language
   names, and the reason each retained original term is appropriate.
3. Whether an answer actually addresses its bound question.
4. Whether the three questions are semantically distinct.
5. Whether customer prose makes unsupported causal, ranking, probability,
   recommendation, or exaggerated claims.
6. Whether the prose faithfully expresses the cited evidence, including
   target/competitor presence, evidence role, source-selection diagnosis,
   priorities, actions, and limitations.
7. Corrections to every mutable customer-prose field in the review manifest.

Deterministic code owns only:

1. JSON/schema, field types, size bounds, enums, and exact cardinalities such
   as three questions, three factors, and three actions where the product
   contract requires them.
2. URL safety, source/evidence/question ID existence, exact ownership and
   cross-reference checks, exact source-excerpt binding, hashes, checkpoint
   identity, model identity, and non-prose projection integrity.
3. Explicit mechanical leakage bans for raw provider JSON, system/developer
   prompts, secrets, tool transcripts, and unknown or unsafe URLs. A regex may
   remain only for an unambiguous byte/syntax safety condition, never to infer
   language quality, answer relevance, brand legitimacy, causality, or evidence
   meaning.
4. Payment, credit, artifact, access, database transaction, terminalization,
   and exactly-once behavior.

### Locked review lifecycle and contract

1. Add one versioned `ReportSemanticReview` contract with a canonical input
   hash, provider/model identity, exact field manifest, original text hash for
   every field, mutable/read-only classification, allowed evidence and question
   IDs, per-field verdict and corrected text, retained-original terms and
   reasons, evidence references, issue codes, exact field coverage, overall
   decision, and a hash of all non-prose data.
2. Each report lifecycle gets exactly one semantic-review model call after all
   of that lifecycle's customer prose and evidence exist:
   - Free V4: after the three questions, observation evidence, Q1 answer/source
     card, and Q1 diagnosis are assembled, before the ready teaser checkpoint.
   - Paid V3: after website synthesis, all three answer/source cards, all three
     V4 diagnoses, the source-selection diagnosis, and the public-source report
     draft are assembled, before artifact materialization and terminalization.
3. The Paid review treats the already accepted Free Q1 question, answer,
   evidence identity, and reviewed prose as read-only continuity. It may review
   them for coverage but may not silently create a different paid Q1 result.
4. Questions are also immutable after their searches/evidence exist. If the
   model finds semantic duplication, the review blocks; it must not rewrite a
   question and leave old search/evidence IDs attached. Question regeneration
   would require a separately scoped pre-search workflow.
5. Apply model corrections only through the exact mutable field paths in the
   manifest. Reject missing, duplicate, extra, reordered, wrong-hash,
   wrong-owner, unknown-ID, immutable-field, non-prose, or structurally invalid
   output. The model cannot rewrite source originals, URLs, IDs, evidence,
   questions, hashes, cost/commercial fields, or checkpoint authority.
6. The review input uses the current locked `websiteSynthesis` model capability
   and its persisted model identity/budget. Do not add a required model-profile
   operation that would invalidate historical or in-flight configuration
   snapshots. `ReportSemanticReview` is a distinct logical contract and hash,
   not a new unversioned configuration fallback.
7. There is no field-by-field semantic repair loop and no programmatic fallback
   that deletes or rewrites prose. A transport or malformed-JSON failure follows
   the existing bounded provider failure policy and fails closed; one completed
   semantic review is the only semantic authority for that artifact lifecycle.
8. Persist the Free review in its checkpoint and the Paid review in the Worker
   checkpoint and final report. Readiness verifies review version, input hash,
   model identity, exact field coverage, pass state, applied-output hashes, and
   non-prose integrity. It does not rerun lexical, regex, or character-ratio
   semantic tests.
9. Historical artifacts remain parseable without pretending they have a review
   receipt. Only newly generated/reviewed Free V4 and Paid V3 artifacts may pass
   the new readiness boundary. No schema migration or historical-data rewrite
   is allowed.

### Exact production allowlist

- `packages/ai-report-engine/src/report-semantic-review.ts` (new)
- `packages/ai-report-engine/src/index.ts`
- `packages/ai-report-engine/src/report-language.ts`
- `packages/ai-report-engine/src/analysis.ts`
- `packages/ai-report-engine/src/synthesis.ts`
- `packages/ai-report-engine/src/generative-search-answer.ts`
- `packages/ai-report-engine/src/open-geo-answer-v3.ts`
- `packages/ai-report-engine/src/combined-geo-report.ts`
- `packages/ai-report-engine/src/combined-geo-report-v3.ts`
- `packages/ai-report-engine/src/recommendation-forensic-v2-claims.ts`
- `packages/ai-report-engine/src/source-selection-diagnosis-v1.ts`
- `packages/ai-report-engine/src/report-v4-diagnosis.ts`
- `packages/ai-report-engine/src/report-v4-customer-prose.ts`
- `packages/ai-report-engine/src/provider-claim-extraction.ts`
- `packages/public-search-observer/src/business-questions.ts`
- `packages/public-search-observer/src/prohibited-claims.ts`
- `apps/web/src/report-v4/mimo-report-semantic-review-provider.ts` (new)
- `apps/web/src/worker/report-semantic-review.ts` (new)
- `apps/web/src/worker/report-v4-free-teaser.ts`
- `apps/web/src/worker/answer-first-v3.ts`
- `apps/web/src/worker/source-selection-diagnosis.ts`
- `apps/web/src/worker/public-source-forensics.ts`
- `apps/web/src/public-source-forensics/report-builder.ts`
- `apps/web/src/worker/processor.ts`
- `apps/web/src/report/combined-artifact-readiness.tsx`
- `docs/ACTIVE-CHANGE-SCOPE.md` for this scope, approval state, measured
  budget, and final verification outcome only.

Maximum production diff across the allowlisted TypeScript files:
`+2,600/-1,300` lines. This is a hard ceiling, not a target. No other production
or runtime path may be touched.

### Initial test and fixture allowlist

- `packages/ai-report-engine/src/report-semantic-review.test.ts` (new)
- `packages/ai-report-engine/src/index.test.ts`
- `packages/ai-report-engine/src/report-language.test.ts`
- `packages/ai-report-engine/src/generative-search-answer.test.ts`
- `packages/ai-report-engine/src/open-geo-answer-v3.test.ts`
- `packages/ai-report-engine/src/combined-geo-report.test.ts`
- `packages/ai-report-engine/src/combined-geo-report-v3.test.ts`
- `packages/ai-report-engine/src/source-selection-diagnosis-v1.test.ts`
- `packages/ai-report-engine/src/report-v4-diagnosis.test.ts`
- `packages/ai-report-engine/src/report-v4-customer-prose.test.ts`
- `packages/ai-report-engine/src/provider-claim-extraction.test.ts`
- `packages/public-search-observer/src/business-questions.test.ts`
- `apps/web/src/report-v4/mimo-report-semantic-review-provider.test.ts` (new)
- `apps/web/src/worker/report-semantic-review.test.ts` (new)
- `apps/web/src/worker/report-v4-free-teaser.test.ts`
- `apps/web/src/worker/answer-first-v3.test.ts`
- `apps/web/src/worker/source-selection-diagnosis.test.ts`
- `apps/web/src/worker/public-source-forensics.test.ts`
- `apps/web/src/public-source-forensics/report-builder.test.ts`
- `apps/web/src/public-source-forensics/testing.ts`
- `apps/web/src/worker/processor.test.ts`
- `apps/web/src/worker/processor-contract.test.ts`
- `apps/web/src/report/combined-artifact-readiness.test.tsx`
- `apps/web/src/components/combined-geo-report-v3-artifact.test.tsx`
- `apps/web/src/components/combined-geo-report-v4-teaser.test.tsx`

Maximum initial test/fixture diff: `+3,200/-1,600` lines. The existing
verification-only amendment rule may add only directly affected tests,
fixtures, mocks, or harness files and may raise this test budget only to the
measured diff plus at most 20 percent. It may not add a production file or
weaken a gate.

### Forbidden subsystems and actions

- No database schema/migration, payment, order, credit, refund, access-token,
  commercial settlement, email, or artifact terminalization semantics.
- No public-search adapter, query fanout, live search, crawler, provider
  discovery retrieval, passage segmentation/ranking, entity resolution,
  evidence grade, source eligibility, provider qualification, or historical
  evidence mutation.
- No legacy V1/V2 product-flow rewrite, compatibility replay, report repair,
  replacement fulfillment, historical artifact rewrite, or job-state repair.
- No dependency, lockfile, environment, secret, model-profile JSON, model ID,
  prompt-provider endpoint, Docker image, deployment, Preview/Staging/
  production mutation, or external paid action.
- No broad cleanup, unrelated refactor, formatting sweep, or modification of
  user-owned files. Any newly discovered required production path stops and
  returns to `FROZEN` for user approval.

### Acceptance checks before any runtime proposal

1. Unit tests prove mixed-language brands and unseen industry/product terms are
   accepted or corrected by the mocked semantic reviewer without a whitelist,
   regex, or character ratio deciding their meaning.
2. Contract tests prove exact field coverage, original-text hashes, immutable
   field protection, allowed evidence/question ownership, non-prose projection
   hash, retained-term reasons, model identity, and input-hash mismatch all
   fail closed.
3. Free tests prove exactly one review call, persisted ready receipt, Q1 answer
   responsiveness and presence metrics sourced from that receipt, and no local
   semantic retry/deletion fallback.
4. Paid tests prove exactly one review call across all final customer prose,
   Free Q1 continuity, all three questions/answers/diagnoses, public-source
   sections, source-selection sections, website synthesis, checkpoint resume,
   and final readiness receipt verification.
5. Adversarial tests cover natural causality discussion versus unsupported
   causal claims, denial language, unknown evidence IDs, evidence belonging to
   another question, altered exact excerpts, duplicate questions, missing
   fields, extra fields, model JSON leakage, prompt leakage, unsafe URLs, and
   malformed provider output.
6. Focused affected suites, `npm test`, `npm run lint`, `npm run build`, and
   `git diff --check` must pass. Compare the complete diff with this allowlist
   and both budgets before any commit.
7. A later protected-Staging acceptance proposal must name the exact candidate
   commit/image, rollback image, target report/job, model-call count, cost cap,
   and non-repetition evidence. This implementation scope by itself authorizes
   none of those actions.

---

## Protected-test email recipient boundary after exact-order refund

Status: `APPROVED` - the user explicitly approved this exact protected-test
recipient-boundary repair on 2026-07-22. The approved exact-order commerce
continuation succeeded for the target Sandbox refund, but its email pass
exposed a configuration-boundary defect that cannot be corrected inside the
earlier filter-only behavior lock.

### Frozen runtime evidence

- Order `4286cb73-6349-467a-8aaf-9b196624da92` is now formally refunded;
  refund `89c3ac6e-5b83-4c7e-8dd7-9354ee5712ef` reached `succeeded` on its
  first Airwallex Sandbox attempt and has a provider refund identity.
- Refund completion correctly queued an additional `refund_succeeded` email,
  so this exact order now has three queued messages: `payment_confirmed`,
  `report_failed_refund`, and `refund_succeeded`. The exact-order email command
  claimed only those three, but all scheduled a first retry with
  `unknown_error` and released their leases.
- Read-only stage diagnostics proved the order ciphertext is present and marked
  `v1`, but the local Staging commerce secret cannot authenticate ciphertext
  written by the protected Vercel Staging Web. Resend API configuration,
  From/Reply-To configuration, commerce test mode, and the redirected test
  recipient are all valid. Vercel Sensitive values cannot be recovered through
  `env pull`, and the merged Worker environment intentionally carries no email
  encryption secret.
- The failure occurs before `ResendEmailGateway.send`: `sendDelivery` decrypts
  the customer address before the gateway replaces the envelope recipient in
  protected test mode. Production and non-test delivery must continue to fail
  closed on any undecryptable customer address.
- The one unrelated pending refund and all five unrelated queued emails remain
  state-equivalent to their pre-operation full-row SHA-256 snapshots.

### Exact allowlist and budget

- `apps/web/src/commerce/operations.ts`
- `apps/web/src/commerce/operations.test.ts`
- `docs/ACTIVE-CHANGE-SCOPE.md` for this approval and outcome only
- Maximum production/test diff across the two TypeScript files: `+80/-15`.
- No database row patch, manual provider call, recipient substitution outside
  protected test mode, gateway/template/config/environment change, Web/Worker
  deployment, refund replay, global commerce run, production mutation, or
  unrelated queue operation is allowed.

### Locked behavior and acceptance

1. Reuse the existing Resend envelope-recipient authority before decryption.
   When and only when the deployed profile is non-production and commerce mode
   is `test`, use its validated `OGC_TEST_EMAIL_RECIPIENT` and do not decrypt
   the customer ciphertext. Production and non-test modes must still decrypt
   the real customer address and fail closed if authentication fails.
2. Add regressions proving protected test delivery succeeds with deliberately
   undecryptable customer ciphertext, while production/non-test paths still
   invoke decryption and reject the same ciphertext. Preserve templates,
   idempotency keys, provider gateway, durable lease/state transitions, and
   access-token behavior.
3. Run focused commerce/email suites, `npm test`, `npm run lint`, `npm run
   build`, and `git diff --check`; commit only the three allowlisted paths
   locally. Do not push, deploy, or change environment values.
4. After the new diagnosis and code pass every gate, invoke `email --order-id
   4286cb73-6349-467a-8aaf-9b196624da92` exactly once. Require all three target
   rows to reach `sent` with provider email identities and prove the unrelated
   refund/email full-row hashes remain unchanged. Any new unchanged provider
   failure stops without another retry.

### Local verification before the single email retry

- Focused commerce and Resend suites: `24/24` passed.
- The pre-existing PostgreSQL 17 capture-clock suite initially repeated its
  known moving timestamp failure under load; after lint/build completed and
  host load settled, its isolated run passed `5/5` and the final full suite
  passed without changing any V4 authority file.
- Repository suite: `295` test files passed and `45` skipped; `2699` tests
  passed and `182` skipped.
- `npm run lint`, `npm run build`, and `git diff --check` passed.

### Staging outcome

- Exact code commit used by the local operator command:
  `baa3aaccdb1392cb525dde6f56744b179e7aa841`.
- The single authorized retry claimed exactly the three target-order messages
  and returned `succeeded: 3`, `retried: 0`, `failed: 0`.
- Signed Resend events then advanced `payment_confirmed`,
  `report_failed_refund`, and `refund_succeeded` from `sent` to `delivered`;
  all three have provider email identities, `attempts=2`, no lease, and no
  failure code. The order delivery status is `delivered`.
- Refund `89c3ac6e-5b83-4c7e-8dd7-9354ee5712ef` remains `succeeded` with one
  attempt and a provider refund identity; the order remains `refunded`.
- The one unrelated pending refund and all five unrelated queued emails still
  match their exact pre-operation full-row SHA-256 values.

## Target the failed-order Staging commerce continuation

Status: `APPROVED` - the user explicitly approved on 2026-07-22 after the
read-only queue inventory proved that the existing Staging commerce runner
would otherwise submit one unrelated historical refund and send five unrelated
historical emails. This one approval covers the exact-order filter, tests, one
targeted Sandbox refund submission, and the two queued redirected test emails
for order `4286cb73-6349-467a-8aaf-9b196624da92` only.

### Exact allowlist and budget

- `apps/web/src/db/commercial-refunds.ts`
- `apps/web/src/db/commercial-delivery.ts`
- `apps/web/src/db/commercial-orders-v4.postgres.test.ts`
- `apps/web/src/commerce/operations.ts`
- `apps/web/src/commerce/operations.test.ts`
- `apps/web/src/commerce/run-operations.ts`
- `apps/web/src/commerce/run-operations.test.ts`
- `apps/web/src/scripts/staging-commercial-operations.ts`
- `apps/web/src/scripts/staging-commercial-operations.test.ts`
- `docs/ACTIVE-CHANGE-SCOPE.md` for this approval and outcome only
- Maximum production/test diff across the nine TypeScript files: `+310/-40`
  lines.
- No schema/migration, payment Webhook, order/job/credit state machine,
  production commerce, provider gateway, email template, recipient, artifact,
  report, Worker search, UI, package/lockfile, environment, Docker, historical
  row, or unrelated queue behavior may change.

### Locked behavior and acceptance

1. Add an optional exact `orderId` filter at the email/refund lease boundary,
   propagate it through commercial operations, and expose it only through the
   guarded Staging CLI as `--order-id <uuid>`. Existing unfiltered callers keep
   their current behavior.
2. Reject malformed order IDs and reject combining `--order-id` with `all`,
   `reconcile`, or `sla`, so an exact-order invocation cannot trigger global
   work. Provider submission and state transitions continue through the
   existing formal gateways and lease-owned functions.
3. Add regressions for argument validation, option propagation, exact lease
   filters, and unchanged unfiltered behavior. Run focused suites, `npm test`,
   `npm run lint`, `npm run build`, and `git diff --check`; commit only the
   allowlisted diff locally. No Worker or Web deployment is required because
   this operator command runs from the verified local exact commit.
4. Before mutation, re-read both global queues. Then invoke `refunds` and
   `email` separately with the exact order ID. Prove the target refund and two
   target emails reach their formal provider-backed states while every
   unrelated refund/email row remains byte-for-byte state-equivalent in the
   audited columns. Do not retry unchanged provider failures without a new
   explicit terminal diagnosis.

### Local verification before Staging mutation

- Exact-order parser, option-propagation, and core fail-closed suites: `14/14`
  passed.
- Disposable PostgreSQL lease-boundary suite using the existing
  `postgres:16` image with `--pull never`, `--rm`, tmpfs, and no volume: `5/5`
  passed; the container was removed after the run.
- Repository suite: `295` test files passed and `45` skipped; `2696` tests
  passed and `182` skipped. Skips were the suite's existing environment-gated
  tests and were not used in place of the non-skipped PostgreSQL proof above.
- One intervening run exposed the pre-existing PostgreSQL 17 capture-clock
  flake in `report-v4-acceptance-authority-phase-snapshot.postgres.test.ts`;
  the failure moved between two timestamp assertions, then its isolated suite
  passed `5/5` and the final full repository run passed. No out-of-scope V4
  authority code was changed.
- `npm run lint` and `npm run build` passed.

## Proposed follow-on - align Paid V3 standard-question search with the proven Free V4 timeout model

Status: `APPROVED` - after reviewing the two root causes, the user explicitly
instructed on 2026-07-22 to solve both: port the proven Free search orchestration
and timeout model into Paid V3, and require the exact non-persisting Paid Q2/Q3
canary before another payment. This single approval covers the complete bounded
scope below. Ordinary corrections and every listed verification and acceptance
step proceed without additional approval requests.

### Objective and frozen runtime evidence

- Preserve report `d83a9744-542b-4425-b2bb-a76ffdeb4f6a`, Airwallex Sandbox
  order `4286cb73-6349-467a-8aaf-9b196624da92`, failed Paid V3 job
  `2dcb4e28-52f1-44aa-a379-38ce1a408a45`, pending artifact revision
  `9dd5489a-5a94-46eb-8d41-c8749457e832`, and confirmed three-question set
  `business-question-set-f26e9883d027938de3efb695756a8e4023fb0ba987a5113209608dee5d3eb1d0`
  as immutable evidence. Do not retry, replay, reopen, repair, clone, delete, or
  use that failed lineage as the final successful report.
- The signed Webhook correctly produced one paid order, one credit reservation,
  and one Paid V3 job. Terminalization correctly left the order failed with a
  pending full Sandbox refund, returned the credit, queued failure mail, and
  left the artifact non-authoritative with no HTML/PDF hashes.
- Paid V3 standard-question resolution still creates six-query fanouts for Q2
  and Q3, executes both questions concurrently, permits two concurrent queries
  inside each snapshot, and retains the default 30-second query timeout. The
  already-repaired Free V4 path instead uses three queries per question,
  sequential questions, one query at a time, and a 60-second timeout.
- The failed paid run persisted 48 search attempts across eight failed and one
  eventually completed refresh snapshot. Forty-seven attempts timed out in
  approximately 29.5-35.6 seconds; the only success completed in 26.1 seconds,
  after the paid job had already terminalized. All four paid error events share
  fingerprint `d3c157bd70da8b193707377b87c9624793fd3cae8dacbc18a60e9753ffc280b8`
  and code `public_source_snapshot_search_execution`.
- The existing one-off replacement-fulfillment command is bound to a different
  historical lineage and, even if generalized, intentionally leaves the
  original order failed/refundable. It cannot satisfy this acceptance's
  commercial-completed, zero-refund, settled-credit contract and is forbidden.

### Exact allowlist and budget

- `apps/web/src/worker/provider-discovery-production.ts`
- `apps/web/src/worker/provider-discovery-production.test.ts`
- `docs/ACTIVE-CHANGE-SCOPE.md` for this approval and final outcome only
- Maximum production/test diff across the two TypeScript files: `+120/-30`
  lines.
- No database, migration, checkpoint schema, job state machine, recovery,
  replacement fulfillment, commerce, payment, email, artifact renderer,
  report route/UI, Free V4 path, crawler, prompt/model, provider adapter,
  package/lockfile, environment-source, Dockerfile/Compose, production, or
  historical-lineage code change is allowed.

### Locked implementation and pre-submission verification

1. In Paid V3 `resolveStandardQuestions` only, apply the proven Free V4 search
   model to Q2 and Q3: keep the first three deterministic fanout queries, set
   each query budget to 60 seconds, pass `searchConcurrency: 1`, and resolve Q2
   then Q3 sequentially. Preserve canonical questions, exclusions, authority,
   evidence cutoff, forced-refresh rule, retrieval depth, source/domain caps,
   provenance, snapshot persistence, and fail-closed behavior.
2. Add regressions proving exact Q2/Q3 order, no cross-question concurrency,
   three queries per question, 60-second budgets, one-query concurrency, and
   unchanged retrieval/source/domain limits. Also prove a Q2 failure prevents
   Q3 from starting and remains a failure rather than becoming partial output.
3. Run focused provider-discovery, public-snapshot, grounded-answer and Paid V3
   Worker suites, then `npm test`, `npm run lint`, `npm run build`, and
   `git diff --check`. Commit only the allowlisted diff locally; no push, merge,
   PR, tag, or production mutation.
4. Before any new report, run a non-persisting live Staging canary using the
   exact locked Q2/Q3 fanouts: at most six MiMo public-search calls, strictly
   sequential, 60 seconds each. Every query must return `complete` or `partial`
   with at least one usable result. A timeout, unavailable/malformed response,
   empty result, or unexpected provider cost stops the acceptance before the
   user is asked to submit or pay.
5. Build one source-only thin Worker overlay from
   `open-geo-console:staging-8bb068e2a0f2e9f49a3f328c9e8f4490c4ea0b78` and
   recreate only the named Staging free/deep Workers after exact image,
   revision, profile, command, health, database-marker, disk, and rollback
   checks. No full build, pull, broad cleanup, Web/Vercel deployment, or
   production mutation is authorized. Keep the accepted current image as the
   one rollback image and remove no image unless its exact unreferenced ID is
   recorded here first.
6. After deterministic checks, the live canary, and the Worker replacement all
   pass, submit the existing pending full refund for the failed Sandbox order
   exactly once and finish its queued redirected test emails. Then put the
   protected-Staging submission page before the user. Exactly one fresh report
   and, only after its complete Free V4 authority is verified, exactly one
   user-completed Airwallex Sandbox checkout are authorized. The user performs
   both manual actions; the agent does not click them.
7. Continue automatically through signed Webhook, Paid V3 Worker, commerce,
   artifact activation, access/email, and desktop/mobile HTML QA. Final success
   requires the new order to be commercially completed with zero refund and a
   settled credit; exactly three questions ordered as full answer, own verified
   sources, then persisted V4 diagnosis; and all required V3 technical,
   page-evidence, public-source, provider/task-package, 90-day-roadmap, and
   methodology sections.
8. Any deterministic or canary failure stops before a new report/payment. Any
   new terminal acceptance failure freezes this authority. No historical
   substitution, manual artifact/DB patch, failed-job replay, repair/recovery,
   replacement fulfillment, second new report/order/payment, provider fallback,
   or production action is authorized.

### Verified implementation checkpoint

- The allowlisted implementation now resolves Paid V3 Q2 then Q3, keeps only
  the first three deterministic queries per question, uses a 60-second budget,
  and passes `searchConcurrency: 1`. Retrieval depth and source/domain caps are
  unchanged. Regressions also prove Q2 failure prevents Q3 from starting.
- Focused provider-discovery/pipeline/snapshot suites passed `46/46`; the full
  repository passed `294` test files and `2690` tests with `45` files and `181`
  tests intentionally skipped. `npm run lint`, `npm run build`, and
  `git diff --check` passed.
- The exact non-persisting Staging canary used the retained confirmed Q2/Q3
  authority and made six strictly sequential calls. All six returned
  `complete`, each with three usable results. Durations were `52,598`, `44,162`,
  `45,986`, `34,193`, `21,050`, and `32,829` ms: four valid calls exceeded the
  obsolete 30-second limit while all completed inside 60 seconds. The canary
  created zero `market_snapshot_questions` rows and zero
  `market_search_attempts` rows.

## Free V4 teaser usability and responsive-layout repair

Status: `APPROVED` - explicitly approved by the user on 2026-07-22 after the
rendered desktop/mobile findings and the six-part repair were presented. This
single approval covers the bounded component repair, its tests, local rendered
QA, the exact-commit Vercel Preview sequence recorded below, and moving only the
protected-Staging alias after verification. It does not authorize another
report, order, payment, or Worker replacement.

The first Preview `dpl_E9hBpwBbEFRoUgBuiZzXPpYTixTV` from pre-final commit
`596c2fb451ce14e377f82c8752bcae01dba8ff34` is immutable failed-QA evidence:
Browser inspection proved that the author `.teaser-source-grid` display rule
overrode the closed `<details>` user-agent rule. The protected-Staging alias was
not moved. On 2026-07-22 the user explicitly approved exactly one replacement
Preview from the final amended commit, its desktop/mobile QA, and the alias move
only after that QA passes. No third Preview is authorized.

### Objective and frozen evidence

- Repair the real Free V4 teaser renderer used by report
  `d83a9744-542b-4425-b2bb-a76ffdeb4f6a`. Its current desktop document is about
  48,514 px tall and its 390 px mobile document about 57,103 px tall; the
  checkout anchor begins around 56,132 px on mobile.
- The primary defect is a markup/CSS contract mismatch: shared `.source-card`
  uses `44px minmax(0,1fr)` (34 px on mobile), but the teaser emits only
  `.source-content`, so every source is placed in the ordinal column. The Free
  teaser also expands all 20 sources, displays lightweight Markdown markers as
  literal text, uses a three-column metadata grid for two fields, and presents
  the conversion action only after the excessively long evidence section.
- Preserve the server-side lock: Q2/Q3 answers and remediation details must
  remain absent from the Free HTML. Preserve every Q1 source identity, URL,
  verification status, cited text, and persisted diagnosis; this is a
  presentation repair only.

### Exact allowlist and budget

- `apps/web/src/components/combined-geo-report-v4-teaser.tsx`
- `apps/web/src/components/combined-geo-report-v4-teaser.test.tsx`
- `docs/ACTIVE-CHANGE-SCOPE.md` for this approval and final outcome
- Maximum production/test diff across the two TSX files: `+420/-140` lines.
- No shared artifact renderer/style, report route, API, database, migration,
  Worker, search, crawler, prompt, model, report contract, checkout/commerce,
  email, package, lockfile, environment, Docker, historical report/job/artifact,
  or production change is allowed.

### Locked implementation and verification

1. Give the teaser its own source layout so source content can never inherit
   the shared ordinal column. Show the strongest first five sources directly
   and keep every remaining source in an accessible collapsed disclosure; all
   source authority and cited text remain in the HTML.
2. Render safe lightweight answer formatting (paragraphs, lists, headings,
   emphasis) as React nodes without `dangerouslySetInnerHTML`, dependency
   changes, arbitrary HTML, or hidden paid content.
3. Replace the oversized linear layout with a clear value hierarchy: compact
   hero metadata, an early CTA, a concise technical/AI overview, Q1 proof,
   visually distinct per-question diagnosis, locked Q2/Q3, issue preview, and
   a final CTA. Keep the exact four teaser product elements and question order.
4. Add static regressions for source structure/progressive disclosure, all
   source identities and cited text, formatted answer markup, early/final CTA,
   diagnosis structure, and continued absence of Q2/Q3/remediation secrets.
5. Run the focused component suite, related report renderer tests, `npm test`,
   `npm run lint`, `npm run build`, and `git diff --check`. Then validate the
   real report in the Browser at desktop and 390 px mobile: correct page
   identity, meaningful DOM, no framework overlay, relevant console health,
   non-narrow source content, no horizontal overflow, reachable CTA, disclosure
   interaction, and screenshots. Do not ask the user to test before these pass.
6. One local commit and the one user-approved replacement source-only
   exact-commit Vercel Preview are allowed; after verifying the replacement,
   move only the protected-Staging alias. Do not push, merge, create a PR/tag,
   rebuild/recreate Workers, generate a new report, create an order, initiate
   payment, write database/artifact state, or mutate production. Existing
   report/job authority remains immutable.

## Proposed follow-on - align the Free teaser ready-checkpoint identity validator

Status: `APPROVED` - explicitly approved by the user on 2026-07-22. One
approval covers the deterministic validator repair, ordinary
corrections inside the exact allowlist, all local verification, exact protected-
Staging replacement, one fresh replacement report, and - only after its Free V4
authority is complete - one Sandbox checkout/payment acceptance flow. These
ordinary steps must not be split into repeated approval requests.

### Objective and frozen runtime evidence

- Keep replacement report `41c1517e-9e7b-498f-8e49-429a1c04c449`, completed
  Free foundation job `2af574b8-4ca3-48de-9930-aabb7c29e884`, and terminal V4
  pre-admission job `201d5fc4-5e41-4980-9a39-c6801fac644f` immutable. Do not
  retry, replay, reopen, repair, clone, delete, attach checkout, or use them as
  final acceptance authority.
- That run completed all three public-search snapshots and persisted the Q1
  answer, sources, and a schema-valid Q1 diagnosis. The final saved checkpoint
  is `stage=ready`, contains exactly three observation snapshot IDs, and has
  `readyAt=2026-07-22T11:44:16.976Z`; terminalization then failed with
  `Free teaser checkpoint is incomplete.`
- The sole failing field is `questionSetIdentity`. The formal question-set
  generator persists `confirmed-business-question-set-` followed by a 64-digit
  lowercase SHA-256 digest, while `parseReadyFreeTeaserCheckpoint` incorrectly
  requires that field to be a naked 64-digit digest. The unit fixture repeats
  the same incorrect naked-digest assumption and therefore masked the real
  production shape.
- This is a deterministic validator-contract mismatch, not a search, provider,
  diagnosis, persistence, or checkpoint-schema failure. The repair must remain
  fail-closed and accept only the exact formal namespace plus digest shape.

### Exact allowlist and budget

- `apps/web/src/worker/report-v4-free-teaser.ts`
- `apps/web/src/worker/report-v4-free-teaser.test.ts`
- `docs/ACTIVE-CHANGE-SCOPE.md` for approval/outcome freeze
- `docs/operations/evidence/2026-07-22-free-teaser-v4-paid-v3-staging-acceptance.md`
  for non-secret final evidence only
- Maximum production/test source diff across the two TypeScript files:
  `+80/-15` lines. No persisted field, checkpoint version or schema, question
  generator, database, migration, search, prompt, model, diagnosis contract,
  provider adapter, timeout, retry/state machine, crawler, paid report contract,
  renderer, route, UI, commerce, email, package, lockfile, environment source,
  Dockerfile, or Compose change is allowed.

### Locked implementation and verification

1. Add an exact local validator for
   `^confirmed-business-question-set-[a-f0-9]{64}$` and use it only for
   `questionSetIdentity` in the ready-checkpoint completeness check. Keep naked
   SHA-256 validation for `identityHash`, `admissionContentIdentityHash`, and
   `foundationHash` unchanged. Keep the subsequent equality checks against the
   authoritative persisted question set unchanged.
2. Replace the misleading naked-digest test fixture with the real formal
   identity shape. Add fail-closed regressions that accept the formal value and
   reject a naked digest, a wrong namespace, a short digest, uppercase/non-hex
   characters, and an otherwise complete checkpoint with any such invalid
   identity. No production checkpoint or historical row may be rewritten.
3. Before deployment, prove the parser against a read-only copy of the exact
   terminal report checkpoint shape and run focused Free teaser/Worker tests,
   `npm test`, `npm run lint`, `npm run build`, and `git diff --check`. One local
   commit is allowed; no push, merge, PR, tag, production mutation, or live model
   provider call is authorized.
4. Build one source-only thin Worker overlay from current accepted image
   `sha256:5f366092624a4ab57472cb8cd024a9776dfbc4f2ad104ba517df7723d3371f5d`
   and one exact-commit Vercel Preview. Recreate only the two Staging Workers and
   move only the protected-Staging alias after exact image, revision, profile,
   command, readiness, and database-marker verification. Retain the replaced
   `5f366...` image as rollback and, only after the candidate is verified,
   remove older unreferenced rollback image
   `sha256:85f5b1fe7ae5f024eaca6682cab01372995d930fa3b83e3cf96af5698261bbce`.
   Never run a full build, pull, broad cleanup, or production mutation.
5. Only after all deterministic checks and the exact Staging replacement pass,
   put the protected submission page before the user; do not submit. Exactly
   one new report and, only after its authority-complete Free V4 teaser, exactly
   one user-completed Airwallex Sandbox checkout are authorized. Continue
   automatically through signed Webhook, Paid V3 Worker, commerce, artifact,
   access, redirected email, and desktop/mobile HTML QA.
6. No failed-job recovery, manual database/artifact write, historical
   substitution, second replacement report/order/payment, refund, provider
   fallback, or production action is authorized. Any new terminal failure
   freezes that authority and stops.

## Proposed follow-on - make the Free teaser diagnosis input customer-prose-safe

Status: `APPROVED` - explicitly approved by the user on 2026-07-22. That single approval
covers the complete bounded implementation, ordinary corrections inside the
allowlist below, verification, exact Staging replacement, one non-persisting
live diagnosis canary, and - only after that canary passes - one fresh
replacement report plus one Sandbox checkout/payment acceptance flow. These
ordinary steps must not be split into repeated approval requests.

### Objective and frozen runtime evidence

- Keep failed report `19169f8c-d6b4-4976-8f0c-2edff6453ed2`, completed Free
  foundation job `3aaf69f1-1a11-42c3-a32d-c02c540266c4`, and terminal V4
  pre-admission job `0dc72e9f-dd70-4afb-b0c6-0b91a35a7fa9` immutable. Do not
  retry, replay, reopen, repair, clone, delete, attach checkout, or use them as
  the final acceptance authority.
- The three-question public-search phase completed normally. Its exact
  snapshots are `snapshot-0628f2bd9af6b30775f10b28d2b7c52a8f8db94965a11a7e3c419d0171046b33`,
  `snapshot-15bddeb87090343f97c2dcf4c2478d5706a4f4a096b9a46af10c49385535324c`,
  and `snapshot-2bda4cfafe20ae89409242370cd8ad1ccc423bcf07ea1fa2251e9ddca7e26bda`.
  Q1 answer and sources persisted at checkpoint revision 12.
- Diagnosis never called the provider. The exact retained Q1 plus five target
  pages fails `parseReportV4DiagnosisInput` because
  `buildFreeTeaserDiagnosisTargetPages` supplies the internal phrase
  `Persisted target-site evidence from the exact free admission snapshot.` as
  `relevanceReason`; the customer-prose guard rejects `admission snapshot`.
  All four append-only errors therefore report `Free teaser Q1 diagnosis did
  not complete.` before any provider invocation.
- Replacing only that phrase in memory with a customer-readable description
  admits the same real input. The retained diagnosis input is 9,557 characters
  and its locked MiMo token budget is accepted at 28,160 estimated total
  tokens, so model capacity and public-search timeouts are not this failure.

### Exact allowlist and budget

- `apps/web/src/worker/report-v4-free-teaser.ts`
- `apps/web/src/worker/report-v4-free-teaser.test.ts`
- `docs/ACTIVE-CHANGE-SCOPE.md` for approval/outcome freeze
- `docs/operations/evidence/2026-07-22-free-teaser-v4-paid-v3-staging-acceptance.md`
  for non-secret final evidence only
- Maximum production/test source diff across the two TypeScript files:
  `+55/-10` lines. No diagnosis schema, customer-prose guard, model profile,
  token budget, provider adapter, public-search query/fanout/timeout, evidence
  eligibility, database, migration, checkpoint schema, retry/state machine,
  crawler, paid report contract, renderer, route, UI, commerce, email,
  package, lockfile, environment source, Dockerfile, or Compose change is
  allowed.

### Locked implementation and pre-submission verification

1. Replace only the internal `relevanceReason` with the bounded neutral text
   `The page contains directly verifiable information relevant to this question.`
   Keep target page selection, location IDs, summaries, URLs, hashes, evidence
   references, and all fail-closed validation unchanged.
2. Add a regression that constructs the real Free target-page shape and proves
   the complete `parseReportV4DiagnosisInput` boundary accepts it, while the
   existing customer-prose guard remains unchanged. Ordinary corrections are
   allowed only in the two allowlisted files and budget above.
3. Run focused Free teaser/diagnosis/customer-prose tests, affected Worker
   suites, `npm test`, `npm run lint`, `npm run build`, and
   `git diff --check`. One local commit is allowed; no push, merge, PR, tag, or
   production mutation is authorized.
4. Before asking for another report, run exactly one live, non-persisting MiMo
   diagnosis canary from the merged Staging environment against the already
   retained failed Q1 answer/source/target-page shape with the corrected
   relevance text. It may make at most two provider calls through the formal
   enhancer, must produce a schema-valid diagnosis with exactly three factors
   and actions, and must not write any report, job, checkpoint, snapshot,
   artifact, order, credit, email, or acceptance authority. A failed canary is
   a stop before report submission.

### Exact Staging replacement and remaining acceptance

1. From current accepted Worker image
   `sha256:d3870185bd43cb9fa52d2f5a43edffc046e67ef2d197a15c4423ce0d2486947b`,
   build one source-only thin overlay and one exact-commit Vercel Preview.
   Recreate only the two Staging Workers and move only the protected-Staging
   alias after exact image/revision/profile/command/readiness verification.
   Retain image
   `sha256:85f5b1fe7ae5f024eaca6682cab01372995d930fa3b83e3cf96af5698261bbce`
   as rollback; never run a full build, pull, broad cleanup, or production
   mutation.
2. Existing consecutive public-search probe passes and the failed report's
   completed three-question snapshot evidence remain valid for this diagnosis-
   only source change; do not spend more search probes before the canary.
3. Only after deterministic checks, exact Staging replacement, and the live
   diagnosis canary pass, put the protected submission page before the user.
   Exactly one new replacement report and, only after its authority-complete
   Free V4 teaser, exactly one user-completed Airwallex Sandbox checkout are
   authorized. Continue automatically through signed Webhook, Paid V3 Worker,
   commerce, artifact, access, redirected email, and desktop/mobile HTML QA.
4. No failed-job recovery, manual database/artifact write, historical
   substitution, second replacement report/order/payment, refund, provider
   fallback, or production action is authorized. Any new terminal failure or
   failed live diagnosis canary freezes that authority and stops.

## Proposed follow-on - align Free teaser search orchestration and MiMo timeout model

Status: `APPROVED` - explicitly approved by the user on 2026-07-22 after the
written allowlist was presented. The user selected the objective "search
orchestration + timeout model". One approval covers the complete bounded implementation,
ordinary allowlisted corrections, verification, exact Staging replacement, at
most three new live probes, and—only after two consecutive probe passes—one
fresh report plus one Sandbox checkout/payment acceptance flow. These ordinary
steps must not be split into repeated approval requests.

### Objective and frozen evidence

- Match the Free V4 teaser search workload to its actual evidence target. The
  current teaser requests at most one available source per question but always
  schedules six fanout variants at concurrency two with a 30-second per-query
  budget. Preserve all three questions and evidence verification while using a
  smaller stable Free-only plan and single-query execution.
- Give MiMo forced, non-streaming web search one authoritative timeout. The
  executable probe currently races the observer's 30-second timer against a
  second `AbortSignal.timeout(30_000)`, so the same deadline may be mislabeled
  as caller `aborted`. Remove that duplicate deadline and use a 60-second
  MiMo/Free-query budget bounded by the existing Worker/job lifecycle.
- Replace the deliberately nonexistent-domain live quality case with a real,
  narrow, logistics-relevant official-domain query. Deterministic mocked tests
  continue to prove no-result, timeout, abort, authentication, rate-limit, and
  malformed-response semantics; the live Go/No-Go must test representative
  availability rather than a pathological `.invalid` target.
- Keep reports `3b351edf-f29e-4e26-8090-dc20405d5966` and
  `6889508e-fa90-4fd9-a011-92b92cce3604`, all of their jobs/snapshots/events,
  and the two failed replacement histories immutable. Do not retry, replay,
  reopen, repair, clone, delete, attach checkout, or use them as substitutes.

### Exact source allowlist and budget

- `apps/web/src/public-search-adapters/mimo/certification.ts`
- `apps/web/src/public-search-adapters/mimo/certification.test.ts`
- `apps/web/src/worker/public-source-snapshot-resolver.ts`
- `apps/web/src/worker/public-source-snapshot-resolver.test.ts`
- `apps/web/src/worker/report-v4-free-teaser.ts`
- `apps/web/src/worker/report-v4-free-teaser.test.ts`
- `docs/ACTIVE-CHANGE-SCOPE.md` for approval/outcome freeze
- `docs/operations/evidence/2026-07-22-free-teaser-v4-paid-v3-staging-acceptance.md`
  for non-secret final evidence only
- Maximum production/test source diff across the six TypeScript files:
  `+220/-70` lines. No public question text, answer/diagnosis prompt, evidence
  eligibility, database, migration, checkpoint schema, job state machine,
  crawler, report contract, renderer, route, UI, commerce, email, package,
  lockfile, environment source, Dockerfile, or Compose change is allowed.

### Locked implementation behavior

1. Keep the generic/paid snapshot resolver default at concurrency two and keep
   its complete planned-query ledger/resume semantics unchanged. Add one
   validated caller option allowing concurrency one; Free teaser alone uses it.
2. For Free teaser only, retain the stable first three existing variants in
   order—canonical, supplier discovery, capability—set their per-query timeout
   to 60 seconds, and execute them one at a time. All three teaser questions
   remain resolved in ordinal order. Do not change query text, result depth,
   source retrieval/verification, identity exclusion, evidence target, retry,
   checkpoint, or persisted snapshot authority.
3. Align the live MiMo quality probe to production request weight:
   `maxRequests=1`, `maxResults=3`, `timeoutMs=60_000`; remove only its duplicate
   outer timeout signal. Replace the `.invalid` quality query with
   `site:gov.cn 国际货运代理 备案 管理办法`, require a complete result from `gov.cn`,
   and retain all redaction plus deterministic failure-semantics checks.
4. Add regressions proving Free receives exactly three stable variants at
   60 seconds and concurrency one, generic resolver behavior remains six/all
   planned queries at concurrency two, resume does not repeat completed work,
   the probe has only one authoritative deadline, and probe output stays
   secret-safe/fail-closed.
5. Run focused adapter/probe/resolver/teaser suites, affected Worker/public-
   search suites, `npm test`, `npm run lint`, `npm run build`, and
   `git diff --check`. Ordinary failures may be corrected automatically only
   inside this allowlist, behavior, and budget. One local commit is allowed;
   no push, merge, PR, tag, or production action is authorized.

### Exact Staging replacement, live Go/No-Go, and acceptance

1. From current accepted Worker image
   `sha256:85f5b1fe7ae5f024eaca6682cab01372995d930fa3b83e3cf96af5698261bbce`,
   build one source-only thin overlay and one exact-commit Vercel Preview. No
   full build, pull, dependency/browser/OS install, `docker cp`, broad cleanup,
   or production mutation is allowed. Recreate only the two Staging Workers,
   verify exact image/revision/tier/readiness/database marker, then move only
   the protected-Staging alias once.
2. Retain the replaced `85f5...` image as the single rollback. After candidate
   readiness, remove only older unreferenced rollback image
   `sha256:f3b65393e41b66bd13b3d14ceb31d6a17b83cae7d9a7e1e630bc9129ef755ad9`;
   never prune or touch production images/volumes.
3. Run at most three new live probes, strictly sequentially, from the merged
   Staging Worker environment. Require two consecutive complete passes of all
   three representative quality cases. If the sequence cannot pass within the
   cap, stop before report submission; do not hide failure by accepting the
   deterministic failure-semantics subtests.
4. Only after the Go decision, put the protected submission page in front of
   the user; do not submit. Exactly one new report and, after its authority-
   complete Free V4 teaser, exactly one user-completed Airwallex Sandbox
   checkout are authorized. Continue automatically through signed Webhook,
   Paid V3 Worker, commerce, artifact, access, redirected email, and desktop/
   mobile HTML QA.
5. No manual DB/artifact write, failed-job recovery, historical substitution,
   second report/order/payment, refund, provider fallback, or production action
   is authorized. Any new terminal failure freezes that authority and stops.

---

## Proposed follow-on - executable public-search Go/No-Go before user acceptance

Status: `APPROVED` - explicitly approved by the user on 2026-07-22. This is a single
approval envelope for the readiness-gate implementation, its ordinary
allowlisted corrections and verification, at most three bounded live probes,
and—only after two consecutive probe passes—one fresh report plus one Sandbox
checkout/payment acceptance flow. Passing tests, ordinary allowlisted fixes,
probe polling, report/Worker processing, commerce polling, and browser QA must
not be split into repeated approval requests.

### Objective and immutable failed authority

- Prevent another user-submitted formal report from being used as the first
  executable test of public-search availability. Protected Staging must fail
  closed before report submission unless the same merged Worker environment
  passes a real, redacted, sequential MiMo public-search quality probe.
- Keep report `6889508e-fa90-4fd9-a011-92b92cce3604`, completed Free job
  `1b37e23a-77a4-4b66-b870-71eb54446d36`, and terminal V4 pre-admission job
  `29e28b37-298a-4339-9193-de4326700c92` immutable. The latter persisted four
  failed question-2 snapshot versions and 24/24 approximately 30-second query
  timeouts. It has no order, payment, paid job, or active artifact.
- This gate does not weaken evidence, substitute cached/historical content,
  extend timeouts, reduce fanout, change query text, or treat a failed probe as
  success. If the existing provider cannot pass, stop before asking the user to
  submit anything.

### Exact allowlist and budget

- `apps/web/src/scripts/probe-public-search.ts`
- `apps/web/src/scripts/probe-public-search.test.ts`
- `scripts/start-report-v4-staging-workers.ps1`
- `apps/web/src/scripts/report-v4-staging-preflight.test.ts`
- `docs/ACTIVE-CHANGE-SCOPE.md` for approval/outcome freeze
- `docs/operations/evidence/2026-07-22-free-teaser-v4-paid-v3-staging-acceptance.md`
  for non-secret final evidence only
- Maximum source/test/script diff across the four implementation/test files:
  `+150/-25` lines. No Worker report logic, query/fanout/timeout, provider
  adapter, prompt, database, migration, crawler, report contract, renderer,
  route, UI, commerce, email, Dockerfile, Compose, package, lockfile, or
  environment-source change is allowed.

### Deterministic implementation and verification

1. Make the existing public-search probe command exit nonzero when any of its
   three quality cases has `passed !== true`, while preserving its redacted
   summary and deterministic failure-semantics checks. Unit-test all-pass,
   timeout/failure, and secret-safe output behavior without live calls.
2. Make the protected-Staging Worker start script run that live probe from the
   already merged `.data/workstation-docker/staging.env` after the read-only
   database preflight and before any Docker build, environment mutation, or
   container recreation. A failed/malformed probe must abort without runtime
   mutation. Add structural tests for ordering and fail-closed handling.
3. Run focused probe/preflight tests, affected suites, `npm test`,
   `npm run lint`, `npm run build`, and `git diff --check`. Ordinary failures
   may be corrected automatically only inside this allowlist and budget. One
   local commit is allowed; no push, merge, PR, tag, production mutation, or
   new Docker image is authorized because application/Worker runtime source is
   unchanged.

### Bounded live Go/No-Go and remaining acceptance

1. From the exact merged Staging Worker environment, run at most three live
   probes, sequentially and with no overlapping calls. Require two consecutive
   full passes; each pass must report all three quality cases passed. Wait and
   retry automatically within that cap. A failure is a No-Go and must never be
   hidden by the deterministic failure-semantics subtests.
2. Only after the two-pass Go decision, reverify protected alias
   `dpl_F98qzNhyjcqJEkhE71KWKdiPy9y1`, Worker image
   `sha256:85f5b1fe7ae5f024eaca6682cab01372995d930fa3b83e3cf96af5698261bbce`,
   revision `74672c07907021ff9b8a07d57d242fa30311f57f`, and the Staging database
   marker. Then put the submission page in front of the user; do not submit.
3. Exactly one fresh report and, only after its complete Free V4 teaser passes
   authority checks, exactly one user-completed Airwallex Sandbox checkout are
   authorized. Continue automatically through signed Webhook, Paid V3 Worker,
   commerce, artifact, access, redirected email, and desktop/mobile HTML QA.
4. No failed-job replay/recovery, manual database/artifact write, historical
   substitution, second report/order/payment, refund, provider fallback, or
   production action is authorized. A terminal failure after the executable
   Go decision freezes that new authority and stops.

### Runtime outcome and No-Go freeze (2026-07-22)

- The executable gate was committed locally as
  `c6aca1b` (`fix(staging): gate reports on live public search`). Focused tests
  passed 28/28; the full repository passed 2,683 tests with 181 skipped, plus
  lint, build, PowerShell parsing, and diff validation. No application/Worker
  image replacement was needed or performed.
- Live probe 1 and live probe 2 were strictly sequential. In both runs,
  `official-factual` and `chinese-b2b-discovery` completed and passed, while
  `narrow-structured-search` was aborted at the 30-second execution boundary.
  Both commands exited nonzero through the new quality gate; deterministic
  failure-semantics checks passed and did not mask the failed quality case.
- With only one call remaining under the three-probe cap, two consecutive full
  passes are no longer attainable. Do not spend the third call, submit a new
  report, create checkout, or mutate any failed authority. The acceptance flow
  remains No-Go until a future explicitly scoped change addresses the actual
  query/timeout/runtime behavior and establishes a new bounded probe allowance.

---

## Proposed follow-on - fail closed by dropping only invalid optional page-analysis prose

Status: `APPROVED` - explicitly approved by the user on 2026-07-22. This
single approval covers the deterministic two-file repair, ordinary allowlisted
debugging and verification, one exact-commit Staging replacement, one official
checkpoint recovery of the exact current nonterminal job, and continuation of
the already authorized report/payment acceptance flow without repeated gates.

### Objective and exact stopped authority

- Preserve the full V3 + per-question V4 product contract and all evidence.
  Do not weaken the report-language guard or accept invalid report prose.
- Current new report `6889508e-fa90-4fd9-a011-92b92cce3604` and Free job
  `1b37e23a-77a4-4b66-b870-71eb54446d36` are the only target authorities. The
  job is nonterminal at `repair_wait/page_analysis`, checkpoint revision 8,
  because the model's bounded language-correction pass still left invalid prose
  at `analyses[0].organizationSignals[1]`.
- The page-analysis engine already discards an invalid optional
  `rewriteExample` after bounded correction while preserving required summary,
  findings, and evidence. Apply the same fail-closed treatment only to invalid
  optional `organizationSignals[]` and `strengths[]` entries. Any violation in
  required prose or evidence continues to fail.
- Baseline source is exact commit
  `83988dedb5f1cd7965c27240d6008a6d21deba67`; preserve every existing dirty and
  untracked file. No new report may be submitted for this repair.

### Exact source allowlist and budget

- `packages/ai-report-engine/src/analysis.ts`
- `packages/ai-report-engine/src/index.test.ts`
- `docs/ACTIVE-CHANGE-SCOPE.md` for this lock and terminal freeze only
- `docs/operations/evidence/2026-07-22-free-teaser-v4-paid-v3-staging-acceptance.md`
  for non-secret final evidence only
- Maximum production/test source diff across the two TypeScript files:
  `+90/-25` lines. No prompt, model configuration, required-field validation,
  evidence quote, provider, Worker state machine, database, migration, crawler,
  question, report contract, renderer, route, UI, commerce, email, Dockerfile,
  Compose, package, lockfile, or environment-source change is allowed.

### Deterministic repair and verification

1. Generalize the existing optional-rewrite omission helper so it may remove
   only language-invalid `organizationSignals[index]`, `strengths[index]`, and
   `findings[index].rewriteExample` paths after the existing bounded correction
   attempt. Remove multiple array entries by original index without shifting the
   wrong item; mixed required/optional violations must still fail closed.
2. Add regressions for single and multiple optional-array violations, preserved
   required prose/evidence, mixed required violations, and the existing rewrite-
   example behavior.
3. Run focused analysis/language suites, affected package/Worker suites,
   `npm test`, `npm run lint`, `npm run build`, and `git diff --check`.
   Ordinary failures may be corrected automatically only inside this allowlist,
   exact behavior, and budget. One local commit is allowed; no push/merge/PR.

### Exact current-job recovery and remaining acceptance

1. Deploy one exact-commit Vercel Preview and one source-only thin Worker
   overlay from current image
   `sha256:32f8146ceea74a1d5f5187cd3f5d000424221a1309d699aa3354b995dc77340b`;
   no full rebuild, pull, dependency install, broad cleanup, production mutation,
   or second new report is allowed.
2. After exact Worker readiness and Staging preflight, invoke the existing
   operator-only `resumeScanJobAfterRepair` boundary exactly once for job
   `1b37e23a-77a4-4b66-b870-71eb54446d36`, using its persisted recovery input
   hash `7da576c29d92bae6aafbda2e14c984090e508c191d1fc5012b6deb576731b5c1`.
   This must append the formal recovery transition and resume the preserved
   checkpoint; no direct SQL update, checkpoint edit, retry route, cloned job,
   or historical authority mutation is allowed.
3. If the same report's Free V4 teaser completes, continue to the already
   authorized single manual Sandbox checkout and the Paid V3/commerce/artifact/
   access/email/desktop/mobile acceptance chain. Any terminal failure or need
   outside this exact allowlist remains a hard stop.

### Runtime outcome and terminal freeze (2026-07-22)

- The exact operator recovery succeeded once. Free job
  `1b37e23a-77a4-4b66-b870-71eb54446d36` resumed from checkpoint revision 8
  with resume generation 1, passed the repaired page-analysis boundary, and
  completed normally. The formal V4 pre-admission job is
  `29e28b37-298a-4339-9193-de4326700c92`; it persisted one confirmed set of
  exactly three questions before entering question generation.
- The pre-admission job terminalized at checkpoint revision 10 with
  `public_source_snapshot_search_execution`. Its append-only authority records
  four failed snapshot completion versions for question ordinal 2. Each
  version executed six queries; all 24 persisted search attempts timed out at
  approximately 30 seconds with cost uncertainty. No order, payment, paid job,
  or active artifact was created.
- Freeze this report and both jobs as immutable evidence. Do not retry, replay,
  reopen, repair, clone, delete, attach checkout, or perform standalone provider
  calls under this lock. The current implementation/deployment scope is closed;
  any public-search timeout, fanout, adapter, or executable preflight change
  requires a new explicit allowlist and must pass that preflight before another
  user-submitted report is requested.

---

## Proposed follow-on - bound Free teaser diagnosis sources to the V4 contract

Status: `APPROVED` - explicitly approved by the user on 2026-07-22. This
single approval covers the deterministic two-file repair, all ordinary
debugging and verification inside the allowlist, one exact-commit Staging
replacement, and one new manual report/payment acceptance flow. Passing tests,
allowlisted corrections, deployment verification, Worker processing, commerce
polling, and browser QA must not be split into repeated approval requests.

### Objective and exact failed baseline

- Preserve the approved product contract without redesign: the Free V4 teaser
  precedes checkout; the paid artifact remains the full V3 report with exactly
  three ordered question cards, each rendered answer -> owned verified sources
  -> persisted V4 diagnosis.
- Fix the deterministic adapter mismatch now proven by immutable Staging
  evidence. Replacement report
  `3b351edf-f29e-4e26-8090-dc20405d5966` persisted a Q1 answer card with 17
  owned sources, while `parseReportV4DiagnosisInput` permits at most five. The
  diagnosis enhancer therefore failed before any diagnosis-provider call and
  the pre-admission job `80079ef7-a8fe-4e65-bae5-c2d324a85544` terminalized
  after its formal retries with `Free teaser Q1 diagnosis did not complete.`
- Keep that report, its Free job
  `4713bb30-89d3-43a1-aef8-7eb77e8d27c4`, its failed pre-admission job, all
  checkpoints, and all append-only events immutable. Do not retry, replay,
  reopen, repair, clone, delete, or attach a payment to them.
- Baseline source is exact commit
  `73df8afe16a36d95aaef5817775a9a40d275b125`; preserve every existing dirty and
  untracked file.

### Exact source allowlist and budget

- `apps/web/src/worker/report-v4-free-teaser.ts`
- `apps/web/src/worker/report-v4-free-teaser.test.ts`
- `docs/ACTIVE-CHANGE-SCOPE.md` for this lock and terminal freeze only
- `docs/operations/evidence/2026-07-22-free-teaser-v4-paid-v3-staging-acceptance.md`
  for non-secret final evidence only
- Maximum production/test source diff across the two TypeScript files:
  `+70/-10` lines. No diagnosis contract, prompt, provider adapter, token budget,
  timeout, query policy, environment, database, migration, crawler, question,
  report contract, renderer, route, UI, payment, email, Dockerfile, Compose,
  package, or lockfile change is allowed.

### Deterministic repair and verification

1. Keep the complete Q1 answer card and all of its owned sources unchanged for
   the teaser/report authority. Only the diagnosis adapter input may select the
   first `REPORT_V4_MAX_DIAGNOSIS_SOURCES` sources in the card's existing stable
   order, matching the already frozen five-source diagnosis contract and paid
   V4 normalization boundary.
2. Add a focused regression with more than five Q1 sources proving the
   diagnosis provider receives exactly the stable first five, the persisted
   teaser card still retains every owned source, and resume makes zero repeated
   search/model calls.
3. Run the focused teaser/diagnosis suites, affected Worker/V4 suites,
   `npm test`, `npm run lint`, `npm run build`, and `git diff --check`.
   Ordinary failures may be corrected automatically only inside the two-file
   allowlist, the exact behavior above, and the diff budget.
4. One local commit is allowed. No push, merge, PR, tag, or production action is
   authorized.

### One replacement runtime and acceptance allowance

1. Create one clean exact-commit export without a new Git worktree, one exact-
   commit Vercel Preview, and one source-only thin Worker overlay from the
   currently accepted Staging image
   `sha256:866dc51884eb730bbc03be30f3ee2e544f1bd9b29d640d742ffc742c12b5fcc6`.
   No full rebuild, dependency/browser/OS install, pull, broad cleanup, or
   production mutation is allowed.
2. Recreate only the two Staging Workers, verify exact revision/image/tier and
   Staging database marker/readiness, then move only the fixed protected-
   Staging alias once. Remove only the superseded unreferenced test image after
   verification and retain exactly one rollback image.
3. The user may manually submit exactly one new replacement report for
   `https://shun-express.com/`. If its formal Free V4 teaser completes, the user
   may manually create and complete exactly one Airwallex Sandbox checkout.
   Continue automatically through the signed Webhook, Paid V3 Worker, commerce,
   artifact, access, redirected-email, and desktop/mobile HTML acceptance chain.
4. No historical report/job mutation, standalone diagnostic model replay,
   manual database/artifact write, second new report/order/payment, refund, or
   production identity is authorized. A terminal failure requiring behavior
   outside this exact allowlist remains a hard stop.

---

## Proposed follow-on - bound Free V4 teaser public-search concurrency

Status: `APPROVED` - explicitly approved by the user on 2026-07-22. This single approval covers
the bounded implementation, all ordinary debugging and verification inside the
allowlist, one exact-commit Staging replacement, and one replacement acceptance
flow. It must not be split into repeated approvals for normal test failures or
allowlisted corrections.

### Objective and failed baseline

- Preserve the approved product contract: the Free V4 teaser precedes checkout;
  the paid artifact remains the full V3 report with exactly three ordered
  question cards, each rendered as answer -> owned verified sources -> persisted
  V4 diagnosis. No report-contract, payment, artifact, or renderer redesign is
  authorized.
- Fix the observed Free teaser search overload. The current implementation starts
  all three question snapshots with `Promise.all`; each snapshot independently
  runs two queries at a time, producing up to six concurrent MiMo public-search
  requests under a 30-second per-request timeout.
- Treat report `ba9b403e-8b19-4169-b21a-8e8199d6d95e`, Free job
  `fe89998a-36ee-4b72-a283-9a197dfd5f67`, and failed pre-admission job
  `577e11ae-78ec-433f-8d6a-4d986244d477` as immutable evidence. Do not retry,
  replay, reopen, repair, clone, delete, or attach a payment to them.
- Baseline source is exact commit
  `c4b0a12bdd97f37869f13e76d58c893ee9828546`; preserve every existing dirty and
  untracked file.

### Exact source allowlist and budget

- `apps/web/src/worker/report-v4-free-teaser.ts`
- `apps/web/src/worker/report-v4-free-teaser.test.ts`
- `docs/ACTIVE-CHANGE-SCOPE.md` for this lock and terminal freeze only
- `docs/operations/evidence/2026-07-22-free-teaser-v4-paid-v3-staging-acceptance.md`
  for non-secret final evidence only
- Maximum production/test source diff across the two TypeScript files:
  `+120/-30` lines. No query text, provider adapter, timeout, environment,
  database, migration, crawler, question, prompt, report contract, renderer,
  route, UI, payment, email, Dockerfile, Compose, package, or lockfile change is
  allowed.

### Deterministic repair and verification

1. Resolve the three persisted teaser question snapshots in stable ordinal order
   instead of starting the three snapshots concurrently. Preserve each
   snapshot's existing bounded internal query concurrency, retries, checkpoint
   identity, evidence rules, and fail-closed semantics.
2. Add a focused regression proving only one question snapshot is active at a
   time, all three ordinals still complete in order, and resume still makes zero
   repeated search/model calls.
3. Run the focused teaser and snapshot-resolver suites, all affected Worker and
   public-search suites, `npm test`, `npm run lint`, `npm run build`, and
   `git diff --check`. Ordinary failures may be corrected automatically only
   inside the two-file allowlist and budget.
4. One local commit is allowed. No push, merge, PR, tag, or production action is
   authorized.

### One replacement runtime and acceptance allowance

1. Create one clean exact-commit export without a new Git worktree, one exact-
   commit Vercel Preview, and one source-only thin Worker overlay from current
   image
   `sha256:8b2fd4613c050edf6fe6618b6a97c5dd62ce8c5476dec7ebdd1ed009db71b665`.
   No full rebuild, dependency/browser/OS install, pull, broad cleanup, or
   production mutation is allowed.
2. Recreate only the two Staging Workers, verify exact revision/image/tier and
   Staging database marker/readiness, then move only the fixed protected-Staging
   alias once. Remove only the superseded unreferenced test image after the new
   containers are verified; retain the current rollback image.
3. After deterministic and runtime verification, the user may manually submit
   exactly one replacement report for `https://shun-express.com/`. Do not repeat
   either already passing provider probe.
4. If the formal Free V4 teaser completes, the user may manually create and
   complete exactly one Airwallex Sandbox checkout. Continue the signed Webhook,
   Paid V3 Worker, commerce, artifact, access, redirected-email, and desktop/
   mobile HTML acceptance chain already defined below.
5. Any second replacement report, second order/payment, terminal failure,
   `completed_limited`, out-of-allowlist source need, environment/timeout/query-
   policy change, historical mutation, refund, or production identity is a hard
   stop. This approval cannot be interpreted as replay authority.

---

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
