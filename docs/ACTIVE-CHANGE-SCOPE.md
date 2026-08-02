# Active Change Scope Lock

Status: `APPROVED`

Approved by the user on 2026-08-02 with the exact objective, allowlist,
behavior boundary, acceptance checks, and forbidden actions below.

No production/runtime source edit may begin until the user explicitly approves
this exact objective, allowlist, behavior boundary, and acceptance set.

## Objective

Prevent a fresh Direct Paid deep report from being discarded when the one
existing website-language correction response is structurally unusable but
every reported violation belongs to prose that the report contract already
permits omitting. Preserve strict locale, terminology, evidence, and report
schema validation; do not accept the invalid prose.

## Current baseline and first divergence

- Repository: `E:\project\open-geo-console`, branch `main`.
- Local and remote baseline: `839e31449ca487cf73887c44bdb38b48c6f74d7f`.
- Existing unrelated dirty files are user-owned and must remain untouched.
- Fresh report `72fcba4f-8f37-4f84-81c0-58b31ee5deec` completed Free and V4
  pre-admission. Direct Paid job `d98425c0-5433-4288-b271-de0102a6c770`
  carried `free-v4-direct-semantics-v1` with `max_attempts=1`.
- The Paid job completed six crawls and six page analyses, then failed at
  progress 85 in `website_synthesis` with one
  `WebsiteReportLanguageValidationError` covering six optional/list paths.
- `synthesizeWebsiteReportWithRecovery` made its one language-correction call.
  The final preservation of the original wrapper error proves the correction
  envelope was rejected before corrected prose could be applied. No Deep AI
  report, combined report, or ready artifact was created.

## Allowed production file and behavior

- `packages/ai-report-engine/src/synthesis.ts`
  - keep the existing single synthesis call and at most one existing language
    correction call;
  - keep the current strict correction-envelope path as the first choice;
  - when that correction cannot be parsed or applied, permit a deterministic
    fallback only if every original violation path is one of these removable
    prose surfaces:
    - `organizationProfile.brandNames[index]`;
    - `executiveSummary.strengths|keyRisks|topPriorities[index]`;
    - `pageTypeAnalyses[index].strengths|commonIssues|recommendations[index]`;
    - `findings[index].rewriteExample`;
    - `roadmap.immediate|nextPhase|ongoing[index].actions[index]`;
  - remove exactly the violating entries, preserving the order and content of
    all other entries;
  - reparse the complete report schema and rerun complete locale and GEO
    terminology validation before returning it;
  - fail closed when any violation is a required scalar, a path is unknown, an
    array would no longer satisfy the report schema, or the pruned report still
    fails validation;
  - never alter evidence quotes, URLs, IDs, hashes, source payloads, or
    non-violating prose.

Production-source budget: at most `+140/-40` measured lines.

## Allowed tests and scope records

- `packages/ai-report-engine/src/index.test.ts`
- `packages/ai-report-engine/src/synthesis.test.ts` only if a private helper
  seam is required; prefer `index.test.ts`.
- `docs/ACTIVE-CHANGE-SCOPE.md`
- `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md`

Test-source budget: at most `+220/-40` measured lines.

## Forbidden behavior

- No additional model call, correction retry, alternate provider, response
  replay, compatibility report version, prompt expansion, or token increase.
- No bypass or weakening of report-language, terminology, evidence, URL,
  identity, or structural validation.
- No edit to Worker routing, Direct Q1/Q2/Q3, terminalization, customer read,
  crawler, public search, payment, refund, email, database, schema, migration,
  dependency, Docker, Vercel, or Production code/configuration.
- No repair, reopen, resume, replay, clone, deletion, or mutation of the failed
  report, job, order, refund, credit, artifact, or any historical record.
- No Git stage/commit/push, deployment, Worker/image action, model call, new
  report/order/payment, commerce run, or browser submission in this task.

## Acceptance checks

1. A regression fixture reproduces the six-path class with a structurally
   unusable correction response: red before the repair, green after it.
2. Only the six violating removable entries disappear; remaining prose,
   evidence quotes, and report identity stay byte-for-byte unchanged.
3. The returned report passes the canonical schema parser, locale validation,
   and GEO terminology validation.
4. A valid correction response retains current behavior and uses two total
   model calls: synthesis plus correction.
5. A malformed correction involving any required scalar remains terminal; no
   invalid or mixed-language report is returned.
6. Focused synthesis tests and lint for the changed production/test files pass.
7. `git diff --check` passes and the complete task diff remains inside this
   allowlist and budget.

## Stop conditions

- The actual code requires a file or behavior outside this allowlist.
- The deterministic fallback cannot preserve schema or language validity.
- A new model operation, runtime action, deployment, historical mutation, or
  broader product decision becomes necessary.
