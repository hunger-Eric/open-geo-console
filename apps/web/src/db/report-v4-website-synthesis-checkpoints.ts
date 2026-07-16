import { createHash } from "node:crypto";
import {
  parseReportV4WebsiteSynthesisOutput,
  type ReportV4WebsiteSynthesisOutput
} from "@open-geo-console/ai-report-engine";
import { ensureDatabase, getSqlClient } from "./index";

export type WebsiteSynthesisCheckpointState = "queued" | "running" | "completed" | "failed";
export interface WebsiteSynthesisLineage {
  readonly reportId: string; readonly orderId: string; readonly coreJobId: string;
  readonly configSnapshotId: string; readonly siteSnapshotId: string;
  readonly operationId: string; readonly profileId: string;
}
export interface WebsiteSynthesisCheckpoint extends WebsiteSynthesisLineage {
  readonly identityHash: string; readonly state: WebsiteSynthesisCheckpointState;
  readonly workerId: string | null; readonly leaseExpiresAt: string | null;
  readonly providerCallCount: 0 | 1; readonly correctionCount: 0;
  readonly output: ReportV4WebsiteSynthesisOutput | null; readonly outputHash: string | null;
  readonly errorCode: string | null;
}
type Claimed = WebsiteSynthesisLineage & { workerId: string; leaseMs: number };
export interface WebsiteSynthesisRepository {
  initialize(i: WebsiteSynthesisLineage): Promise<WebsiteSynthesisCheckpoint>;
  claim(i: Claimed): Promise<WebsiteSynthesisCheckpoint>;
  beginProviderCall(i: WebsiteSynthesisLineage & { workerId: string }): Promise<WebsiteSynthesisCheckpoint>;
  complete(i: WebsiteSynthesisLineage & { workerId: string; output: unknown }): Promise<WebsiteSynthesisCheckpoint>;
  fail(i: WebsiteSynthesisLineage & { workerId: string; errorCode: string }): Promise<WebsiteSynthesisCheckpoint>;
  load(i: WebsiteSynthesisLineage): Promise<WebsiteSynthesisCheckpoint | null>;
}
const lineage = (i: WebsiteSynthesisLineage) => ({ reportId: i.reportId, orderId: i.orderId, coreJobId: i.coreJobId, configSnapshotId: i.configSnapshotId, siteSnapshotId: i.siteSnapshotId, operationId: i.operationId, profileId: i.profileId });
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const MAX_IDENTITY_FIELD_LENGTH = 500;
const MAX_WORKER_ID_LENGTH = 500;
const MAX_ERROR_CODE_LENGTH = 200;
const MAX_LEASE_MS = 86_400_000;
const boundedText = (value: unknown, label: string, maxLength: number): string => {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    throw new TypeError(`${label} must be non-empty and at most ${maxLength} characters.`);
  }
  return value;
};
const validateLineage = (i: WebsiteSynthesisLineage): void => {
  for (const [field, value] of Object.entries(lineage(i))) boundedText(value, `checkpoint ${field}`, MAX_IDENTITY_FIELD_LENGTH);
};
const validateWorker = (workerId: string): void => { boundedText(workerId, "checkpoint workerId", MAX_WORKER_ID_LENGTH); };
const validateLease = (leaseMs: number): void => {
  if (!Number.isSafeInteger(leaseMs) || leaseMs <= 0 || leaseMs > MAX_LEASE_MS) throw new TypeError(`checkpoint leaseMs must be a positive safe integer no greater than ${MAX_LEASE_MS}.`);
};
const validateErrorCode = (errorCode: string): void => { boundedText(errorCode, "checkpoint errorCode", MAX_ERROR_CODE_LENGTH); };
const identity = (i: WebsiteSynthesisLineage) => { validateLineage(i); return digest(lineage(i)); };
const copy = (r: WebsiteSynthesisCheckpoint): WebsiteSynthesisCheckpoint => ({ ...r });

export function createMemoryReportV4WebsiteSynthesisCheckpointRepository(): WebsiteSynthesisRepository {
  const records = new Map<string, WebsiteSynthesisCheckpoint>();
  const owned = (i: WebsiteSynthesisLineage & { workerId: string }) => {
    validateWorker(i.workerId);
    const record = records.get(identity(i));
    if (!record || record.state !== "running" || record.workerId !== i.workerId || !record.leaseExpiresAt || Date.parse(record.leaseExpiresAt) <= Date.now()) throw new Error("checkpoint lease mismatch");
    return record;
  };
  return {
    async initialize(i) {
      const key = identity(i);
      const drift = [...records.values()].find(r => r.coreJobId === i.coreJobId && r.identityHash !== key);
      if (drift) throw new Error("checkpoint lineage drift");
      const existing = records.get(key); if (existing) return copy(existing);
      const record: WebsiteSynthesisCheckpoint = { ...lineage(i), identityHash: key, state: "queued", workerId: null, leaseExpiresAt: null, providerCallCount: 0, correctionCount: 0, output: null, outputHash: null, errorCode: null };
      records.set(key, record); return copy(record);
    },
    async claim(i) {
      validateLineage(i); validateWorker(i.workerId); validateLease(i.leaseMs);
      const key = identity(i), record = records.get(key); if (!record) throw new Error("checkpoint missing");
      if (record.state === "completed") return copy(record);
      if (record.state === "running" && record.leaseExpiresAt && Date.parse(record.leaseExpiresAt) > Date.now()) throw new Error("checkpoint claimed");
      if (record.providerCallCount !== 0) throw new Error("stale provider call cannot replay");
      const next = { ...record, state: "running" as const, workerId: i.workerId, leaseExpiresAt: new Date(Date.now() + i.leaseMs).toISOString() };
      records.set(key, next); return copy(next);
    },
    async beginProviderCall(i) { const record = owned(i); if (record.providerCallCount !== 0) throw new Error("provider call already consumed"); const next = { ...record, providerCallCount: 1 as const }; records.set(record.identityHash, next); return copy(next); },
    async complete(i) { const record = owned(i); if (record.providerCallCount !== 1) throw new Error("provider call not consumed"); const output = parseReportV4WebsiteSynthesisOutput(i.output); const next = { ...record, state: "completed" as const, workerId: null, leaseExpiresAt: null, output, outputHash: digest(output) }; records.set(record.identityHash, next); return copy(next); },
    async fail(i) { validateErrorCode(i.errorCode); const record = owned(i); if (record.providerCallCount !== 1) throw new Error("checkpoint failure rejected"); const next = { ...record, state: "failed" as const, workerId: null, leaseExpiresAt: null, errorCode: i.errorCode }; records.set(record.identityHash, next); return copy(next); },
    async load(i) { const record = records.get(identity(i)); if (!record) return null; if (record.identityHash !== identity(record) || record.correctionCount !== 0 || (record.state === "completed" && (!record.output || record.outputHash !== digest(record.output)))) throw new Error("checkpoint integrity failure"); return copy(record); }
  };
}

export function createPostgresReportV4WebsiteSynthesisCheckpointRepository(client?: ReturnType<typeof getSqlClient>): WebsiteSynthesisRepository {
  const sql = client ?? getSqlClient(); const ready = () => client ? Promise.resolve() : ensureDatabase();
  const read = async (i: WebsiteSynthesisLineage) => { const rows = await sql`SELECT * FROM report_v4_website_synthesis_checkpoints WHERE identity_hash=${identity(i)} AND report_id=${i.reportId} AND order_id=${i.orderId} AND core_job_id=${i.coreJobId} AND config_snapshot_id=${i.configSnapshotId} AND site_snapshot_id=${i.siteSnapshotId} AND operation_id=${i.operationId} AND profile_id=${i.profileId}`; return rows[0] ? map(rows[0] as Record<string, unknown>) : null; };
  const map = (r: Record<string, unknown>): WebsiteSynthesisCheckpoint => { const i: WebsiteSynthesisLineage = { reportId: String(r.report_id), orderId: String(r.order_id), coreJobId: String(r.core_job_id), configSnapshotId: String(r.config_snapshot_id), siteSnapshotId: String(r.site_snapshot_id), operationId: String(r.operation_id), profileId: String(r.profile_id) }; const rawOutput = typeof r.output_payload === "string" ? JSON.parse(r.output_payload) : r.output_payload; const output = rawOutput ? parseReportV4WebsiteSynthesisOutput(rawOutput) : null; const state = String(r.state); const providerCallCount = Number(r.provider_call_count); if (!["queued", "running", "completed", "failed"].includes(state) || (providerCallCount !== 0 && providerCallCount !== 1) || Number(r.correction_count) !== 0 || String(r.identity_hash) !== identity(i) || (state === "completed" && (!output || r.output_hash !== digest(output)))) throw new Error("checkpoint integrity failure"); return { ...i, identityHash: String(r.identity_hash), state: state as WebsiteSynthesisCheckpointState, workerId: r.worker_id as string | null, leaseExpiresAt: r.lease_expires_at ? new Date(String(r.lease_expires_at)).toISOString() : null, providerCallCount: providerCallCount as 0 | 1, correctionCount: 0, output, outputHash: r.output_hash as string | null, errorCode: r.error_code as string | null }; };
  return {
    async initialize(i) { validateLineage(i); await ready(); const rows = await sql`INSERT INTO report_v4_website_synthesis_checkpoints(identity_hash,report_id,order_id,core_job_id,config_snapshot_id,site_snapshot_id,operation_id,profile_id) VALUES(${identity(i)},${i.reportId},${i.orderId},${i.coreJobId},${i.configSnapshotId},${i.siteSnapshotId},${i.operationId},${i.profileId}) ON CONFLICT(identity_hash) DO UPDATE SET identity_hash=EXCLUDED.identity_hash RETURNING *`; return map(rows[0] as Record<string, unknown>); },
    async claim(i) { validateLineage(i); validateWorker(i.workerId); validateLease(i.leaseMs); await ready(); const rows = await sql`UPDATE report_v4_website_synthesis_checkpoints SET state='running',worker_id=${i.workerId},lease_expires_at=now()+(${i.leaseMs}||' milliseconds')::interval,updated_at=now() WHERE identity_hash=${identity(i)} AND provider_call_count=0 AND state<>'completed' AND (state<>'running' OR lease_expires_at<=now()) RETURNING *`; if (!rows[0]) { const r = await read(i); if (r?.state === "completed") return r; throw new Error("checkpoint claim rejected"); } return map(rows[0] as Record<string, unknown>); },
    async beginProviderCall(i) { validateLineage(i); validateWorker(i.workerId); await ready(); const rows = await sql`UPDATE report_v4_website_synthesis_checkpoints SET provider_call_count=1 WHERE identity_hash=${identity(i)} AND state='running' AND worker_id=${i.workerId} AND lease_expires_at>now() AND provider_call_count=0 RETURNING *`; if (!rows[0]) throw new Error("provider call authorization rejected"); return map(rows[0] as Record<string, unknown>); },
    async complete(i) { validateLineage(i); validateWorker(i.workerId); const output = parseReportV4WebsiteSynthesisOutput(i.output); await ready(); const rows = await sql`UPDATE report_v4_website_synthesis_checkpoints SET state='completed',worker_id=NULL,lease_expires_at=NULL,output_payload=${JSON.stringify(output)}::jsonb,output_hash=${digest(output)} WHERE identity_hash=${identity(i)} AND state='running' AND worker_id=${i.workerId} AND provider_call_count=1 AND lease_expires_at>now() RETURNING *`; if (!rows[0]) throw new Error("checkpoint completion rejected"); return map(rows[0] as Record<string, unknown>); },
    async fail(i) { validateLineage(i); validateWorker(i.workerId); validateErrorCode(i.errorCode); await ready(); const rows = await sql`UPDATE report_v4_website_synthesis_checkpoints SET state='failed',worker_id=NULL,lease_expires_at=NULL,error_code=${i.errorCode} WHERE identity_hash=${identity(i)} AND state='running' AND worker_id=${i.workerId} AND provider_call_count=1 AND lease_expires_at>now() RETURNING *`; if (!rows[0]) throw new Error("checkpoint failure rejected"); return map(rows[0] as Record<string, unknown>); },
    async load(i) { validateLineage(i); await ready(); return read(i); }
  };
}
