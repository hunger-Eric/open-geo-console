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
