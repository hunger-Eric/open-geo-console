# Provider-independent Public-search Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a compile-time-selected, provider-independent public-search runtime with MiMo as the first adapter, while keeping report-model configuration independent and production admission fail-closed.

**Architecture:** A typed registry resolves `OGC_PUBLIC_SEARCH_ADAPTER` to a reviewed factory. Each factory reads only its own configuration namespace, constructs an exact surface identity, normalizes provider output into `PublicSearchSurfaceAdapter`, and is admitted only when that identity matches the active PostgreSQL authority. Jobs bind the exact authority/surface identity and never switch provider during resume.

**Tech Stack:** TypeScript, npm workspaces, Vitest, Next.js 16, PostgreSQL/Drizzle, native `fetch`, existing `@open-geo-console/public-search-observer` contracts.

## Global Constraints

- Search runtime code must not read or inherit `OGC_AI_BASE_URL`, `OGC_AI_API_KEY`, or `OGC_AI_MODEL`.
- `OGC_PUBLIC_SEARCH_ADAPTER` selects only a compile-time-approved adapter ID; runtime module paths and JSON-programmed response mappings are forbidden.
- A task uses one exact adapter/authority identity and never falls back to another provider.
- New live authorities install inactive and require the existing explicit activation boundary.
- Generated model prose is never citation evidence; MiMo evidence comes only from structured `message.annotations`.
- Runtime flags alone never open catalog, checkout, or Worker execution.
- Keep `OGC_PUBLIC_SEARCH_RUNTIME_ENABLED=false` throughout implementation and deterministic verification.
- Do not persist or log raw provider responses, API keys, authorization headers, report identity, customer identity, or raw client IPs.
- Use npm workspaces and preserve PostgreSQL as the only production authority.

---

## File structure

- Create `apps/web/src/public-search-adapters/types.ts`: approved factory and resolved runtime interfaces.
- Create `apps/web/src/public-search-adapters/registry.ts`: immutable compile-time adapter registry and selection logic.
- Create `apps/web/src/public-search-adapters/mimo/config.ts`: MiMo-only configuration parsing and exact surface identity.
- Create `apps/web/src/public-search-adapters/mimo/adapter.ts`: MiMo request, response normalization and sanitized error classification.
- Create `apps/web/src/public-search-adapters/mimo/fixtures.ts`: deterministic provider payloads without secrets.
- Create `apps/web/src/public-search-adapters/mimo/certification.ts`: protected-staging probe and artifact input.
- Create focused `.test.ts` files beside each unit.
- Modify `packages/public-search-observer/src/types.ts`, `validation.ts`, `orchestrator.ts`, and tests: preserve authentication/unsupported terminal semantics.
- Modify `apps/web/src/db/schema.ts`, `migrations.ts`, `index.ts`, `market-snapshots.ts`, and add `schema-v14.postgres.test.ts`: persist new terminal attempt states safely.
- Modify `apps/web/src/public-source-forensics/production-runtime.ts`: exact adapter/authority resolution and dependency construction.
- Modify `apps/web/src/recommendation-forensics/product-availability.ts`: require adapter identity and registry readiness.
- Modify `apps/web/src/scripts/certify-public-search-surface.ts`: register only the MiMo certification implementation.
- Modify package scripts, env examples, operations docs and project-state docs.

---

### Task 1: Complete shared adapter failure semantics

**Files:**
- Modify: `packages/public-search-observer/src/types.ts`
- Modify: `packages/public-search-observer/src/validation.ts`
- Modify: `packages/public-search-observer/src/orchestrator.ts`
- Modify: `packages/public-search-observer/src/index.test.ts`

**Interfaces:**
- Produces: `SearchObservationStatus` and `SearchAdapterErrorClass` including `authentication` and `unsupported`.
- Preserves: `observePublicSearch(input): Promise<MarketSearchObservation>` and existing terminal sanitization.

- [ ] **Step 1: Write failing contract and orchestration tests**

Add cases that parse and return both new terminal states without leaking the thrown message:

```ts
for (const status of ["authentication", "unsupported"] as const) {
  const adapter: PublicSearchSurfaceAdapter = {
    ...baseAdapter,
    search: async () => { throw new Error("Authorization: Bearer must-not-leak"); },
    classifyError: () => status
  };
  await expect(observePublicSearch({ adapter, query, budget, signal })).resolves.toMatchObject({
    status,
    results: [],
    usage: { requestCount: 1, resultCount: 0, costUncertain: true }
  });
}
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```powershell
npx vitest run packages/public-search-observer/src/index.test.ts
```

Expected: FAIL because the current status union/validator and safe classifier reject the new states.

- [ ] **Step 3: Add the two shared terminal states**

Extend the status union and validator set, include both values in `safeClassification`, and add fixed safe messages:

```ts
authentication: "The public-search credential was rejected.",
unsupported: "The configured public-search surface does not support the required capability."
```

Never include `error.message` in an observation.

- [ ] **Step 4: Run focused package tests**

Run:

```powershell
npx vitest run packages/public-search-observer/src/index.test.ts
npm run build --workspace packages/public-search-observer
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add packages/public-search-observer/src
git commit -m "feat: complete public search adapter error semantics"
```

---

### Task 2: Persist the new terminal states under schema v14

**Files:**
- Modify: `apps/web/src/db/schema.ts`
- Modify: `apps/web/src/db/migrations.ts`
- Modify: `apps/web/src/db/index.ts`
- Modify: `apps/web/src/db/index.test.ts`
- Modify: `apps/web/src/db/market-snapshots.ts`
- Modify: `apps/web/src/db/public-search-authority.ts`
- Modify: `apps/web/src/db/public-search-authority.test.ts`
- Create: `apps/web/src/db/schema-v14.postgres.test.ts`
- Modify: `apps/web/package.json`

**Interfaces:**
- Produces: `DATABASE_SCHEMA_VERSION = 14`; exact authority columns for adapter/provider/product/model/adapter version; and a `market_search_attempts` check constraint accepting `authentication` and `unsupported`.
- Preserves: all v13 data, immutable completed evidence, and existing attempt mappings.

- [ ] **Step 1: Write the failing schema-version and fresh/upgrade database test**

Model `schema-v14.postgres.test.ts` on the v13 test. It must create one database upgraded from v13 and one bootstrapped at v14. Assert old authority rows receive an explicit historical sentinel and cannot match a live runtime; new rows round-trip exact identity:

```ts
expect(DATABASE_SCHEMA_VERSION).toBe(14);
expect(authority).toMatchObject({
  adapterId: "mimo",
  providerId: "xiaomi-mimo",
  productId: "native-web-search",
  modelId: "mimo-v2.5-pro",
  adapterVersion: "mimo-web-search-adapter-v1"
});
const constraint = await sql<Array<{ definition: string }>>`
  SELECT pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
  WHERE conname='market_search_attempts_status_check'
`;
expect(constraint[0]?.definition).toContain("'authentication'");
expect(constraint[0]?.definition).toContain("'unsupported'");
```

The test uses the existing disposable-database helper and skips when `OGC_TEST_DATABASE_ADMIN_URL` is absent.

- [ ] **Step 2: Run deterministic schema tests and verify failure**

```powershell
npx vitest run apps/web/src/db/index.test.ts apps/web/src/db/schema-v14.postgres.test.ts
```

Expected: the version assertion fails; the PostgreSQL test is either failing with the old constraint or explicitly skipped without an admin URL.

- [ ] **Step 3: Add the v14 migration**

Set `DATABASE_SCHEMA_VERSION` to 14. Add non-null authority identity columns `adapter_id`, `provider_id`, `product_id`, `model_id`, and `adapter_version`. Existing rows receive `historical-unbound-v1`; the runtime must never accept that sentinel. Include all five fields in deterministic authority versioning, installation, equality, activation scope and active-authority lookup. In the advisory-locked migration sequence, also replace the named status check atomically:

```sql
ALTER TABLE market_search_attempts
  DROP CONSTRAINT IF EXISTS market_search_attempts_status_check;
ALTER TABLE market_search_attempts
  ADD CONSTRAINT market_search_attempts_status_check
  CHECK (request_status IN (
    'pending','succeeded','partial','timeout','rate_limited','unavailable',
    'malformed','aborted','authentication','unsupported'
  ));
```

Update Drizzle schema, `PublicSearchSurfaceAuthorityRow`, authority persistence/tests, and every terminal-state set/query in `market-snapshots.ts`.

- [ ] **Step 4: Add the v14 test to `test:postgres:staging-security`**

Insert `apps/web/src/db/schema-v14.postgres.test.ts` after the v13 test in the workspace script.

- [ ] **Step 5: Run focused tests**

```powershell
npx vitest run apps/web/src/db/index.test.ts apps/web/src/db/market-snapshots.test.ts apps/web/src/db/schema-v14.postgres.test.ts
```

Expected: deterministic tests pass; fresh-database test passes when the admin URL exists and otherwise reports skip.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/db apps/web/package.json
git commit -m "feat: persist public search adapter terminal states"
```

---

### Task 3: Add the approved adapter factory registry

**Files:**
- Create: `apps/web/src/public-search-adapters/types.ts`
- Create: `apps/web/src/public-search-adapters/registry.ts`
- Create: `apps/web/src/public-search-adapters/registry.test.ts`

**Interfaces:**
- Produces:

```ts
export interface PublicSearchAdapterFactory {
  readonly adapterId: string;
  resolveIdentity(input: { environment: NodeJS.ProcessEnv; locale: string; region: string }): PublicSearchAdapterIdentity;
  create(input: { environment: NodeJS.ProcessEnv; authority: PublicSearchSurfaceAuthority }): PublicSearchSurfaceAdapter;
}

export interface PublicSearchAdapterIdentity {
  adapterId: string;
  providerId: string;
  productId: string;
  modelId: string;
  adapterVersion: string;
  surface: PublicSearchSurface;
}

export function createApprovedPublicSearchAdapterRegistry(
  factories: readonly PublicSearchAdapterFactory[]
): ReadonlyMap<string, PublicSearchAdapterFactory>;

export function selectApprovedPublicSearchAdapterFactory(input: {
  environment: NodeJS.ProcessEnv;
  registry: ReadonlyMap<string, PublicSearchAdapterFactory>;
}): PublicSearchAdapterFactory;
```

- [ ] **Step 1: Write registry rejection tests**

Cover empty/unknown selection, duplicate IDs, invalid IDs and exact approved selection:

```ts
expect(() => createApprovedPublicSearchAdapterRegistry([factory("mimo"), factory("mimo")]))
  .toThrow(/duplicate/i);
expect(() => selectApprovedPublicSearchAdapterFactory({
  environment: { OGC_PUBLIC_SEARCH_ADAPTER: "caller-module" },
  registry: createApprovedPublicSearchAdapterRegistry([factory("mimo")])
})).toThrow(/not approved/i);
```

- [ ] **Step 2: Run and verify failure**

```powershell
npx vitest run apps/web/src/public-search-adapters/registry.test.ts
```

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement immutable registration and selection**

Accept IDs matching `^[a-z][a-z0-9-]{0,63}$`, reject duplicates, freeze the map behind a copied `ReadonlyMap`, trim the environment value, and never accept a file/module path.

- [ ] **Step 4: Add a source-level independence test**

Read the registry and later runtime roots as text and assert they contain none of:

```ts
["OGC_AI_BASE_URL", "OGC_AI_API_KEY", "OGC_AI_MODEL"]
```

- [ ] **Step 5: Run focused tests and commit**

```powershell
npx vitest run apps/web/src/public-search-adapters/registry.test.ts
git add apps/web/src/public-search-adapters
git commit -m "feat: add approved public search adapter registry"
```

---

### Task 4: Implement deterministic MiMo configuration and adapter normalization

**Files:**
- Create: `apps/web/src/public-search-adapters/mimo/config.ts`
- Create: `apps/web/src/public-search-adapters/mimo/config.test.ts`
- Create: `apps/web/src/public-search-adapters/mimo/fixtures.ts`
- Create: `apps/web/src/public-search-adapters/mimo/adapter.ts`
- Create: `apps/web/src/public-search-adapters/mimo/adapter.test.ts`

**Interfaces:**
- Produces:

```ts
export interface MiMoPublicSearchConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  locale: string;
  region: string;
}

export function readMiMoPublicSearchConfig(
  environment: NodeJS.ProcessEnv,
  locale: string,
  region: string
): MiMoPublicSearchConfig;

export const MIMO_PUBLIC_SEARCH_ADAPTER_VERSION = "mimo-web-search-adapter-v1";
export function createMiMoPublicSearchAdapterFactory(): PublicSearchAdapterFactory;
export function createMiMoPublicSearchAdapter(input: {
  config: MiMoPublicSearchConfig;
  authority: PublicSearchSurfaceAuthority;
  fetch?: typeof fetch;
}): PublicSearchSurfaceAdapter;
```

- [ ] **Step 1: Write configuration-isolation tests**

Assert missing `OGC_PUBLIC_SEARCH_MIMO_*` fails even when all `OGC_AI_*` variables exist. Assert equal secret values are accepted only when both variables are explicitly present. Validate HTTPS base URL outside local/test runtime, bounded model ID, `zh-CN|en` locale and declared region.

- [ ] **Step 2: Write MiMo response fixtures and failing adapter tests**

The success fixture must include:

```ts
{
  choices: [{
    finish_reason: "stop",
    message: {
      content: "Generated prose is not evidence.",
      annotations: [{
        type: "url_citation",
        url: "https://www.dsv.com/zh-cn/our-solutions/modes-of-transport/sea-freight/less-than-container-load",
        title: "Less than container load",
        summary: "Public service description",
        site_name: "www.dsv.com"
      }]
    }
  }],
  usage: { web_search_usage: { tool_usage: 3, page_usage: 15 } }
}
```

Test that annotations normalize contiguously, duplicates collapse by canonical URL, unsafe schemes/credentials fail, and content-only URLs produce `malformed` rather than results.

- [ ] **Step 3: Run tests and verify failure**

```powershell
npx vitest run apps/web/src/public-search-adapters/mimo/config.test.ts apps/web/src/public-search-adapters/mimo/adapter.test.ts
```

Expected: FAIL because the implementation does not exist.

- [ ] **Step 4: Implement the minimal MiMo request**

POST to `${baseUrl}/chat/completions` with:

```ts
{
  model: config.model,
  messages: [{ role: "user", content: input.query.exactQuery }],
  tools: [{
    type: "web_search",
    max_keyword: Math.min(input.budget.maxRequests, 3),
    force_search: true,
    limit: Math.min(input.budget.maxResults, 20)
  }],
  stream: false,
  temperature: 0.1,
  thinking: { type: "disabled" }
}
```

Use `Authorization: Bearer <key>`, the caller signal and the shared timeout boundary. Do not log body or headers.

- [ ] **Step 5: Normalize only structured annotations and usage**

Return the complete unknown observation payload expected by `observePublicSearch`; the adapter owns timestamps and the deterministic observation ID because the orchestrator validates rather than completes successful provider payloads:

```ts
{
  observationId: deterministicId("observation", [
    "mimo", surface.adapterVersion, config.model,
    input.query.id, requestedAt, completedAt
  ]),
  surface,
  queryId: input.query.id,
  exactQuery: input.query.exactQuery,
  requestedAt,
  completedAt,
  status: annotations.length ? "complete" : "malformed",
  results,
  usage: {
    requestCount: webSearchUsage.tool_usage,
    resultCount: results.length,
    costUncertain: true
  }
}
```

The orchestrator remains responsible for strict validation, budget enforcement and safe conversion of thrown failures. Map 401/403 to `authentication`, 400 capability rejection to `unsupported`, 429 to `rate_limited`, abort to `aborted`, 5xx/network to `unavailable`, and invalid JSON/shape to `malformed`.

- [ ] **Step 6: Run focused and package tests**

```powershell
npx vitest run apps/web/src/public-search-adapters/mimo
npx vitest run packages/public-search-observer/src/index.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add apps/web/src/public-search-adapters/mimo
git commit -m "feat: add MiMo public search adapter"
```

---

### Task 5: Resolve exact runtime and authority without model-config coupling

**Files:**
- Modify: `apps/web/src/public-source-forensics/production-runtime.ts`
- Create: `apps/web/src/public-source-forensics/production-runtime.test.ts`
- Modify: `apps/web/src/recommendation-forensics/product-availability.ts`
- Modify: `apps/web/src/recommendation-forensics/product-availability.test.ts`
- Modify: `apps/web/src/worker/public-source-forensics.ts`
- Modify: `apps/web/src/worker/public-source-forensics.test.ts`

**Interfaces:**
- Produces:

```ts
export async function resolveProductionPublicSearchRuntime(input: {
  environment: NodeJS.ProcessEnv;
  getAuthority: typeof getActivePublicSearchSurfaceAuthority;
  registry?: ReadonlyMap<string, PublicSearchAdapterFactory>;
}): Promise<{ adapter: PublicSearchSurfaceAdapter; authority: PublicSearchSurfaceAuthority; identity: PublicSearchAdapterIdentity }>;
```

- Preserves: `createProductionPublicSourceForensicsDependencies()` returning `null` under every incomplete/mismatched condition.

- [ ] **Step 1: Write fail-closed runtime tests**

Cover disabled runtime, unknown adapter, missing adapter-specific config, authority missing, surface/version/model mismatch, inactive authority, locale/region mismatch, and success. Include an environment containing valid `OGC_AI_*` but no search variables and expect failure.

- [ ] **Step 2: Write resume identity tests**

Extend `PublicSourcePipelineCheckpoint` with `adapterIdentityHash`, computed from the complete sorted adapter/provider/product/model/adapter-version/surface identity object. Assert changing provider, model, adapter version or surface version while retaining the authority ID throws `PublicSourceResumeIdentityMismatchError`.

- [ ] **Step 3: Run tests and verify failure**

```powershell
npx vitest run apps/web/src/public-source-forensics/production-runtime.test.ts apps/web/src/recommendation-forensics/product-availability.test.ts apps/web/src/worker/public-source-forensics.test.ts
```

- [ ] **Step 4: Implement exact registry/authority resolution**

Build the approved registry from explicit imports:

```ts
const APPROVED_FACTORIES = createApprovedPublicSearchAdapterRegistry([
  createMiMoPublicSearchAdapterFactory()
]);
```

Resolve the surface before the database lookup. Match environment, adapter/provider/product/model IDs, adapter/surface versions, locale, region and authority version. Convert the persisted row into the exact shared authority object and let the factory reassert the complete identity.

- [ ] **Step 5: Keep unavailable product paths closed**

Update availability so `registryReady` means a successfully constructed exact adapter, not merely a non-empty registry. Catch errors only at the public availability boundary; preserve specific errors in Worker/operator logs after sanitization.

- [ ] **Step 6: Add snapshot resolution dependencies**

Wire the adapter through the existing market-snapshot repository and `observePublicSearch`; do not add direct network work to the web process. Keep artifact readiness and report repository dependencies unchanged.

- [ ] **Step 7: Run focused tests and commit**

```powershell
npx vitest run apps/web/src/public-source-forensics/production-runtime.test.ts apps/web/src/recommendation-forensics/product-availability.test.ts apps/web/src/worker/public-source-forensics.test.ts
git add apps/web/src/public-source-forensics apps/web/src/recommendation-forensics/product-availability* apps/web/src/worker/public-source-forensics*
git commit -m "feat: resolve exact public search runtime authority"
```

---

### Task 6: Add repeatable MiMo probe and signed certification entry

**Files:**
- Create: `apps/web/src/public-search-adapters/mimo/certification.ts`
- Create: `apps/web/src/public-search-adapters/mimo/certification.test.ts`
- Modify: `apps/web/src/scripts/certify-public-search-surface.ts`
- Modify: `apps/web/src/scripts/certify-public-search-surface.test.ts`
- Create: `apps/web/src/scripts/probe-public-search.ts`
- Create: `apps/web/src/scripts/probe-public-search.test.ts`
- Modify: `apps/web/package.json`
- Modify: `package.json`

**Interfaces:**
- Produces CLI commands:

```powershell
npm run public-search:probe -- --adapter mimo --locale zh-CN --region CN
npm run public-search:certify -- --adapter mimo --locale zh-CN --region CN --output .data/public-search-certification/mimo.json
```

- [ ] **Step 1: Write CLI parsing and no-secret-output tests**

Inject a fake factory/fetch and assert output contains only adapter/surface identity, status, source domains, counts, usage and sanitized error classes. Assert it excludes keys, headers, full response bodies and generated answer prose.

- [ ] **Step 2: Write certification-gate tests**

Replace the empty map with a compile-time map containing only `mimo`. Assert unknown adapters refuse before network. Assert MiMo certification refuses installable output unless every required live case and review reference is present.

- [ ] **Step 3: Implement a bounded quality matrix**

The probe runs fixed cases for:

- an official factual query with an expected authoritative domain/path;
- a Chinese B2B supplier-discovery query;
- an intentionally narrow/no-result query;
- injected 401, 429, timeout and malformed deterministic cases.

Live output records pass/fail per case; it does not install or activate authority.

- [ ] **Step 4: Generate signed artifact content only after all live gates pass**

Use `finalizePublicSearchCertificationArtifact` with exact MiMo surface identity, budgets and explicit terms/commercial/storage review references. Keep installation inactive via the existing installer.

- [ ] **Step 5: Run deterministic CLI tests**

```powershell
npx vitest run apps/web/src/public-search-adapters/mimo/certification.test.ts apps/web/src/scripts/probe-public-search.test.ts apps/web/src/scripts/certify-public-search-surface.test.ts
```

Expected: PASS without a live network request.

- [ ] **Step 6: Run the authorized live probe only**

```powershell
npm run public-search:probe -- --adapter mimo --locale zh-CN --region CN
```

Expected: a redacted JSON summary. Record failures honestly. Do not run authority installation or activation.

- [ ] **Step 7: Commit**

```powershell
git add apps/web/src/public-search-adapters/mimo/certification* apps/web/src/scripts/probe-public-search* apps/web/src/scripts/certify-public-search-surface* apps/web/package.json package.json
git commit -m "feat: add MiMo public search certification probe"
```

---

### Task 7: Harden configuration examples and active-runtime reachability

**Files:**
- Modify: `.env.example`
- Modify: `apps/web/.env.example` if present
- Modify: `apps/web/src/recommendation-forensics/active-runtime-reachability.test.ts`
- Modify: `README.md`
- Modify: `docs/operations/public-search-surface-certification.md`

**Interfaces:**
- Documents: independent report/search variables, adapter selection, no fallback and activation gates.
- Preserves: no secrets committed and default runtime disabled.

- [ ] **Step 1: Write/extend source reachability tests**

Assert active runtime contains the generic registry and MiMo adapter but no historical V1 adapters. Assert `OGC_AI_*` strings do not occur in public-search adapter/runtime source roots. Assert no dynamic `import(environment...)`, `require(environment...)` or module-path variable exists.

- [ ] **Step 2: Run reachability test and verify failure before doc/config edits**

```powershell
npx vitest run apps/web/src/recommendation-forensics/active-runtime-reachability.test.ts
```

- [ ] **Step 3: Add safe example variables**

Add blank or disabled defaults only:

```env
OGC_PUBLIC_SEARCH_RUNTIME_ENABLED=false
OGC_PUBLIC_SEARCH_ADAPTER=mimo
OGC_PUBLIC_SEARCH_MIMO_BASE_URL=
OGC_PUBLIC_SEARCH_MIMO_API_KEY=
OGC_PUBLIC_SEARCH_MIMO_MODEL=
```

Do not copy local values or secrets.

- [ ] **Step 4: Update operator documentation**

Document that report-model changes do not affect search, adapter changes apply only after Worker restart, active jobs never switch provider, probe is not certification, certification is not activation, and staging acceptance is not production authority.

- [ ] **Step 5: Run focused tests and commit**

```powershell
npx vitest run apps/web/src/recommendation-forensics/active-runtime-reachability.test.ts
git diff --check
git add .env.example apps/web/.env.example README.md docs/operations/public-search-surface-certification.md apps/web/src/recommendation-forensics/active-runtime-reachability.test.ts
git commit -m "docs: configure independent public search adapters"
```

If `apps/web/.env.example` does not exist, omit it from `git add`; do not create a duplicate configuration source.

---

### Task 8: Full verification and scoped project-state sync

**Files:**
- Modify: `docs/PROJECT-STATE.md`
- Modify: `docs/TASKS.md`
- Modify: `docs/DECISIONS.md`
- Modify: `docs/2026-07-13-public-source-forensics-v2-analysis-report.md`

**Interfaces:**
- Records: implemented adapter boundary, test evidence, live-probe outcome, external terms/admin-URL gates and exact activation status.

- [ ] **Step 1: Run focused deterministic suites**

```powershell
npx vitest run packages/public-search-observer/src/index.test.ts apps/web/src/public-search-adapters apps/web/src/public-source-forensics/production-runtime.test.ts apps/web/src/recommendation-forensics/product-availability.test.ts apps/web/src/worker/public-source-forensics.test.ts apps/web/src/scripts/probe-public-search.test.ts apps/web/src/scripts/certify-public-search-surface.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the full repository gates**

```powershell
npm test
npm run lint
npm run build
git diff --check
```

Expected: all executed tests pass, lint exits 0, build exits 0, diff check emits no errors.

- [ ] **Step 3: Run PostgreSQL gates**

```powershell
npm run test:postgres:staging-security
```

Expected: pass when `OGC_TEST_DATABASE_ADMIN_URL` exists. If absent or the command exceeds the execution ceiling, record it as skipped/unproven, not passed. Never substitute staging or production as a disposable admin database.

- [ ] **Step 4: Re-run staging and production read-only audits**

Use the existing environment-specific methodology and `db:audit` commands. Expected: zero non-terminal V1 recommendation rows and no terminal commercial job with reserved credit.

- [ ] **Step 5: Synchronize CodeGraph and inspect active dependencies**

```powershell
codegraph sync
codegraph status
rg -n "OGC_AI_BASE_URL|OGC_AI_API_KEY|OGC_AI_MODEL" apps/web/src/public-search-adapters apps/web/src/public-source-forensics/production-runtime.ts
```

Expected: graph current; `rg` returns no matches.

- [ ] **Step 6: Perform scoped neat documentation sync**

Update existing current-state entries instead of appending chat history. State explicitly:

- MiMo is the first registered implementation but not a permanent dependency;
- search and report-model configuration are independent;
- runtime remains disabled unless exact authority is active;
- the live probe result and any failed quality case;
- storage/commercial terms and disposable PostgreSQL proof remain external gates where applicable.

- [ ] **Step 7: Commit final state**

```powershell
git add docs/PROJECT-STATE.md docs/TASKS.md docs/DECISIONS.md docs/2026-07-13-public-source-forensics-v2-analysis-report.md
git commit -m "docs: close provider independent search adapter work"
git status --short --branch
```

Expected: clean worktree; branch ahead only by the planned commits. Do not push unless the user requests or confirms publishing.
