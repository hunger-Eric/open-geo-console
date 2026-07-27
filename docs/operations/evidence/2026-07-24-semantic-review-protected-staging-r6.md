# 2026-07-24 protected-Staging semantic diagnosis Phase 3R6 evidence

## Result

Final status: `DEVIATION_REVIEW_REQUIRED`.

The exact Phase 3R5 semantic diagnosis assembly candidate was deployed to the
protected Staging Web and Free/Deep Workers. The user submitted exactly one new
`https://shun-express.com/` report through the protected UI.

The technical scan completed, but the first foundation Free job stopped before
foundation report materialization. Its configured page-analysis operation
failed the report-language gate at `analyses[0].summary`, and the durable job
entered `repair_wait` with `report_language_validation_failed`.

This happened before marker-bearing Free V4 admission, Q1 answer generation,
Q1 diagnosis, or unified semantic review. Phase 3R6 therefore does not provide
runtime acceptance evidence for the Phase 3R5 diagnosis change. The approved
stop rule prohibits operator repair, resume, replay, replacement, a second
report, checkout, or Sandbox payment.

## Candidate and Web deployment

- Branch: `codex/v4-answer-optimization-scope-reset`.
- Candidate:
  `12449e807bdd4c5c2385f92f4a7523b6e025dac9`
  (`fix: assemble deferred diagnosis evidence in code`).
- Detached deployment worktree:
  `E:/project/open-geo-console/.data/semantic-review-phase3-candidate`;
  exact detached candidate and clean at deployment.
- Exactly one new Vercel Preview:
  `dpl_CvWyY6ydVhuGtUaakjF93kZEnzg5`.
- Preview URL:
  `https://open-geo-console-1srwmor61-itheheda-6857s-projects.vercel.app`.
- State/target: `READY` / Preview.
- `gitCommitSha`, `githubCommitSha`, and `ogcGitSha` all equal the candidate.
- The protected catalog returned HTTP 200 with commerce mode `test`; the
  protected localized page returned HTTP 200 after its normal redirect.
- The fixed protected-Staging alias
  `https://open-geo-console-staging-itheheda.vercel.app` was moved once and
  resolves to that exact Preview.
- Former Preview `dpl_AzvNKkJu1d3RarbGYKkk6zxx2mv8` remains the Web rollback.
  No deployment was deleted or promoted to production.

## Worker image, containers, and disk

- Dependency/base inputs were unchanged. No full Worker build, `npm ci`,
  browser/system-package installation, base pull, `docker cp`, or in-container
  edit ran.
- Exactly one thin overlay was built from
  `sha256:ae8c08a5e385c4f5eb11b400ea754edccc868332fc44eb057c35b8d873d0f079`;
  it copied only `apps/` and `packages/` with a 306.00 kB build context.
- Candidate tag:
  `open-geo-console:staging-12449e807bdd4c5c2385f92f4a7523b6e025dac9`.
- Candidate image:
  `sha256:7d78311c673e2ae54b2ae384816458427c100199b281a95b34c767c877d353f5`,
  size 1,237,613,402 bytes, exact candidate revision label.
- Retained rollback:
  `sha256:ae8c08a5e385c4f5eb11b400ea754edccc868332fc44eb057c35b8d873d0f079`,
  revision `05a5209ff60dc910023daba397cb6f5933ab4a9d`.
- Only ignored `OGC_DEPLOYMENT_VERSION` changed. The SHA-256 of every other
  `staging.env` line remained
  `3723e36045914ce12f8f0d27d3b6758453ef0a57c2fdb19a97b9031078c2b1eb`.
- Staging Free container:
  `0b24e00cbbb73f682ced082168cd4ac234c1b2c5b94049ee2b2a44d38f7e750b`.
- Staging Deep container:
  `bffd25630948f2847ba93d0ff47d107c739dde168e56431b025289e50ae709a4`.
- Both use the exact candidate image/revision, are running with zero restarts,
  have correct free/deep tiers and `staging` / `preview` / `test` identity, and
  emitted their normal readiness lines.
- PostgreSQL remained profile `staging`, schema version `42`, with six
  pre-existing diagnosis checkpoint rows before the new report.
- The older zero-reference Staging image
  `sha256:c5f558db842b1a7c6cb84a0fe373ace719d2ad2a6304f3c238148dc3c185aff1`
  was the only image removed after candidate readiness. No broad cleanup ran.
- E drive free bytes were 19,310,456,832 before the thin build,
  19,310,350,336 after it, and 19,310,039,040 after exact image cleanup.
- Docker ended with 57 images using 52.74 GB, 23.88 GB local volumes, and
  1.29 GB build cache.
- No production alias, deployment, image, container, database, report, or
  commerce action was executed.

## New report and foundation stop

- Report:
  `ca243d40-707d-4c54-a65e-ed07db47a9c3`, created
  `2026-07-24T11:28:07.647Z`.
- URL/site/locale:
  `https://shun-express.com/` / `shun-express.com` / `zh`.
- Technical state: `completed`, with no technical error.
- The report has exactly one job:
  `d79fdfdf-2190-43ac-9311-ccd94a9e70f1`.
- Job contract/reason:
  `legacy_website_audit_v1` / `staging_regeneration`.
- Durable state:
  - stage/execution: `analyzing` / `repair_wait`;
  - phase/progress: `page_analysis` / `65`;
  - job attempts: `1` of `3`;
  - phase attempt/resume generation: `0` / `0`;
  - checkpoint revision: `8`;
  - `retry_not_before`: null;
  - repair deadline: null;
  - error and repair reason: `report_language_validation_failed`.
- The single normalized error event is operator-repairable
  `ReportLanguageValidationError`, recorded
  `2026-07-24T11:28:50.861Z`, with sanitized message
  `Report language validation failed at analyses[0].summary.` and no causes.
- The last transition is `running -> repair_wait` at `page_analysis`; the job
  remained unchanged through the read-only inspection at
  `2026-07-24T11:34:03.153Z`.
- The repository recovery boundary `resumeScanJobAfterRepair` is explicitly
  operator-only and has no production caller. This state does not schedule an
  automatic retry.
- Foundation AI reports: `0`.
- Marker-bearing Free V4 jobs: `0`.
- Q1 answers, Q1 diagnoses, and Free semantic receipts: `0`.

## Commercial and artifact boundary

- Orders: `0`.
- Payment events: `0`.
- Credits: `0`.
- Refunds: `0`.
- Paid jobs: `0`.
- Artifact revisions: `0`.
- No checkout was opened and no Airwallex Sandbox payment was attempted.

## Stop boundary

The exact candidate remains on the protected Staging Web and both Staging
Workers because the new report now exists. The report, job, checkpoint,
transition, and error event remain immutable evidence.

Do not submit the URL again. Do not resume, repair, replay, clone, replace, or
terminalize this job manually. Do not create a checkout or attempt Sandbox
payment. Continuing diagnosis acceptance requires a separately frozen scope
that treats this foundation page-language failure as a new root cause; it may
not retry or fix this report or use Phase 3R4 history as a substitute.
