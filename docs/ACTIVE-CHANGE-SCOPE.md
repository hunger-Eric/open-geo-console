# Active Change Scope Lock

Status: `APPROVED`

Approved by the user on 2026-08-01 with the exact boundary: preserve the
complete Paid deep report and replace only the question-diagnosis and semantic
judgment layer that terminally fails at progress 98. The implementation must
remain the smallest change that satisfies that boundary.

Approved amendment on 2026-08-01 after the first fresh Direct Paid V3
acceptance lineage reached a complete private readiness PDF but failed before
atomic activation. The amendment adds only the terminal write parser, active
customer-read parser, and Direct one-Worker-attempt enforcement needed to
finish the approved user-visible objective. The failed report, order, job,
refund, credit, queued email, and orphaned private PDF remain historical
read-only state and must not be repaired, replayed, deleted, or reused.

Current execution boundary, explicitly narrowed by the user on 2026-08-01:
make only the local code changes above and run the affected basic tests. Do not
commit, push, deploy, build or replace Worker images, start Staging services,
create a report/order/payment, call a model, run commerce, mutate historical
state, or perform browser acceptance. Deployment and manual Web submission
belong to the user's separate follow-up workflow.

## Proposal: finish the Free Direct to Paid V3 product boundary

This is the single approval boundary for implementation, proportionate local
verification, independent review, one committed candidate, Protected Staging
deployment, and one fresh end-to-end acceptance run. Approval does not grant
authority to modify or replay any historical commercial record.

### User-observable objective

A fresh report that starts on `free-v4-direct-semantics-v1`, completes Free,
passes checkout, and enters Paid V3 must deliver the existing complete Paid V3
HTML report. Its deep crawl, screenshots, technical audit, page-level AI
analysis, public-source forensics, provider discovery, roadmap, evidence and
methodology sections must remain present. Within that complete report, all
three locked buyer questions must remain present. Each question must show:

1. the unchanged native-search answer or typed refusal;
2. only the public source annotations returned by that same answer operation;
3. one flexible natural-language analysis when available; and
4. an explicit analysis-unavailable state when the optional analysis call or
   its basic transport/shape validation fails.

The Direct lineage must never enter the legacy Paid V3 correction JSON loop,
per-question rigid diagnosis DSL, or final global semantic-review rewrite. A
failure to produce optional analysis must not discard a completed answer or
turn the whole order into a progress-98 failure/refund.

### Paid report preservation contract

The change is a replacement of only the terminal answer-analysis boundary. It
must not remove, bypass, reduce, or substitute any existing Paid collection or
artifact section:

- multi-page crawl and representative-page coverage;
- deterministic technical findings and per-page technical details;
- page-level model analysis, findings, recommendations, and roadmap;
- ready evidence assets and their report screenshots;
- public-source observations, source graph, and commercial snapshot receipts;
- provider discovery and verification;
- the complete combined Paid V3 HTML artifact, evidence appendix, and private
  readiness checks.

Q2 and Q3 are additions to that preserved deep report, not the Paid product by
themselves. The implementation may reuse the existing inputs and rendering
seams, but it may not replace the Paid report with a question-only artifact.

### Baseline and confirmed root cause

- Repository: `E:\project\open-geo-console`, branch `main`.
- Local HEAD: `5d2e64d8e4abe29d45250729986c4831908484a4`; remote
  `origin/main`: `2a208ea6d971c148336b19cfb29e3c1606cfe956`.
- The worktree has pre-existing dirty paths. They must be preserved; only the
  allowlisted task diff may be staged or committed.
- Staging Free job `276d58a0-66fd-4c19-b168-f2dab03de1b9` completed with valid
  Direct core and analysis receipts.
- Its Paid job `686915a3-05c7-440a-ab73-cd0569386efc` and report
  `e34ea7e0-9031-40b4-b0aa-299d0dc0ee5c` entered marker-absent `legacy` Paid
  V3 and failed at 98 on Q3 with `correction_contract/invalid_correction` after
  Q1 and Q2 were already complete.
- `resolvePaidV3SemanticReviewContract` currently verifies Direct receipts and
  then returns `null`; checkout consequently creates an empty Paid checkpoint,
  and `resolvePaidV3SemanticValidation` maps that checkpoint to `legacy`.
- The deployed Free-only commit did not change the Paid diagnosis enhancer,
  Paid answer correction contract, or Paid final semantic review. The failure
  is therefore a lineage handoff and architecture error, not evidence that the
  Free Direct parser still needs another field exception.

### First-principles product contract

- Models own natural-language meaning: whether the target appears, what the
  answer implies, which gaps matter, and what recommendations are useful.
- Code owns only identity, question/source provenance, public URL safety,
  bounded type/size checks, evidence-handle validity, receipts, persistence,
  artifact readiness, and commercial terminalization.
- Q1 reuses the completed Free Direct core and its completed analysis when
  available; a Free `incomplete` analysis remains explicitly unavailable in
  Paid. Paid makes zero new Q1 model calls in either case.
- A Direct Paid job has exactly one Worker attempt. A transient failure or
  expired lease terminalizes that attempt and cannot automatically redrive it.
- Q2 and Q3 each make exactly one native-search answer call. They use the exact
  locked question and preserve same-response source annotations. No hidden
  correction or source retry is allowed.
- After a Q2 or Q3 core answer exists, that question makes at most one analysis
  call using the same flexible projection as Free Direct:

```json
{
  "summary": "natural analysis",
  "observations": ["zero or more natural observations"],
  "recommendations": ["zero or more natural recommendations"],
  "evidenceHandles": ["zero or more current S/T handles"]
}
```

- Unknown analysis fields are ignored. Arrays may be empty or variable length.
  The program must not require fixed counts, priorities, factor enums,
  target-first-sentence fields, competitor labels, roles, or correction
  objects.
- A negative answer, no target mention, no sources, a typed refusal, or empty
  recommendations is a valid result. It is not a semantic program error.
- Answer transport, identity, or unsafe-source failure may still fail the Paid
  job and use the existing refund boundary. Analysis transport/shape failure
  is recorded as `incomplete`; the completed core remains deliverable.
- The immutable `freeDirectSemanticsVersion` carrier, question-set identity,
  per-question core receipts, Paid answer-card binding receipts, analysis
  receipts/status, and source/handle bindings must survive checkpoints and
  final artifact parsing. The binding receipt must join each core receipt to
  the answer and same-response sources rendered in the HTML.
- Marker-present legacy semantic-review lineages and marker-absent historical
  Paid V3 lineages retain their current behavior. Only fresh Paid jobs whose
  checkout authority is a verified Free Direct lineage use this path.

### Allowed production files and behaviors

- `apps/web/src/db/report-semantic-review-activation.ts`
  - return and verify the immutable Direct carrier for Paid creation;
  - reject mixed or mismatched Direct/legacy authority.
- `apps/web/src/db/commercial-orders.ts`
  - copy the verified Free Direct carrier into the exactly-once Paid job root
    checkpoint and verify it on duplicate webhooks;
  - create Direct Paid jobs with one Worker attempt while leaving legacy Paid
    jobs at their existing three-attempt contract.
- `apps/web/src/worker/answer-first-v3.ts`
  - add a Direct semantic mode for Q2/Q3;
  - one answer call per question, no correction/retry, and durable core
    checkpoints/receipts.
- `apps/web/src/worker/report-v4-free-teaser.ts`
  - expose or minimally share the already accepted Direct analysis input and
    one-call invoker without changing the Free runtime behavior.
- `apps/web/src/worker/paid-v3-direct-semantics.ts` (new)
  - own the bounded Direct Paid analysis calls, per-question status/receipts,
    and fail-open-to-incomplete behavior after a valid core exists.
- `apps/web/src/worker/processor.ts`
  - resolve `free_direct` from the immutable Paid root carrier;
  - route only that lineage around legacy diagnosis and global review;
  - persist the Direct question bundle and prepare the existing V3 artifact.
- `packages/ai-report-engine/src/generative-search-answer.ts`
  - retain Direct answer transport/type/source validation without semantic
    prose gates.
- `packages/ai-report-engine/src/free-v4-direct-semantics.ts`
  - reuse the existing version and flexible analysis/receipt primitives for
    all three questions; do not introduce a compatibility version.
- `packages/ai-report-engine/src/open-geo-answer-v3.ts`
  - parse Direct answer cards without requiring legacy `geoDiagnosis` fields.
- `packages/ai-report-engine/src/combined-geo-report-v3.ts`
  - carry and verify the three Direct analysis states, bindings, and receipts.
- `packages/ai-report-engine/src/index.ts`
  - export only the new Direct Paid contract types/functions required above.
- `apps/web/src/report/combined-artifact-readiness.tsx`
  - materialize the Direct V3 report and include completed answers even when an
    optional analysis is incomplete.
- `apps/web/src/components/combined-geo-report-v3-artifact.tsx`
  - render answer -> sources -> flexible analysis/unavailable for each
    question and remove legacy diagnosis copy only for the Direct lineage.
- `apps/web/src/db/schema.ts`
  - TypeScript-only checkpoint projection changes; no table, column, enum, or
    migration changes.
- `apps/web/src/db/combined-correction-terminalization.ts`
  - accept the explicit semantic-validation mode from the Worker;
  - parse Direct V3 only as `free_direct` and verify that mode against the
    immutable Paid root checkpoint before any activation write;
  - preserve legacy and reviewed V3 behavior.
- `apps/web/src/db/combined-reports.ts`
  - read the immutable Paid root Direct carrier with the active artifact;
  - parse an active Direct V3 payload only as `free_direct` and fail closed on
    marker/payload mismatch;
  - preserve all legacy/V2/V4 read behavior.

Production-source budget: at most `+1800/-1200` measured lines across only the
files above. Existing unrelated dirty content in an allowlisted file must not
be rewritten, normalized, staged, or claimed.

### Allowed tests and evidence files

- `apps/web/src/db/report-semantic-review-activation.test.ts`
- `apps/web/src/db/commercial-orders-semantic-review.postgres.test.ts`
- `apps/web/src/worker/answer-first-v3.test.ts`
- `apps/web/src/worker/paid-v3-direct-semantics.test.ts` (new)
- `apps/web/src/worker/processor-contract.test.ts`
- `apps/web/src/worker/processor.test.ts`
- `apps/web/src/report/combined-artifact-readiness.test.tsx`
- `apps/web/src/components/combined-geo-report-v3-artifact.test.tsx`
- `packages/ai-report-engine/src/generative-search-answer.test.ts`
- `packages/ai-report-engine/src/free-v4-direct-semantics.test.ts`
- `packages/ai-report-engine/src/open-geo-answer-v3.test.ts`
- `packages/ai-report-engine/src/combined-geo-report-v3.test.ts`
- `apps/web/src/db/combined-correction-terminalization.postgres.test.ts`
- `apps/web/src/db/combined-reports.test.ts`
- `docs/ACTIVE-CHANGE-SCOPE.md`
- `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md`

Test/evidence budget: at most `+2200/-1200` measured lines. Test-only measured
budget may follow the repository's verification-only amendment rule; the
production budget is hard.

### Forbidden subsystems and behaviors

- No edit to `report-v4-diagnosis-enhancer`, `report-v4-diagnosis`, Paid V3
  semantic-review implementation/manifests/provider adapters, question
  generation, crawlers, public-search forensics, payment/refund copy, access
  control, delivery email, database migrations, dependencies, or Production.
- No retry, correction prompt, replay, resume mechanism, alternate provider,
  fallback model, compatibility version, new report version, or new state
  machine.
- No repair, reopen, clone, replay, or mutation of job
  `686915a3-05c7-440a-ab73-cd0569386efc`, report
  `e34ea7e0-9031-40b4-b0aa-299d0dc0ee5c`, order
  `935e7dfe-de26-4d6f-bd76-3c9483a386cc`, its payment, refund, ledger, or any
  other historical commercial record.
- No Production deployment, Production Worker start, live customer payment,
  force push, history rewrite, broad Docker cleanup, or secret logging.

### Acceptance checks

1. Focused unit/contract tests prove carrier propagation, duplicate-webhook
   identity, zero Paid Q1 calls, exactly one Q2/Q3 answer call, at most one
   analysis call per completed core, no legacy diagnosis/global review calls,
   and completed artifact output when one analysis is incomplete.
2. Package/app lint, typecheck/build, and the affected test suites pass.
3. `npm run test:postgres:disposable` passes its selected PostgreSQL and
   semantic-contract checks with zero selected-test skip and retained receipt.
4. An independent read-only reviewer finds no legacy-lineage regression,
   hidden retry, completed-answer loss, authority mismatch, or out-of-scope
   production diff.
5. The candidate is one attributable commit on `main`; only allowlisted task
   paths are staged. After checks, `main` may be pushed by fast-forward to
   `origin/main`; no branch or worktree is created.
6. Protected Staging passes the four gates in
   `docs/PROTECTED-STAGING-OPERATIONS.md`: unique Preview identity, fixed
   Protected Staging promotion, exact Worker image identity, then one fresh
   browser-visible business acceptance chain.
7. The fresh chain produces a completed Free Direct report, one test Paid V3
   order/job, and a readable final HTML report with all three exact questions,
   their answers and same-response sources, plus completed or explicitly
   unavailable analysis. The Paid job must not call the legacy diagnosis or
   final review operations and must not fail at 98 on a correction contract.
8. A real Direct V3 payload crosses the terminalization and active-loader
   boundaries with the explicit `free_direct` mode, while absent/mismatched
   root carriers fail closed and legacy V3 remains unchanged.
9. Any Direct Paid Worker failure is terminal on its first Worker claim and
   cannot enter `retry_wait`; legacy jobs retain their existing retry contract.

For the current local-only execution, acceptance is limited to focused tests
covering items 1, 8, and 9. Items 2-7 remain downstream acceptance criteria
and are not authorized actions in this task.

### Authorized expensive and external actions after approval

- Build only one thin source-overlay Staging Worker image based on exact current
  image `sha256:5bb354e06780b49f6b46ba779e2284b26dfffabfcb71e6b08ab1b143f14a4bd6`;
  dependency/base inputs are unchanged, so a full Worker build is forbidden.
- Recreate only Protected Staging Free and Deep Worker services with the
  committed candidate image. The current image above becomes the sole
  rollback image. Production containers/images are excluded.
- Deploy exactly one committed candidate to the unique Preview and fixed
  Protected Staging Web target; no Production promotion.
- Create exactly one fresh Protected Staging Free report and at most one test
  payment/order/Paid V3 job. This authorizes at most six model operations for
  the product chain: Free Q1 answer + Free Q1 analysis, Paid Q2/Q3 answers, and
  Paid Q2/Q3 analyses. It authorizes no automatic rerun after failure.
- Run commerce reconciliation at most once only if the fresh test order needs
  its ordinary terminal commercial state. No manual payment/refund mutation.
- After the replacement containers are verified, remove only these currently
  unreferenced superseded Staging image IDs, and only after rechecking that no
  container references them:
  `sha256:9b6eec90a89381e6a2fad3f62c00d9f72fa709933ea321c1c07d2c4f3189882f`,
  `sha256:5ce966c9029b2b8d48fc5e536f7c7732442593c725884ad1e5d61e9aea88bee3`,
  `sha256:49ce21595b618f83339e6a0be3f01098482645a89342c67e11f1e59f35bd381b`,
  `sha256:77b8d11d7a759e7a388d885e61a84ed2ecc1cc87306eddc4ab892c9af5fc462c`,
  `sha256:1d6e7a0554475ea4f06430b16e164f3249bdd2fad6fa69ebfdc334a8f6cf3522`,
  `sha256:ca1cd19456271c4d986cf2a786fba1e72c82425d46e149aad3b258a4ea0b7184`,
  `sha256:a7857e2ec4356618f9235010bee664a3b79df4b44f956e7dd0ff99c4ae48a30e`,
  `sha256:4f2fca0e9e5385aa31bfe0c84d1a8ad3b463ebdbcc20e33e31eff5d65a273e0c`,
  `sha256:3d3fdd1b988592c7404de8b2e6c3fa7e30b2dc01a68c40b1851574a8a300c5e5`,
  `sha256:3be0958c6628fad79e3bd11b0fe86d54fa2e952bbd9a04f804cd047c463d25c3`,
  `sha256:6295c6c0bc441e94a1eafcbef99bb4ca30112bd8bd494f2aa38d2f874ae0ba81`,
  `sha256:f351ab9fccecc5765849eabf03ab84a250e66993cfe7faf8d2a10b24c859267c`,
  `sha256:d8c558573a15ba9d95c9e5d4956023fed465b0facb88e8061061fda332fd0c00`,
  `sha256:ac7a1f07cbe45171e80ea7444f084ecacf353caf928bf82026b690ff92054309`,
  `sha256:25b692c7c9a9bd6d53791af8e53218f706da91184be8c24c14cd8ce7501b4eeb`,
  `sha256:067980359f2a6b0c7a60da44d9ceed53bd7f5dcfaad723b355b97406ea269c87`,
  `sha256:748e2675f2801b8633118f472c4dc749c8adc595b64e74b6996c4955d47480fa`,
  `sha256:bf2cda4be3610c6298a23d9cfd5f00352f01cc506c8f977d9168cdc3b70bcf78`,
  `sha256:6592d914a3debd7d3e8ff4f261b927a5390910d09196767aff8182b4b115106f`,
  `sha256:f985a3866b6a5636d4f57f8f8068543a8e132948d0f088e8fdbb0c81bdcf6b58`.
- Before and after the authorized Staging replacement/cleanup, record free
  space, `docker system df`, image IDs/sizes, and container references.

### Stop conditions

- Any required production file or behavior outside this allowlist.
- Any need for a migration, dependency/base-image change, Production action,
  historical-data mutation, second report/order/payment, or model retry.
- Any out-of-scope staged path, unresolved identity mismatch, unsafe source,
  or inability to prove the final browser-visible report from the fixed
  Protected Staging entry.

No production/runtime source edit, model call, Git state change, deployment,
payment, or image deletion may begin while this scope remains `FROZEN`.
