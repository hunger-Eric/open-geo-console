# Active Change Scope Lock

Status: `FROZEN`

This file is the mandatory authorization boundary for the next implementation. While it is `FROZEN`, no production-code edits or external mutations are allowed.

## Intended objective

Preserve the existing Report V4 behavior in which three business questions are answered independently, and implement only the user's original answer-optimization requirement after it has been reconstructed from the remote baseline and approved in writing.

## Baseline

- Remote baseline: `origin/codex/report-v4-implementation`
- Current local branch: preserved for review only; the 10 unpushed commits preceding the scope-guard commit are not an approved implementation baseline.
- User-owned untracked files are outside this task and must remain untouched.

## Allowed files

None while `FROZEN`.

Before approval, replace this section with an exact file allowlist. Directory-wide wildcards are not allowed unless the user explicitly approves them.

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

Zero production files while `FROZEN`.

The approved version must state the maximum number of production files and tests that may change. Exceeding either number requires a new user approval before further edits.

## Acceptance checks

The proposed approved scope must, at minimum, prove:

1. Exactly three V4 questions remain independent.
2. Each answer belongs to the current report and target website.
3. No answer overwrites another answer.
4. The focused report output contains all three answers.
5. No recovery, replay, historical substitution, or repeated crawl is invoked.
6. The complete diff matches the approved file allowlist and budget.

## Unlock procedure

1. Inspect the remote baseline and original product contract without modifying code.
2. Fill in the exact allowed files, expected behavior change, diff budget, tests, and any external action.
3. Show this scope to the user.
4. Change `Status` to `APPROVED` only after the user explicitly approves that written scope.
5. If implementation discovers an out-of-scope blocker, return this file to `FROZEN` and stop.
