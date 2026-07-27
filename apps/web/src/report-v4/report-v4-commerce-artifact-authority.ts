type Obj = Record<string, unknown>;
const HASH = /^[0-9a-f]{64}$/u;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const kinds = ["generation", "diagnosis_enhancement"] as const;
const statuses = ["pending", "ready", "active", "failed"] as const;
function fail(p: string, m: string): never {
  throw new Error(`Invalid V4 commerce artifact authority at ${p}: ${m}`);
}
const obj = (v: unknown): Obj => {
  if (!v || typeof v !== "object" || Array.isArray(v))
    fail("$", "expected object");
  return v as Obj;
};
function keys(v: Obj, allowed: readonly string[]): void {
  const s = new Set(allowed);
  for (const k of allowed)
    if (!Object.hasOwn(v, k)) fail(`$.${k}`, "missing field");
  for (const k of Object.keys(v))
    if (!s.has(k)) fail(`$.${k}`, "unknown field");
}
function text(v: unknown, p: string, max = 256): string {
  if (typeof v !== "string") fail(`$.${p}`, "invalid text");
  if (v.length === 0 || v.length > max || v.trim() !== v)
    fail(`$.${p}`, "invalid text");
  return v;
}
function hash(v: unknown, p: string): string {
  const s = text(v, p);
  if (!HASH.test(s)) fail(`$.${p}`, "invalid lowercase SHA-256 hash");
  return s;
}
function nh(v: unknown, p: string): string | null {
  return v === null ? null : hash(v, p);
}
function en<T extends string>(v: unknown, p: string, xs: readonly T[]): T {
  if (typeof v !== "string" || !xs.includes(v as T))
    fail(`$.${p}`, "invalid enum");
  return v as T;
}
function time(v: unknown, p: string): string | null {
  if (v === null) return null;
  const s = text(v, p, 24);
  if (!UTC.test(s) || new Date(s).toISOString() !== s)
    fail(`$.${p}`, "invalid canonical UTC timestamp");
  return s;
}
function requiredTime(v: unknown, p: string): string {
  if (v === null || v === undefined) fail(`$.${p}`, "required timestamp");
  const parsed = time(v, p);
  if (parsed === null) fail(`$.${p}`, "required timestamp");
  return parsed;
}
function pos(v: unknown, p: string): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 1)
    fail(`$.${p}`, "invalid positive safe integer");
  return v;
}
function bool(v: unknown, p: string): boolean {
  if (typeof v !== "boolean") fail(`$.${p}`, "invalid boolean");
  return v;
}

export type ReportV4AccessTokenAuthority = Readonly<{
  idHash: string;
  reportIdHash: string;
  tokenPrefixHash: string;
  artifactScope: "combined_geo_report_v4";
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}>;
export type ReportV4ArtifactRevisionAuthority = Readonly<{
  idHash: string;
  reportIdHash: string;
  orderIdHash: string;
  jobIdHash: string;
  configSnapshotIdHash: string;
  correctionIdHash: string | null;
  replacementFulfillmentIdHash: string | null;
  sourceArtifactRevisionIdHash: string | null;
  revisionKind: (typeof kinds)[number];
  revision: number;
  artifactContract: "combined_geo_report_v4";
  status: (typeof statuses)[number];
  payloadIdentityHash: string;
  htmlSha256: string | null;
  pdfSha256: string | null;
  pdfStorageKeyPresent: boolean;
  readyAt: string | null;
  activatedAt: string | null;
}>;

const tokenKeys = [
  "idHash",
  "reportIdHash",
  "tokenPrefixHash",
  "artifactScope",
  "expiresAt",
  "lastUsedAt",
  "revokedAt",
] as const;
const artifactKeys = [
  "idHash",
  "reportIdHash",
  "orderIdHash",
  "jobIdHash",
  "configSnapshotIdHash",
  "correctionIdHash",
  "replacementFulfillmentIdHash",
  "sourceArtifactRevisionIdHash",
  "revisionKind",
  "revision",
  "artifactContract",
  "status",
  "payloadIdentityHash",
  "htmlSha256",
  "pdfSha256",
  "pdfStorageKeyPresent",
  "readyAt",
  "activatedAt",
] as const;

function token(v: unknown): ReportV4AccessTokenAuthority {
  const r = obj(v);
  keys(r, tokenKeys);
  if (r.artifactScope !== "combined_geo_report_v4")
    fail("$.artifactScope", "must be V4");
  return {
    idHash: hash(r.idHash, "idHash"),
    reportIdHash: hash(r.reportIdHash, "reportIdHash"),
    tokenPrefixHash: hash(r.tokenPrefixHash, "tokenPrefixHash"),
    artifactScope: "combined_geo_report_v4",
    expiresAt: requiredTime(r.expiresAt, "expiresAt"),
    lastUsedAt: time(r.lastUsedAt, "lastUsedAt"),
    revokedAt: time(r.revokedAt, "revokedAt"),
  };
}
function artifact(v: unknown): ReportV4ArtifactRevisionAuthority {
  const r = obj(v);
  keys(r, artifactKeys);
  if (r.artifactContract !== "combined_geo_report_v4")
    fail("$.artifactContract", "must be V4");
  const kind = en(r.revisionKind, "revisionKind", kinds);
  if (r.configSnapshotIdHash === null || r.configSnapshotIdHash === undefined)
    fail("$.configSnapshotIdHash", "required V4 config snapshot hash");
  if (r.correctionIdHash !== null || r.replacementFulfillmentIdHash !== null)
    fail("$", "legacy correction/replacement forbidden");
  if (kind === "generation" && r.sourceArtifactRevisionIdHash !== null)
    fail("$.sourceArtifactRevisionIdHash", "generation must have null source");
  if (
    kind === "diagnosis_enhancement" &&
    r.sourceArtifactRevisionIdHash === null
  )
    fail("$.sourceArtifactRevisionIdHash", "enhancement requires source");
  const status = en(r.status, "status", statuses);
  const html = nh(r.htmlSha256, "htmlSha256");
  const pdf = nh(r.pdfSha256, "pdfSha256");
  const storage = bool(r.pdfStorageKeyPresent, "pdfStorageKeyPresent");
  if (
    pdf !== null ||
    storage ||
    ((status === "ready" || status === "active") &&
      (!html || r.readyAt === null)) ||
    (status === "active" && r.activatedAt === null)
  )
    fail("$", "ready/active requires HTML only and no PDF");
  return {
    idHash: hash(r.idHash, "idHash"),
    reportIdHash: hash(r.reportIdHash, "reportIdHash"),
    orderIdHash: hash(r.orderIdHash, "orderIdHash"),
    jobIdHash: hash(r.jobIdHash, "jobIdHash"),
    configSnapshotIdHash: hash(r.configSnapshotIdHash, "configSnapshotIdHash"),
    correctionIdHash: null,
    replacementFulfillmentIdHash: null,
    sourceArtifactRevisionIdHash: nh(
      r.sourceArtifactRevisionIdHash,
      "sourceArtifactRevisionIdHash",
    ),
    revisionKind: kind,
    revision: pos(r.revision, "revision"),
    artifactContract: "combined_geo_report_v4",
    status,
    payloadIdentityHash: hash(r.payloadIdentityHash, "payloadIdentityHash"),
    htmlSha256: html,
    pdfSha256: pdf,
    pdfStorageKeyPresent: storage,
    readyAt: time(r.readyAt, "readyAt"),
    activatedAt: time(r.activatedAt, "activatedAt"),
  };
}
function list<T>(
  input: readonly unknown[],
  fn: (v: unknown) => T,
  id: (v: T) => string,
): readonly T[] {
  if (!Array.isArray(input)) fail("$", "expected array");
  const out = input.map(fn).sort((a, b) => id(a).localeCompare(id(b)));
  for (let i = 1; i < out.length; i++)
    if (id(out[i]) === id(out[i - 1])) fail("$", "duplicate idHash");
  return out;
}
export function normalizeReportV4AccessTokens(
  input: readonly unknown[],
): readonly ReportV4AccessTokenAuthority[] {
  return list(input, token, (x) => x.idHash);
}
export function normalizeReportV4ArtifactRevisions(
  input: readonly unknown[],
): readonly ReportV4ArtifactRevisionAuthority[] {
  return list(input, artifact, (x) => x.idHash);
}
