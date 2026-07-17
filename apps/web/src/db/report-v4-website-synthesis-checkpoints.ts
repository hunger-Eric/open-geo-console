import { createHash } from "node:crypto";
import {
  parseReportV4SiteSynthesisInput,
  parseReportV4WebsiteSynthesisOutput,
  type ReportV4PageSummary,
  type ReportV4WebsiteSynthesisOutput
} from "@open-geo-console/ai-report-engine";
import { ensureDatabase, getSqlClient } from "./index";

export type WebsiteSynthesisCheckpointState = "queued" | "running" | "completed" | "failed";

export interface WebsiteSynthesisLineage {
  readonly reportId: string;
  readonly orderId: string;
  readonly coreJobId: string;
  readonly configSnapshotId: string;
  readonly siteSnapshotId: string;
  readonly operationId: string;
  readonly profileId: string;
}

export interface WebsiteSynthesisInputAuthority {
  readonly inputIdentityHash: string;
  readonly pageSummaryIdentitySetHash: string;
  readonly pageSummaryCount: number;
}

export interface WebsiteSynthesisCheckpointIdentity extends WebsiteSynthesisLineage, WebsiteSynthesisInputAuthority {}

export interface WebsiteSynthesisCheckpoint extends WebsiteSynthesisCheckpointIdentity {
  readonly identityHash: string;
  readonly state: WebsiteSynthesisCheckpointState;
  readonly workerId: string | null;
  readonly leaseExpiresAt: string | null;
  readonly providerCallCount: 0 | 1;
  readonly correctionCount: 0;
  readonly output: ReportV4WebsiteSynthesisOutput | null;
  readonly outputHash: string | null;
  readonly errorCode: string | null;
}

export interface BuildWebsiteSynthesisInputAuthorityInput extends WebsiteSynthesisLineage {
  readonly targetUrl: string;
  readonly locale: string;
  readonly pages: readonly ReportV4PageSummary[];
  readonly modelProfile: unknown;
}

type Claimed = WebsiteSynthesisCheckpointIdentity & { readonly workerId: string; readonly leaseMs: number };

export interface WebsiteSynthesisRepository {
  initialize(input: WebsiteSynthesisCheckpointIdentity): Promise<WebsiteSynthesisCheckpoint>;
  claim(input: Claimed): Promise<WebsiteSynthesisCheckpoint>;
  beginProviderCall(input: WebsiteSynthesisCheckpointIdentity & { readonly workerId: string }): Promise<WebsiteSynthesisCheckpoint>;
  complete(input: WebsiteSynthesisCheckpointIdentity & { readonly workerId: string; readonly output: unknown }): Promise<WebsiteSynthesisCheckpoint>;
  fail(input: WebsiteSynthesisCheckpointIdentity & { readonly workerId: string; readonly errorCode: string }): Promise<WebsiteSynthesisCheckpoint>;
  load(input: WebsiteSynthesisCheckpointIdentity): Promise<WebsiteSynthesisCheckpoint | null>;
}

const INPUT_IDENTITY_DOMAIN = "ogc:report-v4:website-synthesis-input:v1";
const MAX_IDENTITY_FIELD_LENGTH = 500;
const MAX_WORKER_ID_LENGTH = 500;
const MAX_ERROR_CODE_LENGTH = 200;
const MAX_LEASE_MS = 86_400_000;
const MAX_PAGE_SUMMARY_COUNT = 50;

export function buildReportV4WebsiteSynthesisInputAuthority(
  input: BuildWebsiteSynthesisInputAuthorityInput
): WebsiteSynthesisInputAuthority {
  validateLineage(input);
  const canonical = parseReportV4SiteSynthesisInput({
    targetUrl: input.targetUrl,
    locale: input.locale,
    pages: input.pages
  });
  const pageIdentities = canonical.pages.map((page) => pageSummaryIdentity(input.siteSnapshotId, page));
  const pageSummaryIdentitySetHash = reportV4PageSummaryIdentitySetHash(pageIdentities);
  const modelProfileIdentityHash = digestStable(input.modelProfile);
  const providerInputIdentity = {
    domain: INPUT_IDENTITY_DOMAIN,
    operationId: input.operationId,
    profileId: input.profileId,
    modelProfileIdentityHash,
    locale: canonical.locale,
    targetUrlIdentityHash: sha256Text(canonical.targetUrl),
    pages: canonical.pages.map((page, index) => ({
      identityHash: pageIdentities[index]!,
      pageId: page.pageId,
      urlIdentityHash: sha256Text(page.url),
      contentHash: page.contentHash,
      readability: page.readability,
      sourceLength: page.sourceLength,
      chunks: page.chunks
    }))
  };
  return Object.freeze({
    inputIdentityHash: digestStable(providerInputIdentity),
    pageSummaryIdentitySetHash,
    pageSummaryCount: canonical.pages.length
  });
}

/** Same canonical set formula used by the Report V4 semantic verifier. */
export function reportV4PageSummaryIdentitySetHash(identityHashes: readonly string[]): string {
  const hashes = identityHashes.map((value) => sha256(value, "page summary identity hash"));
  if (hashes.length < 1 || hashes.length > MAX_PAGE_SUMMARY_COUNT) {
    throw new TypeError(`website synthesis requires between 1 and ${MAX_PAGE_SUMMARY_COUNT} page summary identities.`);
  }
  if (new Set(hashes).size !== hashes.length) throw new TypeError("website synthesis page summary identities must be unique.");
  return sha256Text(JSON.stringify([...hashes].sort()));
}

export function createMemoryReportV4WebsiteSynthesisCheckpointRepository(): WebsiteSynthesisRepository {
  const records = new Map<string, WebsiteSynthesisCheckpoint>();
  const owned = (input: WebsiteSynthesisCheckpointIdentity & { readonly workerId: string }) => {
    validateWorker(input.workerId);
    const record = records.get(identity(input));
    if (!record || record.state !== "running" || record.workerId !== input.workerId || !record.leaseExpiresAt
      || Date.parse(record.leaseExpiresAt) <= Date.now()) {
      throw new Error("checkpoint lease mismatch");
    }
    assertExactIdentity(record, input);
    return record;
  };
  return {
    async initialize(input) {
      const key = identity(input);
      const drift = [...records.values()].find((record) => record.coreJobId === input.coreJobId && record.identityHash !== key);
      if (drift) throw new Error("checkpoint input authority or lineage drift");
      const existing = records.get(key);
      if (existing) {
        assertExactIdentity(existing, input);
        return copy(existing);
      }
      const record: WebsiteSynthesisCheckpoint = {
        ...checkpointIdentity(input),
        identityHash: key,
        state: "queued",
        workerId: null,
        leaseExpiresAt: null,
        providerCallCount: 0,
        correctionCount: 0,
        output: null,
        outputHash: null,
        errorCode: null
      };
      records.set(key, record);
      return copy(record);
    },
    async claim(input) {
      validateIdentity(input);
      validateWorker(input.workerId);
      validateLease(input.leaseMs);
      const key = identity(input);
      const record = records.get(key);
      if (!record) throw new Error("checkpoint missing or input authority drift");
      assertExactIdentity(record, input);
      if (record.state === "completed") return copy(record);
      if (record.state === "running" && record.leaseExpiresAt && Date.parse(record.leaseExpiresAt) > Date.now()) {
        throw new Error("checkpoint claimed");
      }
      if (record.providerCallCount !== 0) throw new Error("stale provider call cannot replay");
      const next = {
        ...record,
        state: "running" as const,
        workerId: input.workerId,
        leaseExpiresAt: new Date(Date.now() + input.leaseMs).toISOString()
      };
      records.set(key, next);
      return copy(next);
    },
    async beginProviderCall(input) {
      const record = owned(input);
      if (record.providerCallCount !== 0) throw new Error("provider call already consumed");
      const next = { ...record, providerCallCount: 1 as const };
      records.set(record.identityHash, next);
      return copy(next);
    },
    async complete(input) {
      const record = owned(input);
      if (record.providerCallCount !== 1) throw new Error("provider call not consumed");
      const output = parseReportV4WebsiteSynthesisOutput(input.output);
      const next = {
        ...record,
        state: "completed" as const,
        workerId: null,
        leaseExpiresAt: null,
        output,
        outputHash: digest(output)
      };
      records.set(record.identityHash, next);
      return copy(next);
    },
    async fail(input) {
      validateErrorCode(input.errorCode);
      const record = owned(input);
      if (record.providerCallCount !== 1) throw new Error("checkpoint failure rejected");
      const next = {
        ...record,
        state: "failed" as const,
        workerId: null,
        leaseExpiresAt: null,
        errorCode: input.errorCode
      };
      records.set(record.identityHash, next);
      return copy(next);
    },
    async load(input) {
      const record = records.get(identity(input));
      if (!record) {
        if ([...records.values()].some((candidate) => candidate.coreJobId === input.coreJobId)) {
          throw new Error("checkpoint input authority or lineage drift");
        }
        return null;
      }
      assertIntegrity(record);
      assertExactIdentity(record, input);
      return copy(record);
    }
  };
}

export function createPostgresReportV4WebsiteSynthesisCheckpointRepository(
  client?: ReturnType<typeof getSqlClient>
): WebsiteSynthesisRepository {
  const sql = client ?? getSqlClient();
  const ready = () => client ? Promise.resolve() : ensureDatabase();
  const readByCoreJob = async (input: WebsiteSynthesisCheckpointIdentity) => {
    const rows = await sql`SELECT * FROM report_v4_website_synthesis_checkpoints WHERE core_job_id=${input.coreJobId}`;
    if (!rows[0]) return null;
    if (rows.length !== 1) throw new Error("checkpoint core authority is not unique");
    const checkpoint = map(rows[0] as Record<string, unknown>);
    assertExactIdentity(checkpoint, input);
    return checkpoint;
  };
  return {
    async initialize(input) {
      validateIdentity(input);
      await ready();
      const rows = await sql`INSERT INTO report_v4_website_synthesis_checkpoints(
        identity_hash,report_id,order_id,core_job_id,config_snapshot_id,site_snapshot_id,operation_id,profile_id,
        input_identity_hash,page_summary_identity_set_hash,page_summary_count
      ) VALUES(
        ${identity(input)},${input.reportId},${input.orderId},${input.coreJobId},${input.configSnapshotId},${input.siteSnapshotId},
        ${input.operationId},${input.profileId},${input.inputIdentityHash},${input.pageSummaryIdentitySetHash},${input.pageSummaryCount}
      ) ON CONFLICT DO NOTHING RETURNING *`;
      if (rows[0]) return map(rows[0] as Record<string, unknown>);
      const existing = await readByCoreJob(input);
      if (!existing) throw new Error("checkpoint initialization did not persist exact input authority");
      return existing;
    },
    async claim(input) {
      validateIdentity(input);
      validateWorker(input.workerId);
      validateLease(input.leaseMs);
      await ready();
      const rows = await sql`UPDATE report_v4_website_synthesis_checkpoints
        SET state='running',worker_id=${input.workerId},lease_expires_at=now()+(${input.leaseMs}||' milliseconds')::interval,updated_at=now()
        WHERE identity_hash=${identity(input)} AND input_identity_hash=${input.inputIdentityHash}
          AND page_summary_identity_set_hash=${input.pageSummaryIdentitySetHash} AND page_summary_count=${input.pageSummaryCount}
          AND provider_call_count=0 AND state<>'completed' AND (state<>'running' OR lease_expires_at<=now()) RETURNING *`;
      if (!rows[0]) {
        const checkpoint = await readByCoreJob(input);
        if (checkpoint?.state === "completed") return checkpoint;
        throw new Error("checkpoint claim rejected");
      }
      return map(rows[0] as Record<string, unknown>);
    },
    async beginProviderCall(input) {
      validateIdentity(input);
      validateWorker(input.workerId);
      await ready();
      const rows = await sql`UPDATE report_v4_website_synthesis_checkpoints SET provider_call_count=1
        WHERE identity_hash=${identity(input)} AND input_identity_hash=${input.inputIdentityHash}
          AND page_summary_identity_set_hash=${input.pageSummaryIdentitySetHash} AND page_summary_count=${input.pageSummaryCount}
          AND state='running' AND worker_id=${input.workerId} AND lease_expires_at>now() AND provider_call_count=0 RETURNING *`;
      if (!rows[0]) throw new Error("provider call authorization rejected");
      return map(rows[0] as Record<string, unknown>);
    },
    async complete(input) {
      validateIdentity(input);
      validateWorker(input.workerId);
      const output = parseReportV4WebsiteSynthesisOutput(input.output);
      await ready();
      const rows = await sql`UPDATE report_v4_website_synthesis_checkpoints
        SET state='completed',worker_id=NULL,lease_expires_at=NULL,output_payload=${JSON.stringify(output)}::jsonb,
          output_hash=${digest(output)},updated_at=now()
        WHERE identity_hash=${identity(input)} AND input_identity_hash=${input.inputIdentityHash}
          AND page_summary_identity_set_hash=${input.pageSummaryIdentitySetHash} AND page_summary_count=${input.pageSummaryCount}
          AND state='running' AND worker_id=${input.workerId} AND provider_call_count=1 AND lease_expires_at>now() RETURNING *`;
      if (!rows[0]) throw new Error("checkpoint completion rejected");
      return map(rows[0] as Record<string, unknown>);
    },
    async fail(input) {
      validateIdentity(input);
      validateWorker(input.workerId);
      validateErrorCode(input.errorCode);
      await ready();
      const rows = await sql`UPDATE report_v4_website_synthesis_checkpoints
        SET state='failed',worker_id=NULL,lease_expires_at=NULL,error_code=${input.errorCode},updated_at=now()
        WHERE identity_hash=${identity(input)} AND input_identity_hash=${input.inputIdentityHash}
          AND page_summary_identity_set_hash=${input.pageSummaryIdentitySetHash} AND page_summary_count=${input.pageSummaryCount}
          AND state='running' AND worker_id=${input.workerId} AND provider_call_count=1 AND lease_expires_at>now() RETURNING *`;
      if (!rows[0]) throw new Error("checkpoint failure rejected");
      return map(rows[0] as Record<string, unknown>);
    },
    async load(input) {
      validateIdentity(input);
      await ready();
      return readByCoreJob(input);
    }
  };
}

function checkpointIdentity(input: WebsiteSynthesisCheckpointIdentity): WebsiteSynthesisCheckpointIdentity {
  return {
    reportId: input.reportId,
    orderId: input.orderId,
    coreJobId: input.coreJobId,
    configSnapshotId: input.configSnapshotId,
    siteSnapshotId: input.siteSnapshotId,
    operationId: input.operationId,
    profileId: input.profileId,
    inputIdentityHash: input.inputIdentityHash,
    pageSummaryIdentitySetHash: input.pageSummaryIdentitySetHash,
    pageSummaryCount: input.pageSummaryCount
  };
}

function identity(input: WebsiteSynthesisCheckpointIdentity): string {
  validateIdentity(input);
  return digestStable(checkpointIdentity(input));
}

function validateLineage(input: WebsiteSynthesisLineage): void {
  for (const [field, value] of Object.entries({
    reportId: input.reportId,
    orderId: input.orderId,
    coreJobId: input.coreJobId,
    configSnapshotId: input.configSnapshotId,
    siteSnapshotId: input.siteSnapshotId,
    operationId: input.operationId,
    profileId: input.profileId
  })) {
    boundedText(value, `checkpoint ${field}`, MAX_IDENTITY_FIELD_LENGTH);
  }
}

function validateIdentity(input: WebsiteSynthesisCheckpointIdentity): void {
  validateLineage(input);
  sha256(input.inputIdentityHash, "checkpoint inputIdentityHash");
  sha256(input.pageSummaryIdentitySetHash, "checkpoint pageSummaryIdentitySetHash");
  if (!Number.isSafeInteger(input.pageSummaryCount) || input.pageSummaryCount < 1 || input.pageSummaryCount > MAX_PAGE_SUMMARY_COUNT) {
    throw new TypeError(`checkpoint pageSummaryCount must be between 1 and ${MAX_PAGE_SUMMARY_COUNT}.`);
  }
}

function assertExactIdentity(
  checkpoint: WebsiteSynthesisCheckpoint,
  expected: WebsiteSynthesisCheckpointIdentity
): void {
  if (checkpoint.identityHash !== identity(expected)
    || stableJson(checkpointIdentity(checkpoint)) !== stableJson(checkpointIdentity(expected))) {
    throw new Error("checkpoint input authority or lineage drift");
  }
}

function assertIntegrity(checkpoint: WebsiteSynthesisCheckpoint): void {
  validateIdentity(checkpoint);
  const fresh = checkpoint.workerId === null && checkpoint.leaseExpiresAt === null;
  const noTerminalPayload = checkpoint.output === null && checkpoint.outputHash === null;
  const stateIntegrity = checkpoint.state === "queued"
    ? checkpoint.providerCallCount === 0 && fresh && noTerminalPayload && checkpoint.errorCode === null
    : checkpoint.state === "running"
      ? checkpoint.workerId !== null && checkpoint.leaseExpiresAt !== null
        && Number.isFinite(Date.parse(checkpoint.leaseExpiresAt)) && noTerminalPayload && checkpoint.errorCode === null
      : checkpoint.state === "completed"
        ? checkpoint.providerCallCount === 1 && fresh && checkpoint.output !== null
          && checkpoint.outputHash === digest(checkpoint.output) && checkpoint.errorCode === null
        : checkpoint.state === "failed"
          ? checkpoint.providerCallCount === 1 && fresh && noTerminalPayload
            && typeof checkpoint.errorCode === "string" && checkpoint.errorCode.trim().length > 0
            && checkpoint.errorCode.length <= MAX_ERROR_CODE_LENGTH
          : false;
  if (checkpoint.workerId !== null) validateWorker(checkpoint.workerId);
  if (checkpoint.identityHash !== identity(checkpoint) || checkpoint.correctionCount !== 0 || !stateIntegrity) {
    throw new Error("checkpoint integrity failure");
  }
}

function map(row: Record<string, unknown>): WebsiteSynthesisCheckpoint {
  const checkpointIdentityValue: WebsiteSynthesisCheckpointIdentity = {
    reportId: String(row.report_id),
    orderId: String(row.order_id),
    coreJobId: String(row.core_job_id),
    configSnapshotId: String(row.config_snapshot_id),
    siteSnapshotId: String(row.site_snapshot_id),
    operationId: String(row.operation_id),
    profileId: String(row.profile_id),
    inputIdentityHash: String(row.input_identity_hash),
    pageSummaryIdentitySetHash: String(row.page_summary_identity_set_hash),
    pageSummaryCount: Number(row.page_summary_count)
  };
  const rawOutput = typeof row.output_payload === "string" ? JSON.parse(row.output_payload) : row.output_payload;
  const output = rawOutput ? parseReportV4WebsiteSynthesisOutput(rawOutput) : null;
  const state = String(row.state);
  const providerCallCount = Number(row.provider_call_count);
  if (!["queued", "running", "completed", "failed"].includes(state)
    || (providerCallCount !== 0 && providerCallCount !== 1) || Number(row.correction_count) !== 0) {
    throw new Error("checkpoint integrity failure");
  }
  const checkpoint: WebsiteSynthesisCheckpoint = {
    ...checkpointIdentityValue,
    identityHash: String(row.identity_hash),
    state: state as WebsiteSynthesisCheckpointState,
    workerId: row.worker_id as string | null,
    leaseExpiresAt: row.lease_expires_at ? new Date(String(row.lease_expires_at)).toISOString() : null,
    providerCallCount: providerCallCount as 0 | 1,
    correctionCount: 0,
    output,
    outputHash: row.output_hash as string | null,
    errorCode: row.error_code as string | null
  };
  assertIntegrity(checkpoint);
  return checkpoint;
}

function pageSummaryIdentity(snapshotId: string, summary: ReportV4PageSummary): string {
  return digestStable({
    snapshotId,
    pageId: summary.pageId,
    contentHash: summary.contentHash,
    sourceLength: summary.sourceLength,
    chunks: summary.chunks
  });
}

function boundedText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    throw new TypeError(`${label} must be non-empty and at most ${maxLength} characters.`);
  }
  return value;
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
    throw new TypeError(`${label} must be a lowercase SHA-256 value.`);
  }
  return value;
}

function validateWorker(workerId: string): void {
  boundedText(workerId, "checkpoint workerId", MAX_WORKER_ID_LENGTH);
}

function validateLease(leaseMs: number): void {
  if (!Number.isSafeInteger(leaseMs) || leaseMs <= 0 || leaseMs > MAX_LEASE_MS) {
    throw new TypeError(`checkpoint leaseMs must be a positive safe integer no greater than ${MAX_LEASE_MS}.`);
  }
}

function validateErrorCode(errorCode: string): void {
  boundedText(errorCode, "checkpoint errorCode", MAX_ERROR_CODE_LENGTH);
}

function digest(value: unknown): string {
  return sha256Text(JSON.stringify(value));
}

function digestStable(value: unknown): string {
  return sha256Text(stableJson(value));
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  const json = JSON.stringify(value);
  if (json === undefined) throw new TypeError("website synthesis input identity cannot contain undefined values.");
  return json;
}

function copy(checkpoint: WebsiteSynthesisCheckpoint): WebsiteSynthesisCheckpoint {
  return { ...checkpoint };
}
