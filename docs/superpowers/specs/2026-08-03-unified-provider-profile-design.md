# Unified provider profile design

Date: 2026-08-03
Status: approved design; implementation requires a separate FROZEN scope

## 1. Decision

Introduce one canonical runtime selector, `OGC_PROVIDER_PROFILE`, that chooses
an immutable, complete provider capability bundle before a Worker can claim a
job. Initially support exactly two profiles:

- `mimo_native`
- `sensenova_anysearch`

The selector controls routing only. API keys, endpoints and model identifiers
remain separate secret or configuration inputs, but none of those inputs may
independently select a runtime path.

Every active report operation receives its provider from the resolved bundle.
No consumer may default to MiMo, inspect a legacy routing variable or infer
capability from a model name.

## 2. Problem and first divergence

The current Worker has multiple routing authorities:

- `OGC_AI_*` selects the general OpenAI-compatible model used by some analysis
  and writing operations;
- `OGC_PUBLIC_SEARCH_ADAPTER` independently selects the public-search and
  generative-answer path;
- `OGC_REPORT_V4_MIMO_*` and a MiMo-specific locked model profile independently
  select several V4 structured operations.

Protected Staging demonstrated the failure mode: the general model was changed
to SenseNova while `OGC_PUBLIC_SEARCH_ADAPTER` remained `mimo`. A real report
therefore reached question generation and attempted MiMo authentication. The
technical report completed, but the AI preview terminalized as failed.

Changing only the workstation launcher would hide rather than remove this
split authority. MiMo-specific provider construction remains reachable inside
V4 core, diagnosis and synthesis paths. The design must unify construction at
the Worker boundary while reusing the existing provider clients.

## 3. Considered approaches

### A. Synchronize existing environment variables in the launcher

Set `OGC_PUBLIC_SEARCH_ADAPTER` and the V4 provider variables whenever
`OGC_AI_MODEL` changes.

- Advantage: smallest textual diff.
- Rejected because: provider selection remains distributed; direct Docker,
  Vercel or non-workstation startup can bypass the launcher; MiMo-specific
  defaults remain reachable; model names are not reliable capability records.

### B. One typed provider profile resolved at startup (selected)

Resolve one profile into all provider capabilities, validate it once, and pass
the immutable result to report operations.

- Advantage: one routing authority, deterministic startup failure, reusable
  existing clients, testable complete mapping and future extensibility.
- Cost: a small integration change at existing provider entry points rather
  than a one-line environment patch.

### C. Detect search capability dynamically and fall back automatically

Probe the selected model at startup or during a job and use AnySearch when
native search fails.

- Rejected because: capability probes add external calls and nondeterminism;
  provider outages could silently change evidence provenance mid-report;
  fallback would invalidate locked checkpoint/model/search identities.

## 4. Canonical profile contract

The logical resolved value is an immutable `ProviderProfileRuntime` containing:

- profile ID and version;
- general analysis/writing model identity;
- structured V4 model profile and provider factory;
- public-search adapter identity and authority requirement;
- grounded-answer provider factory;
- GEO article provider factory;
- declared search capability: `native` or `external_anysearch`;
- sanitized readiness summary containing identities only, never secrets.

The resolver accepts `OGC_PROVIDER_PROFILE` plus profile-specific configuration
and returns exactly one complete runtime or a typed startup error. It never
returns a partial bundle.

### Exact capability mapping

| Capability | `mimo_native` | `sensenova_anysearch` |
| --- | --- | --- |
| General analysis and writing | Existing MiMo-compatible client | Existing SenseNova OpenAI-compatible client |
| Page analysis | Existing MiMo structured provider | SenseNova structured provider using the existing OpenAI-compatible transport |
| Website synthesis | Existing MiMo structured provider | SenseNova structured provider using the existing OpenAI-compatible transport |
| Buyer-question generation/answer | Existing MiMo native-search provider | Existing AnySearch-grounded SenseNova provider |
| Public-source retrieval | Existing MiMo adapter | Existing AnySearch adapter |
| Source diagnosis | Existing MiMo structured provider | SenseNova structured provider |
| GEO article generation | Existing MiMo-compatible client | Existing SenseNova client |
| Search authority | Active MiMo authority matching profile identity | Active AnySearch authority matching profile identity |

No operation may select a different profile member after resolution. A profile
is not a preference order and contains no fallback provider.

## 5. Configuration and secret boundaries

`OGC_PROVIDER_PROFILE` is the only selector. All other values are data required
by the selected profile.

For `mimo_native`, readiness requires the existing approved MiMo endpoint,
credential, model identity, locked V4 model profile and matching active MiMo
search authority.

For `sensenova_anysearch`, readiness requires:

- the existing SenseNova OpenAI-compatible endpoint, credential and model;
- the existing AnySearch endpoint and credential;
- a new immutable SenseNova V4 model profile registered through the existing
  model-profile mechanism, with operation-specific context/output budgets;
- a matching active AnySearch search authority for the configured locale and
  region.

The model profile is configuration authority, not a database schema change.
New jobs snapshot the selected immutable profile through the existing V4
configuration-snapshot contract. Existing and in-flight snapshots retain their
original provider/model profile and must never be reinterpreted.

Secret values must not appear in the resolved readiness summary, logs, errors,
receipts or report output.

## 6. Legacy selector transition

During one bounded migration release, legacy routing variables may remain in
environment files only as compatibility assertions:

- `OGC_PUBLIC_SEARCH_ADAPTER`
- `OGC_REPORT_V4_MIMO_BASE_URL`
- `OGC_REPORT_V4_MIMO_API_KEY`

The profile resolver does not use them to choose a path. If present, they must
be compatible with the selected profile:

- `mimo_native` may accept the exact derived MiMo adapter/configuration;
- `sensenova_anysearch` may accept `OGC_PUBLIC_SEARCH_ADAPTER=anysearch`, but
  stale MiMo V4 routing values are rejected rather than ignored.

The launcher writes the canonical profile and only the data required by that
profile. Once all managed environments use the canonical profile, removal of
legacy routing variables is a separate mechanical cleanup. There is no silent
default profile: missing `OGC_PROVIDER_PROFILE` fails startup.

## 7. Startup and data flow

1. Worker startup reads `OGC_PROVIDER_PROFILE`.
2. The profile resolver validates the exact allowed profile ID and reads only
   that profile's required configuration.
3. It resolves the immutable V4 model profile and verifies endpoint/model
   compatibility.
4. It resolves the configured search adapter identity and verifies a matching
   active authority for environment, locale and region.
5. It constructs or exposes factories for general AI, structured V4, search,
   grounded-answer and article operations.
6. Startup readiness verifies that every required capability exists and that
   no legacy selector conflicts.
7. Only after readiness passes may the Worker enter its claim loop.
8. A newly admitted report snapshots its immutable model/search identities
   using existing checkpoint/configuration contracts.
9. All later operations receive providers from the resolved bundle or from the
   report's compatible locked snapshot. They do not reread routing variables.

The bundle is resolved once per Worker process. Credentials may be held by the
existing clients/factories but never serialized into checkpoints.

## 8. Provider integration boundary

The implementation reuses existing transport and business logic:

- MiMo native search and structured providers remain intact for
  `mimo_native`.
- The AnySearch adapter and AnySearch-grounded SenseNova answer provider remain
  intact for `sensenova_anysearch`.
- The existing OpenAI-compatible AI client supplies SenseNova structured
  invocations for page analysis, website synthesis and source diagnosis.
- Existing prompt text, JSON contracts, validators, evidence binding, token
  accounting, checkpointing and report rendering remain unchanged.

MiMo-named interfaces currently shared by generic orchestration may receive a
provider-neutral type alias or narrow interface at the seam. This is not an
authorization to rewrite provider clients or report orchestration. The minimum
change replaces construction decisions, not operation semantics.

## 9. Failure behavior

Startup fails before job claim when any of the following is true:

- profile missing or unsupported;
- required endpoint, credential or model missing;
- profile/model/endpoint combination invalid;
- V4 model profile missing, unsupported or incompatible;
- required search authority missing, inactive or identity-mismatched;
- required capability factory absent;
- a legacy selector conflicts with the canonical profile.

Errors expose a typed code and sanitized configuration name, never a secret.
They identify the profile and missing capability so an operator does not need
to infer which of several switches was missed.

After a job is claimed, provider transport, authentication, rate-limit,
malformed-output and timeout errors continue through existing typed job-error
and terminalization rules. There is no provider fallback, automatic retry
expansion, job replay or profile change for an existing job.

## 10. Historical and in-flight isolation

The terminal failed report
`5cddd8e2-df16-4289-87a3-21914e527a61` remains unchanged and is not an
acceptance target.

Existing jobs retain their persisted model/search/checkpoint identities. The
profile change applies only to new jobs created after the corresponding
environment activation. A Worker must reject a claimed job whose locked
profile is incompatible with the running bundle rather than reinterpret or
migrate it.

No database migration, backfill, repair, replay or artifact rewrite is part of
this design.

## 11. Verification design

### Deterministic unit tests

- Table-test both profile IDs across every capability in the mapping table.
- Prove missing/unknown profile fails without a default.
- Prove each required configuration and authority mismatch fails readiness.
- Prove legacy selector agreement is accepted only during migration and every
  conflict fails.
- Prove `sensenova_anysearch` cannot construct or call a MiMo provider.
- Prove `mimo_native` does not construct AnySearch.
- Prove readiness summaries and errors contain no credential values.

### Startup and integration tests

- Start each Worker tier with a complete mocked profile and verify readiness
  precedes the first claim attempt.
- Reproduce the former half-switch configuration and prove the Worker refuses
  startup instead of failing a customer job at question generation.
- Exercise the existing Free and Paid orchestration with injected profile
  bundles and verify call counts, evidence bindings, checkpoint identities and
  terminalization behavior remain unchanged.
- Verify a SenseNova V4 model profile is snapshotted and resumed without
  changing the existing schema or reinterpreting MiMo snapshots.
- Run focused tests, scoped lint, full build and disposable PostgreSQL semantic
  contract checks with zero external provider calls.

### Protected Staging acceptance

Deployment and real-flow acceptance require a separate approved scope:

1. Configure exactly `OGC_PROVIDER_PROFILE=sensenova_anysearch` with the
   required profile data and active AnySearch authority.
2. Prove both Staging Worker tiers expose the same resolved profile and exact
   candidate SHA before accepting work.
3. Submit one fresh website/report only; do not reuse the failed report.
4. Verify the technical report, free AI preview, three-question evidence chain,
   Paid report and GEO article use the expected SenseNova/AnySearch provenance
   with zero MiMo operation.
5. Verify payment, redirect and email only if separately included in the live
   acceptance scope.

Production activation remains separate and applies only to future jobs.

## 12. Minimal implementation boundary

The intended production change is limited to:

- one provider-profile resolver/contract;
- Worker startup readiness and launcher validation;
- existing public-search/generative-answer construction entry points;
- existing V4 structured-provider construction entry points;
- registration of one immutable SenseNova V4 model profile;
- focused tests and configuration documentation.

It does not include UI, prompts, report schemas, database schemas, task state,
payments, email, crawler behavior, evidence rules, source ranking, retries,
historical data or provider-client rewrites.

If implementation discovery requires any of those excluded areas, it is a
scope stop rather than permission to expand the design.

## 13. Success criteria

The design is successfully implemented only when:

1. One selector determines every provider used by a newly admitted report.
2. A half-switched environment cannot enter a Worker claim loop.
3. Native-search profiles retain native search; non-search profiles use the
   explicitly paired AnySearch capability.
4. No runtime probe or automatic provider fallback exists.
5. Existing provider clients and report contracts remain behaviorally intact.
6. Existing/in-flight jobs retain their original immutable identities.
7. Local deterministic verification passes and a separately authorized fresh
   Protected Staging report completes with exact expected provenance.

## 14. Explicit non-goals

- Automatically detecting provider capability from a model name or API probe.
- Choosing AnySearch as an outage fallback for a native-search profile.
- Supporting arbitrary user-defined provider combinations in the first
  implementation.
- Repairing or replaying failed or historical reports.
- Changing report content, UI, persistence, payment, email, crawling or source
  evidence semantics.
- Deploying or activating a profile under this design approval alone.
