import { createHmac, randomUUID } from "node:crypto";
import { ensureDatabase, getSqlClient } from "./index";
import { generateOpaqueSecret, hmacSecret, requireSecret } from "./secrets";
import type { ReportArtifactScope } from "./schema";

export async function issueReportAccessToken(input: {
  reportId: string;
  expiresAt?: Date;
  ttlDays?: number;
  idempotencyKey?: string;
  artifactScope?: ReportArtifactScope;
}): Promise<{ id: string; rawToken: string; expiresAt: Date }> {
  await ensureDatabase();
  const tokenSecret = requireSecret("OGC_TOKEN_HASH_SECRET");
  const artifactScope = input.artifactScope ?? "legacy_website_audit_v1";
  const generated = input.idempotencyKey
    ? deterministicToken(input.reportId, artifactScope, input.idempotencyKey, tokenSecret)
    : generateOpaqueSecret("ogc_report");
  const id = randomUUID();
  const expiresAt = input.expiresAt ?? new Date(Date.now() + (input.ttlDays ?? 30) * 86_400_000);
  if (expiresAt <= new Date()) {
    throw new Error("Report access token expiry must be in the future.");
  }
  await getSqlClient()`
    INSERT INTO report_access_tokens (id, report_id, token_prefix, token_hmac, artifact_scope, expires_at)
    VALUES (
      ${id}, ${input.reportId}, ${generated.displayPrefix},
      ${hmacSecret(generated.raw, tokenSecret)}, ${artifactScope}, ${expiresAt.toISOString()}
    )
    ON CONFLICT (token_hmac) DO NOTHING
  `;
  const existing = await getSqlClient()<{ id: string; report_id: string; artifact_scope: ReportArtifactScope; expires_at: string | Date }[]>`
    SELECT id, report_id, artifact_scope, expires_at FROM report_access_tokens
    WHERE token_hmac = ${hmacSecret(generated.raw, tokenSecret)} LIMIT 1
  `;
  if (!existing[0] || existing[0].report_id !== input.reportId || existing[0].artifact_scope !== artifactScope) throw new Error("Report access token idempotency conflict.");
  return { id: existing[0].id, rawToken: generated.raw, expiresAt: new Date(existing[0].expires_at) };
}

function deterministicToken(reportId: string, artifactScope: ReportArtifactScope, idempotencyKey: string, secret: string) {
  if (!idempotencyKey.trim() || idempotencyKey.length > 256) throw new Error("A valid report token idempotency key is required.");
  const material = createHmac("sha256", secret).update(`report-access\0${reportId}\0${artifactScope}\0${idempotencyKey}`).digest("base64url");
  const raw = `ogc_report_${material}`;
  return { raw, displayPrefix: raw.slice(0, 19) };
}

export async function inspectReportAccessToken(rawToken: string, linkTtlDays = 7): Promise<{
  reportId: string;
  artifactScope: ReportArtifactScope;
  expiresAt: Date;
  linkExpiresAt: Date;
} | null> {
  await ensureDatabase();
  const tokenHmac = hmacSecret(rawToken, requireSecret("OGC_TOKEN_HASH_SECRET"));
  const rows = await getSqlClient()<{
    report_id: string;
    artifact_scope: ReportArtifactScope;
    expires_at: string | Date;
    created_at: string | Date;
  }[]>`
    SELECT report_id, artifact_scope, expires_at, created_at
    FROM report_access_tokens
    WHERE token_hmac = ${tokenHmac}
      AND revoked_at IS NULL
      AND last_used_at IS NULL
      AND expires_at > now()
      AND created_at > now() - (${linkTtlDays} * interval '1 day')
    LIMIT 1
  `;
  if (!rows[0]) return null;
  const createdAt = new Date(rows[0].created_at);
  return {
    reportId: rows[0].report_id,
    artifactScope: rows[0].artifact_scope,
    expiresAt: new Date(rows[0].expires_at),
    linkExpiresAt: new Date(createdAt.getTime() + linkTtlDays * 86_400_000)
  };
}

export async function redeemReportAccessToken(rawToken: string, linkTtlDays = 7): Promise<{
  reportId: string;
  artifactScope: ReportArtifactScope;
  expiresAt: Date;
} | null> {
  await ensureDatabase();
  const tokenHmac = hmacSecret(rawToken, requireSecret("OGC_TOKEN_HASH_SECRET"));
  const rows = await getSqlClient()<{ report_id: string; artifact_scope: ReportArtifactScope; expires_at: string | Date }[]>`
    UPDATE report_access_tokens
    SET last_used_at = now()
    WHERE token_hmac = ${tokenHmac}
      AND revoked_at IS NULL
      AND last_used_at IS NULL
      AND expires_at > now()
      AND created_at > now() - (${linkTtlDays} * interval '1 day')
    RETURNING report_id, artifact_scope, expires_at
  `;
  return rows[0] ? { reportId: rows[0].report_id, artifactScope: rows[0].artifact_scope, expiresAt: new Date(rows[0].expires_at) } : null;
}

export async function verifyReportAccessToken(rawToken: string): Promise<{ reportId: string; artifactScope: ReportArtifactScope; expiresAt: Date } | null> {
  await ensureDatabase();
  const tokenHmac = hmacSecret(rawToken, requireSecret("OGC_TOKEN_HASH_SECRET"));
  const rows = await getSqlClient()<{ report_id: string; artifact_scope: ReportArtifactScope; expires_at: string | Date }[]>`
    SELECT report_id, artifact_scope, expires_at
    FROM report_access_tokens
    WHERE token_hmac = ${tokenHmac}
      AND revoked_at IS NULL
      AND expires_at > now()
    LIMIT 1
  `;
  return rows[0] ? { reportId: rows[0].report_id, artifactScope: rows[0].artifact_scope, expiresAt: new Date(rows[0].expires_at) } : null;
}

export async function revokeReportAccessTokens(reportId: string, artifactScope?: ReportArtifactScope): Promise<number> {
  await ensureDatabase();
  const rows = await getSqlClient()<{ id: string }[]>`
    UPDATE report_access_tokens SET revoked_at = now()
    WHERE report_id = ${reportId} AND revoked_at IS NULL
      AND (${artifactScope ?? null}::text IS NULL OR artifact_scope = ${artifactScope ?? null})
    RETURNING id
  `;
  return rows.length;
}
