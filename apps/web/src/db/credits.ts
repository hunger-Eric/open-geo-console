import { randomUUID } from "node:crypto";
import { ensureDatabase, getSqlClient } from "./index";
import { generateOpaqueSecret, hmacSecret, requireSecret } from "./secrets";
import type { CreditStatus } from "./schema";

interface AccessKeySqlRow {
  id: string;
  status: "active" | "revoked" | "exhausted";
  credits_remaining: number;
  expires_at: string | Date | null;
}

interface CreditSqlRow {
  id: string;
  access_key_id: string;
  report_id: string;
  job_id: string | null;
  idempotency_key: string;
  credits: number;
  status: CreditStatus;
}

export class AccessKeyError extends Error {
  constructor(
    public readonly code: "invalid" | "revoked" | "expired" | "exhausted" | "idempotency_conflict" | "already_settled",
    message: string
  ) {
    super(message);
  }
}

export async function createAccessKey(input: { credits: number; expiresAt?: Date }): Promise<{
  id: string;
  rawKey: string;
  keyPrefix: string;
  credits: number;
  expiresAt: Date | null;
}> {
  if (!Number.isSafeInteger(input.credits) || input.credits < 1) {
    throw new Error("Access key credits must be a positive integer.");
  }
  await ensureDatabase();
  const sql = getSqlClient();
  const generated = generateOpaqueSecret("ogc_live");
  const id = randomUUID();
  await sql`
    INSERT INTO access_keys (id, key_prefix, key_hmac, status, credits_remaining, expires_at)
    VALUES (
      ${id}, ${generated.displayPrefix},
      ${hmacSecret(generated.raw, requireSecret("OGC_TOKEN_HASH_SECRET"))},
      'active', ${input.credits}, ${input.expiresAt?.toISOString() ?? null}
    )
  `;
  return {
    id,
    rawKey: generated.raw,
    keyPrefix: generated.displayPrefix,
    credits: input.credits,
    expiresAt: input.expiresAt ?? null
  };
}

export async function reserveCredit(input: {
  rawKey: string;
  reportId: string;
  jobId?: string;
  idempotencyKey: string;
  credits?: number;
}): Promise<CreditSqlRow> {
  const amount = input.credits ?? 1;
  if (!input.idempotencyKey || !Number.isSafeInteger(amount) || amount < 1) {
    throw new Error("A non-empty idempotency key and positive credit amount are required.");
  }
  await ensureDatabase();
  const sql = getSqlClient();
  const keyHmac = hmacSecret(input.rawKey, requireSecret("OGC_TOKEN_HASH_SECRET"));
  return sql.begin(async (tx) => {
    const keys = await tx<AccessKeySqlRow[]>`
      SELECT id, status, credits_remaining, expires_at
      FROM access_keys WHERE key_hmac = ${keyHmac} FOR UPDATE
    `;
    const key = keys[0];
    if (!key) throw new AccessKeyError("invalid", "The access key is invalid.");

    const existing = await tx<CreditSqlRow[]>`
      SELECT id, access_key_id, report_id, job_id, idempotency_key, credits, status
      FROM credit_ledger WHERE access_key_id = ${key.id} AND idempotency_key = ${input.idempotencyKey}
    `;
    if (existing[0]) {
      if (existing[0].report_id !== input.reportId || existing[0].credits !== amount) {
        throw new AccessKeyError("idempotency_conflict", "The idempotency key was already used for another operation.");
      }
      return existing[0];
    }
    if (key.status === "revoked") throw new AccessKeyError("revoked", "The access key was revoked.");
    if (key.expires_at && new Date(key.expires_at) <= new Date()) throw new AccessKeyError("expired", "The access key expired.");
    if (key.status === "exhausted" || key.credits_remaining < amount) {
      throw new AccessKeyError("exhausted", "The access key has no remaining credits.");
    }

    const reservationId = randomUUID();
    await tx`
      UPDATE access_keys SET
        credits_remaining = credits_remaining - ${amount},
        status = CASE WHEN credits_remaining - ${amount} = 0 THEN 'exhausted' ELSE status END
      WHERE id = ${key.id}
    `;
    const rows = await tx<CreditSqlRow[]>`
      INSERT INTO credit_ledger
        (id, access_key_id, report_id, job_id, idempotency_key, credits, status)
      VALUES
        (${reservationId}, ${key.id}, ${input.reportId}, ${input.jobId ?? null}, ${input.idempotencyKey}, ${amount}, 'reserved')
      RETURNING id, access_key_id, report_id, job_id, idempotency_key, credits, status
    `;
    return rows[0];
  });
}

export async function attachReservationToJob(reservationId: string, jobId: string): Promise<void> {
  await ensureDatabase();
  await getSqlClient().begin(async (tx) => {
    await tx`UPDATE credit_ledger SET job_id = COALESCE(job_id, ${jobId}) WHERE id = ${reservationId}`;
    await tx`UPDATE scan_jobs SET credit_reservation_id = ${reservationId} WHERE id = ${jobId}`;
  });
}

export async function settleCredit(reservationId: string): Promise<CreditSqlRow> {
  await ensureDatabase();
  return getSqlClient().begin(async (tx) => {
    const rows = await tx<CreditSqlRow[]>`
      SELECT id, access_key_id, report_id, job_id, idempotency_key, credits, status
      FROM credit_ledger WHERE id = ${reservationId} FOR UPDATE
    `;
    const row = rows[0];
    if (!row) throw new AccessKeyError("invalid", "The credit reservation does not exist.");
    if (row.status === "refunded") throw new AccessKeyError("invalid", "A refunded reservation cannot be settled.");
    if (row.status === "settled") return row;
    const updated = await tx<CreditSqlRow[]>`
      UPDATE credit_ledger SET status = 'settled', settled_at = now()
      WHERE id = ${reservationId}
      RETURNING id, access_key_id, report_id, job_id, idempotency_key, credits, status
    `;
    return updated[0];
  });
}

export async function refundCredit(reservationId: string): Promise<CreditSqlRow> {
  await ensureDatabase();
  return getSqlClient().begin(async (tx) => {
    const rows = await tx<CreditSqlRow[]>`
      SELECT id, access_key_id, report_id, job_id, idempotency_key, credits, status
      FROM credit_ledger WHERE id = ${reservationId} FOR UPDATE
    `;
    const row = rows[0];
    if (!row) throw new AccessKeyError("invalid", "The credit reservation does not exist.");
    if (row.status === "refunded") return row;
    if (row.status === "settled") {
      throw new AccessKeyError("already_settled", "A settled credit cannot be automatically refunded.");
    }
    await tx`
      UPDATE access_keys SET
        credits_remaining = credits_remaining + ${row.credits},
        status = CASE WHEN status = 'exhausted' THEN 'active' ELSE status END
      WHERE id = ${row.access_key_id}
    `;
    const updated = await tx<CreditSqlRow[]>`
      UPDATE credit_ledger SET status = 'refunded', refunded_at = now()
      WHERE id = ${reservationId}
      RETURNING id, access_key_id, report_id, job_id, idempotency_key, credits, status
    `;
    return updated[0];
  });
}

export async function revokeAccessKey(id: string): Promise<boolean> {
  await ensureDatabase();
  const rows = await getSqlClient()<{ id: string }[]>`
    UPDATE access_keys SET status = 'revoked', revoked_at = now()
    WHERE id = ${id} AND status <> 'revoked' RETURNING id
  `;
  return rows.length === 1;
}
