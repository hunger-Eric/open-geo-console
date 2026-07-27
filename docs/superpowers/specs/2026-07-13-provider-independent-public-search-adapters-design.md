# Provider-independent Public-search Adapters Design

Date: 2026-07-13  
Status: Approved in conversation; pending written-spec review

## Purpose

Open GEO Console must not bind public-source recommendation forensics to the report-generation model or to one search vendor. Report synthesis and public search are independent capabilities with separate configuration, credentials, runtime identity, certification and failure boundaries.

MiMo is the first live adapter candidate because the configured `mimo-v2.5-pro` endpoint has returned structured search citations and usage successfully. MiMo is not a permanent architectural dependency. Replacing the report model must not affect search evidence, and replacing the search adapter must not require changes to market snapshots, evidence graphs, report construction or commercial terminalization.

## Decisions

1. Search and report-generation models are fully independent.
2. `OGC_PUBLIC_SEARCH_ADAPTER` selects one compile-time-approved adapter per deployed Worker environment.
3. An adapter becomes usable only when its source registration, exact runtime configuration, signed certification and active PostgreSQL authority agree.
4. A task is permanently bound to one adapter and exact surface identity. It never falls back to another provider while running or resuming.
5. Search credentials use adapter-specific variables. They may temporarily contain the same secret as a report-model credential, but no implementation may depend on equality or inherit an `OGC_AI_*` value.
6. This implementation adds the generic registry and MiMo adapter only. It does not add Brave, dynamic plugins, an administrator UI, automatic routing or production activation.

## Considered approaches

### Compile-time adapter registry — selected

Each provider has a typed factory registered under a stable adapter ID. The factory owns provider request syntax, response parsing, usage/cost normalization and error classification, and returns the existing `PublicSearchSurfaceAdapter` contract.

This approach is type-safe, testable and compatible with the signed-authority design. Environment variables select only reviewed source code and cannot load an arbitrary module.

### Configuration-programmed OpenAI-compatible adapter — rejected

Encoding tool JSON, citation paths, usage paths and error behavior in environment or JSON configuration would avoid some source changes, but provider differences would turn configuration into an untyped programming language. Incorrect field paths could silently convert generated prose into evidence.

### Dynamically loaded plugins — rejected

Loading a module path at runtime maximizes extensibility but expands path-injection, dependency, deployment-bundling and certification risks. It is unnecessary for the current self-hosted product.

## Architecture

The report-generation lane remains:

```text
OGC_AI_* -> AiModelTransport -> website analysis and report synthesis
```

The public-search lane becomes:

```text
OGC_PUBLIC_SEARCH_ADAPTER
        -> ApprovedPublicSearchAdapterRegistry
        -> adapter-specific factory and configuration
        -> PublicSearchSurfaceAdapter
        -> immutable market snapshot
        -> public-source evidence graph
        -> RecommendationForensicReportV2
```

The two lanes share no configuration fallback. In particular, public-search runtime code must not read `OGC_AI_BASE_URL`, `OGC_AI_API_KEY` or `OGC_AI_MODEL`.

### Components

#### Approved adapter registry

The registry maps a stable adapter ID such as `mimo` to a reviewed factory. It exposes only known IDs and immutable registration metadata. Duplicate IDs, unknown selection and fixture registration in protected environments fail before any network request.

The adapter ID is an implementation selector, not the full evidence identity. A factory must derive and expose the exact provider, product, model, adapter version, surface version, locale and region used for authority matching.

#### Adapter factory

Each factory:

- reads only its adapter-specific configuration namespace;
- validates required values without exposing secrets;
- produces an exact `PublicSearchSurfaceAuthority` identity;
- creates a `PublicSearchSurfaceAdapter` that normalizes observations;
- declares supported locales, regions and usage/cost capabilities;
- classifies provider errors into the shared error contract.

#### MiMo adapter

The first implementation uses the MiMo OpenAI-compatible chat-completions endpoint with the native `web_search` tool. It must force search for forensic observations and accept evidence only from structured `message.annotations` entries. It must never extract citations from model prose when annotations are absent.

MiMo `web_search_usage.tool_usage` maps to request/tool usage, and `page_usage` maps to retrieved-result/page usage. Token usage may be recorded separately but cannot substitute for provider search-call accounting. Unknown monetary cost is represented explicitly rather than estimated from token count.

#### Runtime resolver

The resolver reads the selected adapter ID, resolves a factory, constructs its exact identity, fetches the unique matching active PostgreSQL authority and creates dependencies only when every boundary agrees. Flags alone cannot open catalog or Worker execution.

## Configuration

Shared search controls remain provider-neutral:

```env
OGC_PUBLIC_SEARCH_RUNTIME_ENABLED=false
OGC_PUBLIC_SEARCH_ADAPTER=mimo
OGC_PUBLIC_SEARCH_LOCALE=zh-CN
OGC_PUBLIC_SEARCH_REGION=CN
OGC_PUBLIC_SEARCH_TIMEOUT_MS=20000
OGC_PUBLIC_SEARCH_DAILY_REQUEST_CAP=100
OGC_PUBLIC_SEARCH_DAILY_COST_MICROS_CAP=10000000
OGC_PUBLIC_SEARCH_MAX_RESULTS_PER_QUESTION=10
```

MiMo uses a dedicated namespace:

```env
OGC_PUBLIC_SEARCH_MIMO_BASE_URL=https://token-plan-sgp.xiaomimimo.com/v1
OGC_PUBLIC_SEARCH_MIMO_API_KEY=<secret>
OGC_PUBLIC_SEARCH_MIMO_MODEL=mimo-v2.5-pro
```

The secret may initially equal `OGC_AI_API_KEY`, but it must be configured independently. Removing or changing report-model configuration cannot change the resolved search runtime.

Future adapters add their own namespace and factory. They do not add generic arbitrary request/response field-path configuration.

## Identity and task binding

Before admission, the exact active authority must match:

- deployment environment;
- adapter ID;
- provider and product IDs;
- model ID where the surface is model-mediated;
- adapter and surface versions;
- locale and region capabilities;
- authority version and certification evidence.

The job or market-snapshot checkpoint persists this identity before collection. Resume compares the persisted identity with the current runtime. A mismatch refuses resume and cannot be repaired by relabeling old observations.

Changing `OGC_PUBLIC_SEARCH_ADAPTER` and restarting a Worker affects only new, unbound work. Existing work either resumes under its exact original runtime or reaches the existing limited/failed/refund boundary.

## Normalized observation contract

Provider responses normalize into the existing public-search contracts:

- canonical query and fanout identity;
- observation status;
- source URL, title, snippet/summary, site name and provider order;
- captured timestamp and content hashes;
- request, tool, page/result and token usage when supplied;
- actual or explicitly unknown allocated cost;
- provider, product, model, adapter and surface versions;
- bounded retained excerpts and sanitized errors.

Raw provider response bodies are not report evidence and are not persisted by default. URL and excerpt safety, private-identity rejection, SSRF-safe retrieval and excerpt expiry remain downstream shared responsibilities.

## Error behavior

The adapter maps provider conditions to shared errors:

- authentication: terminal configuration failure with no consumption retry;
- rate limited, timed out or unavailable: bounded retry on the same adapter only;
- malformed: structured evidence is missing or invalid; generated prose is rejected;
- unsupported: model/tool/account capability is absent and runtime stays closed;
- aborted: caller cancellation with uncertain cost recorded when applicable.

After retry exhaustion, existing coverage and commercial rules choose completed-limited/refund or failed/refund. No error triggers an implicit provider fallback.

Authority, adapter or surface version drift prevents job claim or resume. Errors and logs must not contain API keys, authorization headers, full raw responses or private customer identity.

## Certification

Certification has two layers.

### Shared contract certification

Every adapter must pass the same deterministic tests for normalization, URL safety, privacy, budgets, timeouts, error classes, immutable identity, resume drift and fail-closed registration.

### Provider live certification

Protected staging verifies the exact adapter/model/surface using separate runtime credentials. Evidence must cover:

- forced live search and structured citations;
- Chinese and English behavior within declared capabilities;
- source URLs, titles, summaries and usage fields;
- no-result, malformed, timeout, rate-limit and unavailable behavior;
- budget/cost accounting and uncertainty;
- data-retention and commercial-use review;
- signed artifact installation as inactive authority;
- an explicit activation and paid failure-drill gate.

A live probe is capability evidence, not certification authority. The successful MiMo probes on 2026-07-13 establish that `mimo-v2.5-pro` accepts native web search and returns annotations/usage; they do not activate the product.

## Tests

Deterministic acceptance must prove:

1. Unknown and duplicate adapter IDs are rejected.
2. Protected environments reject fixture or unapproved registrations.
3. Search runtime code never reads or inherits `OGC_AI_*`.
4. Equal and unequal report/search secret values construct independent lanes.
5. Missing MiMo search configuration affects only search readiness.
6. MiMo annotations map to normalized sources; missing annotations never fall back to prose URL extraction.
7. MiMo web-search tool/page usage maps to the shared ledger.
8. Unsafe URLs, private identifiers and malformed citations are rejected.
9. Provider HTTP and transport failures map to sanitized shared errors.
10. An adapter/authority mismatch keeps catalog and Worker execution closed.
11. Changing adapter selection cannot resume an identity-bound task.
12. Runtime failures never invoke a second registered adapter.
13. Historical V1 rendering and existing V2 deterministic fixtures remain valid.
14. PostgreSQL atomic terminalization, repository tests, full unit suite, lint and production build pass.

Live certification adds exact-source quality cases. The initial MiMo factual probe returned structured citations but failed to locate the expected official retirement announcement; certification therefore needs query-fanout quality thresholds and independent source verification rather than trusting the generated answer.

## Rollout

1. Add and test the registry and provider-independent resolver while the approved live registry remains closed.
2. Add the MiMo adapter and deterministic response fixtures.
3. Add a repeatable, redacted MiMo probe/certification command.
4. Run protected-staging live certification and legal/retention review.
5. Install the signed authority inactive and run mismatch/failure drills.
6. Activate only in protected staging and complete one paid V2 artifact/delivery/refund drill.
7. Make production activation a separate reviewed decision.

No step in this design changes `OGC_PUBLIC_SEARCH_RUNTIME_ENABLED` to true automatically.

## Out of scope

- Brave or any second provider implementation;
- automatic provider routing or fallback;
- combining observations from multiple providers in one job;
- administrator accounts or a configuration UI;
- runtime loading of arbitrary modules;
- production activation;
- changing the V2 evidence graph, artifact or commercial terminalization contracts except where exact adapter identity must be carried through existing checkpoints.
