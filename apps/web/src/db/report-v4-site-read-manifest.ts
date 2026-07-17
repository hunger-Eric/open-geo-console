import { createHash } from "node:crypto";
import type postgres from "postgres";
import { assertProtectedStagingCommercePreview } from "@/security/deployment-policy";
import { ensureDatabase, getSqlClient } from "./index";
import type {
  ReportV4AcceptanceSiteReadMode,
  ReportV4AcceptanceSiteReadPurpose,
  ReportV4AcceptanceSiteReadScope,
  ReportV4AcceptanceSiteReadTerminalPhase
} from "./schema";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const IDENTITY_DOMAIN = "ogc:report-v4:acceptance-site-read-manifest:identity:v1";
const PAIR_DOMAIN = "ogc:report-v4:acceptance-site-read-manifest:pair:v1";
const AUTHORITY_DOMAIN = "ogc:report-v4:acceptance-site-read-manifest:authority:v1";

export type BeginReportV4AcceptanceSiteReadInput = {
  readonly sessionId: string;
  readonly scenarioId: string;
  readonly reportId: string;
  readonly jobId: string;
  readonly rawUrl: string;
  readonly mode: ReportV4AcceptanceSiteReadMode;
} & (
  | { readonly scope: "admission_discovery"; readonly purpose: "homepage" | "robots" | "sitemap"; readonly attempt: 0 }
  | { readonly scope: "admission_page"; readonly purpose: "page"; readonly attempt: 0 }
  | { readonly scope: "enhancement_source"; readonly purpose: "source"; readonly attempt: 1;
      readonly ownerQuestionId: string; readonly ownerSourceId: string }
);

export interface TerminalizeReportV4AcceptanceSiteReadInput {
  readonly sessionId: string;
  readonly scenarioId: string;
  readonly identityHash: string;
  readonly terminalPhase: ReportV4AcceptanceSiteReadTerminalPhase;
}

export interface LoadReportV4AcceptanceSiteReadManifestInput {
  readonly sessionId: string;
  readonly scenarioId: string;
}

export interface LoadReportV4AcceptanceSiteReadManifestAuthorityInput extends LoadReportV4AcceptanceSiteReadManifestInput {
  readonly phase: "baseline" | "final";
  readonly scenarioKind: "success" | "diagnosis_failure" | "question_failure";
  readonly reportId: string;
  readonly preAdmissionJobId: string;
  readonly enhancementJobId: string | null;
}

export interface ReportV4AcceptanceSiteReadManifestAuthorityRecord {
  readonly identityHash: string;
  readonly reportIdHash: string;
  readonly jobIdHash: string;
  readonly scope: ReportV4AcceptanceSiteReadScope;
  readonly purpose: ReportV4AcceptanceSiteReadPurpose;
  readonly urlHash: string;
  readonly mode: ReportV4AcceptanceSiteReadMode;
  readonly attempt: 0 | 1;
  readonly pairBindingHash: string;
  readonly ownerQuestionIdHash: string | null;
  readonly ownerSourceIdHash: string | null;
  readonly networkPerformed: true;
  readonly terminalPhase: ReportV4AcceptanceSiteReadTerminalPhase | null;
  readonly semanticState: "terminal" | "started_only";
  readonly startedAt: string;
  readonly terminalAt: string | null;
}

export interface ReportV4AcceptanceSiteReadManifestAuthority {
  readonly contractVersion: "report-v4-acceptance-site-read-manifest-authority-v1";
  readonly phase: "baseline" | "final";
  readonly scenarioKind: "success" | "diagnosis_failure" | "question_failure";
  readonly sessionIdHash: string;
  readonly scenarioIdHash: string;
  readonly reportIdHash: string;
  readonly preAdmissionJobIdHash: string;
  readonly enhancementJobIdHash: string | null;
  readonly records: readonly ReportV4AcceptanceSiteReadManifestAuthorityRecord[];
  /** Every terminal row is semantically required. */
  readonly requiredIdentityHashes: readonly string[];
  /** Started-only rows remain visible and allowed, but are not misrepresented as terminal evidence. */
  readonly allowedIdentityHashes: readonly string[];
  readonly authorityHash: string;
}

export interface ReportV4AcceptanceSiteReadManifestAuthorityTransactionSql {
  unsafe<T extends Record<string, unknown>[] = Record<string, unknown>[]>(query: string, parameters?: unknown[]): Promise<T>;
}

export interface ReportV4AcceptanceSiteReadManifestAuthoritySql {
  begin<T>(options: string, work: (tx: ReportV4AcceptanceSiteReadManifestAuthorityTransactionSql) => Promise<T>): Promise<T>;
}

export interface ReportV4AcceptanceSiteReadManifestEntry {
  readonly identityHash: string;
  readonly sessionId: string;
  readonly scenarioId: string;
  readonly reportId: string;
  readonly jobId: string;
  readonly scope: ReportV4AcceptanceSiteReadScope;
  readonly purpose: ReportV4AcceptanceSiteReadPurpose;
  readonly urlHash: string;
  readonly mode: ReportV4AcceptanceSiteReadMode;
  readonly attempt: 0 | 1;
  readonly pairBindingHash: string;
  readonly ownerQuestionId: string | null;
  readonly ownerSourceId: string | null;
  readonly networkPerformed: true;
  readonly terminalPhase: ReportV4AcceptanceSiteReadTerminalPhase | null;
  readonly startedAt: Date;
  readonly terminalAt: Date | null;
}

export interface BeginReportV4AcceptanceSiteReadResult {
  readonly entry: ReportV4AcceptanceSiteReadManifestEntry;
  readonly inserted: boolean;
}

interface HashedBeginReportV4AcceptanceSiteReadInput {
  readonly identityHash: string;
  readonly sessionId: string;
  readonly scenarioId: string;
  readonly reportId: string;
  readonly jobId: string;
  readonly scope: ReportV4AcceptanceSiteReadScope;
  readonly purpose: ReportV4AcceptanceSiteReadPurpose;
  readonly urlHash: string;
  readonly mode: ReportV4AcceptanceSiteReadMode;
  readonly attempt: 0 | 1;
  readonly pairBindingHash: string;
  readonly ownerQuestionId: string | null;
  readonly ownerSourceId: string | null;
}

export interface ReportV4AcceptanceSiteReadManifestStore {
  begin(input: HashedBeginReportV4AcceptanceSiteReadInput): Promise<BeginReportV4AcceptanceSiteReadResult>;
  terminalize(input: TerminalizeReportV4AcceptanceSiteReadInput): Promise<ReportV4AcceptanceSiteReadManifestEntry>;
  loadScenarioManifest(input: LoadReportV4AcceptanceSiteReadManifestInput): Promise<readonly ReportV4AcceptanceSiteReadManifestEntry[]>;
}

export interface ReportV4AcceptanceSiteReadManifestRepository {
  begin(input: BeginReportV4AcceptanceSiteReadInput): Promise<BeginReportV4AcceptanceSiteReadResult>;
  terminalize(input: TerminalizeReportV4AcceptanceSiteReadInput): Promise<ReportV4AcceptanceSiteReadManifestEntry>;
  loadScenarioManifest(input: LoadReportV4AcceptanceSiteReadManifestInput): Promise<readonly ReportV4AcceptanceSiteReadManifestEntry[]>;
}

export function createReportV4AcceptanceSiteReadManifestRepository(
  store: ReportV4AcceptanceSiteReadManifestStore,
  environment: NodeJS.ProcessEnv = process.env
): ReportV4AcceptanceSiteReadManifestRepository {
  const protectedOperation = <T extends unknown[], R>(operation: (...args: T) => Promise<R>) =>
    async (...args: T): Promise<R> => {
      assertProtectedStagingCommercePreview(environment);
      return operation(...args);
    };
  return {
    begin: protectedOperation((input) => store.begin(hashBeginInput(input))),
    terminalize: protectedOperation((input) => store.terminalize(parseTerminalInput(input))),
    loadScenarioManifest: protectedOperation((input) => store.loadScenarioManifest(parseLoadInput(input)))
  };
}

export function createPostgresReportV4AcceptanceSiteReadManifestStore(
  sql: postgres.Sql
): ReportV4AcceptanceSiteReadManifestStore {
  return {
    async begin(input) {
      const rows = await sql`INSERT INTO report_v4_acceptance_site_read_manifest
        (identity_hash,session_id,scenario_id,report_id,job_id,scope,purpose,url_hash,mode,attempt,
          pair_binding_hash,owner_question_id,owner_source_id,network_performed)
        VALUES(${input.identityHash},${input.sessionId},${input.scenarioId},${input.reportId},${input.jobId},
          ${input.scope},${input.purpose},${input.urlHash},${input.mode},${input.attempt},${input.pairBindingHash},
          ${input.ownerQuestionId},${input.ownerSourceId},true)
        ON CONFLICT(identity_hash) DO NOTHING RETURNING *`;
      if (rows[0]) return { entry: mapEntry(rows[0]), inserted: true };
      const existing = mapEntryOptional((await sql`SELECT * FROM report_v4_acceptance_site_read_manifest
        WHERE identity_hash=${input.identityHash}`)[0]);
      if (!existing || !sameBegin(existing, input)) {
        throw new Error("Report V4 acceptance site-read begin idempotency conflicts with another exact manifest identity.");
      }
      return { entry: existing, inserted: false };
    },
    async terminalize(input) {
      const rows = await sql`UPDATE report_v4_acceptance_site_read_manifest
        SET terminal_phase=${input.terminalPhase},terminal_at=clock_timestamp()
        WHERE identity_hash=${input.identityHash} AND session_id=${input.sessionId} AND scenario_id=${input.scenarioId}
          AND terminal_phase IS NULL AND terminal_at IS NULL RETURNING *`;
      if (rows[0]) return mapEntry(rows[0]);
      const existing = mapEntryOptional((await sql`SELECT * FROM report_v4_acceptance_site_read_manifest
        WHERE identity_hash=${input.identityHash} AND session_id=${input.sessionId} AND scenario_id=${input.scenarioId}`)[0]);
      if (!existing) throw new Error("A Report V4 acceptance site-read terminal requires its exact started manifest row.");
      throw new Error("A Report V4 acceptance site-read manifest row may be terminalized only once.");
    },
    loadScenarioManifest: (input) => loadExactReportV4AcceptanceSiteReadManifest(sql, input)
  };
}

export function createProductionReportV4AcceptanceSiteReadManifestRepository(
  environment: NodeJS.ProcessEnv = process.env
): ReportV4AcceptanceSiteReadManifestRepository {
  const store = (): ReportV4AcceptanceSiteReadManifestStore => createPostgresReportV4AcceptanceSiteReadManifestStore(getSqlClient());
  return createReportV4AcceptanceSiteReadManifestRepository({
    async begin(input) { await ensureDatabase(); return store().begin(input); },
    async terminalize(input) { await ensureDatabase(); return store().terminalize(input); },
    async loadScenarioManifest(input) { await ensureDatabase(); return store().loadScenarioManifest(input); }
  }, environment);
}

/** Hash-safe exact-scenario loader that can participate in a future unified read-only projector transaction. */
export async function loadExactReportV4AcceptanceSiteReadManifest(
  sql: postgres.Sql | postgres.TransactionSql | ReportV4AcceptanceSiteReadManifestAuthorityTransactionSql,
  input: LoadReportV4AcceptanceSiteReadManifestInput
): Promise<readonly ReportV4AcceptanceSiteReadManifestEntry[]> {
  const parsed = parseLoadInput(input);
  const querySql = sql as unknown as ReportV4AcceptanceSiteReadManifestAuthorityTransactionSql;
  return (await querySql.unsafe(`SELECT identity_hash,session_id,scenario_id,report_id,job_id,scope,purpose,url_hash,mode,attempt,
      pair_binding_hash,owner_question_id,owner_source_id,network_performed,terminal_phase,started_at,terminal_at
    FROM report_v4_acceptance_site_read_manifest
    WHERE session_id=$1 AND scenario_id=$2
    ORDER BY started_at,identity_hash`, [parsed.sessionId, parsed.scenarioId])).map(mapEntry);
}

/** Public wrapper owns exactly one RR/RO transaction; the scoped helper below never nests it. */
export async function loadReportV4AcceptanceSiteReadManifestAuthority(
  sql: ReportV4AcceptanceSiteReadManifestAuthoritySql,
  input: LoadReportV4AcceptanceSiteReadManifestAuthorityInput
): Promise<ReportV4AcceptanceSiteReadManifestAuthority> {
  const parsed = parseAuthorityInput(input);
  return sql.begin("isolation level repeatable read read only", (tx) =>
    loadReportV4AcceptanceSiteReadManifestAuthorityInTransaction(tx, parsed));
}

export async function loadReportV4AcceptanceSiteReadManifestAuthorityInTransaction(
  tx: ReportV4AcceptanceSiteReadManifestAuthorityTransactionSql,
  input: LoadReportV4AcceptanceSiteReadManifestAuthorityInput
): Promise<ReportV4AcceptanceSiteReadManifestAuthority> {
  const parsed = parseAuthorityInput(input);
  const isolationRows = await tx.unsafe(`/* site-read-authority:isolation */
    SELECT current_setting('transaction_isolation') transaction_isolation,
      current_setting('transaction_read_only') transaction_read_only`);
  if (isolationRows.length !== 1 || isolationRows[0]?.transaction_isolation !== "repeatable read"
      || isolationRows[0]?.transaction_read_only !== "on") {
    throw new Error("Report V4 site-read authority requires one repeatable-read read-only transaction.");
  }
  const bindingRows = await tx.unsafe(`/* site-read-authority:binding */
    SELECT sessions.environment,sessions.state session_state,
      scenarios.state scenario_state,scenarios.kind scenario_kind,scenarios.report_id,
      scenarios.pre_admission_job_id,scenarios.enhancement_job_id
    FROM report_v4_acceptance_sessions sessions
    JOIN report_v4_acceptance_scenarios scenarios
      ON scenarios.session_id=sessions.id AND scenarios.id=$2
    WHERE sessions.id=$1`, [parsed.sessionId, parsed.scenarioId]);
  if (bindingRows.length !== 1) {
    throw new Error("Report V4 site-read authority requires its exact acceptance session/scenario binding.");
  }
  const binding = bindingRows[0]!;
  if (binding.environment !== "protected_staging" || binding.session_state !== "collecting"
      || binding.scenario_state !== "collecting") {
    throw new Error(`Report V4 site-read ${parsed.phase} authority requires a collecting protected-Staging session and scenario.`);
  }
  if (binding.scenario_kind !== parsed.scenarioKind || binding.report_id !== parsed.reportId
      || binding.pre_admission_job_id !== parsed.preAdmissionJobId
      || binding.enhancement_job_id !== parsed.enhancementJobId) {
    throw new Error("Report V4 site-read authority input does not match the exact scenario kind, report, and job binding, including null enhancement lineage.");
  }
  assertPhaseKindTopology(parsed);
  const entries = await loadExactReportV4AcceptanceSiteReadManifest(tx, {
    sessionId: parsed.sessionId,
    scenarioId: parsed.scenarioId
  });
  return projectReportV4AcceptanceSiteReadManifestAuthority(parsed, entries);
}

export function projectReportV4AcceptanceSiteReadManifestAuthority(
  input: LoadReportV4AcceptanceSiteReadManifestAuthorityInput,
  entries: readonly ReportV4AcceptanceSiteReadManifestEntry[]
): ReportV4AcceptanceSiteReadManifestAuthority {
  const parsed = parseAuthorityInput(input);
  assertPhaseKindTopology(parsed);
  if (!Array.isArray(entries)) throw new TypeError("Report V4 site-read authority records must be a complete array.");
  const records = entries.map((entry, index) => projectAuthorityRecord(parsed, entry, index))
    .sort((left, right) => left.identityHash.localeCompare(right.identityHash));
  const identities = records.map(({ identityHash }) => identityHash);
  if (new Set(identities).size !== identities.length) {
    throw new Error("Report V4 site-read authority contains a duplicate physical identity.");
  }
  validatePairGroups(records);
  const requiredIdentityHashes = records.filter(({ semanticState }) => semanticState === "terminal")
    .map(({ identityHash }) => identityHash);
  const authority = {
    contractVersion: "report-v4-acceptance-site-read-manifest-authority-v1" as const,
    phase: parsed.phase,
    scenarioKind: parsed.scenarioKind,
    sessionIdHash: sha256(parsed.sessionId),
    scenarioIdHash: sha256(parsed.scenarioId),
    reportIdHash: sha256(parsed.reportId),
    preAdmissionJobIdHash: sha256(parsed.preAdmissionJobId),
    enhancementJobIdHash: parsed.enhancementJobId === null ? null : sha256(parsed.enhancementJobId),
    records: Object.freeze(records),
    requiredIdentityHashes: Object.freeze(requiredIdentityHashes),
    allowedIdentityHashes: Object.freeze([...identities]),
  };
  return Object.freeze({ ...authority, authorityHash: sha256(`${AUTHORITY_DOMAIN}\x1f${stableJson(authority)}`) });
}

export function hashReportV4AcceptanceSiteReadUrl(rawUrl: string): string {
  if (typeof rawUrl !== "string" || !rawUrl || rawUrl.trim() !== rawUrl || rawUrl.length > 8_192) {
    throw new TypeError("rawUrl must be a bounded nonblank trimmed HTTP(S) URL.");
  }
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new TypeError("rawUrl must be a canonicalizable HTTP(S) URL."); }
  if (!/^https?:$/u.test(url.protocol) || url.username || url.password) {
    throw new TypeError("rawUrl must be a public-shape HTTP(S) URL without credentials.");
  }
  url.hash = "";
  return sha256(url.href);
}

export function reportV4AcceptanceSiteReadIdentityHash(
  input: Omit<HashedBeginReportV4AcceptanceSiteReadInput, "identityHash" | "pairBindingHash">
): string {
  return digest([IDENTITY_DOMAIN, input.sessionId, input.scenarioId, input.reportId, input.jobId, input.scope,
    input.purpose, input.urlHash, input.mode, input.attempt, input.ownerQuestionId ?? "", input.ownerSourceId ?? ""]);
}

export function reportV4AcceptanceSiteReadPairBindingHash(
  input: Omit<HashedBeginReportV4AcceptanceSiteReadInput, "identityHash" | "pairBindingHash" | "mode" | "ownerQuestionId" | "ownerSourceId">
): string {
  return digest([PAIR_DOMAIN, input.sessionId, input.scenarioId, input.reportId, input.jobId, input.scope,
    input.purpose, input.urlHash, input.attempt]);
}

function hashBeginInput(value: BeginReportV4AcceptanceSiteReadInput): HashedBeginReportV4AcceptanceSiteReadInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("site-read begin must be an object.");
  const candidate = value as unknown as Record<string, unknown>;
  const enhancement = candidate.scope === "enhancement_source";
  const input = strictRecord(value,
    ["sessionId", "scenarioId", "reportId", "jobId", "scope", "purpose", "rawUrl", "mode", "attempt",
      ...(enhancement ? ["ownerQuestionId", "ownerSourceId"] : [])], "site-read begin");
  const scope = input.scope as ReportV4AcceptanceSiteReadScope;
  const purpose = input.purpose as ReportV4AcceptanceSiteReadPurpose;
  const mode = input.mode;
  if (mode !== "raw" && mode !== "browser") throw new TypeError("site-read mode must be raw or browser.");
  const validAdmissionDiscovery = scope === "admission_discovery" && ["homepage", "robots", "sitemap"].includes(String(purpose))
    && input.attempt === 0 && !enhancement;
  const validAdmissionPage = scope === "admission_page" && purpose === "page" && input.attempt === 0 && !enhancement;
  const validEnhancement = scope === "enhancement_source" && purpose === "source" && input.attempt === 1 && enhancement;
  if (!validAdmissionDiscovery && !validAdmissionPage && !validEnhancement) {
    throw new TypeError("site-read scope, purpose, attempt, and owner contract is invalid.");
  }
  const base: Omit<HashedBeginReportV4AcceptanceSiteReadInput, "identityHash" | "pairBindingHash"> = {
    sessionId: uuid(input.sessionId, "sessionId"),
    scenarioId: uuid(input.scenarioId, "scenarioId"),
    reportId: boundedText(input.reportId, "reportId", 500),
    jobId: boundedText(input.jobId, "jobId", 500),
    scope,
    purpose,
    urlHash: hashReportV4AcceptanceSiteReadUrl(String(input.rawUrl)),
    mode,
    attempt: input.attempt as 0 | 1,
    ownerQuestionId: validEnhancement ? boundedText(input.ownerQuestionId, "ownerQuestionId", 500) : null,
    ownerSourceId: validEnhancement ? boundedText(input.ownerSourceId, "ownerSourceId", 500) : null
  };
  return {
    ...base,
    identityHash: reportV4AcceptanceSiteReadIdentityHash(base),
    pairBindingHash: reportV4AcceptanceSiteReadPairBindingHash(base)
  };
}

function parseTerminalInput(value: TerminalizeReportV4AcceptanceSiteReadInput): TerminalizeReportV4AcceptanceSiteReadInput {
  const input = strictRecord(value, ["sessionId", "scenarioId", "identityHash", "terminalPhase"], "site-read terminal");
  if (input.terminalPhase !== "completed" && input.terminalPhase !== "failed") {
    throw new TypeError("terminalPhase must be completed or failed.");
  }
  return { sessionId: uuid(input.sessionId, "sessionId"), scenarioId: uuid(input.scenarioId, "scenarioId"),
    identityHash: hash(input.identityHash, "identityHash"), terminalPhase: input.terminalPhase };
}

function parseLoadInput(value: LoadReportV4AcceptanceSiteReadManifestInput): LoadReportV4AcceptanceSiteReadManifestInput {
  const input = strictRecord(value, ["sessionId", "scenarioId"], "site-read manifest lookup");
  return { sessionId: uuid(input.sessionId, "sessionId"), scenarioId: uuid(input.scenarioId, "scenarioId") };
}

function parseAuthorityInput(
  value: LoadReportV4AcceptanceSiteReadManifestAuthorityInput
): LoadReportV4AcceptanceSiteReadManifestAuthorityInput {
  const input = strictRecord(value, ["sessionId", "scenarioId", "phase", "scenarioKind", "reportId", "preAdmissionJobId", "enhancementJobId"],
    "site-read authority lookup");
  if (input.phase !== "baseline" && input.phase !== "final") throw new TypeError("site-read authority phase must be baseline or final.");
  if (input.scenarioKind !== "success" && input.scenarioKind !== "diagnosis_failure"
      && input.scenarioKind !== "question_failure") {
    throw new TypeError("site-read authority scenarioKind is invalid.");
  }
  return {
    sessionId: uuid(input.sessionId, "sessionId"),
    scenarioId: uuid(input.scenarioId, "scenarioId"),
    phase: input.phase,
    scenarioKind: input.scenarioKind,
    reportId: boundedText(input.reportId, "reportId", 500),
    preAdmissionJobId: boundedText(input.preAdmissionJobId, "preAdmissionJobId", 500),
    enhancementJobId: input.enhancementJobId === null
      ? null : boundedText(input.enhancementJobId, "enhancementJobId", 500)
  };
}

function assertPhaseKindTopology(input: LoadReportV4AcceptanceSiteReadManifestAuthorityInput): void {
  if (input.phase === "baseline" && input.enhancementJobId !== null) {
    throw new Error("Report V4 site-read baseline authority forbids enhancement job lineage for every scenario kind.");
  }
  if (input.phase === "final" && input.scenarioKind === "question_failure" && input.enhancementJobId !== null) {
    throw new Error("Report V4 site-read question_failure final authority forbids enhancement job lineage.");
  }
  if (input.phase === "final" && input.scenarioKind !== "question_failure" && input.enhancementJobId === null) {
    throw new Error(`Report V4 site-read ${input.scenarioKind} final authority requires enhancement job lineage.`);
  }
}

function projectAuthorityRecord(
  scope: LoadReportV4AcceptanceSiteReadManifestAuthorityInput,
  value: ReportV4AcceptanceSiteReadManifestEntry,
  index: number
): ReportV4AcceptanceSiteReadManifestAuthorityRecord {
  const entry = strictRecord(value, [
    "identityHash", "sessionId", "scenarioId", "reportId", "jobId", "scope", "purpose", "urlHash", "mode", "attempt",
    "pairBindingHash", "ownerQuestionId", "ownerSourceId", "networkPerformed", "terminalPhase", "startedAt", "terminalAt"
  ], `site-read authority record ${index}`);
  if (entry.sessionId !== scope.sessionId || entry.scenarioId !== scope.scenarioId || entry.reportId !== scope.reportId) {
    throw new Error(`Report V4 site-read authority record ${index} is outside the exact session/scenario/report scope.`);
  }
  const rowScope = entry.scope;
  const purpose = entry.purpose;
  const mode = entry.mode;
  const attempt = entry.attempt;
  if (mode !== "raw" && mode !== "browser") throw new Error(`Report V4 site-read authority record ${index} mode is unknown.`);
  const admissionDiscovery = rowScope === "admission_discovery"
    && (purpose === "homepage" || purpose === "robots" || purpose === "sitemap")
    && attempt === 0 && entry.ownerQuestionId === null && entry.ownerSourceId === null;
  const admissionPage = rowScope === "admission_page" && purpose === "page" && attempt === 0
    && entry.ownerQuestionId === null && entry.ownerSourceId === null;
  const enhancement = rowScope === "enhancement_source" && purpose === "source" && attempt === 1
    && typeof entry.ownerQuestionId === "string" && typeof entry.ownerSourceId === "string";
  if (!admissionDiscovery && !admissionPage && !enhancement) {
    throw new Error(`Report V4 site-read authority record ${index} scope/purpose/attempt/owner contract is invalid.`);
  }
  const expectedJobId = enhancement ? scope.enhancementJobId : scope.preAdmissionJobId;
  if (expectedJobId === null || entry.jobId !== expectedJobId) {
    throw new Error(`Report V4 site-read authority record ${index} is outside the exact job scope.`);
  }
  const ownerQuestionId = enhancement ? boundedText(entry.ownerQuestionId, "ownerQuestionId", 500) : null;
  const ownerSourceId = enhancement ? boundedText(entry.ownerSourceId, "ownerSourceId", 500) : null;
  const urlHash = hash(entry.urlHash, "urlHash");
  if (entry.networkPerformed !== true) throw new Error(`Report V4 site-read authority record ${index} did not perform a network read.`);
  const unhashed = {
    sessionId: scope.sessionId,
    scenarioId: scope.scenarioId,
    reportId: scope.reportId,
    jobId: expectedJobId,
    scope: rowScope as ReportV4AcceptanceSiteReadScope,
    purpose: purpose as ReportV4AcceptanceSiteReadPurpose,
    urlHash,
    mode: mode as ReportV4AcceptanceSiteReadMode,
    attempt: attempt as 0 | 1,
    ownerQuestionId,
    ownerSourceId
  };
  const expectedIdentityHash = reportV4AcceptanceSiteReadIdentityHash(unhashed);
  const expectedPairBindingHash = reportV4AcceptanceSiteReadPairBindingHash(unhashed);
  if (hash(entry.identityHash, "identityHash") !== expectedIdentityHash) {
    throw new Error(`Report V4 site-read authority record ${index} stored identityHash does not match its recomputed identity.`);
  }
  if (hash(entry.pairBindingHash, "pairBindingHash") !== expectedPairBindingHash) {
    throw new Error(`Report V4 site-read authority record ${index} stored pairBindingHash does not match its recomputed pair binding.`);
  }
  const startedAt = exactDate(entry.startedAt, `record ${index} startedAt`);
  let terminalPhase: ReportV4AcceptanceSiteReadTerminalPhase | null;
  let terminalAt: string | null;
  let semanticState: "terminal" | "started_only";
  if (entry.terminalPhase === null && entry.terminalAt === null) {
    terminalPhase = null;
    terminalAt = null;
    semanticState = "started_only";
  } else {
    if ((entry.terminalPhase !== "completed" && entry.terminalPhase !== "failed") || entry.terminalAt === null) {
      throw new Error(`Report V4 site-read authority record ${index} terminal state is incomplete or unknown.`);
    }
    terminalPhase = entry.terminalPhase;
    terminalAt = exactDate(entry.terminalAt, `record ${index} terminalAt`);
    if (Date.parse(terminalAt) < Date.parse(startedAt)) {
      throw new Error(`Report V4 site-read authority record ${index} terminalAt precedes startedAt.`);
    }
    semanticState = "terminal";
  }
  return Object.freeze({
    identityHash: expectedIdentityHash,
    reportIdHash: sha256(scope.reportId),
    jobIdHash: sha256(expectedJobId),
    scope: unhashed.scope,
    purpose: unhashed.purpose,
    urlHash,
    mode: unhashed.mode,
    attempt: unhashed.attempt,
    pairBindingHash: expectedPairBindingHash,
    ownerQuestionIdHash: ownerQuestionId === null ? null : sha256(ownerQuestionId),
    ownerSourceIdHash: ownerSourceId === null ? null : sha256(ownerSourceId),
    networkPerformed: true,
    terminalPhase,
    semanticState,
    startedAt,
    terminalAt
  });
}

function validatePairGroups(records: readonly ReportV4AcceptanceSiteReadManifestAuthorityRecord[]): void {
  const groups = new Map<string, ReportV4AcceptanceSiteReadManifestAuthorityRecord[]>();
  for (const record of records) groups.set(record.pairBindingHash, [...(groups.get(record.pairBindingHash) ?? []), record]);
  for (const [pairBindingHash, pair] of groups) {
    const raw = pair.filter(({ mode }) => mode === "raw");
    const browser = pair.filter(({ mode }) => mode === "browser");
    if (pair.length > 2 || raw.length !== 1 || browser.length > 1) {
      throw new Error(`Report V4 site-read authority pair ${pairBindingHash} violates raw/browser physical cardinality.`);
    }
    if (browser.length === 1 && raw[0]!.semanticState !== "terminal") {
      throw new Error(`Report V4 site-read authority pair ${pairBindingHash} requires its raw read to terminalize before browser fallback.`);
    }
  }
}

function sameBegin(entry: ReportV4AcceptanceSiteReadManifestEntry, input: HashedBeginReportV4AcceptanceSiteReadInput): boolean {
  return entry.identityHash === input.identityHash && entry.sessionId === input.sessionId && entry.scenarioId === input.scenarioId
    && entry.reportId === input.reportId && entry.jobId === input.jobId && entry.scope === input.scope
    && entry.purpose === input.purpose && entry.urlHash === input.urlHash && entry.mode === input.mode
    && entry.attempt === input.attempt && entry.pairBindingHash === input.pairBindingHash
    && entry.ownerQuestionId === input.ownerQuestionId && entry.ownerSourceId === input.ownerSourceId
    && entry.networkPerformed === true;
}

function mapEntryOptional(row: Record<string, unknown> | undefined): ReportV4AcceptanceSiteReadManifestEntry | null {
  return row ? mapEntry(row) : null;
}

function mapEntry(row: Record<string, unknown>): ReportV4AcceptanceSiteReadManifestEntry {
  return {
    identityHash: String(row.identity_hash), sessionId: String(row.session_id), scenarioId: String(row.scenario_id),
    reportId: String(row.report_id), jobId: String(row.job_id), scope: String(row.scope) as ReportV4AcceptanceSiteReadScope,
    purpose: String(row.purpose) as ReportV4AcceptanceSiteReadPurpose, urlHash: String(row.url_hash),
    mode: String(row.mode) as ReportV4AcceptanceSiteReadMode, attempt: Number(row.attempt) as 0 | 1,
    pairBindingHash: String(row.pair_binding_hash), ownerQuestionId: nullable(row.owner_question_id),
    ownerSourceId: nullable(row.owner_source_id), networkPerformed: row.network_performed === true ? true : false as never,
    terminalPhase: row.terminal_phase == null ? null : String(row.terminal_phase) as ReportV4AcceptanceSiteReadTerminalPhase,
    startedAt: new Date(String(row.started_at)), terminalAt: row.terminal_at == null ? null : new Date(String(row.terminal_at))
  };
}

function strictRecord(value: unknown, fields: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  const input = value as Record<string, unknown>;
  const keys = Object.keys(input);
  if (keys.length !== fields.length || keys.some((key) => !fields.includes(key)) || fields.some((field) => !(field in input))) {
    throw new TypeError(`${label} fields must match the strict contract.`);
  }
  return input;
}

function boundedText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string" || !value || value.trim() !== value || value.length > maximum) {
    throw new TypeError(`${field} must be a bounded nonblank trimmed string.`);
  }
  return value;
}
function uuid(value: unknown, field: string): string {
  const result = boundedText(value, field, 36);
  if (!UUID_PATTERN.test(result)) throw new TypeError(`${field} must be a lowercase UUID.`);
  return result;
}
function hash(value: unknown, field: string): string {
  const result = boundedText(value, field, 64);
  if (!HASH_PATTERN.test(result)) throw new TypeError(`${field} must be a lowercase SHA-256 hash.`);
  return result;
}
function digest(parts: readonly (string | number)[]): string { return sha256(parts.join("\x1f")); }
function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function nullable(value: unknown): string | null { return value == null ? null : String(value); }
function exactDate(value: unknown, label: string): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new TypeError(`${label} must be a valid Date.`);
  return value.toISOString();
}
function stableJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`;
  }
  throw new TypeError("Report V4 site-read authority contains unsupported canonical JSON.");
}
