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

export interface HostedCheckoutExpectation {
  amountMinor: number;
  currency: SupportedCurrency;
}

export type HostedCheckoutResult = {
  provider: "airwallex";
  providerCheckoutId: string;
  clientSecret: string;
  currency: SupportedCurrency;
  environment: "demo" | "prod";
} | {
  provider: "stripe";
  providerCheckoutId: string;
  checkoutUrl: string;
  currency: SupportedCurrency;
  environment: "test";
};

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
  provider: "airwallex" | "stripe";
  eventId: string;
  eventType: string;
  createdAt: Date;
  orderId: string | null;
  providerCheckoutId?: string | null;
  paymentLinkId: string | null;
  paymentIntentId: string | null;
  providerRefundId: string | null;
  amountMinor: number | null;
  currency: SupportedCurrency | null;
  payloadHash: string;
  outcome: "payment_paid" | "payment_failed" | "refund_updated" | "ignored";
  providerStatus: string | null;
}

export interface PaymentGateway {
  createHostedCheckout(input: HostedCheckoutInput): Promise<HostedCheckoutResult>;
  getHostedCheckout(
    providerCheckoutId: string,
    orderId: string,
    expected?: HostedCheckoutExpectation
  ): Promise<HostedCheckoutResult>;
  findHostedCheckoutByReference(orderId: string): Promise<HostedCheckoutResult | null>;
  verifyAndParseWebhook(rawBody: string, headers: Headers): VerifiedPaymentEvent;
  requestRefund(input: RefundInput): Promise<RefundResult>;
}
