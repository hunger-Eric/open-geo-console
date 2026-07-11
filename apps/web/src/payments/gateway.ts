import type { SupportedCurrency } from "@/commerce/config";

export interface HostedCheckoutInput {
  orderId: string;
  reportId: string;
  siteKey: string;
  locale: "en" | "zh";
  amountMinor: number;
  currency: SupportedCurrency;
  returnUrl: string;
}

export interface HostedCheckoutResult {
  provider: "airwallex";
  providerCheckoutId: string;
  clientSecret: string;
  currency: SupportedCurrency;
  environment: "demo" | "prod";
}

export interface RefundInput {
  orderId: string;
  paymentIntentId: string;
  amountMinor: number;
  currency: SupportedCurrency;
  reason: "completed_limited" | "report_failed" | "operator_approved" | "sla_missed";
  idempotencyKey: string;
}

export interface RefundResult {
  providerRefundId: string;
  status: "pending" | "submitted" | "succeeded" | "failed";
}

export interface VerifiedPaymentEvent {
  provider: "airwallex";
  eventId: string;
  eventType: string;
  createdAt: Date;
  orderId: string | null;
  paymentIntentId: string | null;
  providerRefundId: string | null;
  payloadHash: string;
  outcome: "payment_paid" | "payment_failed" | "refund_updated" | "ignored";
  providerStatus: string | null;
}

export interface PaymentGateway {
  createHostedCheckout(input: HostedCheckoutInput): Promise<HostedCheckoutResult>;
  getHostedCheckout(providerCheckoutId: string, orderId: string): Promise<HostedCheckoutResult>;
  findHostedCheckoutByReference(orderId: string): Promise<HostedCheckoutResult | null>;
  verifyAndParseWebhook(rawBody: string, headers: Headers): VerifiedPaymentEvent;
  requestRefund(input: RefundInput): Promise<RefundResult>;
}
