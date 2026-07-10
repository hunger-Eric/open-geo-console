import { randomUUID } from "node:crypto";
import { ensureDatabase, getSqlClient } from "./index";
import { generateOpaqueSecret, hmacSecret, requireSecret } from "./secrets";

export async function issueReportAccessToken(input: {
  reportId: string;
  expiresAt?: Date;
  ttlDays?: number;
}): Promise<{ id: string; rawToken: string; expiresAt: Date }> {
  await ensureDatabase();
  const generated = generateOpaqueSecret("ogc_report");
  const id = randomUUID();
  const expiresAt = input.expiresAt ?? new Date(Date.now() + (input.ttlDays ?? 30) * 86_400_000);
  if (expiresAt <= new Date()) {
    throw new Error("Report access token expiry must be in the future.");
  }
  await getSqlClient()`
    INSERT INTO report_access_tokens (id, report_id, token_prefix, token_hmac, expires_at)
    VALUES (
      ${id}, ${input.reportId}, ${generated.displayPrefix},
      ${hmacSecret(generated.raw, requireSecret("OGC_TOKEN_HASH_SECRET"))}, ${expiresAt.toISOString()}
    )
  `;
  return { id, rawToken: generated.raw, expiresAt };
}

export async function verifyReportAccessToken(rawToken: string): Promise<{ reportId: string; expiresAt: Date } | null> {
  await ensureDatabase();
  const tokenHmac = hmacSecret(rawToken, requireSecret("OGC_TOKEN_HASH_SECRET"));
  const rows = await getSqlClient()<{ report_id: string; expires_at: string | Date }[]>`
    UPDATE report_access_tokens
    SET last_used_at = now()
    WHERE token_hmac = ${tokenHmac}
      AND revoked_at IS NULL
      AND expires_at > now()
    RETURNING report_id, expires_at
  `;
  return rows[0] ? { reportId: rows[0].report_id, expiresAt: new Date(rows[0].expires_at) } : null;
}

export async function revokeReportAccessTokens(reportId: string): Promise<number> {
  await ensureDatabase();
  const rows = await getSqlClient()<{ id: string }[]>`
    UPDATE report_access_tokens SET revoked_at = now()
    WHERE report_id = ${reportId} AND revoked_at IS NULL RETURNING id
  `;
  return rows.length;
}
