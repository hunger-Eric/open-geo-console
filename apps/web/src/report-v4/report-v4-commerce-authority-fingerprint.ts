import { createHash } from "node:crypto";
import {
  normalizeReportV4AccessTokens,
  normalizeReportV4ArtifactRevisions,
} from "./report-v4-commerce-artifact-authority";
import {
  normalizeReportV4DiagnosisCheckpointAuthorities,
  normalizeReportV4QuestionCheckpointAuthorities,
} from "./report-v4-commerce-checkpoint-authority";
import { normalizeReportV4CommerceCreditAuthority } from "./report-v4-commerce-credit-authority";
import { normalizeReportV4CommerceEmailAuthority } from "./report-v4-commerce-email-authority";
import {
  normalizeReportV4CommerceDispatches,
  normalizeReportV4CommerceJobs,
} from "./report-v4-commerce-job-authority";
import {
  normalizeReportV4CommerceOrders,
  normalizeReportV4PaymentEvents,
} from "./report-v4-commerce-order-authority";

const HASH = /^[a-f0-9]{64}$/u;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const DOMAIN = "open-geo-console/report-v4/commerce-authority-fingerprint/v1";

const topLevelKeys = [
  "phase",
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
] as const;
const scopeKeys = [
  "reportIdHash",
  "orderIdHash",
  "siteSnapshotIdHash",
  "configSnapshotIdHash",
  "questionSetIdHash",
  "preAdmissionJobIdHash",
  "coreJobIdHash",
  "enhancementJobIdHash",
  "coreArtifactRevisionIdHash",
  "enhancementArtifactRevisionIdHash",
] as const;

type Phase = "baseline" | "final";
type Scope = Readonly<{
  reportIdHash: string;
  orderIdHash: string;
  siteSnapshotIdHash: string | null;
  configSnapshotIdHash: string | null;
  questionSetIdHash: string | null;
  preAdmissionJobIdHash: string | null;
  coreJobIdHash: string | null;
  enhancementJobIdHash: string | null;
  coreArtifactRevisionIdHash: string | null;
  enhancementArtifactRevisionIdHash: string | null;
}>;

/**
 * Produces the only persistable value for a scoped commerce observation.
 * Canonical authority material is intentionally local to this function.
 * This opaque seal is neither provider reconciliation nor sufficient
 * acceptance proof without the typed baseline/final semantic comparator.
 */
export function fingerprintReportV4CommerceAuthority(input: unknown): string {
  const raw = exactRecord(input, topLevelKeys, "authority");
  const phase = parsePhase(raw.phase);
  canonicalTime(raw.capturedAt, "capturedAt");
  const scope = parseScope(raw.scope);

  const orders = normalizeReportV4CommerceOrders(array(raw.orders, "orders"));
  const paymentEvents = normalizeReportV4PaymentEvents(
    array(raw.paymentEvents, "paymentEvents"),
  );
  const jobs = normalizeReportV4CommerceJobs(records(raw.jobs, "jobs"));
  const dispatches = normalizeReportV4CommerceDispatches(
    records(raw.dispatches, "dispatches"),
  );
  const creditAuthority = normalizeReportV4CommerceCreditAuthority(
    raw.creditAuthority,
  );
  const emailAuthority = normalizeReportV4CommerceEmailAuthority(
    raw.emailAuthority,
  );
  const accessTokens = normalizeReportV4AccessTokens(
    array(raw.accessTokens, "accessTokens"),
  );
  const artifacts = normalizeReportV4ArtifactRevisions(
    array(raw.artifacts, "artifacts"),
  );
  const questionCheckpoints =
    normalizeReportV4QuestionCheckpointAuthorities(
      array(raw.questionCheckpoints, "questionCheckpoints"),
    );
  const diagnosisCheckpoints =
    normalizeReportV4DiagnosisCheckpointAuthorities(
      array(raw.diagnosisCheckpoints, "diagnosisCheckpoints"),
    );

  validateLineage({
    phase,
    scope,
    orders,
    paymentEvents,
    jobs,
    dispatches,
    creditAuthority,
    emailAuthority,
    accessTokens,
    artifacts,
    questionCheckpoints,
    diagnosisCheckpoints,
  });

  const canonical = JSON.stringify({
    schemaVersion: 1,
    scope,
    orders,
    paymentEvents,
    jobs,
    dispatches,
    creditAuthority: {
      accessKeys: creditAuthority.accessKeys,
      creditLedger: creditAuthority.creditLedger,
      refunds: creditAuthority.refunds,
    },
    emailAuthority: {
      deliveries: emailAuthority.deliveries,
      events: emailAuthority.events,
    },
    accessTokens,
    artifacts,
    questionCheckpoints,
    diagnosisCheckpoints,
  });
  return createHash("sha256")
    .update(`${DOMAIN}/${phase}\0${canonical}`)
    .digest("hex");
}

type Normalized = {
  phase: Phase;
  scope: Scope;
  orders: ReturnType<typeof normalizeReportV4CommerceOrders>;
  paymentEvents: ReturnType<typeof normalizeReportV4PaymentEvents>;
  jobs: ReturnType<typeof normalizeReportV4CommerceJobs>;
  dispatches: ReturnType<typeof normalizeReportV4CommerceDispatches>;
  creditAuthority: ReturnType<
    typeof normalizeReportV4CommerceCreditAuthority
  >;
  emailAuthority: ReturnType<typeof normalizeReportV4CommerceEmailAuthority>;
  accessTokens: ReturnType<typeof normalizeReportV4AccessTokens>;
  artifacts: ReturnType<typeof normalizeReportV4ArtifactRevisions>;
  questionCheckpoints: ReturnType<
    typeof normalizeReportV4QuestionCheckpointAuthorities
  >;
  diagnosisCheckpoints: ReturnType<
    typeof normalizeReportV4DiagnosisCheckpointAuthorities
  >;
};

function validateLineage(value: Normalized): void {
  const { phase, scope } = value;
  const order = exactlyOne(value.orders, "scoped order");
  equal(order.idHash, scope.orderIdHash, "order scope lineage");
  equal(order.reportIdHash, scope.reportIdHash, "order report lineage");
  equal(
    order.siteSnapshotIdHash,
    scope.siteSnapshotIdHash,
    "order snapshot scope lineage",
  );
  equal(
    order.businessQuestionSetIdHash,
    scope.questionSetIdHash,
    "order question-set scope lineage",
  );
  if (
    phase === "final" &&
    (scope.siteSnapshotIdHash === null ||
      scope.configSnapshotIdHash === null ||
      scope.questionSetIdHash === null)
  )
    fail("final scope must declare snapshot, config, and question-set anchors");

  const laneScopes = [
    ["pre-admission", scope.preAdmissionJobIdHash, "v4_pre_admission"],
    ["core", scope.coreJobIdHash, "standard"],
    ["enhancement", scope.enhancementJobIdHash, "v4_diagnosis_enhancement"],
  ] as const;
  distinctNonNull(
    laneScopes.map(([, id]) => id),
    "job scope identifiers",
  );
  const expectedJobs = laneScopes.filter(([, id]) => id !== null);
  if (phase === "final" && expectedJobs.length !== laneScopes.length)
    fail("final job scope must declare all three lanes");
  if (value.jobs.length !== expectedJobs.length)
    fail("job scope must contain every and only the declared lanes");
  for (const [label, idHash, reason] of laneScopes) {
    const matched = value.jobs.filter((job) => job.idHash === idHash);
    if (idHash === null) {
      if (value.jobs.some((job) => job.reason === reason))
        fail(`${label} job exists outside null scope`);
      continue;
    }
    const job = exactlyOne(matched, `${label} job scope`);
    equal(job.reportIdHash, scope.reportIdHash, `${label} report lineage`);
    equal(job.reason, reason, `${label} lane lineage`);
    if (job.tier !== "deep") fail(`${label} job tier must be deep`);
    equal(job.locale, order.reportLocale, `${label} locale lineage`);
  }
  const coreJob = value.jobs.find((job) => job.idHash === scope.coreJobIdHash);
  const enhancementJob = value.jobs.find(
    (job) => job.idHash === scope.enhancementJobIdHash,
  );
  equal(
    order.fulfillmentJobIdHash,
    scope.coreJobIdHash,
    "order fulfillment job scope",
  );
  if (coreJob) {
    equal(
      coreJob.siteSnapshotIdHash,
      scope.siteSnapshotIdHash,
      "core snapshot scope lineage",
    );
    equal(
      coreJob.businessQuestionSetIdHash,
      scope.questionSetIdHash,
      "core question-set scope lineage",
    );
    equal(
      order.siteSnapshotIdHash,
      coreJob.siteSnapshotIdHash,
      "order/core snapshot lineage",
    );
    equal(
      order.businessQuestionSetIdHash,
      coreJob.businessQuestionSetIdHash,
      "order/core question-set lineage",
    );
  }
  if (enhancementJob) {
    equal(
      enhancementJob.businessQuestionSetIdHash,
      scope.questionSetIdHash,
      "enhancement question-set scope lineage",
    );
  }
  if (enhancementJob && coreJob)
    equal(
      enhancementJob.businessQuestionSetIdHash,
      coreJob.businessQuestionSetIdHash,
      "enhancement/core question-set lineage",
    );

  const dispatchJobs = new Set<string>();
  for (const dispatch of value.dispatches) {
    const job = value.jobs.find((candidate) => candidate.idHash === dispatch.jobIdHash);
    if (!job) fail("dispatch has foreign job lineage");
    if (dispatchJobs.has(dispatch.jobIdHash))
      fail("duplicate dispatch natural job key");
    dispatchJobs.add(dispatch.jobIdHash);
    equal(dispatch.tier, job.tier, "dispatch tier lineage");
  }
  if (dispatchJobs.size !== value.jobs.length)
    fail("dispatch scope must contain exactly one row for every scoped job");

  for (const event of value.paymentEvents) {
    equal(event.orderIdHash, scope.orderIdHash, "payment event order lineage");
    equal(event.provider, order.provider, "payment event provider lineage");
  }
  unique(
    value.paymentEvents.map((event) => `${event.provider}:${event.providerEventIdHash}`),
    "payment event natural key",
  );

  const accessKeyIds = new Set(
    value.creditAuthority.accessKeys.map((accessKey) => accessKey.idHash),
  );
  for (const accessKey of value.creditAuthority.accessKeys)
    equal(
      accessKey.paymentOrderIdHash,
      scope.orderIdHash,
      "access key order lineage",
    );
  for (const credit of value.creditAuthority.creditLedger) {
    equal(credit.reportIdHash, scope.reportIdHash, "credit report lineage");
    equal(
      credit.paymentOrderIdHash,
      scope.orderIdHash,
      "credit order lineage",
    );
    if (!accessKeyIds.has(credit.accessKeyIdHash))
      fail("credit has foreign access-key lineage");
    if (credit.jobIdHash !== null && credit.jobIdHash !== scope.coreJobIdHash)
      fail("credit has foreign job lineage");
  }
  if (coreJob) {
    if (coreJob.creditReservationIdHash === null)
      fail("core job is missing credit reservation lineage");
    const reservation = exactlyOne(
      value.creditAuthority.creditLedger.filter(
        (credit) => credit.idHash === coreJob.creditReservationIdHash,
      ),
      "core credit reservation scope",
    );
    equal(reservation.jobIdHash, coreJob.idHash, "core credit job lineage");
    equal(
      reservation.reportIdHash,
      scope.reportIdHash,
      "core credit report lineage",
    );
    equal(
      reservation.paymentOrderIdHash,
      scope.orderIdHash,
      "core credit order lineage",
    );
    if (!accessKeyIds.has(reservation.accessKeyIdHash))
      fail("core credit has foreign access-key lineage");
  }
  const creditedAccessKeys = new Set(
    value.creditAuthority.creditLedger.map((credit) => credit.accessKeyIdHash),
  );
  for (const accessKeyId of accessKeyIds)
    if (!creditedAccessKeys.has(accessKeyId))
      fail("access key has no scoped credit lineage");
  unique(
    value.creditAuthority.creditLedger.map((credit) => credit.idempotencyKeyHash),
    "credit idempotency key",
  );
  for (const refund of value.creditAuthority.refunds) {
    equal(refund.orderIdHash, scope.orderIdHash, "refund order lineage");
    equal(refund.provider, order.provider, "refund provider lineage");
    equal(refund.currency, order.currency, "refund currency lineage");
    equal(refund.amountMinor, order.amountMinor, "refund amount lineage");
  }
  if (value.creditAuthority.refunds.length > 1)
    fail("scoped order may have at most one full refund");
  unique(
    value.creditAuthority.refunds.map((refund) => refund.idempotencyKeyHash),
    "refund idempotency key",
  );

  const deliveryIds = new Set(
    value.emailAuthority.deliveries.map((delivery) => delivery.idHash),
  );
  const providerEmailIds = new Set(
    value.emailAuthority.deliveries.flatMap((delivery) =>
      delivery.providerEmailIdHash === null ? [] : [delivery.providerEmailIdHash],
    ),
  );
  for (const delivery of value.emailAuthority.deliveries) {
    equal(delivery.reportIdHash, scope.reportIdHash, "email report lineage");
    if (
      delivery.orderIdHash !== null &&
      delivery.orderIdHash !== scope.orderIdHash
    )
      fail("email has foreign order lineage");
    if (delivery.orderIdHash === scope.orderIdHash)
      equal(delivery.locale, order.reportLocale, "email locale lineage");
  }
  unique(
    value.emailAuthority.deliveries.map(
      (delivery) => delivery.businessIdempotencyKeyHash,
    ),
    "email delivery idempotency key",
  );
  unique(
    value.emailAuthority.deliveries.flatMap((delivery) =>
      delivery.providerEmailIdHash === null ? [] : [delivery.providerEmailIdHash],
    ),
    "provider email id",
  );
  for (const event of value.emailAuthority.events) {
    if (event.deliveryIdHash !== null && !deliveryIds.has(event.deliveryIdHash))
      fail("email event has foreign delivery lineage");
    if (!providerEmailIds.has(event.providerEmailIdHash))
      fail("email event has foreign provider-email lineage");
  }
  unique(
    value.emailAuthority.events.map(
      (event) => `${event.provider}:${event.providerEventIdHash}`,
    ),
    "email event natural key",
  );

  for (const token of value.accessTokens)
    equal(token.reportIdHash, scope.reportIdHash, "access token report lineage");
  unique(
    value.accessTokens.map((token) => token.tokenPrefixHash),
    "access token prefix",
  );

  validateArtifacts(value, phase);
  const questionCount = value.questionCheckpoints.length;
  const diagnosisCount = value.diagnosisCheckpoints.length;
  if (phase === "final" && (questionCount !== 3 || diagnosisCount !== 3))
    fail("final checkpoint scope must contain exactly three of each kind");
  if (
    phase === "baseline" &&
    ((questionCount !== 0 && questionCount !== 3) ||
      (diagnosisCount !== 0 && diagnosisCount !== 3))
  )
    fail("baseline checkpoint scope must contain zero or exactly three rows");
  validateCheckpoints(value, coreJob, enhancementJob);
}

function validateArtifacts(value: Normalized, phase: Phase): void {
  const { scope } = value;
  distinctNonNull(
    [
      scope.coreArtifactRevisionIdHash,
      scope.enhancementArtifactRevisionIdHash,
    ],
    "artifact scope identifiers",
  );
  const expected = [
    scope.coreArtifactRevisionIdHash,
    scope.enhancementArtifactRevisionIdHash,
  ].filter((id): id is string => id !== null);
  if (phase === "final" && expected.length !== 2)
    fail("final artifact scope must declare core and enhancement revisions");
  if (value.artifacts.length !== expected.length)
    fail("artifact scope must contain every and only declared revision");

  const core = value.artifacts.find(
    (artifact) => artifact.idHash === scope.coreArtifactRevisionIdHash,
  );
  const enhancement = value.artifacts.find(
    (artifact) => artifact.idHash === scope.enhancementArtifactRevisionIdHash,
  );
  if (scope.coreArtifactRevisionIdHash !== null && !core)
    fail("missing core artifact scope");
  if (scope.enhancementArtifactRevisionIdHash !== null && !enhancement)
    fail("missing enhancement artifact scope");

  for (const artifact of value.artifacts) {
    equal(artifact.reportIdHash, scope.reportIdHash, "artifact report lineage");
    equal(artifact.orderIdHash, scope.orderIdHash, "artifact order lineage");
    equal(
      artifact.configSnapshotIdHash,
      scope.configSnapshotIdHash,
      "artifact config scope lineage",
    );
  }
  if (core) {
    equal(core.jobIdHash, scope.coreJobIdHash, "core artifact job lineage");
    equal(core.revisionKind, "generation", "core artifact kind lineage");
    equal(core.sourceArtifactRevisionIdHash, null, "core artifact source lineage");
    if (phase === "final" && core.status !== "active")
      fail("scoped core artifact must be active");
  }
  if (enhancement) {
    equal(
      enhancement.jobIdHash,
      scope.enhancementJobIdHash,
      "enhancement artifact job lineage",
    );
    equal(
      enhancement.revisionKind,
      "diagnosis_enhancement",
      "enhancement artifact kind lineage",
    );
    equal(
      enhancement.sourceArtifactRevisionIdHash,
      scope.coreArtifactRevisionIdHash,
      "enhancement artifact source lineage",
    );
    if (!core) fail("enhancement artifact requires scoped core artifact");
    if (
      phase === "final" &&
      enhancement.status !== "active" &&
      enhancement.status !== "failed"
    )
      fail("scoped enhancement artifact must be terminal");
    equal(
      enhancement.configSnapshotIdHash,
      core.configSnapshotIdHash,
      "artifact config lineage",
    );
    if (enhancement.revision <= core.revision)
      fail("enhancement artifact revision must follow core revision");
  }
}

function validateCheckpoints(
  value: Normalized,
  coreJob: Normalized["jobs"][number] | undefined,
  enhancementJob: Normalized["jobs"][number] | undefined,
): void {
  const { scope } = value;
  for (const checkpoint of value.questionCheckpoints) {
    equal(checkpoint.reportIdHash, scope.reportIdHash, "question report lineage");
    equal(checkpoint.jobIdHash, scope.coreJobIdHash, "question job lineage");
    if (!coreJob) fail("question checkpoint requires scoped core job");
    equal(
      checkpoint.questionSetIdHash,
      scope.questionSetIdHash,
      "question set scope lineage",
    );
    equal(
      checkpoint.snapshotIdHash,
      scope.siteSnapshotIdHash,
      "question snapshot scope lineage",
    );
  }
  unique(
    value.questionCheckpoints.map((checkpoint) => checkpoint.ordinal),
    "question ordinal",
  );
  unique(
    value.questionCheckpoints.map((checkpoint) => checkpoint.questionIdHash),
    "question identity",
  );
  unique(
    value.questionCheckpoints.map(
      (checkpoint) => checkpoint.questionIdentityHash,
    ),
    "question content identity",
  );

  const coreArtifact = value.artifacts.find(
    (artifact) => artifact.idHash === scope.coreArtifactRevisionIdHash,
  );
  const enhancementArtifact = value.artifacts.find(
    (artifact) => artifact.idHash === scope.enhancementArtifactRevisionIdHash,
  );
  for (const checkpoint of value.diagnosisCheckpoints) {
    equal(checkpoint.reportIdHash, scope.reportIdHash, "diagnosis report lineage");
    equal(
      checkpoint.enhancementJobIdHash,
      scope.enhancementJobIdHash,
      "diagnosis job lineage",
    );
    equal(
      checkpoint.coreArtifactRevisionIdHash,
      scope.coreArtifactRevisionIdHash,
      "diagnosis core artifact lineage",
    );
    if (!enhancementJob || !coreArtifact || !enhancementArtifact)
      fail("diagnosis checkpoint requires complete scoped lineage");
    equal(
      checkpoint.questionSetIdHash,
      scope.questionSetIdHash,
      "diagnosis question-set scope lineage",
    );
    equal(
      checkpoint.configSnapshotIdHash,
      scope.configSnapshotIdHash,
      "diagnosis config scope lineage",
    );
    equal(
      checkpoint.snapshotIdHash,
      scope.siteSnapshotIdHash,
      "diagnosis snapshot scope lineage",
    );
    const question = value.questionCheckpoints.find(
      (candidate) => candidate.ordinal === checkpoint.ordinal,
    );
    if (!question) fail("diagnosis missing matching question ordinal");
    equal(
      checkpoint.questionIdHash,
      question.questionIdHash,
      "diagnosis question lineage",
    );
    equal(
      checkpoint.snapshotIdHash,
      question.snapshotIdHash,
      "diagnosis snapshot lineage",
    );
  }
  unique(
    value.diagnosisCheckpoints.map((checkpoint) => checkpoint.ordinal),
    "diagnosis ordinal",
  );
  unique(
    value.diagnosisCheckpoints.map((checkpoint) => checkpoint.questionIdHash),
    "diagnosis question identity",
  );
}

function parseScope(value: unknown): Scope {
  const scope = exactRecord(value, scopeKeys, "scope");
  const result = {
    reportIdHash: requiredHash(scope.reportIdHash, "scope.reportIdHash"),
    orderIdHash: requiredHash(scope.orderIdHash, "scope.orderIdHash"),
    siteSnapshotIdHash: nullableHash(
      scope.siteSnapshotIdHash,
      "scope.siteSnapshotIdHash",
    ),
    configSnapshotIdHash: nullableHash(
      scope.configSnapshotIdHash,
      "scope.configSnapshotIdHash",
    ),
    questionSetIdHash: nullableHash(
      scope.questionSetIdHash,
      "scope.questionSetIdHash",
    ),
    preAdmissionJobIdHash: nullableHash(
      scope.preAdmissionJobIdHash,
      "scope.preAdmissionJobIdHash",
    ),
    coreJobIdHash: nullableHash(scope.coreJobIdHash, "scope.coreJobIdHash"),
    enhancementJobIdHash: nullableHash(
      scope.enhancementJobIdHash,
      "scope.enhancementJobIdHash",
    ),
    coreArtifactRevisionIdHash: nullableHash(
      scope.coreArtifactRevisionIdHash,
      "scope.coreArtifactRevisionIdHash",
    ),
    enhancementArtifactRevisionIdHash: nullableHash(
      scope.enhancementArtifactRevisionIdHash,
      "scope.enhancementArtifactRevisionIdHash",
    ),
  };
  if (
    result.enhancementJobIdHash === null &&
    result.enhancementArtifactRevisionIdHash !== null
  )
    fail("enhancement artifact scope requires enhancement job scope");
  if (
    result.coreJobIdHash === null &&
    result.coreArtifactRevisionIdHash !== null
  )
    fail("core artifact scope requires core job scope");
  return result;
}

function parsePhase(value: unknown): Phase {
  if (value !== "baseline" && value !== "final")
    fail("phase must be baseline or final");
  return value;
}

function exactRecord<const K extends readonly string[]>(
  value: unknown,
  keys: K,
  label: string,
): Record<K[number], unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`${label} must be an object`);
  const allowed = new Set<string>(keys);
  for (const key of Object.keys(value))
    if (!allowed.has(key)) fail(`${label} has unknown field ${key}`);
  for (const key of keys)
    if (!Object.prototype.hasOwnProperty.call(value, key))
      fail(`${label} is missing field ${key}`);
  return value as Record<K[number], unknown>;
}

function array(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  return value;
}

function records(value: unknown, label: string): Record<string, unknown>[] {
  return array(value, label).map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row))
      fail(`${label}[${index}] must be an object`);
    return row as Record<string, unknown>;
  });
}

function requiredHash(value: unknown, label: string): string {
  if (typeof value !== "string" || !HASH.test(value))
    fail(`${label} must be lowercase SHA-256`);
  return value;
}

function nullableHash(value: unknown, label: string): string | null {
  return value === null ? null : requiredHash(value, label);
}

function canonicalTime(value: unknown, label: string): string {
  if (typeof value !== "string" || !UTC.test(value))
    fail(`${label} must be a canonical UTC timestamp`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value)
    fail(`${label} must be a canonical UTC timestamp`);
  return value;
}

function exactlyOne<T>(values: readonly T[], label: string): T {
  if (values.length !== 1) fail(`${label} must contain exactly one row`);
  return values[0];
}

function equal(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) fail(`${label} mismatch`);
}

function distinctNonNull(values: readonly (string | null)[], label: string) {
  const present = values.filter((value): value is string => value !== null);
  unique(present, label);
}

function unique(values: readonly (string | number)[], label: string): void {
  if (new Set(values).size !== values.length) fail(`duplicate ${label}`);
}

function fail(message: string): never {
  throw new TypeError(`Invalid Report V4 commerce authority: ${message}`);
}
