export interface CheckoutPayload {
  code?: "payment_confirmation_pending";
  orderId?: string;
  hpp?: {
    intentId?: string;
    clientSecret?: string;
    currency?: "CNY" | "USD" | "HKD";
    environment?: "demo" | "prod";
  };
  error?: string;
}

export async function readCheckoutPayload(response: Response): Promise<CheckoutPayload> {
  const body = await response.text();
  if (!body.trim()) return {};
  try {
    const parsed = JSON.parse(body) as unknown;
    return parsed && typeof parsed === "object" ? parsed as CheckoutPayload : {};
  } catch {
    return {};
  }
}

export function getPaymentConfirmationReturnUrl(payload: CheckoutPayload, currentUrl: string): string | null {
  if (payload.code !== "payment_confirmation_pending"
    || typeof payload.orderId !== "string"
    || !/^[a-zA-Z0-9_-]{1,128}$/.test(payload.orderId)) return null;
  const url = new URL(currentUrl);
  url.searchParams.delete("order");
  url.searchParams.delete("payment_return");
  url.hash = "";
  url.searchParams.set("order", payload.orderId);
  url.searchParams.set("payment_return", "success");
  return url.href;
}
