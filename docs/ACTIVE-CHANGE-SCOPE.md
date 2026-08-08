# Active Change Scope Lock

Status: `APPROVED`

Prepared on 2026-08-08 after the user requested commit, push, and deployment
of the approved buyer-question prompt and canonical report-language repair to
the fixed Protected Staging test endpoint.

No Git or deployment mutation may begin until the user explicitly approves
this exact release scope.

## Objective

Create one candidate commit containing only the completed prompt/locale repair
and its scope records, push `main` non-force to `origin/main`, then deploy that
exact SHA to Protected Staging Web plus the Free and Deep Workers. Move the
fixed Staging alias once only after all three runtimes report the same SHA.

Stop after fixed-site smoke. Do not create a report, crawl, model/search call,
order, Sandbox payment, refund, email, or customer artifact.

## Candidate contents

Baseline `main` and `origin/main`:
`f466b9e8bad3b5a6be6d38e049e5986b99a1383b`.

The candidate SHA will be the single commit produced from exactly these paths:

| Path | Authorized content |
|---|---|
| `apps/web/src/worker/report-v4-free-teaser.ts` | Previously approved buyer-centered Free/Paid question prompts |
| `apps/web/src/worker/report-v4-free-teaser.test.ts` | Prompt-contract regression coverage |
| `apps/web/src/db/business-questions.ts` | Canonicalize persisted question-set language through shared `normalizeReportLanguage()` |
| `apps/web/src/db/business-questions.test.ts` | Locale canonicalization, precedence, and fail-closed tests |
| `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md` | Preserve the already-written record of the preceding score-distribution Staging release |
| `docs/ACTIVE-CHANGE-SCOPE.md` | This release authority |

Commit message: `fix: align buyer questions and report locale`.

After commit, reread the resulting full SHA from Git and bind every subsequent
push/deployment command and receipt to that authority. The commit cannot embed
its own SHA without a self-reference, so no post-commit file edit is permitted.

## Confirmed verification baseline

- Focused prompt/locale tests: 20/20 passed.
- Full workspace run: 3322 tests passed. Four pre-existing unrelated tests
  remain failing; one independent PostgreSQL time-order fluctuation passed 5/5
  on isolated rerun.
- Lint: 0 errors, 8 pre-existing warnings.
- Workspace build: passed.
- `git diff --check`: passed.
- CodeGraph: synced and up to date.
- Runtime/dependency inputs (`package.json`, `package-lock.json`, Worker
  Dockerfile, browser/system dependencies) are unchanged, so a full Worker
  image build is forbidden.

## Git authorization

- Stage and commit exactly the six paths above on local `main`.
- Push exactly the resulting `main` commit to `origin/main` at
  `https://github.com/hunger-Eric/open-geo-console.git` using a normal
  non-force push.
- No branch creation, merge, rebase, tag, force push, history rewrite, pull
  request, remote deletion, or additional commit.
- Stop if remote `main` no longer equals the recorded baseline before push.

## Deployment identities

### Candidate

- Web: at most one new manual Vercel Preview from the exact candidate SHA,
  using `--meta ogcGitSha=<candidate-full-sha>`.
- Worker: at most one source-only thin Overlay image based on the current exact
  Worker image, tagged
  `open-geo-console:staging-<candidate-short-sha>-buyer-locale-overlay-v1`.
- Exact clean checkout: reuse
  `E:\project\open-geo-console\.data\deploy-worktree-readmode`, currently clean
  and detached at a commit already reachable from `main`; move only its detached
  HEAD to the candidate SHA after the commit is authoritative.

### Current

- Web deployment: `dpl_3hLMnHSnQ2Gf4mZa7WHr8nQGKxCX`, Preview host
  `open-geo-console-f01hyi34j-itheheda-6857s-projects.vercel.app`, READY.
- Web/Worker revision:
  `f466b9e8bad3b5a6be6d38e049e5986b99a1383b`.
- Worker image:
  `sha256:d22b41983741fad5db1eeba3e5c5bceb533a361d084bf884c16d20aa876936d6`,
  tag `open-geo-console:staging-f466b9e8-score-restore-overlay-v1`.

### Rollback

- Web deployment: `dpl_HdXUaBRQ2s8igM3x1vi6VAeYG2oR`, Preview host
  `open-geo-console-41orvpy6b-itheheda-6857s-projects.vercel.app`, READY.
- Worker image:
  `sha256:82f13cbf9059803b7b4f944c2e5ccc5755d5e3da4c998988852fee606c04bdfb`,
  tag `open-geo-console:staging-1407cba8-preadmit-retry-overlay-v1`.

## Deployment budget and sequence

1. Reverify exact diff, remote baseline, clean release checkout, Vercel link and
   identity, Docker state, E-drive free space, and current/rollback identities.
2. Commit once and reread the exact candidate SHA from Git as the runtime
   release authority.
3. Push `main` once, non-force.
4. Move the existing clean detached release checkout to the exact candidate;
   require clean status and matching HEAD.
5. Create at most one manual Vercel Preview. Require READY, Preview target,
   exact project/team, and both `gitCommitSha` and `ogcGitSha` equal to the
   candidate SHA.
6. Build at most one thin source Overlay; no `npm ci`, browser install, OS
   package install, or full Worker build.
7. Preserve Staging env bytes except for the single
   `OGC_DEPLOYMENT_VERSION=<candidate-sha>` value. Recreate exactly two
   services once: `staging-worker-free` and `staging-worker-deep`.
8. Use the existing 60-second tier readiness function and require running,
   restart count 0, correct tier/profile/image/revision, and zero active or
   claimable workflow effects.
9. Move the fixed alias
   `open-geo-console-staging-itheheda.vercel.app` exactly once.
10. Independently verify fixed `/zh`, test commerce catalog, Web/Free/Deep SHA
    equality, and zero report/payment side effects.

## Disk and image budget

- Preflight: E drive 39.7 GiB free; Docker images 63 / 30.35 GB; build cache
  15.05 GB.
- Full Worker build: forbidden because dependency/base inputs are unchanged.
- New images: at most one candidate thin Overlay.
- Cleanup: none. Do not remove any image, container, cache, volume, worktree,
  or untracked file during this release.
- After deployment, record free space, Docker system usage, candidate image ID
  and size, container references, and net change.

## Acceptance

- Local and remote `main` equal the candidate SHA after push.
- The unique candidate Preview is READY and independently bound to the exact SHA.
- Staging Free and Deep Workers use the same candidate SHA/image, are ready,
  running, restart count 0, and have not claimed work.
- The fixed Protected Staging alias points to the candidate Preview.
- Fixed `/zh` reaches expected Vercel protection/application behavior and
  `/api/commerce/catalog` is reachable through the protected test path with
  `mode=test`.
- An independent read-only checker confirms technical deployment evidence.
- Final status must say: **Protected Staging deployment completed; real flow
  not yet accepted.**

## Failure and rollback

- Before alias/container mutation, any failure stops without retry.
- After mutation, restore the original Staging env bytes, recreate only Free
  and Deep with the recorded current/rollback image as appropriate, and restore
  the fixed alias to the current Web deployment if it moved.
- Verify rollback, report it, and stop. Rollback does not authorize a second
  Preview, second image build, or second deployment attempt.

## Explicitly forbidden

- Production, production database, production Worker, production alias, live
  payment, or customer email changes.
- Any historical report/job/order/question-set/payment/refund/access mutation,
  repair, replay, retry, resume, clone, or replacement.
- Gate 4, a new report, public crawl/search/model call, Sandbox Checkout, email,
  or paid-report acceptance.
- Schema, migration, dependency, prompt/locale behavior beyond the candidate
  diff, provider configuration, webhook, secret, or Vercel Git-link changes.
- Broad Docker cleanup, image deletion, force-removal, worktree creation or
  deletion, or editing/removing existing untracked release files.

## Stop conditions

- Diff, remote baseline, project/team, environment marker, runtime identity,
  candidate/current/rollback identity, or clean-checkout evidence conflicts.
- Less than 20 GiB free, dependency/base inputs changed, a full build becomes
  necessary, or either Worker has active/claimable/recoverable work.
- Preview identity cannot independently prove the exact candidate SHA.
- Any second Preview/build/recreate/alias move or any real report/payment action
  would be required.

---

Approved by the user on 2026-08-08: one six-file commit, one non-force push of
`main`, and one Protected Staging Gates 1-3 release with one Preview, one thin
Worker Overlay, two Staging Worker recreations, one fixed-alias move, zero
real-flow actions, and the exact current/rollback identities above.
