# Active Change Scope Lock

Status: `APPROVED`

Prepared on 2026-08-08 after the user requested commit, push, and deployment
of the completed Paid V4 locale-boundary and atomic terminal-state repair to
the fixed Protected Staging test endpoint.

No Git or deployment mutation may begin until the user explicitly approves
this exact release scope.

## Objective

Create one candidate commit containing only the completed prospective Paid V4
repair and its tests/scope records, push `main` non-force to `origin/main`, then
deploy that exact SHA to Protected Staging Web plus the Free and Deep Workers.
Move the fixed Staging alias once only after all three runtimes report the same
SHA.

Stop after fixed-site smoke. Do not create or rerun a report, crawl, public
search/model call, order, Sandbox payment, refund, email, or customer artifact.

## Candidate contents

Baseline local `main`, `origin/main`, and live remote `main`:
`c05151bf48384bc40e6403457eb978bf2700bda0`.

The candidate SHA will be the single commit produced from exactly these paths:

| Path | Authorized content |
|---|---|
| `apps/web/src/components/payment-return-banner.test.ts` | Failed-progress and normal payment-return state regressions |
| `apps/web/src/components/payment-return.ts` | Treat a failed deep-job progress stage as terminal failure |
| `apps/web/src/db/public-source-commerce.postgres.test.ts` | Atomic terminalization, idempotency, lineage, and rollback proofs |
| `apps/web/src/db/public-source-commerce.ts` | V4-owned atomic permanent-failure terminalizer |
| `apps/web/src/provider-profile/runtime.test.ts` | Prepared search-locale/region compatibility regression |
| `apps/web/src/worker/processor.test.ts` | Transient retry versus permanent terminalization regressions |
| `apps/web/src/worker/processor.ts` | Route permanent Paid V4 core failures through the V4 terminalizer |
| `apps/web/src/worker/report-v4-core-production.test.ts` | Report-language versus provider-search-locale regression |
| `apps/web/src/worker/report-v4-core-production.ts` | Preserve report language and supply prepared provider locale/region |
| `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md` | Archive the completed local implementation and preceding release record |
| `docs/ACTIVE-CHANGE-SCOPE.md` | This exact release authority |

Commit message: `fix: terminalize paid v4 locale failures`.

After commit, reread the resulting full SHA from Git and bind every subsequent
push/deployment command and receipt to that authority. No post-commit source or
scope edit is authorized.

## Confirmed verification baseline

- Focused unit tests: 114/114 passed.
- Exact isolated Staging-profile PostgreSQL target: 17/17 passed, including six
  fault-injection rollback boundaries and idempotency.
- Lint: 0 errors and 8 pre-existing warnings.
- Full workspace build: passed.
- `git diff --check`: passed.
- CodeGraph: synced and up to date.
- Full `npm test`: 3315 passed; four existing unrelated failures plus one
  Windows preflight hook timeout remain outside this release.
- Runtime/dependency inputs (`package.json`, `package-lock.json`, Worker
  Dockerfile, base image, browser/system dependencies) are unchanged, so a full
  Worker image build is forbidden.

## Git authorization

- Stage and commit exactly the eleven paths above on local `main`.
- Push exactly the resulting `main` commit to `origin/main` at
  `https://github.com/hunger-Eric/open-geo-console.git` using one normal
  non-force push.
- No branch creation, merge, rebase, tag, force push, history rewrite, pull
  request, remote deletion, or additional commit.
- Stop if live remote `main` no longer equals the recorded baseline before push.

## Deployment identities

### Candidate

- Web: at most one manual Vercel Preview from the exact candidate SHA using
  `--meta ogcGitSha=<candidate-full-sha>`.
- Worker: at most one thin source-overlay image based on the current exact
  Worker image, tagged
  `open-geo-console:staging-<candidate-short-sha>-paid-v4-locale-overlay-v1`.
- Exact checkout: reuse the clean detached worktree
  `E:\project\open-geo-console\.data\deploy-worktree-readmode`, currently at
  `c05151bf48384bc40e6403457eb978bf2700bda0`; move only its detached HEAD to
  the candidate after the commit is authoritative.

### Current

- Fixed URL: `https://open-geo-console-staging-itheheda.vercel.app`.
- Web deployment: `dpl_9nSXNA4P51g5FqqDZGAz6uw4ZprM`, Preview host
  `open-geo-console-hrgegrt43-itheheda-6857s-projects.vercel.app`, READY.
- Web/Worker revision: `c05151bf48384bc40e6403457eb978bf2700bda0`.
- Worker image:
  `sha256:1ba445594c50ed638b9bb02caf6e2d19c53e6adf57c874ef4c6b7ec00fb25666`,
  tag `open-geo-console:staging-c05151bf-buyer-locale-overlay-v1`.
- Both current Worker containers are running with restart count zero.

### Retained older rollback line

- Web deployment: `dpl_3hLMnHSnQ2Gf4mZa7WHr8nQGKxCX`, Preview host
  `open-geo-console-f01hyi34j-itheheda-6857s-projects.vercel.app`, READY.
- Worker image:
  `sha256:d22b41983741fad5db1eeba3e5c5bceb533a361d084bf884c16d20aa876936d6`,
  tag `open-geo-console:staging-f466b9e8-score-restore-overlay-v1`, revision
  `f466b9e8bad3b5a6be6d38e049e5986b99a1383b`.

## Deployment budget and sequence

1. Reverify exact diff, live remote baseline, clean release checkout, Vercel
   project/team identity, Docker state, disk space, and current/rollback IDs.
2. Commit once and reread the exact candidate SHA from Git.
3. Push `main` once, non-force.
4. Move the existing clean detached release checkout to the exact candidate;
   require clean status and matching HEAD.
5. Create at most one manual Vercel Preview. Require READY, Preview target,
   exact project/team, and `ogcGitSha` plus available Git commit metadata equal
   the candidate SHA.
6. Build at most one thin source overlay from the current exact image; do not
   run `npm ci`, install browsers/system packages, or perform a full build.
7. Preserve Staging env bytes except for exactly one
   `OGC_DEPLOYMENT_VERSION=<candidate-sha>` replacement. Recreate exactly once
   each: `staging-worker-free` and `staging-worker-deep`.
8. Use the existing 60-second readiness function and require running, restart
   count zero, correct tier/profile/image/revision, and zero claimable,
   running, recoverable, or terminalizable work for both Workers.
9. Only after Web/Free/Deep SHA equality, move the fixed alias exactly once.
10. Verify fixed `/zh`, test commerce catalog, final identities, restart counts,
    and zero report/payment side effects.

## Disk and image budget

- Preflight: E drive 39.39 GiB free; Docker images 64 / 30.37 GB; build cache
  15.07 GB.
- Full Worker build: forbidden because dependency/base inputs are unchanged.
- New images: at most one candidate thin overlay.
- Cleanup: none. Do not remove any image, container, cache, volume, worktree, or
  untracked file during this release.
- Record after-state free space, Docker usage, candidate image ID/size,
  container references, and net change.

## Acceptance

- Local and remote `main` equal the candidate SHA after push.
- The unique candidate Preview is READY and independently bound to that SHA.
- Staging Free and Deep Workers use the candidate SHA/image, are ready, running,
  restart count zero, and have not claimed work.
- The fixed Protected Staging alias points to the candidate Preview.
- Fixed `/zh` reaches the expected Vercel protection/application behavior and
  `/api/commerce/catalog` is reachable on the protected test path with
  `mode=test`.
- Final status must say: **Protected Staging deployment completed; real Paid V4
  flow not yet accepted.**

## Failure and rollback

- Before alias movement, stop on any failed Web/Worker identity or readiness
  gate; keep the fixed URL on the current deployment.
- After Worker replacement failure, restore the original Staging env bytes and
  recreate only Free/Deep on the recorded current `c05151b` image, then stop.
- After alias movement failure, restore the alias to the recorded current
  `c05151b` Web deployment, restore Workers if needed, verify, and stop.
- Rollback authorizes no second Preview, second candidate image, retry, report,
  payment, model call, refund, email, cleanup, or production action.

## Explicitly forbidden

- No mutation, replay, retry, resume, repair, clone, refund, email, or artifact
  creation for report `0c0916f1-32ea-4985-8934-d7b4c258abe5`, order
  `9d13652b-416a-4bf5-ae08-225291d942af`, job
  `b67a3f9a-e774-4ff6-8de1-c627d3f83abf`, or any historical record.
- No new report, crawl, search/model call, Checkout, payment, order, refund,
  email, or customer artifact.
- No Production Web, Worker, commerce, database, config, secret, alias, or data
  mutation.
- No schema, migration, dependency, provider configuration, prompt, model, or
  semantic fallback change.
- No deployment or Git action beyond the exact counts and targets above.

## Approval required

Approve this exact release scope to authorize the one commit, one non-force
push, one Protected Staging Preview, one thin Worker overlay, two named Worker
replacements, and one fixed-alias move described above.

---

Approved by the user on 2026-08-08 for exactly the Git and Protected Staging
release actions recorded above.
