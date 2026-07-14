export type EmailTemplate =
  | "payment_confirmed"
  | "report_ready"
  | "limited_report_refund"
  | "report_failed_refund"
  | "refund_succeeded"
  | "refund_assistance"
  | "link_reissue"
  | "corrected_report_ready";
export type EmailLocale = "en" | "zh";

export interface SendEmailInput {
  to: string;
  template: EmailTemplate;
  locale: EmailLocale;
  orderReference: string;
  siteLabel: string;
  idempotencyKey: string;
  reportUrl?: string;
}

export interface SendEmailResult {
  provider: "resend";
  providerEmailId: string;
}

export interface EmailGateway {
  send(input: SendEmailInput): Promise<SendEmailResult>;
}
