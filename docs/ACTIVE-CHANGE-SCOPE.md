# Active Change Scope Lock

Status: `APPROVED`

This file contains only the current executable authority. Completed and failed
scopes are context-only in `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md`.

## Current authority: disposable PostgreSQL verification infrastructure (APPROVED)

**Status:** `APPROVED` — the user explicitly approved this exact allowlist and external-action envelope on 2026-07-31.

Verification-only amendment (2026-07-31): `vitest.config.ts` is added solely
to collect the already allowlisted `scripts/**/*.test.ts` runner test. This
changes no production/runtime behavior, dependency, schema, or acceptance gate.

Approved scope amendment (2026-07-31): after the first authoritative default
run proved that the repository's PostgreSQL files require incompatible PG16,
Staging-profile, and PG17 environments, the user approved replacing suffix-wide
selection with an explicit canonical PG16 inventory, fixing four stale test
fixtures, and leaving the Staging/PG17 matrix to a separate future scope.

### User-observable outcome

One repository-owned `npm run test:postgres:disposable` command reliably creates an isolated PostgreSQL test runtime, executes selected or default PostgreSQL/semantic-contract suites without conditional skip, persists machine-readable evidence before cleanup, removes only its run-owned resources, and returns an authoritative exit status. GitHub CI exercises the default gate. This task also delivers the pending U+0000 repair only after the new runner proves its five focused suites and the repository gates.

### Baseline

- Repository: `E:\project\open-geo-console`, branch `main`.
- Local HEAD and `origin/main`: `fbdd41155d3c0495d2422d1b177ba91cb61812dd`.
- Existing dirty implementation is limited to the U+0000 boundary, its tests, the Paid V3 fixture repair, and this scope migration.
- PostgreSQL image authority: existing local `postgres:16-alpine`; runtime records its exact image ID.
- `freight_lead_agent-postgres-1` and host port `5432` are foreign/shared and forbidden.

### Exact file allowlist

- New runtime: `scripts/run-disposable-postgres-tests.mjs`.
- New runtime tests: `scripts/run-disposable-postgres-tests.test.ts`.
- Test collection: `vitest.config.ts` (`scripts/**/*.test.ts` only).
- Root command: `package.json` (`test:postgres:disposable` only; no dependency change).
- New CI: `.github/workflows/postgres-contracts.yml`.
- Project rules: `AGENTS.md`.
- Current/history authority: `docs/ACTIVE-CHANGE-SCOPE.md`, `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md`.
- Retained pending repair: `packages/site-crawler/src/html.ts`, `packages/site-crawler/src/html.test.ts`, `apps/web/src/worker/report-v4-admission-runtime.ts`, `apps/web/src/worker/report-v4-admission-runtime.test.ts`, `apps/web/src/db/recovery-state.postgres.test.ts`.
- Approved canonical-suite fixture repairs: `apps/web/src/db/commercial-orders-semantic-review.postgres.test.ts`, `apps/web/src/db/report-v4-acceptance-ledger.postgres.test.ts`, `apps/web/src/db/report-v4-page-summaries.postgres.test.ts`, `apps/web/src/worker/report-v4-independent-claims.postgres.test.ts`.

No other file may change. `package-lock.json`, dependencies, schemas, migrations, production database code, prompts, models, Worker orchestration, commerce, deployment, and Staging are forbidden.

### Runtime contract

- Node-only orchestrator; no new dependency. Default command selects an explicit canonical PG16 test inventory plus the canonical semantic-contract set. Every discovered `*.postgres.test.ts` file must be classified exactly once as canonical PG16, Staging-profile, or PG17; an unclassified/duplicate entry fails before Docker. The PG16 runner refuses a focused Staging-profile or PG17 PostgreSQL file. Positional compatible test paths select a focused subset.
- Allocate an OS-free `127.0.0.1` port and reject `5432`. Name and label every container with a fresh run ID.
- Start `postgres:16-alpine` with `--tmpfs /var/lib/postgresql/data:rw,size=1g`; no named or anonymous data volume is allowed. Verify image, tmpfs mount, port, name, label, and zero foreign-container overlap before tests.
- Separate phases: Docker/image preflight; container creation; `pg_isready`; exact `SELECT 1`; Vitest invocation; JSON/exit-code persistence; JSON parsing; exact-resource cleanup; cleanup verification; final receipt.
- Persist `.data/test-runs/postgres-disposable/<run-id>/vitest.json`, `exit-code.txt`, and `receipt.json` before cleanup. The ignored run directory remains available as evidence.
- A passing result requires Vitest exit `0`, `numFailedTests=0`, `numPendingTests=0`, `numPassedTests=numTotalTests`, every selected file present in the JSON, successful exact-container cleanup, no run-owned volume, and foreign PostgreSQL still untouched.
- Infrastructure preflight may use at most three fresh setup attempts before Vitest begins; each failed attempt cleans only its exact run-owned container. Once Vitest starts, that invocation is never automatically retried.
- The original loop used three Vitest invocations (one focused failure, one focused pass, one incompatible suffix-wide default failure) plus one setup-only invocation. This approved amendment authorizes at most three additional disposable Vitest invocations: one fixture-focused check, one canonical default gate, and one in-allowlist correction. No model, crawl, payment, email, deploy, Staging, PG17 runtime, or customer-data action is authorized.

### CI contract

- GitHub Actions runs on every pull request and every push to `main`, uses `npm ci`, then runs `npm run test:postgres:disposable` with the classified canonical PG16 plus semantic-contract selection. It must not claim coverage for the separately classified Staging-profile or PG17 suites.
- The workflow uploads the run-owned receipt/JSON evidence with `if: always()` and cannot convert a skip, missing file, malformed JSON, cleanup failure, or nonzero exit into success.
- CI uses no application secrets, Staging database, production database, service deployment, or publication.

### Scope-history contract

- `docs/ACTIVE-CHANGE-SCOPE.md` contains exactly one current authority and no previous-authority sections; target size is at most 180 lines.
- The exact pre-migration working-tree snapshot (4,239 lines and 239,873 UTF-8 bytes before the archive header) is preserved in `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md`. It intentionally includes user-owned uncommitted scope history beyond the 4,068-line HEAD version; replacing it from HEAD would lose that history. The archive is context-only and never executable authority.
- `AGENTS.md` records this current/history split and directs PostgreSQL/semantic-contract changes through the disposable command with zero skipped selected tests.

### Acceptance

1. Unit tests prove Docker args include the exact tmpfs, port `5432` is rejected, preflight retries stop once Vitest begins, evidence precedes cleanup, malformed/missing/skipped JSON fails, selected files are checked, and cleanup targets only the recorded run ID/container.
2. `npm run test:postgres:disposable -- --help` and a no-Docker dry-run/selection check pass.
3. Historical focused run `pg-20260731120917-121edeea` proved the five-file U+0000 path at `133 passed`, `0 failed`, `0 skipped`. The final runner restricts future focused database invocations to the canonical PG16 or semantic inventory; the site-crawler unit path is covered by `npm test`, while the canonical run covers its PostgreSQL/runtime consumers.
4. A fixture-focused disposable check covers the four newly allowlisted stale fixtures with zero failures/skips. The default canonical PG16/semantic-contract command then runs once locally with zero selected-test skips; its receipt proves the selected inventory and explicit excluded classifications. Existing unrelated failures may be fixed only if they are inside this allowlist; otherwise stop before delivery.
5. `npm run lint`, `npm test`, `npm run build`, runner unit tests, workflow/static review, and `git diff --check` pass. The byte-preserved history file is checked by its exact 4,239-line/239,873-byte boundary and is excluded from whitespace normalization; `git diff --check` must pass for every other path. The known Windows preflight timeout must pass independently if it times out in the full parallel suite.
6. Exact diff/allowlist/budget audit passes; no container or volume with the run label remains; freight PostgreSQL remains healthy and unchanged.

### Local verification evidence

- Focused U+0000 run `pg-20260731120917-121edeea`: `133/133`, zero skipped.
- Final canonical run `pg-20260731124225-19e25f9a`: 55 selected files, `272/272`, zero skipped; inventory `50` canonical PG16, `8` Staging-profile, `5` PG17; tmpfs/no-volume, evidence-before-cleanup, and exact cleanup verified. The runtime operator independently observed the foreign freight PostgreSQL still healthy on `5432` after each run.
- Runner unit tests `10/10`, lint exit `0`, build exit `0`, and `git diff --check` passed outside the byte-preserved archive; its three historical trailing-whitespace lines remain unchanged and its exact boundary passed. Full `npm test` passed `3013` tests except the known two Windows PowerShell five-second parallel timeouts; the exact timeout file independently passed `23/23`.
- Independent reviewer found no remaining actionable issue and approved routing the local commit through `git_operator`. CI/remote parity/clean worktree remain delivery gates.

### Budgets and delivery

- Runtime script `+620/-0`; runtime test `+430/-0`; test configuration `+1/-0`; CI `+100/-0`; rules/current-scope content `+200/-40`; pending production repair remains `+80/-20`; pending tests and the four approved fixture repairs remain `+500/-60`; dependencies/schema `0`.
- The 4,239-line, 239,873-byte pre-migration working-tree relocation from `ACTIVE-CHANGE-SCOPE.md` to `ACTIVE-CHANGE-SCOPE-HISTORY.md` is a byte-preserving mechanical move plus at most ten archive-header lines and is tracked separately from the content budgets; it is not the older 4,068-line HEAD snapshot. The new active file must remain at most 180 lines.
- After all local gates pass, route Git mutation through `git_operator`: stage exactly the allowlist, commit on `main` as `test: add disposable PostgreSQL verification`, and non-force push to `origin/main`.
- Observe the new GitHub Actions run. Up to two additional in-allowlist correction commits/non-force pushes are authorized only for failures caused by this runner/workflow; no force push or branch creation. Final completion requires green CI, matching local/remote HEAD, and a clean worktree.
- Stop and report only if the same blocker survives the bounded correction envelope, an out-of-scope production/schema/dependency change is required, foreign resources would be touched, or authorization expands to deployment/Staging/business side effects.
