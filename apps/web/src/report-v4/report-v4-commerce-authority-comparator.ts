import { createHash } from "node:crypto";
import type { ReportV4CommerceAuthoritySnapshot } from "../db/report-v4-commerce-authority-snapshot";
import { fingerprintNormalizedReportV4CommerceAuthority } from "./report-v4-commerce-authority-fingerprint";

export type ReportV4CommerceScenarioKind =
  | "success"
  | "diagnosis_failure"
  | "question_failure";

export type ReportV4CommerceComponentName =
  | "orders"
  | "paymentEvents"
  | "jobs"
  | "dispatches"
  | "accessKeys"
  | "creditLedger"
  | "refunds"
  | "emailDeliveries"
  | "emailEvents"
  | "accessTokens"
  | "artifacts"
  | "questionCheckpoints"
  | "diagnosisCheckpoints";

export interface ReportV4CommerceComparisonViolation {
  readonly code: string;
  readonly message: string;
  readonly component: ReportV4CommerceComponentName | "snapshot" | "scope" | "topology";
}

export interface ReportV4CommerceComponentObservation {
  readonly count: number;
  readonly duplicateCount: number;
  readonly fingerprint: string;
}

export interface ReportV4CommerceComponentComparison {
  readonly baseline: ReportV4CommerceComponentObservation;
  readonly final: ReportV4CommerceComponentObservation;
  readonly delta: number;
  readonly added: number;
  readonly removed: number;
  readonly changed: number;
  readonly violations: readonly ReportV4CommerceComparisonViolation[];
}

export interface ReportV4CommerceAuthorityComparison {
  readonly valid: boolean;
  readonly scenarioKind: ReportV4CommerceScenarioKind;
  readonly baselineFingerprint: string;
  readonly finalFingerprint: string;
  readonly components: Readonly<
    Record<ReportV4CommerceComponentName, ReportV4CommerceComponentComparison>
  >;
  readonly violations: readonly ReportV4CommerceComparisonViolation[];
  readonly verified: Readonly<{
    baselineFingerprint: boolean;
    finalFingerprint: boolean;
    distinctFingerprints: boolean;
    captureOrder: boolean;
    immutableLineage: boolean;
    componentAuthority: boolean;
    finalTopology: boolean;
  }>;
}

type Row = Readonly<Record<string, unknown>>;
type MutableComponent = {
  name: ReportV4CommerceComponentName;
  baselineRows: readonly Row[];
  finalRows: readonly Row[];
  idKey: (row: Row) => string;
  naturalKey: (row: Row) => string;
  violations: ReportV4CommerceComparisonViolation[];
  added: number;
  removed: number;
  changed: number;
};

const SNAPSHOT_KEYS = [
  "phase",
  "scenarioKind",
  "capturedAt",
  "scope",
  "orders",
  "paymentEvents",
  "jobs",
  "dispatches",
  "creditAuthority",
  "emailAuthority",
  "accessTokens",
  "artifacts",
  "questionCheckpoints",
  "diagnosisCheckpoints",
  "fingerprint",
  "transactionProfile",
] as const;

const COMPONENT_NAMES: readonly ReportV4CommerceComponentName[] = [
  "orders",
  "paymentEvents",
  "jobs",
  "dispatches",
  "accessKeys",
  "creditLedger",
  "refunds",
  "emailDeliveries",
  "emailEvents",
  "accessTokens",
  "artifacts",
  "questionCheckpoints",
  "diagnosisCheckpoints",
];

/**
 * Compares two independently captured, hash-safe PostgreSQL authority snapshots.
 * It never accepts component summaries as authority: both complete snapshots are
 * revalidated by the canonical fingerprint implementation before any delta is
 * considered verified.
 *
 * @requirement GEO-V4-COMMERCE-01
 * @requirement GEO-V4-ACCEPT-01
 */
export function compareReportV4CommerceAuthoritySnapshots(input: {
  readonly baseline: ReportV4CommerceAuthoritySnapshot;
  readonly final: ReportV4CommerceAuthoritySnapshot;
  readonly scenarioKind: ReportV4CommerceScenarioKind;
}): ReportV4CommerceAuthorityComparison {
  const violations: ReportV4CommerceComparisonViolation[] = [];
  const scenarioKind = isScenarioKind(input.scenarioKind)
    ? input.scenarioKind
    : "question_failure";
  if (!isScenarioKind(input.scenarioKind))
    add(
      violations,
      "invalid_scenario_kind",
      "snapshot",
      "scenarioKind must be success, diagnosis_failure, or question_failure",
    );
  const baseline = exactSnapshot(input.baseline, "baseline", violations);
  const final = exactSnapshot(input.final, "final", violations);

  const baselineVerified = verifyFingerprint(baseline, "baseline", violations);
  const finalVerified = verifyFingerprint(final, "final", violations);
  if (baseline.scenarioKind !== scenarioKind)
    add(violations, "scenario_kind_mismatch", "snapshot", "baseline scenario kind does not match the comparison contract");
  if (final.scenarioKind !== scenarioKind)
    add(violations, "scenario_kind_mismatch", "snapshot", "final scenario kind does not match the comparison contract");

  const distinctFingerprints = baseline.fingerprint !== final.fingerprint;
  if (!distinctFingerprints)
    add(violations, "identical_fingerprints", "snapshot", "baseline and final authority fingerprints must differ");
  const captureOrder = Date.parse(baseline.capturedAt) < Date.parse(final.capturedAt);
  if (!captureOrder)
    add(violations, "capture_order_reversed", "snapshot", "final authority capture precedes baseline capture");

  const immutableLineage = compareScope(baseline, final, scenarioKind, violations);
  const mutable = createComponents(baseline, final);
  compareAppendOnly(mutable.orders, false);
  compareAppendOnly(mutable.paymentEvents, false);
  compareJobs(mutable.jobs, scenarioKind, final);
  compareDispatches(mutable.dispatches, scenarioKind, final);
  compareAppendOnly(mutable.accessKeys, false);
  compareAppendOnly(mutable.creditLedger, false);
  compareAppendOnly(mutable.refunds, false);
  compareAppendOnly(mutable.emailDeliveries, false);
  compareAppendOnly(mutable.emailEvents, false);
  compareAppendOnly(mutable.accessTokens, false);
  compareArtifacts(mutable.artifacts, scenarioKind, baseline, final);
  compareAppendOnly(mutable.questionCheckpoints, false);
  compareDiagnosisCheckpoints(mutable.diagnosisCheckpoints, scenarioKind);
  for (const component of Object.values(mutable)) registerDuplicates(component);
  const finalTopology = validateFinalTopology(final, scenarioKind, violations);

  const components = Object.fromEntries(
    COMPONENT_NAMES.map((name) => [name, finishComponent(mutable[name])]),
  ) as unknown as Record<ReportV4CommerceComponentName, ReportV4CommerceComponentComparison>;
  for (const component of Object.values(components)) violations.push(...component.violations);
  const componentAuthority = Object.values(components).every((component) => component.violations.length === 0);

  return {
    valid:
      baselineVerified &&
      finalVerified &&
      distinctFingerprints &&
      captureOrder &&
      immutableLineage &&
      componentAuthority &&
      finalTopology &&
      violations.length === 0,
    scenarioKind,
    baselineFingerprint: baseline.fingerprint,
    finalFingerprint: final.fingerprint,
    components,
    violations,
    verified: {
      baselineFingerprint: baselineVerified,
      finalFingerprint: finalVerified,
      distinctFingerprints,
      captureOrder,
      immutableLineage,
      componentAuthority,
      finalTopology,
    },
  };
}

function exactSnapshot(
  value: ReportV4CommerceAuthoritySnapshot,
  phase: "baseline" | "final",
  violations: ReportV4CommerceComparisonViolation[],
): ReportV4CommerceAuthoritySnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    add(violations, "invalid_snapshot", "snapshot", `${phase} authority must be a complete snapshot object`);
    return emptySnapshot(phase);
  }
  const actual = Object.keys(value).sort();
  const expected = [...SNAPSHOT_KEYS].sort();
  if (stableJson(actual) !== stableJson(expected))
    add(violations, "invalid_snapshot_shape", "snapshot", `${phase} authority does not have the exact snapshot fields`);
  if (value.phase !== phase)
    add(violations, "phase_mismatch", "snapshot", `${phase} snapshot declares the wrong phase`);
  if (
    value.transactionProfile?.isolation !== "repeatable read" ||
    value.transactionProfile?.readOnly !== true
  )
    add(violations, "invalid_transaction_profile", "snapshot", `${phase} snapshot is not a repeatable-read read-only authority capture`);
  if (!canonicalTime(value.capturedAt))
    add(violations, "invalid_capture_time", "snapshot", `${phase} capturedAt is not canonical UTC`);
  return value;
}

function verifyFingerprint(
  snapshot: ReportV4CommerceAuthoritySnapshot,
  phase: "baseline" | "final",
  violations: ReportV4CommerceComparisonViolation[],
): boolean {
  try {
    const recomputed = fingerprintNormalizedReportV4CommerceAuthority(authorityInput(snapshot));
    if (recomputed !== snapshot.fingerprint) {
      add(violations, "fingerprint_mismatch", "snapshot", `${phase} stored fingerprint does not match its canonical authority fields`);
      return false;
    }
    return true;
  } catch (error) {
    add(
      violations,
      "invalid_canonical_authority",
      "snapshot",
      `${phase} authority cannot be canonically fingerprinted: ${error instanceof Error ? error.message : "invalid authority"}`,
    );
    return false;
  }
}

function authorityInput(snapshot: ReportV4CommerceAuthoritySnapshot): Record<string, unknown> {
  return {
    phase: snapshot.phase,
    capturedAt: snapshot.capturedAt,
    scope: snapshot.scope,
    orders: snapshot.orders,
    paymentEvents: snapshot.paymentEvents,
    jobs: snapshot.jobs,
    dispatches: snapshot.dispatches,
    creditAuthority: snapshot.creditAuthority,
    emailAuthority: snapshot.emailAuthority,
    accessTokens: snapshot.accessTokens,
    artifacts: snapshot.artifacts,
    questionCheckpoints: snapshot.questionCheckpoints,
    diagnosisCheckpoints: snapshot.diagnosisCheckpoints,
  };
}

function compareScope(
  baseline: ReportV4CommerceAuthoritySnapshot,
  final: ReportV4CommerceAuthoritySnapshot,
  kind: ReportV4CommerceScenarioKind,
  violations: ReportV4CommerceComparisonViolation[],
): boolean {
  const immutable = [
    "reportIdHash",
    "orderIdHash",
    "siteSnapshotIdHash",
    "configSnapshotIdHash",
    "questionSetIdHash",
    "preAdmissionJobIdHash",
    "coreJobIdHash",
    "coreArtifactRevisionIdHash",
  ] as const;
  let valid = true;
  for (const field of immutable) {
    if (baseline.scope[field] !== final.scope[field]) {
      add(violations, "scope_lineage_changed", "scope", `${field} changed between authority captures`);
      valid = false;
    }
  }
  if (baseline.scope.enhancementJobIdHash !== null || baseline.scope.enhancementArtifactRevisionIdHash !== null) {
    add(violations, "baseline_enhancement_present", "scope", "baseline must precede enhancement job and artifact creation");
    valid = false;
  }
  if (kind === "question_failure") {
    if (final.scope.enhancementJobIdHash !== null || final.scope.enhancementArtifactRevisionIdHash !== null) {
      add(violations, "unexpected_enhancement_scope", "scope", "question failure must not declare enhancement lineage");
      valid = false;
    }
  } else if (final.scope.enhancementJobIdHash === null || final.scope.enhancementArtifactRevisionIdHash === null) {
    add(violations, "missing_enhancement_scope", "scope", "enhancement scenario is missing final enhancement lineage");
    valid = false;
  }
  return valid;
}

function createComponents(
  baseline: ReportV4CommerceAuthoritySnapshot,
  final: ReportV4CommerceAuthoritySnapshot,
): Record<ReportV4CommerceComponentName, MutableComponent> {
  const component = (
    name: ReportV4CommerceComponentName,
    baselineRows: readonly Row[],
    finalRows: readonly Row[],
    naturalKey: (row: Row) => string = (row) => String(row.idHash),
    idKey: (row: Row) => string = (row) => String(row.idHash),
  ): MutableComponent => ({ name, baselineRows, finalRows, idKey, naturalKey, violations: [], added: 0, removed: 0, changed: 0 });
  return {
    orders: component("orders", baseline.orders as readonly Row[], final.orders as readonly Row[]),
    paymentEvents: component("paymentEvents", baseline.paymentEvents as readonly Row[], final.paymentEvents as readonly Row[], (row) => `${row.provider}:${row.providerEventIdHash}`),
    jobs: component("jobs", baseline.jobs as readonly Row[], final.jobs as readonly Row[]),
    dispatches: component("dispatches", baseline.dispatches as readonly Row[], final.dispatches as readonly Row[], (row) => String(row.jobIdHash)),
    accessKeys: component("accessKeys", baseline.creditAuthority.accessKeys as readonly Row[], final.creditAuthority.accessKeys as readonly Row[]),
    creditLedger: component("creditLedger", baseline.creditAuthority.creditLedger as readonly Row[], final.creditAuthority.creditLedger as readonly Row[], (row) => String(row.idempotencyKeyHash)),
    refunds: component("refunds", baseline.creditAuthority.refunds as readonly Row[], final.creditAuthority.refunds as readonly Row[], (row) => String(row.idempotencyKeyHash)),
    emailDeliveries: component("emailDeliveries", baseline.emailAuthority.deliveries as readonly Row[], final.emailAuthority.deliveries as readonly Row[], (row) => String(row.businessIdempotencyKeyHash)),
    emailEvents: component("emailEvents", baseline.emailAuthority.events as readonly Row[], final.emailAuthority.events as readonly Row[], (row) => `${row.provider}:${row.providerEventIdHash}`),
    accessTokens: component("accessTokens", baseline.accessTokens as readonly Row[], final.accessTokens as readonly Row[], (row) => String(row.tokenPrefixHash)),
    artifacts: component("artifacts", baseline.artifacts as readonly Row[], final.artifacts as readonly Row[]),
    questionCheckpoints: component("questionCheckpoints", baseline.questionCheckpoints as unknown as readonly Row[], final.questionCheckpoints as unknown as readonly Row[], (row) => String(row.ordinal), (row) => String(row.identityHash)),
    diagnosisCheckpoints: component("diagnosisCheckpoints", baseline.diagnosisCheckpoints as unknown as readonly Row[], final.diagnosisCheckpoints as unknown as readonly Row[], (row) => String(row.ordinal), (row) => String(row.identityHash)),
  };
}

function compareJobs(
  component: MutableComponent,
  kind: ReportV4CommerceScenarioKind,
  final: ReportV4CommerceAuthoritySnapshot,
): void {
  compareRows(component, {
    additions: kind === "question_failure" ? "none" : "one",
    allowedAddition: (row) => row.idHash === final.scope.enhancementJobIdHash && row.reason === "v4_diagnosis_enhancement",
    transition: exactTransition,
  });
}

function compareDispatches(
  component: MutableComponent,
  kind: ReportV4CommerceScenarioKind,
  final: ReportV4CommerceAuthoritySnapshot,
): void {
  compareRows(component, {
    additions: kind === "question_failure" ? "none" : "one",
    allowedAddition: (row) => row.jobIdHash === final.scope.enhancementJobIdHash,
    transition: exactTransition,
  });
}

function compareArtifacts(
  component: MutableComponent,
  kind: ReportV4CommerceScenarioKind,
  baseline: ReportV4CommerceAuthoritySnapshot,
  final: ReportV4CommerceAuthoritySnapshot,
): void {
  compareRows(component, {
    additions: kind === "question_failure" ? "none" : "one",
    allowedAddition: (row) => row.idHash === final.scope.enhancementArtifactRevisionIdHash && row.revisionKind === "diagnosis_enhancement",
    transition: (before, after, violations) => {
      immutableFields(before, after, new Set(["status", "activatedAt"]), violations);
      const allowed = before.idHash === baseline.scope.coreArtifactRevisionIdHash && kind !== "question_failure"
        ? before.status === "active" && after.status === "ready"
        : before.status === after.status;
      if (!allowed) violations.push(`illegal artifact status transition ${String(before.status)}->${String(after.status)}`);
      if (kind === "question_failure" && before.activatedAt !== after.activatedAt)
        violations.push("question-failure core activation timestamp changed");
      if (kind !== "question_failure" && after.activatedAt !== null)
        violations.push("demoted core artifact retained activatedAt");
    },
  });
}

function compareDiagnosisCheckpoints(component: MutableComponent, kind: ReportV4CommerceScenarioKind): void {
  compareRows(component, {
    additions: kind === "question_failure" ? "none" : "three",
    transition: exactTransition,
  });
}

function compareAppendOnly(component: MutableComponent, allowAdditions: boolean): void {
  compareRows(component, { additions: allowAdditions ? "append" : "none", transition: exactTransition });
}

function registerDuplicates(component: MutableComponent): void {
  const baselineDuplicates = Math.max(
    duplicateCount(component.baselineRows.map(component.idKey)),
    duplicateCount(component.baselineRows.map(component.naturalKey)),
  );
  const finalDuplicates = Math.max(
    duplicateCount(component.finalRows.map(component.idKey)),
    duplicateCount(component.finalRows.map(component.naturalKey)),
  );
  if (baselineDuplicates > 0)
    violation(component, "duplicate_natural_key", `baseline contains ${baselineDuplicates} duplicate authority row(s)`);
  if (finalDuplicates > 0)
    violation(component, "duplicate_natural_key", `final contains ${finalDuplicates} duplicate authority row(s)`);
}

function compareRows(
  component: MutableComponent,
  options: {
    additions: "none" | "one" | "three" | "at-most-one" | "append";
    allowedAddition?: (row: Row) => boolean;
    transition: (before: Row, after: Row, violations: string[]) => void;
  },
): void {
  const baselineById = indexById(component.baselineRows, component.idKey);
  const finalById = indexById(component.finalRows, component.idKey);
  for (const [id, before] of baselineById) {
    const after = finalById.get(id);
    if (!after) {
      component.removed += 1;
      violation(component, "row_removed", `authority row ${id} was removed`);
      continue;
    }
    const rowViolations: string[] = [];
    options.transition(before, after, rowViolations);
    if (stableJson(before) !== stableJson(after)) component.changed += 1;
    for (const message of rowViolations) violation(component, "illegal_row_transition", `${id}: ${message}`);
  }
  const added = [...finalById.entries()].filter(([id]) => !baselineById.has(id));
  component.added = added.length;
  const expected = options.additions === "one" ? 1 : options.additions === "three" ? 3 : null;
  if (options.additions === "none" && added.length !== 0)
    violation(component, "unexpected_rows_added", `${added.length} undeclared authority row(s) were added`);
  if (expected !== null && added.length !== expected)
    violation(component, "wrong_addition_count", `expected ${expected} added authority row(s), observed ${added.length}`);
  if (options.additions === "at-most-one" && added.length > 1)
    violation(component, "duplicate_side_effect", "more than one side-effect row was added");
  if (options.allowedAddition)
    for (const [, row] of added)
      if (!options.allowedAddition(row)) violation(component, "undeclared_row_added", "added row does not match the declared scenario topology");
}

function validateFinalTopology(
  snapshot: ReportV4CommerceAuthoritySnapshot,
  kind: ReportV4CommerceScenarioKind,
  violations: ReportV4CommerceComparisonViolation[],
): boolean {
  const before = violations.length;
  const expectedEnhancement = kind !== "question_failure";
  const expectedJobs = expectedEnhancement ? 3 : 2;
  if (snapshot.jobs.length !== expectedJobs) add(violations, "job_topology", "topology", `final ${kind} must contain ${expectedJobs} jobs`);
  if (snapshot.dispatches.length !== expectedJobs) add(violations, "dispatch_topology", "topology", `final ${kind} must contain ${expectedJobs} dispatches`);
  const preAdmission = snapshot.jobs.find((job) => job.reason === "v4_pre_admission");
  const core = snapshot.jobs.find((job) => job.reason === "standard");
  const enhancement = snapshot.jobs.find((job) => job.reason === "v4_diagnosis_enhancement");
  validateFinalJob(preAdmission, "pre-admission", "completed", true, violations);
  validateFinalJob(
    core,
    "core",
    kind === "question_failure" ? "completed_limited" : "completed",
    true,
    violations,
  );
  if (expectedEnhancement)
    validateFinalJob(enhancement, "enhancement", "completed", false, violations);
  else if (enhancement)
    add(violations, "job_topology", "topology", "question failure must not contain an enhancement job");
  if (snapshot.artifacts.length !== (expectedEnhancement ? 2 : 1)) add(violations, "artifact_topology", "topology", `final ${kind} has the wrong artifact count`);
  if (snapshot.questionCheckpoints.length !== 3) add(violations, "question_topology", "topology", "final authority must contain exactly three question checkpoints");
  const answered = snapshot.questionCheckpoints.filter((row) => row.state === "answered").length;
  const unavailable = snapshot.questionCheckpoints.filter((row) => row.state === "unavailable").length;
  if (kind === "question_failure" ? answered !== 2 || unavailable !== 1 : answered !== 3 || unavailable !== 0)
    add(violations, "question_outcome_topology", "topology", `${kind} has the wrong question outcome distribution`);
  const completed = snapshot.diagnosisCheckpoints.filter((row) => row.state === "completed").length;
  const failed = snapshot.diagnosisCheckpoints.filter((row) => row.state === "failed").length;
  if (kind === "success" && (completed !== 3 || failed !== 0)) add(violations, "diagnosis_outcome_topology", "topology", "success must have three completed diagnoses");
  if (kind === "diagnosis_failure" && (completed !== 2 || failed !== 1)) add(violations, "diagnosis_outcome_topology", "topology", "diagnosis failure must have two completed and one failed diagnosis");
  if (kind === "question_failure" && snapshot.diagnosisCheckpoints.length !== 0) add(violations, "diagnosis_topology", "topology", "question failure must not have diagnosis checkpoints");
  const coreArtifact = snapshot.artifacts.find((row) => row.idHash === snapshot.scope.coreArtifactRevisionIdHash);
  const enhancementArtifact = snapshot.artifacts.find((row) => row.idHash === snapshot.scope.enhancementArtifactRevisionIdHash);
  if (kind === "question_failure") {
    if (!coreArtifact || coreArtifact.status !== "active" || snapshot.scope.activeArtifactRevisionIdHash !== coreArtifact.idHash)
      add(violations, "active_artifact_topology", "topology", "question failure must leave Core as the only active artifact");
  } else if (!coreArtifact || !enhancementArtifact || coreArtifact.status !== "ready" || enhancementArtifact.status !== "active" || snapshot.scope.activeArtifactRevisionIdHash !== enhancementArtifact.idHash) {
    add(violations, "active_artifact_topology", "topology", "enhancement scenario must demote Core and activate the enhancement artifact");
  }
  for (const dispatch of snapshot.dispatches)
    if (dispatch.state !== "published") add(violations, "dispatch_state_topology", "topology", "every final scenario dispatch must be published");
  return violations.length === before;
}

function validateFinalJob(
  job: ReportV4CommerceAuthoritySnapshot["jobs"][number] | undefined,
  lane: "pre-admission" | "core" | "enhancement",
  expectedStage: "completed" | "completed_limited",
  requiresPageCounters: boolean,
  violations: ReportV4CommerceComparisonViolation[],
): void {
  if (!job) {
    add(violations, "job_topology", "topology", `final authority is missing the ${lane} job`);
    return;
  }
  if (
    job.stage !== expectedStage ||
    job.executionState !== "completed" ||
    job.currentPhase !== "terminalization" ||
    job.progress !== 100 ||
    job.errorCode !== null ||
    job.publicError !== null
  ) {
    add(
      violations,
      "job_terminal_state",
      "topology",
      `${lane} job is not in its exact successful terminal state`,
    );
  }
  if (job.attempts < 1 || job.attempts > job.maxAttempts) {
    add(
      violations,
      "job_attempt_counters",
      "topology",
      `${lane} job has invalid terminal attempt counters`,
    );
  }
  if (requiresPageCounters) {
    if (
      job.plannedPages < 1 ||
      job.successfulPages < 1 ||
      job.successfulPages + job.failedPages !== job.plannedPages
    ) {
      add(
        violations,
        "job_page_counters",
        "topology",
        `${lane} job has invalid terminal page counters`,
      );
    }
  } else if (
    job.plannedPages !== 0 ||
    job.successfulPages !== 0 ||
    job.failedPages !== 0
  ) {
    add(
      violations,
      "job_page_counters",
      "topology",
      "enhancement job must not claim crawl page counters",
    );
  }
}

function finishComponent(component: MutableComponent): ReportV4CommerceComponentComparison {
  return {
    baseline: observe(component.baselineRows, component.naturalKey, component.idKey),
    final: observe(component.finalRows, component.naturalKey, component.idKey),
    delta: component.finalRows.length - component.baselineRows.length,
    added: component.added,
    removed: component.removed,
    changed: component.changed,
    violations: component.violations,
  };
}

function observe(
  rows: readonly Row[],
  naturalKey: (row: Row) => string,
  idKey: (row: Row) => string,
): ReportV4CommerceComponentObservation {
  return {
    count: rows.length,
    duplicateCount: Math.max(
      duplicateCount(rows.map(naturalKey)),
      duplicateCount(rows.map(idKey)),
    ),
    fingerprint: createHash("sha256").update(`open-geo-console/report-v4/commerce-component/v1\0${stableJson(rows)}`).digest("hex"),
  };
}

function indexById(rows: readonly Row[], idKey: (row: Row) => string): Map<string, Row> {
  const result = new Map<string, Row>();
  for (const row of rows) result.set(idKey(row), row);
  return result;
}

function duplicateCount(keys: readonly string[]): number {
  return keys.length - new Set(keys).size;
}

function immutableFields(before: Row, after: Row, mutable: ReadonlySet<string>, violations: string[]): void {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys)
    if (!mutable.has(key) && stableJson(before[key]) !== stableJson(after[key])) violations.push(`${key} changed`);
}

function exactTransition(before: Row, after: Row, violations: string[]): void {
  if (stableJson(before) !== stableJson(after)) violations.push("append-only row changed");
}

function violation(component: MutableComponent, code: string, message: string): void {
  component.violations.push({ code, component: component.name, message });
}

function add(
  violations: ReportV4CommerceComparisonViolation[],
  code: string,
  component: ReportV4CommerceComparisonViolation["component"],
  message: string,
): void {
  violations.push({ code, component, message });
}

function canonicalTime(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) && new Date(value).toISOString() === value;
}

function isScenarioKind(value: unknown): value is ReportV4CommerceScenarioKind {
  return (
    value === "success" ||
    value === "diagnosis_failure" ||
    value === "question_failure"
  );
}

function stableJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  return JSON.stringify(String(value));
}

function emptySnapshot(phase: "baseline" | "final"): ReportV4CommerceAuthoritySnapshot {
  return {
    phase,
    scenarioKind: "question_failure",
    capturedAt: phase === "baseline" ? "1970-01-01T00:00:00.000Z" : "1970-01-01T00:00:00.001Z",
    scope: {
      reportIdHash: "0".repeat(64), orderIdHash: "1".repeat(64), siteSnapshotIdHash: "2".repeat(64), configSnapshotIdHash: "3".repeat(64), questionSetIdHash: "4".repeat(64),
      preAdmissionJobIdHash: "5".repeat(64), coreJobIdHash: "6".repeat(64), enhancementJobIdHash: null, coreArtifactRevisionIdHash: "7".repeat(64), enhancementArtifactRevisionIdHash: null, activeArtifactRevisionIdHash: "7".repeat(64),
    },
    orders: [], paymentEvents: [], jobs: [], dispatches: [], creditAuthority: { accessKeys: [], creditLedger: [], refunds: [] }, emailAuthority: { deliveries: [], events: [] }, accessTokens: [], artifacts: [], questionCheckpoints: [], diagnosisCheckpoints: [], fingerprint: "0".repeat(64), transactionProfile: { isolation: "repeatable read", readOnly: true },
  };
}
