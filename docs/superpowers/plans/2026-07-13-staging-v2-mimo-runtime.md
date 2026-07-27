# Staging V2 MiMo Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the workstation staging deep Worker use the same operator-supplied MiMo endpoint, key, and model as the Preview V2 runtime without introducing a production fallback.

**Architecture:** The workstation environment builder will populate the three V2 MiMo variables only for `staging` when they are absent, using the already-required local `OGC_AI_*` configuration. Explicit V2 values remain authoritative. The production branch will neither derive nor write V2 values from `OGC_AI_*`.

**Tech Stack:** PowerShell, Docker Compose workstation launcher, Node.js/TypeScript staging Worker, Vitest.

## Global Constraints

- Preserve `OGC_DEPLOYMENT_PROFILE=production` explicit-configuration behavior.
- Never print, commit, or log model API keys.
- Keep PostgreSQL as the report authority; use Cloudflare Queue only for notification.
- Verify the real staging resolver and Worker guard after unit coverage.

---

### Task 1: Make staging V2 MiMo configuration explicit and testable

**Files:**
- Modify: `scripts/start-workstation-workers.ps1`
- Create: `scripts/start-workstation-workers.tests.ps1`

**Interfaces:**
- Consumes: non-empty `OGC_AI_BASE_URL`, `OGC_AI_API_KEY`, and `OGC_AI_MODEL` from `apps/web/.env.local`.
- Produces: V2 MiMo variables in `.data/workstation-docker/staging.env` only when public-search runtime is enabled and those V2 values are missing.

- [ ] Write a failing PowerShell fixture test for missing V2 values and non-empty `OGC_AI_*` values.
- [ ] Run `powershell -ExecutionPolicy Bypass -File scripts/start-workstation-workers.tests.ps1`; expect failure before the mapping exists.
- [ ] Add a staging-only mapping for missing `OGC_PUBLIC_SEARCH_MIMO_BASE_URL`, `OGC_PUBLIC_SEARCH_MIMO_API_KEY`, and `OGC_PUBLIC_SEARCH_MIMO_MODEL`; preserve explicit V2 values and never apply it to production.
- [ ] Re-run the focused test; assert staging values are derived and production does not gain them.
- [ ] Commit the launcher, test, and plan with `fix: configure V2 MiMo for staging worker`.

### Task 2: Verify the real staging runtime boundary

**Files:**
- Modify: none
- Test: `apps/web/src/public-source-forensics/production-runtime.ts`

- [ ] Run `powershell -ExecutionPolicy Bypass -File scripts/start-workstation-workers.ps1 -PrepareOnly` and ensure it prints no secret values.
- [ ] Load `.data/workstation-docker/staging.env` into a Node/tsx resolver diagnostic and assert `{ ok: true }` for the active staging authority.
- [ ] Run `$env:OGC_JOB_QUEUE_PROVIDER='postgres'; npm run worker:staging:deep`; it must pass the staging guard and claim an eligible V2 job.
- [ ] Update `docs/PROJECT-STATE.md` and `docs/TASKS.md` only if the verified configuration source changes operator handoff.
