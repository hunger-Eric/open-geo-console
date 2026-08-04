import type { Dictionary } from "@/i18n";

export type ReturnHint = "success" | "cancel";
export interface PaymentReturnContext { orderId: string; hint: ReturnHint }
export interface PublicOrderStatus {
  orderId: string;
  paymentStatus: "created" | "pending" | "paid" | "failed" | "cancelled";
  fulfillmentStatus: "not_started" | "queued" | "processing" | "completed" | "completed_limited" | "failed";
  refundStatus: "not_required" | "pending" | "submitted" | "refunded" | "failed";
  deliveryStatus: "not_queued" | "queued" | "sent" | "delivered" | "bounced" | "failed";
  deliveryDeadlineAt: string | null;
  fulfillmentMode: "batch_24h" | "realtime";
  progress: { stage: string; progress: number } | null;
}

export const PAYMENT_STATUS_REQUEST_TIMEOUT_MS = 12_000;

export function paymentPollDelay(attempt: number): number {
  const safeAttempt = Math.max(0, Math.trunc(attempt));
  return Math.min(1_000 * 2 ** Math.min(safeAttempt, 4), 15_000);
}

export function getPaymentReturnContext(searchParams: Pick<URLSearchParams, "get">): PaymentReturnContext | null {
  const orderId = searchParams.get("order") ?? "";
  const hint = searchParams.get("payment_return");
  return /^[a-zA-Z0-9_-]{1,128}$/.test(orderId) && (hint === "success" || hint === "cancel")
    ? { orderId, hint }
    : null;
}

export function shouldHidePurchaseControls(
  context: PaymentReturnContext | null,
  status: PublicOrderStatus | null
): boolean {
  if (!context) return false;
  if (!status || status.orderId !== context.orderId) return context.hint === "success";
  if (status.paymentStatus === "failed" || status.paymentStatus === "cancelled" || status.refundStatus === "refunded") {
    return false;
  }
  return status.paymentStatus === "paid" || context.hint === "success";
}

export async function fetchPaymentReturnStatus(
  url: string,
  options: {
    signal?: AbortSignal;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
  } = {}
): Promise<Response> {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(options.signal?.reason);
  const timeout = setTimeout(
    () => controller.abort(new DOMException("Payment status request timed out.", "TimeoutError")),
    options.timeoutMs ?? PAYMENT_STATUS_REQUEST_TIMEOUT_MS
  );
  options.signal?.addEventListener("abort", abortFromCaller, { once: true });

  try {
    return await (options.fetchImpl ?? fetch)(url, {
      cache: "no-store",
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
}

export function shouldAttemptCompletionAccess(status: PublicOrderStatus): boolean {
  return status.paymentStatus === "paid"
    && (status.fulfillmentStatus === "completed" || status.fulfillmentStatus === "completed_limited");
}

export async function fetchPaymentCompletionAccess(
  url: string,
  expectedDestination: string,
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {}
): Promise<string | null> {
  const response = await (options.fetchImpl ?? fetch)(url, {
    method: "POST",
    cache: "no-store",
    signal: options.signal
  });
  if (!response.ok) return null;
  const payload = await response.json() as { destination?: unknown };
  return payload.destination === expectedDestination ? expectedDestination : null;
}

export async function attemptPaymentCompletionHandoff(input: {
  status: PublicOrderStatus;
  orderId: string;
  attemptedFor: string | null;
  completionUrl: string;
  expectedDestination: string;
  markAttempted: (orderId: string) => void;
  fetchAccess?: typeof fetchPaymentCompletionAccess;
  navigate?: (destination: string) => void;
  signal?: AbortSignal;
}): Promise<void> {
  if (!shouldAttemptCompletionAccess(input.status) || input.attemptedFor === input.orderId) return;
  input.markAttempted(input.orderId);
  const destination = await (input.fetchAccess ?? fetchPaymentCompletionAccess)(
    input.completionUrl,
    input.expectedDestination,
    { signal: input.signal }
  );
  if (destination) (input.navigate ?? ((value) => window.location.replace(value)))(destination);
}

export function buildHppReturnUrls(currentUrl: string, orderId: string) {
  const base = new URL(currentUrl);
  base.hash = "";
  base.searchParams.delete("order");
  base.searchParams.delete("payment_return");
  const success = new URL(base);
  success.searchParams.set("order", orderId);
  success.searchParams.set("payment_return", "success");
  const cancel = new URL(base);
  cancel.searchParams.set("order", orderId);
  cancel.searchParams.set("payment_return", "cancel");
  return { successUrl: success.href, cancelUrl: cancel.href };
}

export function getPaymentReturnView(status: PublicOrderStatus | null, hint: ReturnHint, dictionary: Dictionary) {
  if (!status) return { kind: hint === "cancel" ? "warning" : "pending", message: hint === "cancel" ? dictionary.commerce.paymentNotCompleted : dictionary.commerce.paymentConfirming } as const;
  if (status.refundStatus === "refunded") return { kind: "warning", message: dictionary.commerce.paymentRefunded } as const;
  if (status.refundStatus === "failed") return { kind: "warning", message: dictionary.commerce.paymentRefundFailed } as const;
  if (status.refundStatus === "pending") return { kind: "warning", message: dictionary.commerce.paymentRefundPending } as const;
  if (status.refundStatus === "submitted") return { kind: "warning", message: dictionary.commerce.paymentRefundSubmitted } as const;
  if (status.paymentStatus === "cancelled") return { kind: "warning", message: dictionary.commerce.paymentCancelled } as const;
  if (status.paymentStatus === "failed") return { kind: "warning", message: dictionary.commerce.paymentNotCompleted } as const;
  if (status.paymentStatus !== "paid") return { kind: hint === "cancel" ? "warning" : "pending", message: hint === "cancel" ? dictionary.commerce.paymentNotCompleted : dictionary.commerce.paymentConfirming } as const;
  if (status.fulfillmentStatus === "completed" || status.fulfillmentStatus === "completed_limited") return { kind: "success", message: dictionary.commerce.paymentCompleted } as const;
  if (status.fulfillmentStatus === "failed") return { kind: "warning", message: dictionary.commerce.paymentFailed } as const;
  if (status.progress && !["queued", "completed", "completed_limited", "failed"].includes(status.progress.stage)) {
    return { kind: "pending", message: dictionary.commerce.paymentGenerating } as const;
  }
  if (status.fulfillmentStatus === "processing") return { kind: "pending", message: dictionary.commerce.paymentGenerating } as const;
  return { kind: "success", message: dictionary.commerce.paymentQueued } as const;
}

export function isTerminalPaymentReturn(status: PublicOrderStatus): boolean {
  return status.paymentStatus === "failed"
    || status.paymentStatus === "cancelled"
    || status.refundStatus === "refunded"
    || status.refundStatus === "failed"
    || status.fulfillmentStatus === "completed"
    || status.fulfillmentStatus === "completed_limited";
}
