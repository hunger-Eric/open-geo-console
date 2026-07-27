import { ensureDatabase, getSqlClient } from "./index";

export interface FreeAiBudgetResult {
  granted: boolean;
  usedCount: number;
  limit: number;
}

/**
 * Reserves one global free AI preview exactly once for an HMAC business key.
 * Denials are persisted too, so retries cannot cross a later configuration
 * change and unexpectedly consume budget for an already answered request.
 */
export async function consumeFreeAiDailyBudget(input: {
  idempotencyHmac: string;
  bucketDate?: string;
  limit: number;
}): Promise<FreeAiBudgetResult> {
  if (!input.idempotencyHmac.trim()) throw new Error("A free AI budget idempotency HMAC is required.");
  if (!Number.isSafeInteger(input.limit) || input.limit < 0) {
    throw new Error("The free AI daily budget must be a non-negative integer.");
  }
  if (input.bucketDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.bucketDate)) {
    throw new Error("The free AI budget date must use YYYY-MM-DD.");
  }
  await ensureDatabase();
  const sql = getSqlClient();
  return sql.begin(async (tx) => {
    const bucketDate = input.bucketDate ?? new Date().toISOString().slice(0, 10);
    await tx`
      INSERT INTO free_ai_daily_budgets (bucket_date, used_count, limit_snapshot)
      VALUES (${bucketDate}, 0, ${input.limit})
      ON CONFLICT (bucket_date) DO UPDATE
      SET limit_snapshot = EXCLUDED.limit_snapshot, updated_at = now()
    `;
    const budgets = await tx<{ used_count: number; limit_snapshot: number }[]>`
      SELECT used_count, limit_snapshot FROM free_ai_daily_budgets
      WHERE bucket_date = ${bucketDate}
      FOR UPDATE
    `;
    const budget = budgets[0]!;
    const existing = await tx<{ granted: boolean }[]>`
      SELECT granted FROM free_ai_budget_reservations
      WHERE idempotency_hmac = ${input.idempotencyHmac}
    `;
    if (existing[0]) {
      return { granted: existing[0].granted, usedCount: budget.used_count, limit: budget.limit_snapshot };
    }

    const granted = budget.used_count < budget.limit_snapshot;
    let usedCount = budget.used_count;
    if (granted) {
      const updated = await tx<{ used_count: number }[]>`
        UPDATE free_ai_daily_budgets
        SET used_count = used_count + 1, updated_at = now()
        WHERE bucket_date = ${bucketDate} AND used_count < limit_snapshot
        RETURNING used_count
      `;
      if (!updated[0]) throw new Error("The free AI budget changed while it was reserved.");
      usedCount = updated[0].used_count;
    }
    await tx`
      INSERT INTO free_ai_budget_reservations (idempotency_hmac, bucket_date, granted)
      VALUES (${input.idempotencyHmac}, ${bucketDate}, ${granted})
    `;
    return { granted, usedCount, limit: budget.limit_snapshot };
  });
}
