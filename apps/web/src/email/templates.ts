import type { EmailLocale, EmailTemplate } from "./gateway";

export interface RenderEmailInput {
  template: EmailTemplate;
  locale: EmailLocale;
  orderReference: string;
  siteLabel: string;
  reportUrl?: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export const EMAIL_TEMPLATE_VERSION = "v1";

export function renderTransactionalEmail(input: RenderEmailInput): RenderedEmail {
  const zh = input.locale === "zh";
  const order = escapeHtml(input.orderReference);
  const site = escapeHtml(input.siteLabel);
  const safeUrl = input.reportUrl ? escapeHtml(assertHttpsOrLocalUrl(input.reportUrl)) : null;
  const content = copy(input.template, zh, order, site);
  const action = safeUrl
    ? `<p style="margin:28px 0"><a href="${safeUrl}" style="background:#111827;color:#fff;padding:12px 18px;text-decoration:none;border-radius:8px">${zh ? "安全打开报告" : "Open report securely"}</a></p>`
    : "";
  const textAction = input.reportUrl ? `\n${zh ? "报告链接" : "Report link"}: ${input.reportUrl}` : "";
  return {
    subject: content.subject,
    html: `<!doctype html><html><body style="background:#f5f5f0;margin:0;padding:32px 12px;font-family:Arial,sans-serif;color:#17202a"><main style="max-width:600px;margin:auto;background:#fff;padding:32px;border-radius:12px"><p style="font-size:12px;letter-spacing:.08em;color:#64748b">OPEN GEO CONSOLE</p><h1 style="font-size:24px">${content.heading}</h1><p>${content.body}</p>${action}<p style="color:#64748b;font-size:13px">${zh ? "订单" : "Order"}: ${order}<br>${zh ? "网站" : "Site"}: ${site}</p><p style="color:#64748b;font-size:12px">${zh ? "报告将在付款后 24 小时内通过邮件交付，否则全额退款。" : "Your report is delivered by email within 24 hours of payment or fully refunded."}</p></main></body></html>`,
    text: `${content.heading}\n\n${stripHtml(content.body)}${textAction}\n\n${zh ? "订单" : "Order"}: ${input.orderReference}\n${zh ? "网站" : "Site"}: ${input.siteLabel}`
  };
}

function copy(template: EmailTemplate, zh: boolean, order: string, site: string) {
  switch (template) {
    case "payment_confirmed": return zh
      ? { subject: `付款已确认 · ${order}`, heading: "付款已确认", body: `我们已收到 ${site} 的深度诊断订单。任务会进入最近一批处理。` }
      : { subject: `Payment confirmed · ${order}`, heading: "Payment confirmed", body: `We received the full-site diagnostic order for ${site}. It will enter the next processing batch.` };
    case "report_ready": return zh
      ? { subject: `你的深度诊断报告已完成 · ${order}`, heading: "报告已完成", body: "请通过下面的安全链接确认并打开报告。链接有效期为 7 天，打开后本设备保持 30 天访问权限。" }
      : { subject: `Your diagnostic report is ready · ${order}`, heading: "Your report is ready", body: "Confirm and open the report using the secure link below. The link is valid for 7 days; this device keeps access for 30 days after redemption." };
    case "limited_report_refund": return zh
      ? { subject: `已发起全额退款 · ${order}`, heading: "已发起全额退款", body: "报告未达到约定交付条件，我们已按承诺发起全额退款。若之后仍能完成报告，它将作为免费补偿交付。" }
      : { subject: `Full refund started · ${order}`, heading: "Full refund started", body: "The report did not meet the promised delivery condition, so we started a full refund. If it can still be completed, it will be delivered as a complimentary report." };
    case "report_failed_refund": return zh
      ? { subject: `报告未完成，已发起退款 · ${order}`, heading: "报告未能完成", body: "本次深度诊断未能完成，我们已发起全额退款。邮件不会展示内部错误细节。" }
      : { subject: `Report unavailable, refund started · ${order}`, heading: "The report could not be completed", body: "We could not complete this diagnostic and have started a full refund. Internal error details are not included in this email." };
    case "refund_succeeded": return zh
      ? { subject: `全额退款已完成 · ${order}`, heading: "退款已完成", body: "支付服务商已确认本次全额退款。实际到账时间取决于原付款方式。" }
      : { subject: `Full refund completed · ${order}`, heading: "Refund completed", body: "The payment provider confirmed the full refund. Posting time depends on the original payment method." };
    case "refund_assistance": return zh
      ? { subject: `退款需要人工协助 · ${order}`, heading: "退款需要协助", body: "自动退款暂未完成，我们已记录问题并需要人工处理。你无需再次付款。" }
      : { subject: `Refund assistance required · ${order}`, heading: "Refund assistance required", body: "The automatic refund did not complete. The issue is recorded for manual handling; no additional payment is required." };
    case "link_reissue": return zh
      ? { subject: `新的报告访问链接 · ${order}`, heading: "新的安全链接", body: "旧的未兑换链接已失效。请使用下面的新链接。" }
      : { subject: `New report access link · ${order}`, heading: "New secure link", body: "The previous unredeemed link is no longer valid. Use the new link below." };
  }
}

function assertHttpsOrLocalUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error("Email report URLs must use HTTPS.");
  return url.href;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]!);
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, "");
}
