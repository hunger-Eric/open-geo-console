# Active Change Scope Lock

Status: `APPROVED`

## Proposal: restore the original two-call Direct semantic boundary

The user approved the implementation allowlist on 2026-08-01. The candidate is
implemented; the commit and Protected Staging amendment below awaits approval.

### User-observable objective

A fresh Free V4 Direct run must:

1. use the existing deterministic confirmed buyer-question set and send only
   Q1 to the native-search answer model;
2. persist Q1 plus same-response provider URL annotations as an independently
   readable core result and seal it with a core receipt;
3. call the analysis model exactly once with the unchanged answer or typed
   refusal, answer-source aliases, and unassessed submitted-site page aliases;
4. persist a completed flexible analysis and its receipt, or retain the Q1 core
   while marking analysis incomplete;
5. make checkout depend only on a valid core receipt plus a completed analysis
   with a valid analysis receipt.

Direct makes exactly two model calls in order: `q1_answer -> analysis`.
It makes zero question-editor calls, zero legacy observation searches, and zero
global semantic-review calls. Q2 and Q3 remain confirmed visible locked
questions for a later Paid continuation and are not searched during Free.

### Baseline and current evidence

- Repository: `E:\project\open-geo-console`, branch `main`.
- HEAD and `origin/main`:
  `2a208ea6d971c148336b19cfb29e3c1606cfe956`.
- Current worktree: 40 tracked dirty paths plus 4 untracked Direct files.
  The tracked diff measures `+2368/-2879`; the four untracked files contain
  867 lines. All existing dirty work must be preserved until an approved edit
  intentionally retains, reduces, or restores an exact path below.
- Replacement disposable PostgreSQL evidence passed `275/275`, zero skip:
  `.data/test-runs/postgres-disposable/pg-20260801052141-b6a8973f/receipt.json`.
- The only real Direct sequence sent exactly three requests. Question editing
  and Q1 completed; analysis did not return a completed outcome:
  `apps/web/.data/test-runs/free-v4-direct-real/direct-20260801053627187-2736a3c0/direct-semantics-receipt.json`.
- The failure evidence did not retain the raw analysis output or its specific
  failure classification. It proves the boundary only and does not authorize a
  provider-, transport-, or field-specific root-cause claim.
- The Direct carrier is uncommitted and unpublished. Correct
  `free-v4-direct-semantics-v1` in place; do not add a compatibility version.

### Model-owned analysis contract

The analysis model receives:

- the exact confirmed Q1 text;
- authoritative target canonical name, aliases, and domain;
- the unchanged answer or typed refusal;
- same-response answer sources aliased as `S1..`;
- unassessed submitted-site page candidates aliased as `T1..`; and
- the requested locale.

The retained minimum projection is:

```json
{
  "summary": "natural analysis",
  "observations": ["zero or more natural observations"],
  "recommendations": ["zero or more natural recommendations"],
  "evidenceHandles": ["zero or more S/T handles"]
}
```

The model owns all semantic meaning: whether the answer is useful, whether the
target appears, what gaps exist, how many observations or recommendations are
appropriate, and which current handles support the analysis.

Unknown additional model fields are ignored. Observation, recommendation, and
handle lists are variable length, including zero, within basic retained-size
bounds. The program must not require factor-kind enums, exactly three items,
fixed priorities, `targetFirstSentence`, `targetRoles`,
`competitorLabels`, `targetEvidenceState`, or nested per-item evidence keys.

### Program-owned integrity

Program code may enforce only:

- exact report, job, question-set, Q1, provider-response, and checkpoint
  identities;
- Q1 request text equality with the confirmed question;
- JSON object/basic field types, serializability, non-finite/cycle rejection,
  and bounded total/item sizes;
- provider URL annotations coming from the same answer response;
- public HTTP(S) URL safety, canonicalization, local source IDs, and hashes;
- `evidenceHandles` membership in the current S/T alias map, uniqueness, and
  receipt binding;
- core and analysis receipt hashes, persistence identity, and tamper detection;
- fail-closed checkout with no order or Paid job creation when either receipt
  is missing/invalid or analysis is not completed.

Program code must not infer or rewrite answer relevance, target presence,
target-page relevance, competitor meaning, evidence sufficiency, observation
count, recommendation count, or semantic quality.

### Core and analysis state semantics

#### Q1 core

- A nonblank answer or an existing typed refusal is a completed Q1 outcome.
- Zero provider annotations is an honest empty source set, not by itself a
  technical failure. A typed refusal may retain any same-response annotations.
- Harmless extra JSON fields in answer content are ignored. Model-reported
  source fields are ignored; provider URL annotations remain source authority.
- The core receipt binds Q1 identity/text, answer/refusal, accepted annotations,
  provider/model/search metadata, timestamps, report/job/admission identity,
  and the relevant hashes.
- The core is persisted before analysis and remains readable independently.

#### Analysis

- A structurally valid minimum projection is `completed`, including negative
  prose, empty lists, no target mention, insufficient evidence, and refusal
  analysis.
- Transport/provider rejection, non-JSON content, missing minimum fields,
  unsafe size/type, or a nonexistent evidence handle makes only the analysis
  `incomplete`.
- Analysis failure must not delete, hide, rewrite, or invalidate the Q1 core.
- Direct makes one analysis request and no correction/retry request.

#### Run lifecycle

- A Direct run is fresh and linear. It makes at most one answer request and one
  analysis request.
- Analysis incomplete ends the job as a core-complete limited outcome. It does
  not leave a retryable/resumable Direct checkpoint.
- Re-entering a nonterminal Direct checkpoint must not issue another model
  request. The user starts a new report/run when they want another attempt.

### Reader and checkout behavior

- The report page always shows a receipt-verified Q1 answer/refusal and its
  same-response sources when the core is complete.
- A completed analysis renders its natural summary and variable observation
  and recommendation lists. An incomplete analysis renders an explicit
  analysis-unavailable state without fabricated content.
- The status route exposes distinct core readiness, analysis status, and
  checkout eligibility instead of collapsing them into one `ready` boolean.
- Server-side checkout verifies both receipts and completed analysis status.
  Missing, incomplete, or tampered authority fails closed before creating an
  order or Paid job.
- Historical marker-absent Free rendering and existing Paid V3 review meaning
  remain unchanged.

## Exact allowed production/runtime files

Only these files may retain or receive production/runtime behavior changes:

- `apps/web/package.json`
- `apps/web/src/app/[locale]/reports/[id]/page.tsx`
- `apps/web/src/app/api/reports/[id]/status/route.ts`
- `apps/web/src/components/combined-geo-report-v4-teaser.tsx`
- `apps/web/src/db/commercial-orders.ts`
- `apps/web/src/db/jobs.ts`
- `apps/web/src/db/report-semantic-review-activation.ts`
- `apps/web/src/db/report-v4-admission-jobs.ts`
- `apps/web/src/db/scan-admission.ts`
- `apps/web/src/db/schema.ts`
- `apps/web/src/public-search-adapters/mimo/generative-answer.ts`
- `apps/web/src/report-v4/mimo-provider.ts`
- `apps/web/src/scripts/probe-free-v4-direct-semantics.ts`
- `apps/web/src/worker/processor.ts`
- `apps/web/src/worker/report-v4-free-teaser.ts`
- `package.json`
- `packages/ai-report-engine/src/free-v4-direct-semantics.ts`
- `packages/ai-report-engine/src/generative-search-answer.ts`
- `packages/ai-report-engine/src/index.ts`

## Exact allowed focused tests

Only these test paths may be changed:

- `apps/web/src/components/combined-geo-report-v4-teaser.test.tsx`
- `apps/web/src/db/commercial-orders-semantic-review.postgres.test.ts`
- `apps/web/src/db/report-semantic-review-activation.test.ts`
- `apps/web/src/db/report-v4-admission-jobs.test.ts`
- `apps/web/src/public-search-adapters/mimo/generative-answer.test.ts`
- `apps/web/src/report-v4/mimo-provider.test.ts`
- `apps/web/src/scripts/probe-free-v4-direct-semantics.test.ts`
- `apps/web/src/worker/processor.test.ts`
- `apps/web/src/worker/report-v4-free-teaser.test.ts`
- `packages/ai-report-engine/src/free-v4-direct-semantics.test.ts`
- `packages/ai-report-engine/src/generative-search-answer.test.ts`

## Reduction-only dirty paths

These prior first-cut files may be edited only to remove the agent-owned Direct
changes and restore their HEAD behavior/content. They may not retain new Direct
behavior:

- `apps/web/src/db/business-questions.test.ts`
- `apps/web/src/db/business-questions.ts`
- `apps/web/src/worker/report-v4-diagnosis-enhancer.test.ts`
- `apps/web/src/worker/report-v4-diagnosis-enhancer.ts`
- `apps/web/src/worker/semantic-review-evidence-sink.test.ts`
- `apps/web/src/worker/semantic-review-evidence-sink.ts`
- `packages/ai-report-engine/src/report-semantic-review-provider-adapter.test.ts`
- `packages/ai-report-engine/src/report-semantic-review-provider-adapter.ts`
- `packages/ai-report-engine/src/report-semantic-review.test.ts`
- `packages/ai-report-engine/src/report-semantic-review.ts`
- `packages/ai-report-engine/src/report-v4-diagnosis.ts`
- `packages/public-search-observer/src/business-questions.test.ts`
- `packages/public-search-observer/src/business-questions.ts`

Authority bookkeeping may update only:

- `docs/ACTIVE-CHANGE-SCOPE.md`
- `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md`

No other source, test, fixture, snapshot, script, package, configuration, or
documentation path is implicitly allowlisted.

## Explicitly forbidden

- Question-editor model calls or a replacement question-generation model step.
- Exact-three observation/action requirements, fixed semantic enums, strict
  unknown-field rejection, nested evidence mini-DSLs, or code-generated
  semantic fallbacks.
- Paid V3 prompt/parser/review changes, legacy Free semantic changes, crawler or
  public-search expansion, payment/refund/settlement changes, dependency
  changes, database/SQL migrations, schema-meaning changes, or a new report
  type.
- Automatic retry, correction call, defer, resume, replay, compatibility
  version, state-machine expansion, historical report mutation, or repair.
- Production, shared-database mutation, payment, email, publication, and
  customer-data mutation remain forbidden. Protected Staging and Git may be
  used only by the exact pending amendment after it is approved.

## Diff budget

- Every reduction-only path must finish at zero diff against HEAD.
- Retained production/runtime behavior, excluding the probe script and package
  script entries: maximum `+950/-650`.
- Direct probe and its two package script entries: maximum `+320/-320`.
- Focused tests: maximum `+1100/-1800`.
- Authority/history text: maximum `+500/-500`.
- Dependencies, migrations, generated artifacts, Paid-only behavior, and files
  outside the exact lists: `0`.
- The measured final complete diff, not this tracking budget, is authoritative.
  Stop before further edits if the implementation cannot fit these bounds.

Verification-only amendment (2026-08-01): the focused-test deletion bound was
raised from 1100 to 1800 after the measured Direct fixture simplification reached
1662 deleted lines. This changes no production behavior or acceptance gate.

## Local acceptance checks after approval

1. Call-order tests prove exactly `q1_answer -> analysis`, one call each, with
   zero question-editor, observation-resolver, global-review, correction, or
   retry calls.
2. Answer tests prove harmless extra fields are ignored; answer, typed refusal,
   zero annotations, and same-response annotations remain valid core outcomes;
   foreign/unsafe annotations and identity/hash tampering fail closed.
3. Checkpoint tests prove the core receipt is persisted before analysis and
   remains readable when analysis is incomplete.
4. Analysis tests prove 0/1/N observations and recommendations plus harmless
   extra fields complete successfully; an unknown handle makes only analysis
   incomplete; negative semantic results are completed outcomes.
5. Lifecycle tests prove a nonterminal persisted Direct checkpoint cannot issue
   another model request and analysis incomplete produces a terminal limited
   result rather than retry/resume state.
6. UI/status tests prove Q1 remains visible independently, analysis incomplete
   is explicit, variable lists render, and checkout requires receipt-verified
   completed analysis.
7. Checkout/PostgreSQL-focused tests prove only valid core receipt + completed
   valid analysis receipt can create the Paid continuation;
   missing/tampered/incomplete inputs create no order/job.
8. Existing focused legacy Free and Paid V3 tests pass without meaning changes.
9. Run the exact focused Vitest files above with zero skip, then
   `npm run lint`, `npm run build`, `npm test`, and
   `git diff --check`. Automated checks are regression evidence only.
10. Re-read the final code and complete diff to confirm the exact allowlist,
    zero-diff reduction paths, budgets, two-call boundary, and semantic
    ownership table.

## Pending commit and Protected Staging amendment

The first Preview command was rejected before creation because it used the
personal display name; the corrected team-slug attempt awaits user approval.

- Amend the existing unpushed local candidate only with this corrected scope;
  retain message `fix: restore direct AI semantic boundary`. Git push is `0`.
- Create one temporary clean detached worktree at that candidate SHA and remove
  it after deployment evidence is retained; do not create a branch.
- Create at most one Vercel Preview for linked project `open-geo-console`, team
  `itheheda-6857s-projects`, and require READY plus matching full `gitCommitSha`, `ogcGitSha`,
  and detached-worktree HEAD before any alias switch.
- Build one thin source-overlay image tagged
  `open-geo-console:staging-<candidate-short-sha>-overlay-v1` from current exact
  image `sha256:9b6eec90a89381e6a2fad3f62c00d9f72fa709933ea321c1c07d2c4f3189882f`.
  The package change is script-only; lockfile, dependencies, Worker Dockerfile,
  browser/system inputs, and base image remain unchanged. Full build is `0`.
- Recheck staging schema `44`, marker `staging`, and zero active/recoverable jobs;
  recreate only staging Free and Deep Workers, then require candidate SHA,
  staging/preview/test identity, correct tiers, restart count zero, and no claim.
- Retain rollback image `sha256:5ce966c9029b2b8d48fc5e536f7c7732442593c725884ad1e5d61e9aea88bee3`.
  On failure restore both Workers and the fixed alias once, then stop; no retry.
- After both Workers pass, switch only
  `https://open-geo-console-staging-itheheda.vercel.app` to the accepted Preview
  and perform Gate 3 smoke without creating a report or model/payment action.
- Production, commerce Worker, historical data, report creation, payment,
  email, cleanup, Git push/merge/tag, and Gate 4 execution by the agent: `0`.
- The user's later manual webpage submission is separate acceptance evidence;
  deployment success must not be reported as real-flow acceptance.

## External-action budget after amendment approval

- Local edits inside the exact allowlist and deterministic local checks: allowed
  only after this scope changes to `APPROVED`.
- Disposable PostgreSQL invocation: exactly `1` fresh local full Free Direct
  example for `https://shun-express.com/`, explicitly authorized by the user on
  2026-08-01. It may create only the new local report/job and disposable test
  data required for this example; the database must be cleaned up by its
  canonical disposable runner after evidence is persisted.
- Real model test runs: unlimited while this scope remains `APPROVED`, as
  explicitly authorized by the user on 2026-08-01. Every run remains a fresh
  fixed-input two-call probe with no in-run retry and no database/report/job/UI
  action; a failed run may be followed by another fresh test run.
- Git and Protected Staging: only the exact pending amendment above.
- Production, payment, email, publication, and agent-created real flow: `0`.

## Stop conditions

- Do not edit production or tests while status remains `FROZEN`.
- Stop if implementation needs a path outside the exact list, cannot restore a
  reduction-only path without overwriting unrelated user work, exceeds a
  budget, or requires a migration/dependency/Paid/legacy semantic change.
- Stop before any database, Docker, browser, deployment, Git,
  payment, email, or publication action unless the user grants that exact new
  authority.
