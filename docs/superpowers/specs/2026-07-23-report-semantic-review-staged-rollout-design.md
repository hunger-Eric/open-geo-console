# ReportSemanticReview staged rollout design

Date: 2026-07-23
Status: design baseline approved by the user; implementation scope remains
`FROZEN`

## 1. Decision

Replace program-owned customer-prose semantics in the active Free V4 -> Paid
V3 product line with one evidence-bound `ReportSemanticReview` per report
lifecycle. Do not perform a direct cutover. Introduce the capability
additively, isolate adoption by an immutable version authority, validate it
offline, then require separate protected-Staging and production activation
approvals.

V1 and V2 product flows are retired and remain unchanged.

## 2. Why this is staged

The audited defect crosses language validation, answer relevance, question
distinctness, target/competitor presence, causal and ranking claims,
source-selection diagnosis, public-source conclusions, and final artifact
readiness. A monolithic replacement would touch the Free teaser, Q1 continuity,
Paid synthesis, checkpoint resume, and artifact terminalization in one change.
That would make a regression difficult to localize and could cause deployed
code to reinterpret an in-flight checkpoint.

The rollout therefore treats each phase as a separately approved change scope.
A later phase cannot inherit unused authority from an earlier phase.

## 3. Considered approaches

### A. Direct replacement

Remove the existing heuristics and wire one reviewer across Free and Paid in a
single release.

- Advantage: shortest path to the final architecture.
- Rejected because: highest regression radius; existing jobs could be resumed
  under a contract they did not start with; rollback would mix customer prose,
  evidence, and checkpoint versions.

### B. Version-isolated staged rollout (selected)

Build the contract without routing changes, add offline integration, bind new
adoption to an immutable version authority, then activate only newly created
jobs after environment-specific acceptance.

- Advantage: old and new jobs never change semantic contract mid-flight;
  every phase has a small diff, observable output, and independent rollback.
- Cost: more phases and temporary coexistence of the pre-review path and the
  reviewed path.

### C. Permanent shadow review

Call the reviewer but never let it control customer output.

- Advantage: lowest immediate behavior risk.
- Rejected as the final design because: it adds cost while leaving the wrong
  programmatic semantic authority in control. A bounded shadow comparison may
  be used in protected Staging, but never as the production terminal state.

## 4. Semantic ownership

The model owns:

1. Whether prose is natural for the report locale and needs translation.
2. Whether brands, products, industry terms, and mixed-language names should be
   preserved, plus a reason for every preserved original term.
3. Whether an answer responds to its exact question.
4. Whether the three questions are semantically distinct.
5. Whether prose makes unsupported causal, ranking, probability,
   recommendation, or exaggerated claims.
6. Whether customer prose faithfully expresses the bound evidence.
7. Corrected text for every mutable customer-prose field.

Deterministic code owns:

1. JSON/schema, exact field types, bounds, enums, and cardinalities.
2. Safe URLs and exact question/source/evidence ID existence and ownership.
3. Exact source-excerpt binding and immutable evidence preservation.
4. Canonical hashes, model identity, field coverage, checkpoint identity, and
   non-prose projection integrity.
5. Explicit syntax/byte safety bans for raw provider JSON, system/developer
   prompts, secrets, tool transcripts, and unsafe URLs.
6. Payment, credit, artifact, access, database, and exactly-once boundaries.

Code must not infer language quality, answer relevance, brand legitimacy,
causality, exaggeration, or evidence meaning from a lexical list, regex,
character ratio, or substring score.

## 5. Review contract

`ReportSemanticReview` is a versioned logical contract. Its canonical input
contains:

- lifecycle (`free_v4` or `paid_v3`), locale, target identity, and review
  contract version;
- an exact ordered manifest of all customer-prose fields;
- stable field path, original text, original text hash, mutable/read-only flag,
  question ownership, and allowed evidence/source IDs per field;
- immutable question/source/evidence catalogs containing original text and
  identity data;
- a hash of the complete non-prose projection;
- expected provider/model identity.

The model output contains exactly one result per manifest field:

- field path and original text hash;
- `pass`, `corrected`, or `blocked` decision;
- corrected text only for mutable fields;
- semantic issue codes and concise reason;
- bound evidence/source IDs;
- retained original terms and a reason for each;
- report-level question-distinctness result and overall decision.

It also contains structured semantic annotations constrained to exact IDs from
the input catalogs:

- for every Free observation/result, a target, competitor, or `ambiguous`
  classification with its exact observation/result IDs and a short reason;
- question-distinctness annotations for the immutable three-question set;
- answer relevance and target/competitor entity-role annotations bound to the
  owning question and allowed source/evidence IDs; and
- evidence-use and source-selection annotations for every applicable customer
  conclusion.

`ambiguous` classifications are deliberately excluded from target and
competitor totals. The program verifies only returned IDs, ownership, coverage,
hashes, safe URLs, structure, persistence, and commercial integrity; it never
infers any annotation from wording.

The program rejects missing, duplicate, extra, reordered, wrong-hash,
wrong-owner, unknown-ID, immutable-field, non-prose, or structurally invalid
output. Applying corrections must leave the non-prose projection hash
unchanged.

## 6. Lifecycle rules

### Free V4

One review occurs after the three questions, public observations, Q1 answer and
sources, and Q1 diagnosis exist, but before the teaser becomes ready. The
review receipt owns Q1 responsiveness and target/competitor presence semantics.
Free target/competitor metrics are derived mechanically only from the
reviewer's exact observation/result classifications after catalog and ownership
verification; `ambiguous` contributes to neither metric.
The ready checkpoint persists the input hash, applied-output hash, model
identity, exact field coverage, non-prose hash, and pass state.

### Paid V3

One review occurs after website synthesis, all three answer/source cards, all
three diagnoses, the source-selection diagnosis, and the public-source draft
exist, but before artifact materialization and terminalization.

The accepted Free Q1 question, answer, evidence identity, and reviewed text are
read-only in Paid. Paid cannot silently produce a different Q1.

Questions are immutable after search/evidence collection. If the reviewer
finds semantic duplication, it blocks. It cannot rewrite a question while
leaving evidence from the old question attached.

There is no per-field semantic repair loop and no local deletion fallback. A
transport or malformed-output failure follows the existing bounded provider
failure policy and fails closed without a customer artifact.

## 7. Version isolation

Activation must be bound to an immutable authority created before a job starts.
Read-only verification proved that the active Free V4 -> Paid V3 path does not
share the formal V4 configuration-snapshot lineage: Free pre-admission and Paid
V3 jobs begin with an empty JSONB checkpoint, and V3 artifact revisions are
required to keep `config_snapshot_id` null. On 2026-07-23 the user therefore
approved **checkpoint-lineage activation** as the replacement carrier.

The semantic-review marker is optional in the existing `scan_jobs.checkpoint`
JSONB authority and explicit for newly activated jobs:

- marker absent: preserve the pre-review behavior for that already-created
  authority; never partially inject the new reviewer;
- marker present with `report-semantic-review-v1`: require the complete new
  review receipt and never fall back to programmatic semantics.

The marker is seeded atomically when a Free V4 pre-admission job is created.
It may never be added, removed, or changed by a later checkpoint write. A Paid
V3 job may receive the marker only at its own creation, copied from the exact
completed Free checkpoint after report and question-set lineage verification.
Absence propagates as absence. No historical row is updated.

The marker is contract metadata, not a new model operation. The reviewer uses
the already locked website-synthesis model capability and records its exact
provider/model identity. This avoids invalidating old model-operation
snapshots.

Phase 2 implementation must not itself activate the marker in the normal
production enqueue call. It first adds the explicit carrier capability with a
default-absent call path and proves it offline. A later separately approved
activation changes only the explicit new-job authority. Implementation must not
invent a timestamp, environment fallback, job denylist, or implicit migration.

## 8. Phases and authorization

### Phase 0 - baseline and design (current)

Deliverables:

- read-only reachable-path audit;
- this approved design;
- a new staged `FROZEN` scope;
- exact statement that no code, job, provider, database, or environment was
  changed.

### Phase 1 - additive contract foundation

Deliverables:

- new review types, canonicalization, parsing, receipt verification, and
  immutable correction application helpers;
- package export and exhaustive mocked contract tests;
- no Worker/provider import, routing, model call, checkpoint write, artifact
  behavior, or report-output change.

This phase is safe to execute unattended only after its exact scope changes
from `FROZEN` to `APPROVED`.

### Phase 2A - inactive checkpoint-lineage carrier

Deliverables:

- implement atomic optional marker seeding on Free job creation;
- reject later addition, removal, or change of a job-bound marker;
- copy a present marker into the Paid V3 job only at creation after exact Free
  checkpoint/report/question-set verification;
- preserve the normal production enqueue path as marker-absent;
- prove the carrier with local unit/PostgreSQL tests and zero external calls.

This smaller phase deliberately changes no Worker routing, provider call,
customer prose, report artifact, or normal production activation behavior.

### Phase 2B1 - offline reviewer core and manifests

Deliverables:

- extend the additive contract for catalog-bound observation/result and
  evidence-use annotations;
- add pure Free V4 and Paid V3 customer-prose manifest builders, one unified
  reviewer provider adapter, and a pure correction/annotation application
  layer;
- exercise the whole review request/response with fixtures and mocks only;
- keep every production runtime path unreferenced: no Worker import or wiring,
  checkpoint/report/artifact/schema/environment/configuration/model-operation
  change, and no provider/model call.

Inputs are already-materialized Free/Paid report-shaped values and immutable
catalogs. Outputs are verified review requests, structured reviewer responses,
and pure reviewed projections/receipts. This phase cannot persist, route, or
make a semantic decision for a real job.

Rollback is deletion/revert of unused local capability; no report authority
has adopted it. Approval of this phase does not authorize Phase 2B2 or Phase
2B3.

### Phase 2B2 - marker-present Free V4 integration

Deliverables:

- call the already-built unified reviewer exactly once after Free questions,
  observations, Q1 answer/sources, and Q1 diagnosis exist;
- persist the verified review receipt and mechanically derived Free metrics in
  the marker-present Free checkpoint before ready;
- require a passing review with no heuristic fallback for marker-present jobs;
- prove marker-absent Free jobs preserve their existing routing and checkpoint
  behavior byte-for-byte at integration seams.

The marker-present Free path is fail-closed on transport, malformed output,
coverage, or review block. It has no field-level semantic retry/deletion loop.
It is separately authorized and separately rollbackable: the immutable marker
continues to select its compatible path; no existing job is rewritten.

### Phase 2B3 - marker-present Paid V3 integration

Deliverables:

- call the unified reviewer exactly once after all Paid customer prose exists
  and before artifact materialization/terminalization;
- require the accepted Free Q1 question, answer, evidence identity, and
  reviewed text to be read-only and continuous in Paid;
- persist the verified receipt with the marker-present Paid artifact and
  remove marker-present reliance on old semantic heuristics;
- prove marker-absent Paid behavior remains unchanged at routing, checkpoint,
  and artifact seams.

The marker-present Paid path also fails closed without local semantic repair or
fallback. It is not authorized until a future exact `FROZEN` scope is approved.

Phase 2B1, 2B2, and 2B3 each receive their own exact allowlist and hard diff
budget. Approval of Phase 1, the carrier architecture, Phase 2A, or one 2B
subphase does not authorize another.

### Phase 3 - protected-Staging acceptance

Deliverables:

- exact candidate commit and immutable image identity;
- one rollback image;
- one newly created Staging report authority with a cost and model-call cap;
- Free/Paid continuity, receipt, HTML completeness, and commercial outcome
  evidence.

This phase requires separate external-action approval. It cannot reuse the
current Paid job, an old report, or historical evidence as the canary.

### Phase 4 - future-job production activation

Only new authorities created after an explicitly approved production
activation use `report-semantic-review-v1`. Existing and in-flight authorities
retain their starting contract. Push, deploy, production configuration, and
production report generation each require the exact production authorization.

### Phase 5 - old heuristic removal

After evidence proves that no active job depends on the marker-absent path,
remove the obsolete semantic gates in a separate cleanup scope. Do not combine
cleanup with first activation. V1/V2 product code remains untouched.

## 9. Automatic execution and drift guard

Every implementation unit records:

- approved design clauses;
- exact allowed files and diff budget;
- expected deliverable;
- focused validation;
- non-goals and external-action count.

Its terminal classification is exactly one of:

- `CONFORMANT`: evidence matches the approved unit; continue automatically;
- `REVISE_WITHIN_PLAN`: a scoped implementation/test defect exists; repair the
  same unit automatically;
- `DEVIATION_REVIEW_REQUIRED`: stop, preserve evidence, and request the
  smallest user decision.

Mandatory stops:

1. Any required production file is outside the active phase allowlist.
2. A schema, dependency, model-operation meaning, payment, credit, artifact,
   database, access, historical-data, or external-action change is required.
3. A customer-visible or architecture decision differs from this design.
4. Two consecutive repairs do not reduce the failing acceptance set and a new
   route is being considered.
5. A production diff budget is exceeded.
6. Existing/in-flight job isolation cannot be proven.
7. A live model call, scan, deployment, payment, report generation, job
   recovery, or other costly action would be next without exact approval.

Within an approved local phase, ordinary compilation errors, test failures,
and bounded implementation mistakes are repaired automatically. The process
does not pause between conformant units.

## 10. Git and verification discipline

- Preserve unrelated dirty files and use the current bounded branch.
- One local commit per approved phase; no push or merge without authorization.
- Before every commit, compare all changed paths and the measured diff with the
  active phase scope.
- Phase 1 requires focused contract tests, package tests, `npm test`,
  `npm run lint`, `npm run build`, and `git diff --check`.
- Later phases add their exact integration and checkpoint-resume suites.
- Use one independent final checker at the Phase 2 local-integration gate and
  at any separately approved protected-Staging gate; do not create per-file or
  per-test checkers.

## 11. Rollback and failure semantics

Before external activation, rollback is a code/config choice because no real
job uses the new marker. After activation, rollback never rewrites an existing
authority: marker-present jobs remain marker-present and must be handled by the
exact reviewed code or stopped; marker-absent jobs remain on their original
path. Deployment rollback must therefore retain one compatible candidate image
for each active authority version.

No failure may produce a mixed artifact containing some locally heuristic
prose and some reviewed prose.

## 12. Success criteria

The design is complete only when:

1. New reviewed jobs have exactly one semantic authority per lifecycle.
2. The program cannot accept or reject customer meaning using word lists,
   semantic regexes, character ratios, or substring relevance.
3. Every customer field is covered by a verified receipt bound to immutable
   evidence and non-prose data.
4. Existing/in-flight jobs never change contract mid-run.
5. Free Q1 remains identical and evidence-bound in Paid.
6. Local verification and separately approved protected-Staging evidence pass.
7. No payment, credit, database, historical artifact, or unrelated product
   behavior changes.

## 13. Explicit non-goals

- Reviving or modifying V1/V2 product flows.
- Redesigning search fanout, crawling, passage ranking, entity resolution,
  provider qualification, evidence grading, payment, refunds, email, access,
  or database transactions.
- Repairing or replaying the current Paid job.
- Deploying or generating a report under this design approval alone.
- Keeping the old heuristic path as the permanent production architecture.
