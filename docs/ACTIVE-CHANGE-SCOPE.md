# Active Change Scope Lock

Status: `APPROVED`

## Proposed objective

Complete the MiMo replacement with the smallest evidence-preserving split:

- Use the admitted `deepseek-v4-flash` SenseNova Token Plan model for
  structured report analysis, answer synthesis and GEO article generation.
- Replace MiMo native search with one certified AnySearch REST surface.
- Bind every synthesized buyer answer only to URLs/titles/snippets returned by
  AnySearch; never accept model-invented source fields.
- Preserve the existing Free/Paid questions, report contracts, technical
  analysis, payment, fulfillment, access, email and artifact lifecycle.

The user approved this exact FROZEN allowlist on 2026-08-03. Anonymous access
may now be used for one capability
probe only; local implementation may follow if it passes. Authenticated
certification, authority activation and deployment additionally require a free
AnySearch API key supplied through an approved non-logging path. Anonymous
access is not an accepted deployed Worker configuration.

## Baseline

- Repository: `E:/project/open-geo-console`.
- Branch / HEAD: `codex/delivery-root-fix` at
  `40e7bc108db8cf53c97abd485f9e766304261c67`.
- The worktree retains the approved report-presentation/GEO-article diff and
  the two scope records; `apps/web/.tmp-preview/` remains excluded.
- SenseNova structured JSON compatibility is proven only for
  `deepseek-v4-flash`; native `web_search` compatibility failed with HTTP 400.
- AnySearch documents direct `POST https://api.anysearch.com/v1/search` access,
  structured `title`, `url`, `snippet`, and `content` results, `cn`/`intl`
  zones, anonymous access and a free key plan of 1,000 requests/day at 20 QPS.
- The locally installed AnySearch Skill CLI does not hash-match either its
  declared v2.1.0 release or current official main scripts and must not be
  executed. Product integration uses the documented REST API directly and does
  not copy, import, execute or depend on that Skill package.

## Exact production allowlist

- `apps/web/src/public-search-adapters/anysearch/config.ts` (new)
- `apps/web/src/public-search-adapters/anysearch/adapter.ts` (new)
- `apps/web/src/public-search-adapters/anysearch/generative-answer.ts` (new)
- `apps/web/src/public-search-adapters/anysearch/certification.ts` (new)
- `apps/web/src/public-source-forensics/production-runtime.ts`
- `apps/web/src/scripts/certify-public-search-surface.ts`
- `apps/web/src/worker/processor.ts` (secret-redaction allowlist only; preserve
  the already approved GEO-article edit)
- `scripts/start-workstation-workers.ps1`

Ignored secret/runtime configuration:

- `apps/web/.env.local`
- `apps/web/.env.staging.local`
- `.data/workstation-docker/staging.env`

## Exact test allowlist

- `apps/web/src/public-search-adapters/anysearch/config.test.ts` (new)
- `apps/web/src/public-search-adapters/anysearch/adapter.test.ts` (new)
- `apps/web/src/public-search-adapters/anysearch/generative-answer.test.ts` (new)
- `apps/web/src/public-search-adapters/anysearch/certification.test.ts` (new)
- `apps/web/src/public-source-forensics/production-runtime.test.ts`
- `apps/web/src/scripts/certify-public-search-surface.test.ts`

Scope authority/history only:

- `docs/ACTIVE-CHANGE-SCOPE.md`
- `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md`

No other source, test, configuration, generated or untracked file is allowed.

## Required behavior

1. The AnySearch adapter accepts only
   `https://api.anysearch.com/v1/search` and a dedicated ignored API key,
   preserves locale/region through `language` and `zone`, maps ranked results
   to the existing public-search observation contract, and fails closed on
   unsafe URLs, malformed payloads, authentication, rate limit, timeout or
   transport errors.
2. Only `title`, `url` and bounded `snippet` fields are admitted from AnySearch.
   Provider `content` is ignored; the existing safe retriever and evidence
   verification path remain responsible for page content.
3. The buyer-answer provider performs one AnySearch query per answer attempt,
   then one SenseNova structured synthesis over only those admitted results.
   Its source list is constructed locally from AnySearch results; generated
   URLs or source metadata are ignored.
4. Existing provider discovery, snapshot identity, exact fanout, retrieval,
   evidence verification, answer receipt and terminalization gates remain
   unchanged.
5. Adapter selection is explicit through `OGC_PUBLIC_SEARCH_ADAPTER=anysearch`.
   There is no anonymous deployed mode, silent MiMo fallback or model-only
   ungrounded answer.
6. The Workstation launcher validates AnySearch-specific variables and no
   longer backfills MiMo settings from generic SenseNova values when AnySearch
   is selected.
7. No historical job/report is retried, repaired, replayed or mutated.

## Forbidden behavior

- No use or modification of the installed AnySearch Skill/CLI package.
- No persistence or customer display of AnySearch `content` fields.
- No report/UI/article-contract changes beyond preserving the already approved
  uncommitted diff.
- No payment, order, Webhook, credit, refund, email, access, redirect, job-state,
  queue, crawler, report-version, schema/migration or dependency change.
- No uncertified Staging authority activation and no Production authority or
  Production deployment.
- No edits or cleanup under `apps/web/.tmp-preview/`.

## Diff budget

- AnySearch production adapter/provider/certification: at most 650 changed lines.
- Existing runtime/launcher/redaction integration: at most 120 changed lines.
- Tests: at most 750 changed lines.
- Scope/history: at most 350 changed lines.

## Acceptance

1. After approval, exactly one anonymous synthetic capability query may confirm
   the documented response shape. No retry is authorized.
2. Focused adapter, provider, runtime and certification tests pass with no skip.
3. The existing Paid V3 Direct disposable PostgreSQL linear-flow regression
   still passes with active artifact, completed fulfillment and no refund.
4. Scoped lint, full build and `git diff --check` pass; the complete diff stays
   inside this and the archived report-design allowlists.
5. Exactly one authenticated Protected Staging AnySearch certification run may
   execute its three fixed synthetic queries. It must pass source quality,
   terms/commercial/storage-display review and typed failure gates before its
   private artifact is installed and its exact Staging authority is activated.
6. After local verification, the already requested commit and Protected Staging
   deployment may proceed through the required Git/release roles, including the
   matching Staging Worker source overlay. No fresh report/payment/email run is
   performed by Codex; the user will manually test the deployed website.

## External prerequisites and stop conditions

- User must create/provide one free AnySearch API key from
  `https://anysearch.com/console/api-keys` for the deployed Worker.
- The official terms/privacy pages must provide enough current evidence to
  approve commercial use and customer display of returned URL/title/snippet
  fields. Ambiguity is a stop before certification/activation, not permission
  to infer rights.
- Any failed probe/certification, missing rights evidence, out-of-scope file,
  schema need or report-chain regression stops the task before authority
  activation or deployment; no retry is authorized.

## Local implementation and verification record (2026-08-03)

- The AnySearch REST adapter, AnySearch-grounded SenseNova answer provider,
  compile-time runtime selection, certification entry, launcher validation and
  secret redaction were implemented within the approved allowlist and budgets.
- The existing article-project private `ANYSEARCH_API_KEY` was copied without
  disclosure into the three approved ignored Open GEO Console configurations;
  the running Staging adapter and authority were not changed.
- Focused deterministic verification passed: 6 files, 25 tests, 0 failures and
  0 skips. Scoped lint passed with only three pre-existing `processor.ts`
  warnings. The full workspace build passed.
- The disposable PostgreSQL Paid V3 Direct linear-flow regression passed 1/1
  with 0 skips. Receipt:
  `.data/test-runs/postgres-disposable/pg-20260803063336-b2b8555d/receipt.json`.
- `git diff --check` and the tracked-diff secret scan passed. The locally
  installed AnySearch CLI remained unused.
- Authenticated certification is intentionally not executed: AnySearch's
  official API documentation and FAQ describe structured API use, pricing and
  zero-retention query handling, but the current official Terms and Privacy
  pages fail to return their legal text and the underlying public legal
  endpoints return HTTP 404. Commercial use plus customer storage/display of
  URL/title/snippet therefore remains ambiguous under this scope's explicit
  prerequisite.
- Staging authority activation and deployment remain stopped. No certification
  query, authority artifact, report, order, payment, email or historical-data
  mutation was created.

Any action outside this FROZEN proposal requires a new explicit approval.
