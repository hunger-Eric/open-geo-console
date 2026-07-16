# Simulator and Log Analyzer Refactor Design

## Status

- Date: 2026-07-10
- Scope: `apps/web` simulator, simulator API routes, and log analyzer UI
- Behavior change: none, except correcting observed-attempt counting when duplicate log lines match one attempt
- Out of scope: new product features, route changes, visual redesign, authentication, persistence changes, and moving the simulator into a new workspace package

## Problem

The simulator workflow works and its current tests pass, but its implementation has three overlapping sources of complexity:

1. `apps/web/src/components/log-analyzer.tsx` combines page orchestration, simulator state, HTTP calls, response normalization, and all log-analysis presentation in one file.
2. `apps/web/src/app/api/simulator/_lib/simulator-api.ts` dynamically searches for several possible simulator export names and accepts several response shapes even though the simulator is an internal, statically imported module.
3. Simulator log matching exists in both the simulator domain module and the API adapter. The match API returns both results, while the client uses only the API comparison result.

This weakens TypeScript's contract guarantees, makes behavior harder to trace, and allows the two matching implementations to drift.

## Goals

- Establish one typed contract across simulator domain code, API routes, and browser code.
- Use one implementation of attempted-versus-observed log matching.
- Keep the strict evidence rule: a simulator attempt is observed only when `ogc_run`, path, and User-Agent all match.
- Split the log analyzer into independently understandable orchestration, state, transport, and presentation units.
- Preserve current routes, bilingual copy, visual behavior, network timeouts, and crawler selection rules.
- Retain deterministic unit tests and the existing repository acceptance commands.

## Non-goals

- Do not create `packages/simulator` in this refactor.
- Do not change the target site, discovery paths, request plan, crawler registry, or simulator concurrency.
- Do not add schema-validation dependencies solely for this internal contract.
- Do not redesign the log analyzer UI.
- Do not add persistence for simulator runs.

## Architecture

The simulator remains an `apps/web` domain capability. The refactor creates a direct dependency flow:

```text
LogAnalyzer
  -> useSimulator controller
    -> typed simulator client
      -> simulator API route
        -> simulator domain function
          -> crawler rules / log parser
```

The domain module owns simulator runs and attempted-versus-observed comparison. API routes validate transport input, call explicit domain exports, and serialize typed responses. Browser code consumes those exact response contracts and performs only minimal runtime boundary checks.

## Components

### Shared contracts

Create a browser-safe simulator contract module under `apps/web/src/simulator`. It defines:

- run request and response types;
- match request and response types;
- serialized attempt and comparison types;
- stable API error payloads;
- narrow type guards for untrusted JSON responses.

The contracts use the repository's actual field names. They do not accept unused historical aliases such as `targetUrl`, `requests`, or `requestUserAgent`.

### Simulator domain

Keep `runExternalCrawlerSimulation` as the explicit run entry point. Consolidate log matching into one exported domain function that accepts the normalized log entries produced by `@open-geo-console/log-parser` and returns a comparison grouped by simulator attempt.

Each attempted request appears once in the comparison. An attempt may retain multiple matching log entries, but summary counts measure matched attempts, not matching log-line count. Therefore `observedCount` cannot exceed `attemptedCount`.

### API boundary

The API layer directly imports explicit simulator functions. Remove:

- export-name candidate arrays;
- reflection over the simulator module;
- alternate call signatures;
- synthetic fallback run identifiers and timestamps for malformed internal results;
- the unused second comparison payload.

Invalid request JSON produces a stable 400 response. External request failures remain 502 responses, and unexpected failures remain 500 responses. A missing internal export becomes a build-time error instead of a runtime 503 because routes import the domain functions directly. Error payloads expose stable codes while the browser presents localized user-facing copy.

### Browser transport and controller

Move fetch, abort timeout, JSON parsing, and API error conversion into a simulator client module. Move run/match loading and error state into a controller hook.

The controller exposes data and actions rather than JSX. Changing log input clears stale comparison state but does not discard the last simulator run. The existing 20-second browser API timeout remains unchanged.

### Presentation

Split the current component by responsibility:

- `LogAnalyzer` owns log text, file import, sample reset, and page composition.
- `SimulatorPanel` renders run and comparison controls/results.
- `LogAnalysisResults` renders metrics, operator summaries, coverage, policy hints, evidence, and logging guidance.

Small presentation helpers may stay colocated with the component that exclusively uses them. The refactor should avoid creating one-file wrappers that contain no meaningful behavior.

## Data Flow

### Run simulator

1. `LogAnalyzer` invokes the controller with the configured case-study URL.
2. The client posts a typed run request to `/api/simulator/runs`.
3. The route validates the request and calls `runExternalCrawlerSimulation` directly.
4. The route serializes the domain result into `SimulatorRunResponse`.
5. The client validates the required response fields and stores the run.

### Match imported logs

1. The controller sends the current run identifier, serialized attempts, and log text to `/api/simulator/match-logs`.
2. The route validates the input and parses the log text once.
3. The route invokes the single domain matcher with normalized entries.
4. The response contains log-analysis output and one attempt-grouped comparison.
5. The client stores the comparison without compatibility-shape normalization.

## Validation and Error Handling

- Empty or missing `runId` is invalid for matching.
- Missing non-string `logInput` is invalid; an empty string remains valid so the UI can show all attempts as unobserved.
- `attempted` must be an array of structurally valid serialized attempts. Invalid entries are rejected rather than silently discarded.
- Run requests accept the canonical `sourceUrl` field only and validate it as an HTTP or HTTPS URL.
- API routes distinguish invalid JSON/input, external network failures, and unexpected failures.
- Browser transport converts non-success responses, malformed JSON, and aborts into stable client errors. UI handlers continue to render localized fallback messages.

## Testing

Add or update deterministic tests for:

- direct simulator run integration through the API helper;
- canonical run and match response shapes;
- rejection of missing or malformed request fields;
- strict `ogc_run + path + User-Agent` matching;
- multiple matching log lines grouped under one observed attempt;
- `observedCount <= attemptedCount`;
- empty logs producing zero observed attempts;
- missing User-Agent and missing marker warnings;
- client response guards and error conversion without real network calls;
- existing crawler-token exclusions and request timeouts.

Run the repository acceptance commands after implementation:

```bash
npm run lint
npm test
npm run build
```

## Migration Sequence

1. Introduce the canonical transport contracts and focused contract tests.
2. Consolidate the domain matcher and test duplicate-log grouping.
3. Simplify API helpers and routes to explicit imports and one comparison response.
4. Add the typed browser client and controller hook.
5. Extract simulator and log-analysis presentation components.
6. Delete compatibility helpers and verify no stale aliases or dynamic export candidates remain.
7. Run all acceptance commands and update project-state documentation with the resulting stable boundaries.

## Acceptance Criteria

- Existing user-visible simulator and log-analysis workflows behave the same.
- A matching attempt is counted once even if several log lines match it.
- The simulator API no longer discovers internal functions by string name.
- Server and browser code share canonical request and response contracts.
- Only one attempted-versus-observed matching implementation remains.
- `log-analyzer.tsx` becomes a page-level orchestrator rather than a transport and compatibility layer.
- Lint, all unit tests, and the production build pass.
