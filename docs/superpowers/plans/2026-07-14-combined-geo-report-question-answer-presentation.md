# Combined GEO Report Question Answer Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the customer-visible public-source forensics under the three `combined_geo_report_v1` business questions with one evidence-grounded short answer and a small source-link list per question, while preserving internal evidence and all technical URL/quote/screenshot evidence.

**Architecture:** Add a combined-only, evidence-bound `businessQuestionAnswers` projection whose three entries are synthesized from Grade A/B verified excerpts and validated against the exact question fanout and at least two independent source domains. The canonical `CombinedGeoReportArtifact` renders only the private question, answer, source domain/URL, and question freshness; readiness generates the stored PDF from that same component and rejects missing or misbound answers. Because the existing protected-staging report has no usable sources for its third question, add a staging-only non-billable artifact-refresh job that reuses the locked questions and technical evidence, collects a new public-source snapshot, and atomically activates a new revision only after HTML/PDF/evidence readiness.

**Tech Stack:** TypeScript, React server rendering, Next.js App Router, Vitest, PostgreSQL/Drizzle migrations, Playwright/Chromium, Vercel protected Preview, private Vercel Blob.

## Global Constraints

- Change customer presentation only for `combined_geo_report_v1`; historical `legacy_website_audit_v1`, V1 recommendation, and non-combined V2 report contracts and renderers remain readable and unchanged.
- Every combined report has exactly three purpose-fixed questions and exactly one answer per question.
- Every answer is one short paragraph grounded in at least two Grade A/B verified excerpts from at least two independent registrable domains that belong to that question's query fanout.
- Do not expose excerpts, long summaries, query/snapshot/evidence IDs, evidence grades, matching diagnostics, or internal cost/provenance fields in section 05.
- Preserve internal retrieval text, excerpts, hashes, ratings, source graph, snapshot persistence, and validation.
- Preserve technical findings, URL citations, quotes, and screenshot assets in section 03.
- HTML is canonical; stored PDF bytes must be produced from the same `CombinedGeoReportArtifact` markup and print CSS.
- Protected staging only: do not deploy, migrate, rebuild Workers, repoint aliases, or mutate data in production.
- The old active artifact remains visible until a new revision is ready and atomically activated; failure leaves the old revision active.
- Current staging fact to account for: report `a71d7481-c5dc-4e2a-a042-b9be878feab8`, revision 1, has per-question verified-excerpt sources/domains of `4/3`, `2/2`, and `0/0`. A presentation-only rematerialization cannot truthfully satisfy question 3.

---

## File Map

- Create `packages/ai-report-engine/src/combined-business-question-answers.ts`: combined-only answer types, synthesis prompt, source selection, validation, and model retry.
- Create `packages/ai-report-engine/src/combined-business-question-answers.test.ts`: grounding, ordering, independence, length, and unsupported-reference tests.
- Modify `packages/ai-report-engine/src/combined-geo-report.ts`: add backward-readable optional answer projection and strict ready-artifact validation.
- Modify `packages/ai-report-engine/src/index.ts`: export the combined answer API.
- Modify `apps/web/src/worker/processor.ts`: synthesize/checkpoint answers, resume without duplicate model work, and dispatch staging artifact refreshes.
- Modify `apps/web/src/worker/processor-contract.test.ts`: checkpoint/resume and staging-refresh dispatch tests.
- Modify `apps/web/src/report/combined-artifact-readiness.tsx`: require three grounded answers before rendering or storing PDF.
- Create `apps/web/src/report/combined-artifact-readiness.test.tsx`: same-component HTML/PDF and fail-closed readiness tests.
- Modify `apps/web/src/components/combined-geo-report-artifact.tsx`: render `question + answer + sources` only in section 05.
- Modify `apps/web/src/components/combined-geo-report-artifact.test.tsx`: three-question, clickable-source, redaction, and technical-evidence preservation tests.
- Modify `apps/web/src/report/artifact-model.ts`: load screenshot rows from the payload's exact evidence-asset job IDs so refreshed revisions retain technical screenshots.
- Modify `apps/web/src/db/schema.ts` and `apps/web/src/db/migrations.ts`: add schema v19 and the staging artifact-refresh job reason/lineage.
- Create `apps/web/src/db/staging-combined-artifact-refresh.ts`: guarded refresh preparation/context and atomic ready-revision activation.
- Create `apps/web/src/db/staging-combined-artifact-refresh.postgres.test.ts`: staging-only, no-billing, old-active-on-failure, and one-active-revision tests.
- Create `apps/web/src/scripts/staging-combined-artifact-refresh.ts`: guarded operator command for the fixed existing staging report.
- Modify `apps/web/package.json` and root `package.json`: expose `staging:combined:refresh`.
- Modify `apps/web/src/db/schema-v18.postgres.test.ts` or add `schema-v19.postgres.test.ts`: migration constraints and compatibility coverage.
- Modify `docs/PROTECTED-STAGING-OPERATIONS.md`: document the new staging-only refresh and acceptance/audit steps.
- Modify `docs/PROJECT-STATE.md`, `docs/TASKS.md`, and `docs/DECISIONS.md` only after implementation/staging acceptance establishes final facts.
- Create `docs/operations/evidence/2026-07-14-combined-question-answer-presentation-acceptance.md`: non-secret deployment, revision, browser, PDF, screenshot, and test evidence.

---

### Task 1: Define and validate the combined-only grounded answer contract

**Files:**
- Create: `packages/ai-report-engine/src/combined-business-question-answers.ts`
- Create: `packages/ai-report-engine/src/combined-business-question-answers.test.ts`
- Modify: `packages/ai-report-engine/src/combined-geo-report.ts`
- Modify: `packages/ai-report-engine/src/index.ts`

**Interfaces:**
- Produces: `CombinedBusinessQuestionAnswer`, `CombinedBusinessQuestionAnswers`, `selectQuestionAnswerEvidence(...)`, `parseCombinedBusinessQuestionAnswers(...)`, and `synthesizeCombinedBusinessQuestionAnswers(...)`.
- Consumes: `ConfirmedBusinessQuestionSet`, `RecommendationForensicReportV2`, `PublicSourceEvidence`, and `JsonCompletionClient`.

- [ ] **Step 1: Write contract tests that fail for ungrounded or misbound answers**

  Cover exactly three ordered entries, exact `questionId`/`purpose` alignment, a non-empty short paragraph, at least two evidence IDs, at least two distinct registrable domains, Grade A/B only, `available` retrievals with `verifiedExcerpt`, no ambiguity/contradiction, and exact query-fanout ownership. Include a regression where evidence from question 1 is attached to question 2 and expect a `TypeError` mentioning question evidence.

  ```ts
  const answers = {
    version: "combined-business-question-answers-v1",
    synthesis: { mode: "evidence_constrained_model", modelId: "fixture", inputHash: "hash" },
    answers: report.businessQuestionSet.questions.map((question, index) => ({
      questionId: report.publicSourceForensics.questions.questions[index]!.id,
      purpose: question.purpose,
      answer: `Direct answer ${index + 1} grounded in two verified sources.`,
      sourceEvidenceIds: questionEvidenceIds(report, index).slice(0, 2)
    }))
  };
  expect(parseCombinedBusinessQuestionAnswers(answers, report.businessQuestionSet, report.publicSourceForensics).answers).toHaveLength(3);
  ```

- [ ] **Step 2: Run the focused test and verify it fails before implementation**

  Run: `npx vitest run packages/ai-report-engine/src/combined-business-question-answers.test.ts`

  Expected: FAIL because the new module/exports do not exist.

- [ ] **Step 3: Implement evidence selection and strict parsing**

  Select only evidence satisfying all of:

  ```ts
  evidence.retrievalState === "available" &&
  (evidence.grade === "A" || evidence.grade === "B") &&
  Boolean(evidence.verifiedExcerpt?.trim()) &&
  !evidence.entityAmbiguous &&
  !evidence.contradictory &&
  evidence.queryVariantIds.some((id) => questionQueryIds.has(id))
  ```

  Deduplicate by canonical URL/content family, retain distinct domains first, and fail closed when fewer than two independent domains remain. Keep evidence IDs and excerpts internal; the customer renderer receives only the validated answer projection plus source metadata resolved from the graph.

- [ ] **Step 4: Implement the constrained JSON synthesis prompt and retry**

  Send only the private question, locale, and compact verified evidence records `{ evidenceId, domain, url, excerpt }`. Require one direct paragraph per question, no method explanation, no unsupported facts, no URL/ID text inside the answer, and exact source IDs. Use temperature `0.1`, a bounded token count, caller abort propagation, and the existing three-attempt exponential recovery pattern.

  ```ts
  requiredShape: {
    answers: [{
      questionId: "exact supplied question id",
      purpose: "exact supplied purpose",
      answer: "one concise paragraph",
      sourceEvidenceIds: ["at least two supplied evidence ids"]
    }]
  }
  ```

  Hash the normalized question/evidence input into `synthesis.inputHash`; persist only model ID, input hash, answer text, and selected evidence IDs, never raw model content.

- [ ] **Step 5: Extend `CombinedGeoReportV1` without breaking historical payload reads**

  Add `businessQuestionAnswers?: CombinedBusinessQuestionAnswers` to the V1 payload for backward readability. `parseCombinedGeoReportV1` accepts an old stored payload without the field, but validates it strictly when present. Export a `requireReadyCombinedGeoReport(...)` helper that rejects missing answers; all new readiness and activation paths must call that helper.

- [ ] **Step 6: Run focused package tests**

  Run: `npx vitest run packages/ai-report-engine/src/combined-business-question-answers.test.ts packages/ai-report-engine/src/recommendation-forensic-v2.test.ts`

  Expected: PASS; historical V2 tests remain unchanged.

- [ ] **Step 7: Commit the contract slice**

  ```powershell
  git add packages/ai-report-engine/src/combined-business-question-answers.ts packages/ai-report-engine/src/combined-business-question-answers.test.ts packages/ai-report-engine/src/combined-geo-report.ts packages/ai-report-engine/src/index.ts
  git commit -m "feat: add grounded combined question answers"
  ```

### Task 2: Checkpoint synthesis and preserve evidence across resume

**Files:**
- Modify: `apps/web/src/worker/processor.ts`
- Modify: `apps/web/src/worker/processor-contract.test.ts`
- Modify: `apps/web/src/report/combined-artifact-readiness.tsx`
- Create: `apps/web/src/report/combined-artifact-readiness.test.tsx`
- Modify: `apps/web/src/report/artifact-model.ts`

**Interfaces:**
- Consumes: `synthesizeCombinedBusinessQuestionAnswers(...)` from Task 1.
- Produces: `WorkerCheckpoint.combinedQuestionAnswers`, a resumed combined artifact input, and readiness that accepts only `requireReadyCombinedGeoReport(...)`.

- [ ] **Step 1: Add failing checkpoint/resume tests**

  Verify that a combined job checkpoints the validated answers before Chromium/PDF work, resumes from those answers without another model call, and keeps `pendingArtifactVerification.report` plus commercial snapshot refs intact. Verify a non-combined V2 job neither creates nor requires this checkpoint field.

- [ ] **Step 2: Run the focused Worker contract tests and verify failure**

  Run: `npx vitest run apps/web/src/worker/processor-contract.test.ts`

  Expected: FAIL because the checkpoint has no combined-answer projection.

- [ ] **Step 3: Add `combinedQuestionAnswers` to the Worker checkpoint and both combined finalize paths**

  Reuse a validated checkpoint value when its `inputHash` matches the current question set and public-source graph. Otherwise use the already configured website-analysis client when available, or create the configured client only for the early combined resume path. Persist the answer projection with `phase="artifact_verification"` before calling `buildReadyCombinedArtifact`; abort/retry must not repeat synthesis after that checkpoint is durable.

- [ ] **Step 4: Make combined readiness require and embed the answer projection**

  Add `businessQuestionAnswers` to `buildReadyCombinedArtifact(...)`, construct the report, call `requireReadyCombinedGeoReport(...)`, render `CombinedGeoReportArtifact`, and include each answer plus each selected canonical source URL in the completeness check before PDF export.

- [ ] **Step 5: Add same-component readiness tests**

  Inject or mock PDF/storage collaborators so the test asserts that the HTML handed to `exportCanonicalArtifactHtmlPdf` contains the same `data-business-question-section` and answer/source markup produced by `CombinedGeoReportArtifact`. Add failure cases for a missing third answer and an answer whose selected source belongs to another question.

- [ ] **Step 6: Preserve technical screenshot ownership for refreshed revisions**

  Change `loadPrivateReportArtifact` to derive evidence job IDs from `active.report.technicalFoundation.evidenceAssets.map(asset => asset.jobId)` instead of assuming only `originalPaidJobId` and the current public-source job. Deduplicate rows by asset ID and retain the existing report/access scope.

- [ ] **Step 7: Run focused tests**

  Run: `npx vitest run apps/web/src/worker/processor-contract.test.ts apps/web/src/report/combined-artifact-readiness.test.tsx apps/web/src/report/artifact-model.test.ts`

  Expected: PASS with one synthesis call on initial execution and zero on artifact resume.

- [ ] **Step 8: Commit the Worker/readiness slice**

  ```powershell
  git add apps/web/src/worker/processor.ts apps/web/src/worker/processor-contract.test.ts apps/web/src/report/combined-artifact-readiness.tsx apps/web/src/report/combined-artifact-readiness.test.tsx apps/web/src/report/artifact-model.ts apps/web/src/report/artifact-model.test.ts
  git commit -m "feat: checkpoint combined answer synthesis"
  ```

### Task 3: Replace section 05 with the compact customer presentation

**Files:**
- Modify: `apps/web/src/components/combined-geo-report-artifact.tsx`
- Modify: `apps/web/src/components/combined-geo-report-artifact.test.tsx`
- Modify: `apps/web/src/report/artifact-styles.ts`

**Interfaces:**
- Consumes: validated `businessQuestionAnswers` and source graph/snapshot freshness.
- Produces: one semantic question card per purpose containing question, answer, and source links only.

- [ ] **Step 1: Expand the component fixture to exactly three grounded questions**

  Give each question two distinct-domain sources, unique sentinel excerpts, internal query/snapshot/evidence IDs, and a snapshot freshness timestamp. Add one technical AI citation and one ready screenshot asset sentinel.

- [ ] **Step 2: Write the customer-visible assertions**

  Isolate section 05 by `data-business-question-section`. Assert three question headings, three `.business-question-answer` paragraphs, six `<a href="https://...">` source links with correct per-question ownership, domain labels, and freshness text. Assert the isolated section excludes every sentinel excerpt, neutral query wording, query ID, snapshot ID, evidence ID, `Grade`, `verifiedExcerpt`, and internal ownership/rating text.

- [ ] **Step 3: Assert technical evidence remains intact**

  Assert the full HTML still contains the section 03 technical quote, cited technical URL, and `/api/reports/<report>/evidence/<asset>` image. This prevents the public-source cleanup from deleting website evidence.

- [ ] **Step 4: Run the component test and verify it fails**

  Run: `npx vitest run apps/web/src/components/combined-geo-report-artifact.test.tsx`

  Expected: FAIL because section 05 still renders neutral search text, internal IDs, grades, and excerpts.

- [ ] **Step 5: Implement the compact markup**

  Remove `SourceEvidence` and the neutral search/internal ID lines. Resolve only the selected answer evidence IDs, then render:

  ```tsx
  <article className="business-question-card" data-question-purpose={question.purpose}>
    <h3>{question.privateText}</h3>
    <p className="business-question-answer">{answer.answer}</p>
    <ul className="business-question-sources">
      {sources.map((source) => (
        <li key={source.evidenceId}>
          <a href={source.canonicalUrl}>{source.registrableDomain}</a>
          <span>{source.canonicalUrl}</span>
          <time dateTime={snapshot.observedAt}>{snapshot.freshness}</time>
        </li>
      ))}
    </ul>
  </article>
  ```

  Keep links as real anchors so Chromium PDF preserves click targets. Add compact print-safe CSS without hiding URLs in print.

- [ ] **Step 6: Run component and route tests**

  Run: `npx vitest run apps/web/src/components/combined-geo-report-artifact.test.tsx apps/web/src/report/pdf-artifact-route.test.ts apps/web/src/report/pdf-export.test.ts`

  Expected: PASS; legacy and recommendation PDF routes remain unchanged.

- [ ] **Step 7: Commit the presentation slice**

  ```powershell
  git add apps/web/src/components/combined-geo-report-artifact.tsx apps/web/src/components/combined-geo-report-artifact.test.tsx apps/web/src/report/artifact-styles.ts
  git commit -m "feat: simplify combined public source presentation"
  ```

### Task 4: Add a protected-staging artifact refresh for the existing report

**Files:**
- Modify: `apps/web/src/db/schema.ts`
- Modify: `apps/web/src/db/migrations.ts`
- Create: `apps/web/src/db/schema-v19.postgres.test.ts`
- Create: `apps/web/src/db/staging-combined-artifact-refresh.ts`
- Create: `apps/web/src/db/staging-combined-artifact-refresh.postgres.test.ts`
- Create: `apps/web/src/scripts/staging-combined-artifact-refresh.ts`
- Modify: `apps/web/src/worker/processor.ts`
- Modify: `apps/web/src/worker/processor-contract.test.ts`
- Modify: `apps/web/package.json`
- Modify: `package.json`

**Interfaces:**
- Produces: `ScanJobReason = "staging_artifact_refresh"`, `prepareStagingCombinedArtifactRefresh(...)`, `getStagingCombinedArtifactRefreshContext(...)`, and `terminalizeStagingCombinedArtifactRefresh(...)`.
- Consumes: the active combined revision, locked question set, existing technical foundation/evidence asset references, the normal public-source Worker pipeline, and Task 1 answer synthesis.

- [ ] **Step 1: Write schema and PostgreSQL failure-path tests**

  Prove the refresh job is deep, combined, non-billable, bound to the existing report/order/question set and a new pending revision. Prove preparation is idempotent while pending/running, does not create a correction/credit/refund/email, and refuses a non-staging database marker. Prove readiness failure leaves revision 1 active and a successful transaction leaves exactly one active revision with revision 2.

- [ ] **Step 2: Run the new PostgreSQL tests and verify they fail**

  Run: `npx vitest run apps/web/src/db/schema-v19.postgres.test.ts apps/web/src/db/staging-combined-artifact-refresh.postgres.test.ts`

  Expected: FAIL because schema v19/reason/refresh functions do not exist.

- [ ] **Step 3: Add schema v19 refresh identity**

  Extend only the `scan_jobs.reason` allowlist with `staging_artifact_refresh`. Add `source_artifact_revision_id` to `report_artifact_revisions` as a restrictive self-reference and a `revision_kind` check with existing rows defaulted to `generation`, correction rows set to `correction`, and new refresh rows set to `presentation_refresh`. Preserve the one-active-per-report and one-artifact-per-job indexes.

- [ ] **Step 4: Implement guarded refresh preparation**

  Use `prepareStagingCommand(...)`, verify `VERCEL_ENV=preview`, `OGC_DEPLOYMENT_PROFILE=staging`, the database marker, the fixed report/order identity, active `combined_geo_report_v1`, paid/completed/not-required commercial state, settled original credit, and locked question set. Under the report advisory lock, create one new non-billable deep job, one pending revision `max(revision)+1`, and one dispatch outbox row. Do not alter the active revision.

- [ ] **Step 5: Dispatch refresh jobs through the existing deep Worker**

  Add an early `staging_artifact_refresh` branch that fails closed outside the staging/Preview identity, loads the active combined technical foundation and referenced screenshots, runs the normal public-source pipeline with the same locked questions, and proceeds only when all three questions have at least two Grade A/B sources from independent domains. Synthesize/checkpoint answers, then call normal combined readiness.

- [ ] **Step 6: Implement atomic refresh activation**

  In one transaction lock the refresh job, source active revision, report, order, and pending revision. Re-check the source revision is still active, the new report/question/order identities match, the three answers pass strict grounding, PDF signature/page count/hashes/storage are ready, and no billing side effects exist. Insert the new combined payload, mark pending to ready, demote the prior active revision to ready, activate the new revision, and update `scan_reports.active_artifact_revision_id`. Do not create payment, credit, correction, refund, or email rows.

- [ ] **Step 7: Add the operator command**

  Expose `npm run staging:combined:refresh -- --report a71d7481-c5dc-4e2a-a042-b9be878feab8`. Print only non-secret job/revision IDs and status. A second invocation while pending/running returns the same identities; after activation it requires `--from-revision <active-id>` so accidental repeated refreshes fail closed.

- [ ] **Step 8: Run schema, Worker, and refresh tests**

  Run: `npx vitest run apps/web/src/db/schema-v19.postgres.test.ts apps/web/src/db/staging-combined-artifact-refresh.postgres.test.ts apps/web/src/worker/processor-contract.test.ts`

  Expected: PASS, including zero commercial side effects and old-active preservation on injected readiness failure.

- [ ] **Step 9: Commit the staging refresh slice**

  ```powershell
  git add apps/web/src/db/schema.ts apps/web/src/db/migrations.ts apps/web/src/db/schema-v19.postgres.test.ts apps/web/src/db/staging-combined-artifact-refresh.ts apps/web/src/db/staging-combined-artifact-refresh.postgres.test.ts apps/web/src/scripts/staging-combined-artifact-refresh.ts apps/web/src/worker/processor.ts apps/web/src/worker/processor-contract.test.ts apps/web/package.json package.json
  git commit -m "feat: add atomic staging combined artifact refresh"
  ```

### Task 5: Complete local verification and scoped documentation sync

**Files:**
- Modify: `docs/PROTECTED-STAGING-OPERATIONS.md`
- Modify after verified implementation: `docs/TASKS.md`
- Modify after verified implementation: `docs/PROJECT-STATE.md`
- Modify only if the durable architecture decision changes: `docs/DECISIONS.md`

- [ ] **Step 1: Document the staging-only refresh contract**

  Add the exact command, fixed identity boundary, no-billing/no-email behavior, old-active-until-ready rule, Worker requirement, and audit checklist to `docs/PROTECTED-STAGING-OPERATIONS.md`.

- [ ] **Step 2: Sync CodeGraph after source/schema changes**

  Run: `codegraph sync`

  Expected: `[OK]` and no stale/missing index warning.

- [ ] **Step 3: Run affected tests first**

  ```powershell
  npx vitest run packages/ai-report-engine/src/combined-business-question-answers.test.ts apps/web/src/components/combined-geo-report-artifact.test.tsx apps/web/src/report/combined-artifact-readiness.test.tsx apps/web/src/worker/processor-contract.test.ts apps/web/src/db/schema-v19.postgres.test.ts apps/web/src/db/staging-combined-artifact-refresh.postgres.test.ts apps/web/src/report/pdf-artifact-route.test.ts apps/web/src/report/pdf-export.test.ts
  ```

  Expected: PASS with three answers, correctly owned clickable sources, no public excerpts/IDs/grades, preserved technical quote/image, same-component PDF, and atomic refresh invariants.

- [ ] **Step 4: Run the full required verification**

  ```powershell
  npm test
  npm run lint
  npm run build
  git diff --check
  ```

  Expected: all commands exit 0.

- [ ] **Step 5: Run scoped neat sync**

  Update existing task/state entries rather than adding a changelog narrative. Record only the implemented contract, validation commands, and staging refresh operator boundary. Do not edit global memory; the user did not request a memory update.

- [ ] **Step 6: Commit local completion**

  ```powershell
  git add docs/PROTECTED-STAGING-OPERATIONS.md docs/TASKS.md docs/PROJECT-STATE.md docs/DECISIONS.md
  git commit -m "docs: record combined answer presentation workflow"
  ```

### Task 6: Deploy protected staging, refresh the existing artifact, and capture acceptance evidence

**Files:**
- Create: `docs/operations/evidence/2026-07-14-combined-question-answer-presentation-acceptance.md`
- Runtime artifacts: ignored `output/playwright/` screenshots and trace.

- [ ] **Step 1: Confirm clean reviewed revision and production non-interference baseline**

  Record `git status --short --branch`, commit SHA, current production container/deployment identities, current staging active revision, and zero pending artifact-refresh jobs. Do not run a production migration, deploy, alias, Worker rebuild, or database command.

- [ ] **Step 2: Refresh Preview environment and deploy Preview only**

  ```powershell
  npx vercel pull --yes --environment=preview
  npx vercel deploy --yes
  npx vercel alias set <new-preview-url> open-geo-console-staging-itheheda.vercel.app
  ```

  Keep Vercel Authentication enabled and record the returned deployment ID/URL. Do not pass `--prod`.

- [ ] **Step 3: Apply schema v19 to staging through the normal guarded bootstrap**

  Exercise a protected Preview request or guarded staging command, then run `npm run db:environment:inspect` with staging env and verify marker `staging` plus schema version 19. Run the updated `npm run test:postgres:staging-security` before creating the refresh job.

- [ ] **Step 4: Build/restart staging Workers only from the reviewed commit**

  Run `powershell -File scripts/start-workstation-workers.ps1` and record staging free/deep image revision, image ID, container IDs, zero restarts, and live heartbeats. Confirm production services retain their prior image/container identities.

- [ ] **Step 5: Start the fixed existing-report refresh**

  Run:

  ```powershell
  npm run staging:combined:refresh -- --report a71d7481-c5dc-4e2a-a042-b9be878feab8
  ```

  Let the staging deep Worker process the new job. If any question still has fewer than two independent Grade A/B sources, expect `repair_wait`/non-activation, keep revision 1 active, and report the exact evidence shortfall; do not fabricate an answer or weaken source validation. Resume only through the sanctioned readiness/repair path.

- [ ] **Step 6: Audit the atomic artifact switch**

  Verify one new active revision, the former revision retained as ready, three answer records, at least two selected independent domains per answer, HTML/PDF hashes, `%PDF-` signature, page count, private PDF storage key/readback, unchanged question set, unchanged order/settled credit/refund state, zero new correction, charge, credit, refund, or email rows, and preserved screenshot asset references.

- [ ] **Step 7: Run real Chromium acceptance**

  In an authenticated/protection-bypassed context, bootstrap the existing staging report access and inspect `/reports/a71d7481-c5dc-4e2a-a042-b9be878feab8/report.html` plus its PDF. Capture a full section-05 screenshot and a PDF screenshot. Assert each of the three cards has one concise answer and at least two clickable source anchors belonging to that question; no long excerpt/summary/internal ID/grade text is visible. Also assert section 03 still contains technical URLs, quotes, and non-zero screenshot images.

- [ ] **Step 8: Verify anonymous application-level denial**

  In a fresh browser context that bypasses only Vercel protection but has no report access cookie, verify HTML, PDF, and one evidence route each return application-level `404`. Distinguish this from the outer anonymous Vercel `302/401` checks, which must also remain intact.

- [ ] **Step 9: Re-run final verification against the deployed revision**

  Run `npm test`, `npm run lint`, `npm run build`, `git diff --check`, `npm run db:audit`, and `npm run test:postgres:staging-security`. Record exact passed file/test counts and any conditional skips.

- [ ] **Step 10: Write acceptance evidence and final commit**

  Record commit SHA, Preview deployment ID/URL, fixed staging alias, new artifact revision ID/number, HTML/PDF links, hashes/page count, browser screenshot paths, anonymous 404 results, Worker identities, production non-interference, and test results in the evidence document. Commit the evidence and any final scoped state/task updates.

  ```powershell
  git add docs/operations/evidence/2026-07-14-combined-question-answer-presentation-acceptance.md docs/PROJECT-STATE.md docs/TASKS.md
  git commit -m "docs: record combined answer staging acceptance"
  ```

---

## Self-Review Results

- Spec coverage: all requested customer-visible removals, three grounded answers, per-question links, technical evidence preservation, same-component HTML/PDF, historical contract isolation, protected-staging deployment, atomic stored-PDF replacement, Chromium inspection, anonymous 404, screenshots, and required commands map to explicit tasks.
- Root-cause coverage: the plan does not treat the existing third question's `0` sources as a presentation problem; it fails closed and refreshes evidence through a staging-only Worker job while preserving the old active artifact.
- Compatibility: old stored combined payloads remain readable until rematerialized; non-combined contracts and routes are not migrated to the new answer field.
- Placeholder scan: no implementation step depends on an undefined runtime choice; deployment-generated IDs/URLs are recorded when the corresponding command returns them.

