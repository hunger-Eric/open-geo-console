import { describe, expect, it } from "vitest";
import { DATABASE_MIGRATIONS } from "./migrations";
import {
  advanceEmailDeliveryState,
  advanceFulfillmentStatus,
  advanceOrderDeliveryStatus,
  advanceOrderRefundStatus,
  advancePaymentRefundState,
  advancePaymentStatus,
  CommercialStateError,
  shouldApplyEmailProviderEvent
} from "./commercial-state";

describe("commercial persistence migrations", () => {
  const migration = DATABASE_MIGRATIONS.join("\n");

  it("installs every commercial authority additively", () => {
    for (const table of [
      "payment_orders",
      "payment_events",
      "payment_refunds",
      "job_dispatch_outbox",
      "email_deliveries",
      "email_delivery_events",
      "worker_presence",
      "batch_runs",
      "free_ai_daily_budgets",
      "free_ai_budget_reservations"
    ]) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
  });

  it("keeps exactly-once business keys in PostgreSQL", () => {
    expect(migration).toContain("checkout_idempotency_hmac text NOT NULL UNIQUE");
    expect(migration).toContain("UNIQUE (provider, provider_event_id)");
    expect(migration).toContain("order_id text NOT NULL UNIQUE REFERENCES payment_orders");
    expect(migration).toContain("job_id text NOT NULL UNIQUE REFERENCES scan_jobs");
    expect(migration).toContain("business_idempotency_key text NOT NULL UNIQUE");
    expect(migration).toContain("access_keys_payment_order_uidx");
    expect(migration).toContain("credit_ledger_payment_order_uidx");
  });

  it("stores bounded payment evidence instead of raw provider payloads", () => {
    const paymentEventMigration = migration.slice(
      migration.indexOf("CREATE TABLE IF NOT EXISTS payment_events"),
      migration.indexOf("CREATE INDEX IF NOT EXISTS payment_events_order_idx")
    );
    expect(paymentEventMigration).toContain("payload_hash text NOT NULL");
    expect(paymentEventMigration).toContain("selected_fields jsonb");
    expect(paymentEventMigration).not.toMatch(/raw_(body|payload)|customer_email\s+text/i);
  });

  it("uses HMAC-only lookup fields and encrypted email storage", () => {
    expect(migration).toContain("customer_email_encrypted text NOT NULL");
    expect(migration).toContain("customer_email_hmac text NOT NULL");
    expect(migration).not.toMatch(/customer_email_plain|raw_access_token|raw_payment_secret/i);
  });

  it("adds existing-table foreign keys through idempotent constraint checks", () => {
    expect(migration).toContain("pg_constraint");
    expect(migration).toContain("access_keys_payment_order_id_fkey");
    expect(migration).toContain("credit_ledger_payment_order_id_fkey");
    expect(migration).not.toContain("ADD CONSTRAINT IF NOT EXISTS");
  });
});

describe("commercial monotonic state machines", () => {
  it("allows forward progress and exact duplicate application", () => {
    expect(advancePaymentStatus("created", "pending")).toBe("pending");
    expect(advancePaymentStatus("pending", "paid")).toBe("paid");
    expect(advancePaymentStatus("paid", "paid")).toBe("paid");
    expect(advanceFulfillmentStatus("queued", "processing")).toBe("processing");
    expect(advanceFulfillmentStatus("processing", "completed_limited")).toBe("completed_limited");
    expect(advanceOrderRefundStatus("pending", "submitted")).toBe("submitted");
    expect(advancePaymentRefundState("submitted", "succeeded")).toBe("succeeded");
    expect(advanceOrderDeliveryStatus("queued", "delivered")).toBe("delivered");
    expect(advanceEmailDeliveryState("sent", "delivered")).toBe("delivered");
  });

  it("rejects terminal regression in every independent dimension", () => {
    for (const operation of [
      () => advancePaymentStatus("paid", "pending"),
      () => advanceFulfillmentStatus("completed", "processing"),
      () => advanceOrderRefundStatus("refunded", "submitted"),
      () => advancePaymentRefundState("succeeded", "pending"),
      () => advanceOrderDeliveryStatus("delivered", "sent"),
      () => advanceEmailDeliveryState("bounced", "sent")
    ]) {
      expect(operation).toThrow(CommercialStateError);
    }
  });

  it("ignores stale and duplicate terminal email events", () => {
    const lastEvent = new Date("2026-07-10T10:00:00.000Z");
    expect(shouldApplyEmailProviderEvent({
      current: "sent",
      target: "delivered",
      lastProviderEventAt: lastEvent,
      providerCreatedAt: new Date("2026-07-10T09:59:59.000Z")
    })).toBe(false);
    expect(shouldApplyEmailProviderEvent({
      current: "delivered",
      target: "bounced",
      lastProviderEventAt: lastEvent,
      providerCreatedAt: new Date("2026-07-10T10:01:00.000Z")
    })).toBe(false);
    expect(shouldApplyEmailProviderEvent({
      current: "sent",
      target: "delivered",
      lastProviderEventAt: lastEvent,
      providerCreatedAt: new Date("2026-07-10T10:01:00.000Z")
    })).toBe(true);
  });
});
