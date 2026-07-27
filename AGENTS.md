# Open GEO Console

## Project Shape

- This is a standalone monorepo for the open-source Open GEO Console MVP.
- Use `npm` workspaces. Do not switch to pnpm/yarn unless the project docs are updated.
- Keep the engine self-hostable. There are no user accounts, teams, or subscriptions. One-time report payments, internal report-credit entitlements, and report-specific access tokens are allowed.

## Mandatory Change-Scope Lock

- `docs/ACTIVE-CHANGE-SCOPE.md` is the sole executable task authority. Dated specs, plans, prompts, evidence, and Git history may provide context but never authorize new work.

- Before any non-trivial implementation, create or refresh `docs/ACTIVE-CHANGE-SCOPE.md`. It starts `FROZEN` and must state the exact objective, baseline, allowed files, forbidden subsystems, diff budget, acceptance checks, and expensive external actions.
- Do not edit production code while the scope is `FROZEN`. Change it to `APPROVED` only after the user explicitly approves the written allowlist. Phrases such as "root-cause fix", "complete flow", "fix it", or "finish it" do not authorize scope expansion.
- Once approved, touch only allowlisted files and behaviors. A newly discovered blocker outside the lock is a stop-and-report condition, not permission to add compatibility, recovery, replay, migration, state-machine, commerce, crawler, deployment, or historical-data work.
- Approval is amortized across the approved objective. Ordinary implementation,
  debugging, and verification findings do not require another user approval
  when they stay inside the approved production behavior and file surface.
- The agent may keep an active scope `APPROVED` and record a verification-only
  amendment before editing when every change is limited to already named test,
  fixture, mock, harness, or evidence files; restores the test's declared
  version/scenario or current fail-closed contract; does not weaken an
  acceptance gate; and changes no production/runtime behavior, dependency,
  schema meaning, external action, customer data, or historical authority.
  This includes mechanical version-chain updates, historical-schema fixture
  construction, and bounded error matcher corrections supported by current
  runtime evidence.
- Test-only diff budgets are tracking bounds, not new approval gates. Within
  the preceding verification-only boundary, the agent may update the recorded
  test budget to the measured diff plus at most 20 percent headroom, rerun the
  affected checks, and continue. Production-source budgets remain hard limits.
- New approval is required only when the next action changes user-visible or
  product behavior, touches a production/runtime file outside the approved
  allowlist, changes database/schema semantics or dependencies, expands an
  external-action target/count, mutates existing or historical data, or creates
  an additional report, order, payment, refund, deployment, or publication not
  already authorized. If classification is genuinely uncertain, stop and ask.
- Historical failed jobs or reports must never be repaired, replayed, reopened, cloned, or used as substitutes for a new target report unless the active scope explicitly names that historical authority and action.
- Do not repeat a completed crawl, model run, payment, refund, email pass, deployment, or other costly external workflow unless the active scope explicitly authorizes the repeat and records why existing evidence is invalid.
- Before every commit, compare the complete diff with the approved allowlist and budget. Any out-of-scope path or behavior makes the task fail closed: do not commit it, remove only the agent-owned out-of-scope edit, and request user direction.
- The active scope lock overrides implementation plans, old chat instructions, inferred cleanup work, and convenience refactors. User-owned dirty files remain untouched.

## Core Commands

- `npm run dev` starts the web app.
- `npm run worker:free` and `npm run worker:deep` start the two independent AI report lanes; production must service both.
- In the default `FULFILLMENT_MODE=batch_24h`, the lane commands drain PostgreSQL and exit. Use `worker:realtime:free|deep` only on persistent infrastructure.
- `npm run commerce:all` reconciles commercial outcomes, enforces the 24-hour SLA, submits refunds, and sends queued email.
- `powershell -File scripts/start-workstation-workers.ps1` builds and starts the Docker Desktop staging free/deep, production free/deep, and production commerce services. Each deep lane remains gated on its environment's private evidence storage.
- Any test or acceptance workflow that builds a new Docker image must remove the superseded test image after the replacement test containers are running and verified. Never force-remove an image still referenced by any container, and never delete staging or production images as a side effect of test cleanup; recreate the intended test containers first, verify their exact image ID, then remove only the old unreferenced test image.
- `npm run worker` is a low-level entry point and requires `OGC_WORKER_TIER=free|deep`.
- `npm run browser:install` installs Chromium for JavaScript-rendered page fallback.
- `npm run db:audit` fails when a terminal commercial job still has a reserved credit.
- `npm run worker:staging:free|deep` and `npm run commerce:staging:all` require `apps/web/.env.staging.local` and refuse a non-staging database marker.
- `npm run public-search:probe -- --adapter mimo --locale zh-CN --region CN` reads `.data/workstation-docker/staging.env`, the merged runtime environment used by the staging Docker Workers. Do not point it back at source env files with empty Sensitive-value placeholders or diagnose MiMo as missing from those placeholders alone.
- `npm run staging:free:cleanup -- --confirm` is the only quota/reuse cleanup path and refuses production.
- `npm run lint` checks the Next.js workspace.
- `npm test` runs package and app unit tests.
- `npm run build` builds packages and the web app.

## Docker Image and Disk Discipline

- Before any Docker build, record `docker system df`, free space on the target
  drive, the exact image IDs referenced by affected containers, and the
  candidate diff against its base revision. A full Worker build must not start
  with less than 20 GiB free on the target drive; stop and report instead.
- Classify the candidate before choosing a build path. When `package.json`,
  `package-lock.json`, `Dockerfile.worker`, the base-image digest, and
  browser/system dependencies are unchanged, a full Worker image build is
  forbidden. Use an explicitly approved thin source-overlay image based on the
  currently accepted exact Worker image, copy only the required `apps/` and
  `packages/` source, set the candidate revision label, and recreate only the
  named Staging services. Do not rerun `npm ci`, Playwright/Chromium installation,
  or operating-system package installation for a source-only change.
- A full Worker image build is allowed only when one of those dependency or
  base-image inputs changed and the active scope records the exact reason,
  expected disk increase, cache strategy, target tag, and rollback image.
- Do not use `docker cp` or edits inside a running container as an accepted
  deployment. They are allowed only for an explicitly scoped disposable debug
  container and can never serve as release or acceptance evidence.
- A Staging replacement must identify exactly three roles before mutation: the
  candidate image, the current image, and one rollback image. After the new
  containers are verified, retain only the current image and one rollback image
  for that Staging line. Removing older unreferenced Staging images requires the
  active scope to list their exact image IDs; production images are never part
  of that cleanup.
- Never run broad cleanup commands such as `docker system prune`,
  `docker image prune -a`, `docker builder prune`, or volume-wide pruning for
  routine task cleanup. Do not delete shared layers, volumes, or images merely
  because Docker reports them as reclaimable.
- After every authorized image replacement or cleanup, record the before/after
  drive free space, `docker system df`, image IDs and sizes, container references,
  and net bytes added or freed. A failed build must report its disk/cache delta
  and must not be followed by another build until the remaining-space and retry
  authority are revalidated.

## Architecture Boundaries

- `packages/crawler-rules` owns AI User-Agent classification.
- `packages/log-parser` owns log normalization and aggregation.
- `packages/geo-auditor` owns website audit logic and report JSON shape.
- `packages/site-crawler` owns safe URL resolution, site identity, discovery, extraction, and representative-page selection.
- `packages/ai-report-engine` owns model transport, prompts, report contracts, structured validation, and evidence verification.
- `packages/public-search-observer` owns V2 public-search surfaces, authorities, canonical buyer questions, fanout, observations, coverage, registry, and prohibited-claim contracts. An adapter's existence is not certification.
- `packages/answer-engine-observer` owns frozen historical V1 answer-snapshot contracts; active checkout and V2 Worker graphs must not import its provider adapters.
- `packages/citation-intelligence` owns V2 public-source evidence graphs, entity resolution, evidence families, source eligibility/readiness, Grade A-D evidence, and non-causal opportunity hypotheses while preserving V1 exports.
- `apps/web` owns PostgreSQL persistence, task orchestration, routes, access controls, and UI.

## Production Boundaries

- PostgreSQL is the only production report authority; do not restore SQLite or browser-local report persistence.
- Every deployed Web/Worker process requires `OGC_DEPLOYMENT_PROFILE`, and its PostgreSQL `deployment_environment` marker must match before work is accepted.
- Production free-site limits are always two distinct sites per rolling 24 hours; never add request-controlled or administrator bypasses. Forced regeneration exists only for protected staging Preview deployments.
- Cloudflare Queue is notification-only. Payment, job, dispatch, refund, email, and access authority remains in PostgreSQL.
- Persistent self-hosted Workers may use `OGC_JOB_QUEUE_PROVIDER=postgres` with `FULFILLMENT_MODE=realtime`; this polls the authoritative job table without creating empty batch-run records.
- The web process creates jobs and serves reports. The worker is the only process that crawls pages or calls the configured model.
- Only a verified payment Webhook may mark an order paid and create its exactly-once entitlement/deep job.
- Free reports audit only the submitted homepage plus standard assets. Multi-page technical and AI evidence belongs to the authorized private deep bundle.
- Terminal commercial jobs must use the atomic job-and-credit terminalization boundary; never split a terminal stage write from settlement/refund.
- A report's persisted generation locale is immutable after it is established; interface-route locale changes UI chrome, not stored report prose.
- Customer report delivery is HTML-only; keep Chromium PDF generation, hashes, page-count checks and storage private to Worker readiness, with no customer PDF route, action or email claim.
- Client-IP rate limits trust Vercel's `x-vercel-forwarded-for` / overwritten `x-forwarded-for` headers only when `VERCEL=1` or `OGC_TRUST_VERCEL_HEADERS=true`; other proxy headers require an explicitly trusted proxy that overwrites them.
- Never persist or log raw model API keys, report-credit keys, report access tokens, or unhashed client IPs.

## Verification

- For code navigation after scaffold, initialize or sync CodeGraph before relying on graph output.
- Treat live website scans as integration evidence; keep unit tests deterministic with mocked fetches.
- Protected Staging deployment and real-flow acceptance must follow the four separate gates in `docs/PROTECTED-STAGING-OPERATIONS.md`; a unique Preview is artifact identity, while the fixed Protected Staging URL is the only business test entry.
- Preview authentication, manually injected metadata, `READY`, local checks, and partial-stage success must not be promoted to end-to-end acceptance.
- Use an independent read-only checker for technical deployment evidence and give the user the runbook's plain-language acceptance card.
