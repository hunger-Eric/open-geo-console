# Active Change Scope Lock

Status: `FROZEN`

Approved by the user on 2026-07-19 for the exact implementation allowlist and diff budget below.

The approved work unit is complete and independently audited `CONFORMANT`. This scope is frozen again; no further implementation or external action is authorized.

This file is the mandatory authorization boundary for the next implementation. While it is `FROZEN`, no production-code edits or external mutations are allowed.

## Intended objective

Preserve the existing Report V4 behavior in which three business questions are answered independently, and implement only the user's original answer-optimization requirement after it has been reconstructed from the remote baseline and approved in writing.

## Baseline

- Remote baseline: `origin/codex/report-v4-implementation`
- Current local branch: `codex/v4-answer-optimization-scope-reset`, created directly from the remote baseline with only the scope-guard documentation commit cherry-picked.
- The 10 unapproved product-code commits remain only on the preserved accident branch and are not present in this implementation branch.
- User-owned untracked files are outside this task and must remain untouched.

## Allowed files

No implementation edits are allowed while this scope remains `FROZEN`.

After explicit user approval, the exact implementation allowlist is:

1. `apps/web/src/report-v4/mimo-provider.ts`
2. `apps/web/src/report-v4/mimo-provider.test.ts`

The parser files `packages/ai-report-engine/src/generative-search-answer.ts` and `packages/ai-report-engine/src/generative-search-answer.test.ts` are not approved. Baseline tests already prove that the parser accepts localized direct answers containing official provider names and ordinary industry acronyms. If later test evidence proves that a correct provider result is rejected by the parser, this scope must return to `FROZEN` and obtain a separate approval before either parser file changes.

The complete branch diff may also contain only these scope-control files carried or updated by the mandated scope-guard setup:

3. `AGENTS.md`
4. `docs/ACTIVE-CHANGE-SCOPE.md`
5. `docs/DECISIONS.md`
6. `docs/PROJECT-STATE.md`
7. `docs/TASKS.md`

These five control-plane documents do not authorize product behavior changes. During implementation, only `docs/ACTIVE-CHANGE-SCOPE.md` and `docs/PROJECT-STATE.md` may receive further factual scope/status updates.

## Expected behavior change

- Keep one provider call scoped to the current question only.
- Require the answer to lead with a direct, useful response before necessary explanation.
- For provider-discovery questions, name concrete providers and state the publicly offered service relevant to the question.
- For solution-fit questions, map each solution to its suitable scenario, delivery conditions, and limitations.
- For purchase-verification questions, give a practical checklist covering service scope, conditions, limitations, and risks.
- Ordinary business questions must not be answered with research methodology, generic market background, or no-answer wording.
- Keep sources out of the JSON answer body; sources remain exclusively the current response's provider URL annotations, capped at five.
- Allow an empty answer only for an explicit typed `safety_refusal`, `policy_refusal`, or `high_risk_refusal`.
- Do not change the three-question order, independent inputs, immutable checkpoints, per-question one-local-retry limit, or sibling isolation.

## Forbidden by default

- Job state-machine changes or new states.
- Recovery, replay, resume, compatibility, migration, or historical-record remediation.
- Payment, order, credit, refund, email, access-token, or other commerce behavior.
- Crawl, site admission, page-limit, deduplication, or URL-discovery behavior.
- Worker launchers, environment handling, Docker images, deployment, production, or staging infrastructure.
- Reuse of another website's report, snapshot, job, order, artifact, or answer.
- Repeating a completed crawl, model run, payment, refund, email pass, or deployment.
- Refactors, cleanup, documentation rewrites, or tests unrelated to the approved answer optimization.

## Diff budget

Zero production or test files while `FROZEN`.

After approval, the implementation budget is exactly:

- At most 1 production file changed: `apps/web/src/report-v4/mimo-provider.ts`.
- At most 1 test file changed: `apps/web/src/report-v4/mimo-provider.test.ts`.
- No new production or test files.
- No parser, answerer, checkpoint, state-machine, commerce, crawler, admission, enhancement, Worker-launch, Docker, staging, or deployment file changes.

Exceeding either file count or adding any path requires returning this scope to `FROZEN` and obtaining a new user approval before further edits.

## Acceptance checks

Run only deterministic local checks; no real model call, website scan, payment, refund, email, Worker, Docker, staging, or deployment action is authorized.

```powershell
npm test -- --run `
  apps/web/src/report-v4/mimo-provider.test.ts `
  apps/web/src/worker/report-v4-question-answerer.test.ts `
  packages/ai-report-engine/src/generative-search-answer.test.ts
npm run lint
git diff --check
git diff --name-only origin/codex/report-v4-implementation
```

The focused tests must prove:

1. New provider-prompt tests separately cover provider discovery, solution-to-scenario fit, and purchase-verification checklist intent.
2. Exactly three V4 questions still use independent inputs and checkpoints.
3. A failure or retry remains local to one question and never reruns sibling questions or the whole report.
4. A normal answer is nonblank; only a typed refusal may become `unavailable`.
5. Each answer retains only its own same-response annotations, capped at five.
6. The provider prompt does not request JSON-body sources, citations, URLs, research methodology, or generic market background.

The complete diff must contain no path outside the seven exact files listed above. Verify it with:

```powershell
$allowed = @(
  "AGENTS.md",
  "docs/ACTIVE-CHANGE-SCOPE.md",
  "docs/DECISIONS.md",
  "docs/PROJECT-STATE.md",
  "docs/TASKS.md",
  "apps/web/src/report-v4/mimo-provider.ts",
  "apps/web/src/report-v4/mimo-provider.test.ts"
)
$changed = @(git diff --name-only origin/codex/report-v4-implementation)
$unexpected = @($changed | Where-Object { $_ -notin $allowed })
if ($unexpected.Count -gt 0) { throw "Out-of-scope files: $($unexpected -join ', ')" }
if (@($changed | Where-Object { $_ -eq "apps/web/src/report-v4/mimo-provider.ts" }).Count -gt 1) { throw "Production diff budget exceeded." }
if (@($changed | Where-Object { $_ -eq "apps/web/src/report-v4/mimo-provider.test.ts" }).Count -gt 1) { throw "Test diff budget exceeded." }
```

Before completion, also confirm that no recovery, replay, historical substitution, repeated crawl, model run, commerce pass, Worker/Docker action, or deployment occurred.

## Completed work unit

- Product change: only `apps/web/src/report-v4/mimo-provider.ts` updates the current-question system prompt.
- Test change: only `apps/web/src/report-v4/mimo-provider.test.ts` adds separate provider-discovery, solution-fit, and purchase-verification prompt tests.
- Implementation diff: 1 production file and 1 test file; 41 insertions and 1 deletion; no new production or test files.
- Verification: the three approved focused test files pass 64 tests; `npm run lint` and `git diff --check` pass.
- Independent checker: `CONFORMANT`; the complete branch diff contains exactly the seven approved paths and no parser, answerer, checkpoint, state-machine, commerce, crawler, admission, enhancement, Worker, Docker, staging, or deployment change.
- External actions: none. No model call, website scan, historical recovery/replay, payment, refund, email, Worker/Docker action, staging operation, or deployment was run.
- Next gate: any real `shun-express.com` report, crawl/admission change, or protected-Staging action requires a separate explicit scope and approval.

## Unlock procedure

1. Inspect the remote baseline and original product contract without modifying code.
2. Fill in the exact allowed files, expected behavior change, diff budget, tests, and any external action.
3. Show this scope to the user.
4. Change `Status` to `APPROVED` only after the user explicitly approves that written scope.
5. If implementation discovers an out-of-scope blocker, return this file to `FROZEN` and stop.
