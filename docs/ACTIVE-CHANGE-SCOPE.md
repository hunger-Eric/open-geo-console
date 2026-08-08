# Active Change Scope Lock

Status: `APPROVED`

Prepared on 2026-08-08 after the user requested pushing and deploying the
locally verified former-score-distribution restoration to the Protected Staging
test endpoint.

## Objective

Package the exact six-file scoring repair as one commit on `main`, push it once
to `origin/main`, then deploy that exact candidate to Protected Staging Web and
the Staging free/deep Workers so the user can manually submit a new report and
verify that a one-page zero-finding audit scores 90 instead of 100.

The agent performs deployment identity/protection smoke only. The user owns the
manual report test; the agent does not create a report or invoke crawl/model,
commerce, refund, or email workflows.

## Confirmed baseline

| Item | Value |
|---|---|
| Repository / branch | `E:\project\open-geo-console` / `main` |
| Local HEAD / `origin/main` | `1407cba844c147e0d27fd5de4f6461365b0f3602` / same |
| Dirty source/test surface | Exact locally verified scoring repair in four files plus this scope/history; no other dirty paths |
| Local verification | Focused 41/41; lint 0 errors and 8 pre-existing warnings; all workspace TypeScript and Next.js build passed; CodeGraph current; `git diff --check` passed |
| Current fixed Web alias | `open-geo-console-staging-itheheda.vercel.app` -> `open-geo-console-41orvpy6b-itheheda-6857s-projects.vercel.app` (`dpl_HdXUaBRQ2s8igM3x1vi6VAeYG2oR`, READY) |
| Current Worker image | `open-geo-console:staging-1407cba8-preadmit-retry-overlay-v1` |
| Current Worker image ID | `sha256:82f13cbf9059803b7b4f944c2e5ccc5755d5e3da4c998988852fee606c04bdfb` |
| Current Worker identity | free/deep revision and `OGC_DEPLOYMENT_VERSION` = `1407cba8...`; running; restart 0 |
| Staging database | marker `staging`; no queued/running/retry_wait jobs; 4 free + 1 deep `repair_wait` rows remain untouched |
| Docker / disk | images 62 / 30.34 GB; build cache 15.02 GB; E: 39.77 GiB free |
| Dependency/base inputs | `package.json`, `package-lock.json`, `Dockerfile.worker`, and browser/system dependencies unchanged |
| Build classification | Source-only change; full Worker build forbidden; one thin source overlay required |
| Vercel identity | `itheheda` |

## Gate 0 - candidate commit and push

1. Re-run focused tests and `git diff --check` if the candidate diff changes
   from the locally verified state.
2. Verify the complete diff contains only the six commit-allowlisted files and
   remains within the approved budgets.
3. Create exactly one commit on `main` with message
   `fix: restore technical score distribution`.
4. Push that commit once, non-force, to `origin main`.
5. Record the full candidate SHA and require local `main` and `origin/main` to
   match it.

## Commit file allowlist

| Path | Role |
|---|---|
| `packages/geo-auditor/src/index.ts` | Restored score formula and versioned reconstructable breakdown |
| `packages/geo-auditor/src/index.test.ts` | Formula/distribution regression tests |
| `apps/web/src/components/combined-geo-report-v3-artifact.tsx` | V2/V3 reconstructable arithmetic rendering |
| `apps/web/src/components/combined-geo-report-v3-artifact.test.tsx` | Paid V3 presentation compatibility tests |
| `docs/ACTIVE-CHANGE-SCOPE.md` | Current release authority |
| `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md` | Completed local implementation receipt |

## Commit diff budget

| Surface | Measured / hard limit |
|---|---:|
| Production source | `+45/-26` / no additional source lines |
| Tests | `+38/-21` / no additional test lines |
| Scope/history documentation | `+217/-145` / maximum `+230/-160` |
| Dependencies/schema/migrations | `0` / `0` |

Any source/test delta beyond the measured candidate, or any path outside the
six-file allowlist, is a stop condition rather than permission to repair during
release packaging.

## Gate 1 - exact-SHA release preparation

1. Reuse the existing clean detached worktree at
   `.data/candidate-worktree`; do not create another worktree.
2. Detach that clean worktree at the new candidate SHA and verify its HEAD and
   cleanliness.
3. Reconfirm Docker engine, E: free space >= 20 GiB, `docker system df`, current
   Worker image IDs, no queued/running/retry_wait Staging jobs, fixed Web alias,
   and `npx vercel whoami`.
4. Existing `repair_wait` rows are not active leases and must not be modified,
   retried, repaired, failed, or used as acceptance substitutes.

## Gate 2 - Protected Staging deployment

1. Create exactly one Vercel Preview from the clean candidate worktree with:
   - project `prj_WVpdlJfsEp0YyWM2W54w8oBy985S`;
   - org `team_PbYYV2K2zBjTeThfavXStTOI`;
   - metadata `ogcGitSha=<candidate-full-sha>`.
2. Require Preview `READY` and `gitCommitSha = ogcGitSha = candidate SHA`.
3. Build exactly one thin overlay:
   - `FROM open-geo-console:staging-1407cba8-preadmit-retry-overlay-v1`;
   - copy only candidate `apps/` and `packages/` into `/app`;
   - OCI revision label = candidate full SHA;
   - tag `open-geo-console:staging-<candidate-short>-score-restore-overlay-v1`.
4. Expected incremental disk use is below 1 GiB. Stop before build if free space
   drops below 20 GiB; after a failed build, record disk/cache delta and do not
   retry without new authority.
5. Preserve all other `staging.env` bytes and change only
   `OGC_DEPLOYMENT_VERSION` to the candidate SHA.
6. Create one derived override file named
   `.data/workstation-docker/staging-<candidate-short>-score-restore.override.yaml`
   that changes only free/deep image tag and deployment version.
7. Recreate only `staging-worker-free` and `staging-worker-deep` with
   `--no-deps --no-build --force-recreate`; do not touch commerce, PostgreSQL,
   Production, or any other service.
8. Require both Workers running, restart 0, ready, exact image ID, exact OCI
   revision, and exact deployment version before moving the alias.
9. Move fixed alias `open-geo-console-staging-itheheda.vercel.app` exactly once
   to the accepted Preview.

## Deploy-only mutation allowlist

- Existing clean `.data/candidate-worktree/**` checkout state and one ignored
  thin-overlay Dockerfile tied to the candidate SHA.
- `.data/workstation-docker/staging.env`:
  `OGC_DEPLOYMENT_VERSION` line only.
- One derived
  `.data/workstation-docker/staging-<candidate-short>-score-restore.override.yaml`.
- One candidate Docker image/tag described above.
- Containers `open-geo-console-staging-worker-free-1` and
  `open-geo-console-staging-worker-deep-1` only.
- One Vercel Preview and one fixed-alias reassignment.

## Gate 3 - deployment smoke

1. Verify fixed `/zh` remains protected; an SSO 302 is accepted.
2. Verify fixed alias resolves to the accepted Preview.
3. Verify Web metadata and both Workers all carry the candidate full SHA.
4. Verify both Workers remain running, ready, and restart 0.
5. Record before/after E: free space, `docker system df`, candidate/current/
   rollback image identities, container references, and net disk change.
6. Stop and hand the fixed endpoint to the user. Do not submit a report.

## Rollback identities and action

| Role | Identity |
|---|---|
| Rollback Web | `open-geo-console-41orvpy6b-itheheda-6857s-projects.vercel.app` / `dpl_HdXUaBRQ2s8igM3x1vi6VAeYG2oR` |
| Rollback Workers | `open-geo-console:staging-1407cba8-preadmit-retry-overlay-v1` / `sha256:82f13cbf9059803b7b4f944c2e5ccc5755d5e3da4c998988852fee606c04bdfb` |
| Rollback version | `1407cba844c147e0d27fd5de4f6461365b0f3602` |

If Gate 2/3 fails after mutation, restore the prior `staging.env` deployment
version, recreate only free/deep on the rollback image, restore the prior fixed
alias if it moved, verify, and stop. Rollback is not permission to build a
second candidate.

## Hard action caps

| Action | Maximum |
|---|---:|
| Candidate commit on `main` | 1 |
| Non-force `git push origin main` | 1 |
| Vercel Preview | 1 |
| Thin overlay Docker build | 1 |
| Staging free/deep recreate | 1 pair, plus rollback only on failure |
| Fixed alias move | 1, plus rollback only on failure |
| Report/crawl/search/model/payment/refund/email | 0 |

## Explicitly forbidden

- Any source/test edit beyond packaging the exact locally verified repair.
- Production, commerce service, PostgreSQL/container/volume mutation, full
  Worker build, dependency installation, Docker prune, image cleanup, or
  historical report/job/data mutation.
- New report, scan, crawl, model/search call, checkout, payment, refund, email,
  or Gate 4 acceptance by the agent.
- A second Preview, second candidate image, retry after failed build, or expanded
  deployment target without a new scope.
- Force push, merge, branch/tag creation, additional worktree, or history rewrite.

## Acceptance

1. Candidate commit contains exactly the six allowlisted paths and is identical
   across local `main`, `origin/main`, Vercel metadata, Worker OCI revision, and
   Worker deployment version.
2. Fixed Protected Staging alias points to the READY candidate Preview.
3. Both Staging Workers use the candidate thin overlay, are ready, and restart 0.
4. Protection smoke passes without creating a report or external workflow.
5. Current and rollback image/Web identities remain recorded; no image cleanup
   occurs in this scope.

## Stop conditions

- Diff outside commit allowlist, dependency/base input change, disk below 20
  GiB, queued/running/retry_wait job, SHA mismatch, Preview not READY, Worker
  readiness/restart failure, alias mismatch, or any need for Production.
- Any required second build/Preview/alias move, report creation, historical
  mutation, or scope expansion.

---

**Approved by the user on 2026-08-08.** Gates 0-3 may proceed only within this
exact release allowlist and the recorded hard action caps.
