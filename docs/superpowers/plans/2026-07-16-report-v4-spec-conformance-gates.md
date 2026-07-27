# Report V4 Spec Conformance Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish an executable traceability and acceptance gate that prevents `combined_geo_report_v4` implementation from being declared complete when it differs from the approved two-stage GEO report design.

**Architecture:** A machine-readable JSON registry is the authority for requirement IDs, implementation ownership, tests, commands, runtime evidence and verification state. A pure TypeScript conformance module validates the registry and renders the Markdown coverage matrix; a thin CLI exposes structural traceability and final acceptance modes. Structural traceability passes while work is planned, but final acceptance fails until every requirement is verified with real files, requirement markers, passing commands and required Staging evidence.

**Tech Stack:** TypeScript, Node.js, Vitest, npm workspaces, JSON, Markdown

## Global Constraints

- The prospective artifact contract is `combined_geo_report_v4`; historical V1, V2 and V3 remain readable and are never reinterpreted.
- The approved product specification is `docs/superpowers/specs/2026-07-16-two-stage-geo-report-generation-design.md`.
- The requirements registry is the single authority for the generated coverage matrix.
- `traceability` mode validates structure without claiming the product is implemented.
- `acceptance` mode fails unless every requirement is `verified`, every declared implementation/test/evidence path exists, every test file contains its requirement marker and every distinct verification command succeeds.
- The initial infrastructure commit must leave all product requirements in `planned`; it must not claim V4 business functionality exists.
- Customer-visible analysis remains GEO-only; model-authored analysis and recommendations may not introduce SEO terminology.
- No report business logic is changed in this infrastructure phase.
- The unrelated untracked `docs/superpowers/plans/2026-07-15-v3-paid-acceptance-remediation.md` remains untouched.

---

### Task 1: Register the executable V4 requirements

**Files:**
- Create: `config/report-contracts/combined-geo-report-v4.requirements.json`
- Modify: `docs/superpowers/specs/2026-07-16-two-stage-geo-report-generation-design.md`

**Interfaces:**
- Produces: `ReportV4RequirementRegistry` JSON consumed by the conformance library.
- Produces: stable IDs in the form `GEO-V4-<AREA>-NN`.
- Consumes: approved sections 3 through 19 of the design specification.

- [ ] **Step 1: Add the registry with exact requirement ownership**

Create a JSON object with this top-level shape:

```json
{
  "contract": "combined_geo_report_v4",
  "specPath": "docs/superpowers/specs/2026-07-16-two-stage-geo-report-generation-design.md",
  "matrixPath": "docs/REPORT-V4-COVERAGE-MATRIX.md",
  "requirements": []
}
```

Each requirement must contain `id`, `specSection`, `title`, `status`, `implementationPaths`, `testPaths`, `verificationCommands` and `runtimeEvidencePaths`. Use `planned` for every initial status. Register all approved boundaries: isolated V4 contract, crawl scope, raw/browser fallback, 1–50/51 admission, snapshot reuse, pre-call Token gate, hierarchical summaries, three independent questions, one local retry, per-question top five sources, inaccessible-source degradation, core-before-diagnosis, question-level diagnosis, diagnosis failure isolation, prompt leakage prevention, GEO-only terminology, no new PDF, historical compatibility, commerce invariants and Staging call/time evidence.

- [ ] **Step 2: Bind the design document to the registry**

Add this metadata below the design scope:

```markdown
**前瞻合同：** `combined_geo_report_v4`

**可执行需求注册表：** `config/report-contracts/combined-geo-report-v4.requirements.json`
```

Add a final section stating that requirement status is authoritative only through the registry and `npm run report:v4:acceptance`; prose or task checkboxes cannot independently claim completion.

- [ ] **Step 3: Validate JSON and inspect the exact diff**

Run:

```powershell
Get-Content config/report-contracts/combined-geo-report-v4.requirements.json -Raw | ConvertFrom-Json | Out-Null
git diff --check -- config/report-contracts/combined-geo-report-v4.requirements.json docs/superpowers/specs/2026-07-16-two-stage-geo-report-generation-design.md
```

Expected: JSON parsing succeeds and `git diff --check` prints nothing.

### Task 2: Implement and test the pure conformance engine

**Files:**
- Create: `apps/web/src/report-v4/conformance.ts`
- Create: `apps/web/src/report-v4/conformance.test.ts`

**Interfaces:**
- Produces: `parseReportV4Registry(value: unknown): ReportV4RequirementRegistry`.
- Produces: `auditReportV4Registry(registry, workspaceRoot, mode, commandRunner): Promise<ConformanceResult>`.
- Produces: `renderReportV4CoverageMatrix(registry): string`.
- Consumes: registry JSON and a dependency-injected verification-command runner.

- [ ] **Step 1: Write failing parser and audit tests**

Tests must prove:

```ts
expect(() => parseReportV4Registry(validRegistry)).not.toThrow();
expect(() => parseReportV4Registry(duplicateIds)).toThrow(/duplicate requirement id/i);
expect(() => parseReportV4Registry(badStatus)).toThrow(/unsupported requirement status/i);
expect((await auditReportV4Registry(plannedRegistry, root, "traceability", runner)).exitCode).toBe(0);
expect((await auditReportV4Registry(plannedRegistry, root, "acceptance", runner)).exitCode).toBe(1);
expect((await auditReportV4Registry(verifiedRegistry, root, "acceptance", runner)).exitCode).toBe(0);
```

The verified fixture must use temporary implementation, test and evidence files. Its test file must contain `@requirement <ID>`. A missing marker, missing file, changed matrix or failing command must independently produce exit code 1 and identify the exact requirement.

- [ ] **Step 2: Run the focused test and confirm failure**

Run:

```bash
npm test -- apps/web/src/report-v4/conformance.test.ts
```

Expected: FAIL because `conformance.ts` does not exist.

- [ ] **Step 3: Implement strict parsing**

Define these exact public types:

```ts
export type ReportV4RequirementStatus = "planned" | "implemented" | "verified";
export type ReportV4AuditMode = "traceability" | "acceptance";

export interface ReportV4Requirement {
  id: string;
  specSection: string;
  title: string;
  status: ReportV4RequirementStatus;
  implementationPaths: string[];
  testPaths: string[];
  verificationCommands: string[];
  runtimeEvidencePaths: string[];
}

export interface ReportV4RequirementRegistry {
  contract: "combined_geo_report_v4";
  specPath: string;
  matrixPath: string;
  requirements: ReportV4Requirement[];
}

export interface ConformanceResult {
  exitCode: 0 | 1;
  output: string;
}
```

Reject unknown top-level contract values, empty arrays, duplicate IDs, IDs outside `^GEO-V4-[A-Z]+-[0-9]{2}$`, unsupported statuses, absolute paths and paths containing `..`.

- [ ] **Step 4: Implement the two audit modes**

`traceability` checks registry structure, spec existence and exact matrix content. It does not require planned implementation/test/evidence paths to exist and does not run verification commands.

`acceptance` additionally requires every status to be `verified`, every declared path to exist, every test file to contain `@requirement <ID>`, and every distinct verification command to return zero. It aggregates every failure rather than stopping at the first one.

- [ ] **Step 5: Implement deterministic matrix rendering**

Render a table with columns `ID`, `Spec`, `Requirement`, `Status`, `Implementation`, `Tests`, `Commands` and `Runtime evidence`. Sort in registry order and finish with:

```markdown
This file is generated from `config/report-contracts/combined-geo-report-v4.requirements.json`. Do not edit it independently.
```

- [ ] **Step 6: Run the focused test**

Run:

```bash
npm test -- apps/web/src/report-v4/conformance.test.ts
```

Expected: PASS.

### Task 3: Expose traceability and acceptance commands

**Files:**
- Create: `apps/web/src/scripts/audit-report-v4-conformance.ts`
- Create: `apps/web/src/scripts/audit-report-v4-conformance.test.ts`
- Modify: `apps/web/package.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: the conformance engine and registry JSON.
- Produces: `npm run report:v4:traceability` and `npm run report:v4:acceptance`.
- Produces: `--write-matrix` for deterministic matrix refresh.

- [ ] **Step 1: Write failing CLI argument tests**

Test exact parsing:

```ts
expect(parseReportV4AuditArgs(["traceability"])).toEqual({ mode: "traceability", writeMatrix: false });
expect(parseReportV4AuditArgs(["acceptance"])).toEqual({ mode: "acceptance", writeMatrix: false });
expect(parseReportV4AuditArgs(["traceability", "--write-matrix"])).toEqual({ mode: "traceability", writeMatrix: true });
expect(() => parseReportV4AuditArgs(["acceptance", "--write-matrix"])).toThrow(/traceability only/i);
expect(() => parseReportV4AuditArgs(["unknown"])).toThrow(/traceability or acceptance/i);
```

- [ ] **Step 2: Run the CLI test and confirm failure**

Run:

```bash
npm test -- apps/web/src/scripts/audit-report-v4-conformance.test.ts
```

Expected: FAIL because the CLI module does not exist.

- [ ] **Step 3: Implement the CLI**

Resolve the workspace root from the script location, read and parse the registry, optionally write the rendered matrix only in traceability mode, execute the audit and set `process.exitCode`. Verification commands run with `spawnSync(command, { cwd: workspaceRoot, shell: true, stdio: "inherit" })`; commands come only from the committed registry and are never accepted from CLI input.

- [ ] **Step 4: Add package commands**

Add to `apps/web/package.json`:

```json
"report:v4:traceability": "node --import tsx src/scripts/audit-report-v4-conformance.ts traceability",
"report:v4:matrix": "node --import tsx src/scripts/audit-report-v4-conformance.ts traceability --write-matrix",
"report:v4:acceptance": "node --import tsx src/scripts/audit-report-v4-conformance.ts acceptance"
```

Add root forwarding commands with the same names using `npm run ... --workspace apps/web`.

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm test -- apps/web/src/report-v4/conformance.test.ts apps/web/src/scripts/audit-report-v4-conformance.test.ts
```

Expected: PASS.

### Task 4: Generate and enforce the coverage matrix

**Files:**
- Create: `docs/REPORT-V4-COVERAGE-MATRIX.md`
- Test: `apps/web/src/report-v4/conformance.test.ts`

**Interfaces:**
- Consumes: the committed JSON registry.
- Produces: a human-reviewable matrix that cannot drift from the registry.

- [ ] **Step 1: Generate the committed matrix**

Run:

```bash
npm run report:v4:matrix
```

Expected: the CLI writes `docs/REPORT-V4-COVERAGE-MATRIX.md` and reports a passing structural traceability audit.

- [ ] **Step 2: Prove drift fails**

The conformance test must render a matrix, alter one requirement status in the committed text fixture and verify traceability returns exit code 1 with `coverage matrix is stale`.

- [ ] **Step 3: Run the structural gate**

Run:

```bash
npm run report:v4:traceability
```

Expected: PASS and report every requirement as planned without claiming implementation.

- [ ] **Step 4: Run the final gate and verify it fails closed**

Run:

```bash
npm run report:v4:acceptance
```

Expected: FAIL and list every planned requirement. No model, browser, database or external network call occurs.

### Task 5: Record the prospective boundary without rewriting current truth

**Files:**
- Modify: `docs/PROJECT-STATE.md`
- Modify: `docs/TASKS.md`
- Modify: `docs/DECISIONS.md`

**Interfaces:**
- Produces: durable project truth that V4 conformance infrastructure exists while V4 business behavior remains unimplemented.

- [ ] **Step 1: Update project state**

Add a concise prospective V4 section stating that the approved design and executable registry exist, structural traceability passes, final acceptance intentionally fails while all requirements are planned, and current V3 runtime remains unchanged.

- [ ] **Step 2: Update tasks**

Add one completed task for installing the conformance infrastructure and one pending task for implementing V4 only through requirement-ID-bound plans and tests.

- [ ] **Step 3: Record the decision**

Add a dated decision that new behavior uses `combined_geo_report_v4`, V1–V3 remain historical, task checkboxes cannot establish completion, and only the executable acceptance gate plus protected-Staging evidence can change a requirement to `verified`.

- [ ] **Step 4: Run scoped documentation and repository checks**

Run:

```bash
npm run report:v4:traceability
npm test -- apps/web/src/report-v4/conformance.test.ts apps/web/src/scripts/audit-report-v4-conformance.test.ts
npm run lint
git diff --check
```

Expected: traceability, focused tests, lint and diff check pass.

- [ ] **Step 5: Confirm the final gate still refuses completion**

Run:

```bash
npm run report:v4:acceptance
```

Expected: nonzero exit with every unimplemented requirement listed as planned. This expected failure proves the infrastructure cannot misrepresent the product as complete.

- [ ] **Step 6: Commit only this phase**

Stage the plan, registry, conformance engine, CLI, tests, generated matrix, package scripts, design binding and scoped durable docs. Verify the unrelated untracked V3 remediation plan is not staged, then commit:

```bash
git commit -m "test: establish report v4 conformance gates"
```
