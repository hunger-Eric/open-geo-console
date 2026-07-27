# Active Change Scope Lock

## Historical superseded scope (context only)
Status: `FROZEN`

This file is the mandatory authorization boundary for the next implementation. While it is `FROZEN`, no production-code edits or external mutations are allowed.

The deviation audit, convergence steps, and paste-ready fresh-chat prompt are recorded in `docs/handoffs/2026-07-19-v4-answer-optimization-scope-recovery.md`.

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
## Current approved consolidation authority
## Approved local convergence and worktree consolidation (2026-07-27)

Status: `APPROVED`

Approval source: user instruction on 2026-07-27 — “批准，保留 Staging”。
This section is the sole executable authority for the current task; the
historical Q1 scope below is retained for context and is superseded.

### Objective

Converge all already-existing functional/security worktree changes into the
local `main`, verify the result, retain Staging, and leave only the canonical
worktree at `E:\project\open-geo-console`. Do not add functionality.

### Baseline

- Canonical revision: `a35674b`
- Local `main`: `a856280` (ahead by 1)
- Supersession marker: `14786`
- Staging runtime: `235bbc1`
- Worktree count: `15`
- Existing branch and dirty-file inventories are the boundary of work; no new
  branch, file, or behavior may be inferred.

### Allowed surfaces

- Git operations required to classify, preserve, merge, and verify the existing
  branches/worktrees and their already-present dirty files.
- `docs/ACTIVE-CHANGE-SCOPE.md` and other already-existing project status,
  handoff, README, Obsidian, or Hermes projection files only when their facts
  are directly established by the resulting Git/runtime evidence.
- Existing source and test files present in the branch/dirty inventories, only
  to conserve those changes during merge and run the declared verification.
- No new functionality, dependency, schema meaning, or product behavior.

### Dirty preservation

Preserve every user-owned dirty change exactly until classified and safely
merged or explicitly reported. Do not overwrite, discard, reset, stash away
without an auditable mapping, or silently resolve conflicts by choosing one
side. Any unclassifiable or conflicting change is a stop condition.

### Forbidden

- Secrets, credentials, tokens, raw client IPs, or runtime artifacts in files,
  logs, commits, or handoffs.
- New runtime behavior, schema/database changes, dependencies, commerce,
  payments/refunds/email, historical-data replay/repair, or report/job replay.
- Any Production process, image, container, deployment, data, or acceptance
  action.
- Push, remote branch deletion, force-push, broad prune/cleanup, or deletion
  of anything outside the exact named extra worktrees after all gates pass.
- Docker image deletion or pruning except the explicitly authorized Staging
  candidate/current/rollback discipline below.

### Merge strategy

Use a local, auditable merge of all existing functional/security branches and
classified dirty changes into local `main`, preserving every existing unique
commit and recording conflict decisions. Do not synthesize replacement commits
for absent work or introduce unrelated cleanup. The remote remains untouched.

### Conservation budget

- Commits: all existing unique commits from the enumerated worktrees must be
  conserved; zero newly invented product commits.
- Diff: only classified pre-existing dirty diffs and the minimum merge/conflict
  metadata needed to conserve them; zero net new product behavior.
- Documentation projections: update only from established post-merge facts.

### Verification and review gates

1. Independent read-only review confirms branch/worktree inventory, complete
   diff classification, and conservation against the baseline.
2. Run the repository's proportionate tests/lint/build checks for the merged
   source and any affected test surfaces; failures outside this scope stop.
3. Verify Staging runtime identity and health without touching Production.
4. Only after all gates pass may exact extra worktrees be removed.

### Docker and Staging discipline

Before any Docker build, record `docker system df`, target-drive free space,
affected container image IDs, and the candidate diff. A full Worker build is
forbidden unless dependency/base/browser inputs changed and the reason,
expected disk increase, cache strategy, target tag, and rollback image are
recorded. For source-only changes, use the approved thin source-overlay path.
Identify exactly three Staging roles: candidate, current, rollback. Retain
only current plus one rollback image after verification. Only the named
Staging services may be recreated: `Staging Free` and `Staging Deep`.

### Worktree removal and stop conditions

After independent review, tests, and Staging gates pass, remove only the exact
14 non-canonical worktrees, verify `E:\project\open-geo-console` is the sole
worktree, and preserve all remote branches. Stop immediately on an unknown
dirty file, unresolvable conflict, out-of-scope diff, missing authority,
secret/runtime-artifact exposure, disk-space violation, failed gate, or any
request to touch Production, push, delete remote branches, force/prune, or
expand behavior. Report the blocker without substituting or replaying history.

## Accepted Q1 sample presentation (narrative HTML)

Status: `APPROVED`

User accepted the r2/B Q1 sample on 2026-07-25 and directed that the
customer-facing deliverable keep **LLM answer + narrative HTML packaging**,
and drop the previous **code-audit / claim-map table** presentation block.

### Objective

1. Record Q1 sample acceptance for 凌顺 / shun-express.com.
2. Rewrite `fresh-q1-report.html` as narrative report HTML (model ordinary-text
   answer + verified findings about sources and 凌顺), without present/partial/
   unknown claim-map ledgers in the customer page.
3. Keep `fresh-q1-evidence.md` / `fresh-q1-analysis.txt` as technical ledgers.
4. No Free/Deep production code, no third MiMo call, no new page fetches.

### Allowed writes

- `docs/ACTIVE-CHANGE-SCOPE.md`
- `C:\Users\fengc\.codex\visualizations\2026\07\25\019f991c-91c6-7163-aa1f-fb5b905c89e5\fresh-q1-evidence.md`
- `...\fresh-q1-analysis.txt`
- `...\fresh-q1-report.html`
- `...\fresh-q1-report.png`

Production/runtime allowed files: **none**.

### External-action budget

- MiMo / model: 0
- New web reads: 0
- Local screenshot of static HTML only: allowed

### Forbidden

Production/test code; packages; DB/job/report/commerce; containers/deployment;
deleting scope-out auxiliary files; Git stage/commit of user dirty files;
treating external providers as proof of 凌顺 capability.

### Completion

When narrative HTML + screenshot are updated and acceptance is noted in the
technical ledger, stop. Free/Deep product changes require a new scope.
