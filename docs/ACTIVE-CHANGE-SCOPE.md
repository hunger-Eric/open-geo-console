# Active Change Scope Lock

Status: `COMPLETE`

Approved by the user on 2026-08-03 for the exact specification-only allowlist
and one-local-documentation-commit boundary below.

## Objective

Convert the user-approved unified provider-profile design into one reviewable
design specification and one local documentation commit. This scope authorizes
no implementation or runtime change.

## Baseline

- Repository: `E:/project/open-geo-console`.
- Branch / HEAD: `codex/delivery-root-fix` at
  `95e7fb296f6a308b92e4279f9d076a745e22b888`.
- The completed Protected Staging deployment closeout is already present as
  uncommitted edits to `docs/ACTIVE-CHANGE-SCOPE.md` and
  `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md`; preserve it in this documentation
  commit.
- User-owned untracked `apps/web/.tmp-preview/**` remains excluded and must not
  be touched or staged.
- Existing ignored `.data/**` and detached worktrees remain untouched.

## Exact allowlist

- `docs/superpowers/specs/2026-08-03-unified-provider-profile-design.md`
  - Record the approved two-profile design: `mimo_native` and
    `sensenova_anysearch`.
  - Define one canonical selector, capability mapping, credential/config input
    boundaries, startup fail-closed behavior, provider construction flow,
    legacy selector treatment, error handling, migration, tests and live
    acceptance.
  - Explicitly preserve existing provider clients, report prompts/contracts,
    persistence, orchestration, payments and historical reports.
- `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md`
  - Preserve the completed deployment record and append this spec-only scope
    closeout after the specification passes self-review.
- `docs/ACTIVE-CHANGE-SCOPE.md`
  - Record approval and close this documentation-only authority.

No other file may be edited or staged.

## Design constraints

1. `OGC_PROVIDER_PROFILE` is the only provider-routing selector.
2. Secrets remain separate inputs and never become selector logic.
3. `mimo_native` maps analysis, structured V4 operations, native search and
   generative answers to existing MiMo providers.
4. `sensenova_anysearch` maps analysis/structured synthesis to the existing
   OpenAI-compatible SenseNova client, source retrieval to AnySearch, and
   grounded answers to SenseNova over AnySearch evidence.
5. Every active report stage must receive providers from the resolved profile;
   no consumer may independently default to MiMo or inspect a legacy selector.
6. Missing credentials, incompatible legacy routing values, inactive search
   authority or incomplete capability wiring fails Worker startup before a job
   can be claimed.
7. No runtime capability probing or automatic provider fallback.
8. The eventual implementation must remain local to provider resolution,
   startup readiness and existing provider entry points; no database, schema,
   report contract, UI, payment, task-state or historical-data change.
9. The failed report `5cddd8e2-df16-4289-87a3-21914e527a61` remains terminal
   and must not be repaired, replayed or used as implementation acceptance.

## Authorized Git actions after approval

1. Write and self-review the exact design specification.
2. Verify no placeholders, contradictions, ambiguous routing, hidden provider
   defaults or implementation scope expansion remain.
3. Stage only the three allowlisted documentation paths.
4. Run `git diff --cached --check` and verify `apps/web/.tmp-preview/**` plus
   `.data/**` are absent.
5. Create exactly one local commit with message:
   `docs: design unified provider profile`.
6. Do not push, merge, rebase, tag, deploy or change branches/worktrees.

## Acceptance

- The spec provides an exact profile-to-capability mapping and one startup
  resolution path covering analysis, search, grounded answers, V4 structured
  synthesis/diagnosis and GEO article generation.
- It explains why a launcher-only environment-variable patch is insufficient
  and how the minimal design reuses existing clients without a broad rewrite.
- It defines deterministic unit/startup/integration tests and a separately
  authorized fresh Protected Staging report acceptance path.
- It contains no TBD/TODO, secret value, unsupported provider claim or
  implementation code.
- Exactly one local documentation commit contains only the three allowlisted
  paths. No production/runtime behavior changes.

## Forbidden actions

- No production, test, fixture, dependency, config, launcher or runtime edit.
- No provider/model/search/crawl/database/report/order/payment/email call.
- No repair/replay of the failed report or any historical data.
- No push, PR, deployment, Docker action, branch/worktree mutation or cleanup.
- No edit or staging of `apps/web/.tmp-preview/**` or `.data/**`.

## Stop conditions

- The design requires a new schema, report contract, provider client rewrite,
  runtime probe/fallback or behavior outside provider routing/startup readiness.
- Exact routing for an active report stage cannot be determined from current
  source without implementation experimentation.
- Any next action needs a production edit, external call or expanded Git scope.

Documentation work is authorized only within this exact scope.

## Closeout

- The approved design specification was written and self-reviewed at
  `docs/superpowers/specs/2026-08-03-unified-provider-profile-design.md`.
- It contains no TODO/TBD, defines complete two-profile routing, startup
  failure semantics, historical isolation, deterministic verification and a
  separately authorized Protected Staging acceptance path.
- No production/runtime/test/configuration behavior or external system was
  changed. The remaining authorized action is the exact local documentation
  commit defined above.
