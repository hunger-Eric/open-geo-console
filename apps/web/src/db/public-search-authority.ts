import { createHash } from "node:crypto";
import { readDeploymentProfile } from "@/security/deployment-policy";
import { ensureDatabase, getSqlClient, isMemoryPersistence } from "./index";
import {
  memoryListPublicSearchSurfaceAuthorities,
  memorySavePublicSearchSurfaceAuthority
} from "./memory";
import type { PublicSearchSurfaceAuthorityRow } from "./schema";

export type PublicSearchDeploymentEnvironment = "staging" | "production";

export interface InstallPublicSearchSurfaceAuthorityInput {
  authorityVersion?: string;
  environment: PublicSearchDeploymentEnvironment;
  surfaceId: string;
  surfaceVersion: string;
  localeCapabilities: readonly string[];
  regionCapabilities: readonly string[];
  termsReviewedAt: string;
  evidenceReferences: readonly string[];
  active: boolean;
  capturedAt: string;
}

export interface PublicSearchSurfaceAuthorityMatch {
  environment: PublicSearchDeploymentEnvironment;
  surfaceId: string;
  surfaceVersion: string;
  locale: string;
  region: string;
  authorityVersion?: string;
}

export function createPublicSearchSurfaceAuthorityVersion(
  raw: Omit<InstallPublicSearchSurfaceAuthorityInput, "authorityVersion">
): string {
  const input = parseInstallInput(raw);
  const identity = {
    environment: input.environment,
    surfaceId: input.surfaceId,
    surfaceVersion: input.surfaceVersion,
    localeCapabilities: input.localeCapabilities,
    regionCapabilities: input.regionCapabilities,
    termsReviewedAt: input.termsReviewedAt,
    evidenceReferences: input.evidenceReferences,
    capturedAt: input.capturedAt
  };
  return `public-search-authority-${createHash("sha256").update(JSON.stringify(identity)).digest("hex")}`;
}

export async function installPublicSearchSurfaceAuthority(
  raw: InstallPublicSearchSurfaceAuthorityInput
): Promise<PublicSearchSurfaceAuthorityRow> {
  const input = parseInstallInput(raw);
  assertRuntimeEnvironment(input.environment);
  const deterministicVersion = createPublicSearchSurfaceAuthorityVersion(input);
  if (input.authorityVersion && input.authorityVersion !== deterministicVersion) {
    throw new Error("Public-search authority version does not match its deterministic evidence identity.");
  }
  const row: PublicSearchSurfaceAuthorityRow = {
    authorityVersion: deterministicVersion,
    surfaceId: input.surfaceId,
    surfaceVersion: input.surfaceVersion,
    environment: input.environment,
    localeCapabilities: [...input.localeCapabilities],
    regionCapabilities: [...input.regionCapabilities],
    termsReviewedAt: new Date(input.termsReviewedAt),
    evidenceReferences: [...input.evidenceReferences],
    active: input.active,
    capturedAt: new Date(input.capturedAt),
    createdAt: new Date()
  };
  if (isMemoryPersistence()) {
    const existing = memoryListPublicSearchSurfaceAuthorities().find(({ authorityVersion }) => authorityVersion === deterministicVersion);
    if (existing) {
      assertAuthorityEqual(existing, row);
      return clone(existing);
    }
    memorySavePublicSearchSurfaceAuthority(row);
    return clone(row);
  }
  await ensureDatabase();
  const sql = getSqlClient();
  return sql.begin(async (tx) => {
    await tx`
      INSERT INTO public_search_surface_authorities (
        authority_version, surface_id, surface_version, environment,
        locale_capabilities, region_capabilities, terms_reviewed_at,
        evidence_references, active, captured_at
      ) VALUES (
        ${row.authorityVersion}, ${row.surfaceId}, ${row.surfaceVersion}, ${row.environment},
        ${JSON.stringify(row.localeCapabilities)}::jsonb, ${JSON.stringify(row.regionCapabilities)}::jsonb,
        ${row.termsReviewedAt.toISOString()}, ${JSON.stringify(row.evidenceReferences)}::jsonb,
        ${row.active}, ${row.capturedAt.toISOString()}
      ) ON CONFLICT (authority_version) DO NOTHING
    `;
    const stored = (await tx<Array<Record<string, unknown>>>`
      SELECT * FROM public_search_surface_authorities WHERE authority_version = ${row.authorityVersion}
    `)[0];
    if (!stored) throw new Error("Public-search authority installation failed.");
    const parsed = dbAuthority(stored);
    assertAuthorityEqual(parsed, row);
    return parsed;
  });
}

export async function listPublicSearchSurfaceAuthorities(
  filter: Partial<Pick<PublicSearchSurfaceAuthorityMatch, "environment" | "surfaceId" | "surfaceVersion">> = {}
): Promise<PublicSearchSurfaceAuthorityRow[]> {
  const environment = filter.environment === undefined ? undefined : deploymentEnvironment(filter.environment);
  if (environment) assertRuntimeEnvironment(environment);
  const scopedEnvironment = environment ?? (isMemoryPersistence() ? undefined : readDeploymentProfile());
  const surfaceId = filter.surfaceId === undefined ? undefined : text(filter.surfaceId, "surfaceId", 200);
  const surfaceVersion = filter.surfaceVersion === undefined ? undefined : text(filter.surfaceVersion, "surfaceVersion", 100);
  let rows: PublicSearchSurfaceAuthorityRow[];
  if (isMemoryPersistence()) rows = memoryListPublicSearchSurfaceAuthorities();
  else {
    await ensureDatabase();
    rows = (await getSqlClient()<Array<Record<string, unknown>>>`
      SELECT * FROM public_search_surface_authorities
      WHERE (${scopedEnvironment ?? null}::text IS NULL OR environment = ${scopedEnvironment ?? null})
        AND (${surfaceId ?? null}::text IS NULL OR surface_id = ${surfaceId ?? null})
        AND (${surfaceVersion ?? null}::text IS NULL OR surface_version = ${surfaceVersion ?? null})
      ORDER BY captured_at DESC, authority_version
    `).map(dbAuthority);
  }
  return rows
    .filter((row) => (!scopedEnvironment || row.environment === scopedEnvironment) && (!surfaceId || row.surfaceId === surfaceId) && (!surfaceVersion || row.surfaceVersion === surfaceVersion))
    .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime() || a.authorityVersion.localeCompare(b.authorityVersion))
    .map(clone);
}

export async function getActivePublicSearchSurfaceAuthority(
  raw: PublicSearchSurfaceAuthorityMatch
): Promise<PublicSearchSurfaceAuthorityRow> {
  const match = {
    environment: deploymentEnvironment(raw.environment),
    surfaceId: text(raw.surfaceId, "surfaceId", 200),
    surfaceVersion: text(raw.surfaceVersion, "surfaceVersion", 100),
    locale: text(raw.locale, "locale", 35),
    region: text(raw.region, "region", 35),
    authorityVersion: raw.authorityVersion === undefined ? undefined : text(raw.authorityVersion, "authorityVersion", 256)
  };
  const candidates = (await listPublicSearchSurfaceAuthorities(match)).filter((row) =>
    row.active &&
    (!match.authorityVersion || row.authorityVersion === match.authorityVersion) &&
    stringArray(row.localeCapabilities).includes(match.locale) &&
    stringArray(row.regionCapabilities).includes(match.region)
  );
  if (candidates.length !== 1) {
    throw new Error("No unique active public-search authority matches the exact environment, surface, version, locale, and region.");
  }
  return clone(candidates[0]!);
}

export async function activatePublicSearchSurfaceAuthority(input: {
  authorityVersion: string;
  environment: PublicSearchDeploymentEnvironment;
  surfaceId: string;
  surfaceVersion: string;
}): Promise<PublicSearchSurfaceAuthorityRow> {
  const authorityVersion = text(input.authorityVersion, "authorityVersion", 256);
  const environment = deploymentEnvironment(input.environment);
  assertRuntimeEnvironment(environment);
  const surfaceId = text(input.surfaceId, "surfaceId", 200);
  const surfaceVersion = text(input.surfaceVersion, "surfaceVersion", 100);
  if (isMemoryPersistence()) {
    const rows = memoryListPublicSearchSurfaceAuthorities();
    const target = rows.find((row) => row.authorityVersion === authorityVersion);
    if (!target || target.environment !== environment || target.surfaceId !== surfaceId || target.surfaceVersion !== surfaceVersion) {
      throw new Error("Public-search authority activation scope mismatch.");
    }
    for (const row of rows) {
      if (row.environment === environment && row.surfaceId === surfaceId && row.active) {
        memorySavePublicSearchSurfaceAuthority({ ...row, active: false });
      }
    }
    const active = { ...target, active: true };
    memorySavePublicSearchSurfaceAuthority(active);
    return clone(active);
  }
  await ensureDatabase();
  return getSqlClient().begin(async (tx) => {
    const target = (await tx<Array<Record<string, unknown>>>`
      SELECT * FROM public_search_surface_authorities WHERE authority_version=${authorityVersion} FOR UPDATE
    `)[0];
    if (!target || target.environment !== environment || target.surface_id !== surfaceId || target.surface_version !== surfaceVersion) {
      throw new Error("Public-search authority activation scope mismatch.");
    }
    await tx`UPDATE public_search_surface_authorities SET active=false WHERE environment=${environment} AND surface_id=${surfaceId} AND authority_version<>${authorityVersion} AND active=true`;
    const stored = (await tx<Array<Record<string, unknown>>>`UPDATE public_search_surface_authorities SET active=true WHERE authority_version=${authorityVersion} RETURNING *`)[0];
    if (!stored) throw new Error("Public-search authority activation failed.");
    return dbAuthority(stored);
  });
}

function parseInstallInput(raw: InstallPublicSearchSurfaceAuthorityInput): InstallPublicSearchSurfaceAuthorityInput {
  const allowed = new Set(["authorityVersion", "environment", "surfaceId", "surfaceVersion", "localeCapabilities", "regionCapabilities", "termsReviewedAt", "evidenceReferences", "active", "capturedAt"]);
  for (const key of Object.keys(raw)) if (!allowed.has(key)) throw new TypeError(`Authority input contains unsupported field: ${key}`);
  if (raw.active !== false) throw new TypeError("Public-search authorities must be installed inactive and activated through the atomic activation boundary.");
  return {
    ...(raw.authorityVersion === undefined ? {} : { authorityVersion: text(raw.authorityVersion, "authorityVersion", 256) }),
    environment: deploymentEnvironment(raw.environment),
    surfaceId: text(raw.surfaceId, "surfaceId", 200),
    surfaceVersion: text(raw.surfaceVersion, "surfaceVersion", 100),
    localeCapabilities: uniqueStrings(raw.localeCapabilities, "localeCapabilities", 35),
    regionCapabilities: uniqueStrings(raw.regionCapabilities, "regionCapabilities", 35),
    termsReviewedAt: iso(raw.termsReviewedAt, "termsReviewedAt"),
    evidenceReferences: uniqueStrings(raw.evidenceReferences, "evidenceReferences", 1_000),
    active: raw.active,
    capturedAt: iso(raw.capturedAt, "capturedAt")
  };
}

function assertAuthorityEqual(actual: PublicSearchSurfaceAuthorityRow, expected: PublicSearchSurfaceAuthorityRow): void {
  const comparable = (row: PublicSearchSurfaceAuthorityRow) => ({
    authorityVersion: row.authorityVersion, surfaceId: row.surfaceId, surfaceVersion: row.surfaceVersion,
    environment: row.environment, localeCapabilities: stringArray(row.localeCapabilities),
    regionCapabilities: stringArray(row.regionCapabilities), termsReviewedAt: row.termsReviewedAt.toISOString(),
    evidenceReferences: stringArray(row.evidenceReferences), capturedAt: row.capturedAt.toISOString()
  });
  if (JSON.stringify(comparable(actual)) !== JSON.stringify(comparable(expected))) {
    throw new Error("Public-search authority immutability mismatch.");
  }
}

function dbAuthority(row: Record<string, unknown>): PublicSearchSurfaceAuthorityRow {
  return {
    authorityVersion: String(row.authority_version), surfaceId: String(row.surface_id), surfaceVersion: String(row.surface_version),
    environment: String(row.environment), localeCapabilities: row.locale_capabilities, regionCapabilities: row.region_capabilities,
    termsReviewedAt: new Date(row.terms_reviewed_at as string | Date), evidenceReferences: row.evidence_references,
    active: Boolean(row.active), capturedAt: new Date(row.captured_at as string | Date), createdAt: new Date(row.created_at as string | Date)
  };
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new Error("Authority capability evidence is malformed.");
  return value as string[];
}
function uniqueStrings(value: readonly string[], label: string, max: number): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) throw new TypeError(`${label} must be a bounded non-empty array.`);
  const parsed = value.map((item) => text(item, label, max));
  const sorted = [...new Set(parsed)].sort();
  if (sorted.length !== parsed.length) throw new TypeError(`${label} cannot contain duplicates.`);
  return sorted;
}
function deploymentEnvironment(value: unknown): PublicSearchDeploymentEnvironment {
  if (value !== "staging" && value !== "production") throw new TypeError("Unsupported public-search deployment environment.");
  return value;
}
function text(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new TypeError(`${label} is invalid.`);
  return value.trim().normalize("NFC");
}
function iso(value: unknown, label: string): string {
  const parsed = text(value, label, 64);
  if (!Number.isFinite(Date.parse(parsed))) throw new TypeError(`${label} must be an ISO timestamp.`);
  return new Date(parsed).toISOString();
}
function clone<T>(value: T): T { return structuredClone(value); }
function assertRuntimeEnvironment(environment: PublicSearchDeploymentEnvironment): void {
  if (!isMemoryPersistence() && readDeploymentProfile() !== environment) {
    throw new Error("Public-search authority environment does not match the deployment runtime.");
  }
}
