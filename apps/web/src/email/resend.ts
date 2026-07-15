import type { EmailGateway, SendEmailInput, SendEmailResult } from "./gateway";
import { isMailbox, readResendConfiguration, required } from "./config";
import { renderTransactionalEmail } from "./templates";
import { getCommerceMode } from "@/commerce/config";
import { CommerceProviderError } from "@/commerce/provider-error";

interface ResendOptions {
  environment?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}

export class ResendRequestError extends CommerceProviderError {
  constructor(public readonly status: number) {
    super("resend", "send", "http", status);
    this.name = "ResendRequestError";
  }
}

export class ResendEmailGateway implements EmailGateway {
  private readonly environment: NodeJS.ProcessEnv;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ResendOptions = {}) {
    this.environment = options.environment ?? process.env;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    if (!input.idempotencyKey || input.idempotencyKey.length > 256) throw new Error("A valid permanent email idempotency key is required.");
    const rendered = renderTransactionalEmail(input);
    let recipient: string;
    let configuration: ReturnType<typeof readResendConfiguration>;
    try {
      recipient = resolveEnvelopeRecipient(input.to, this.environment);
      configuration = readResendConfiguration(this.environment);
    } catch (error) {
      throw resendConfigurationError(error);
    }
    let response: Response;
    try {
      response = await this.fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${configuration.apiKey}`,
          "content-type": "application/json",
          "idempotency-key": input.idempotencyKey
        },
        body: JSON.stringify({
          from: configuration.from,
          to: [recipient],
          reply_to: configuration.replyTo,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text
        })
      });
    } catch (error) {
      throw networkError("resend", "send", error);
    }
    if (!response.ok) throw new ResendRequestError(response.status);
    let payload: { id?: unknown };
    try {
      payload = await response.json() as { id?: unknown };
    } catch {
      throw new CommerceProviderError("resend", "send", "invalid_response");
    }
    if (typeof payload.id !== "string") throw new CommerceProviderError("resend", "send", "invalid_response");
    return { provider: "resend", providerEmailId: payload.id };
  }
}

function networkError(provider: "resend", operation: "send", error: unknown): CommerceProviderError {
  const name = error instanceof Error ? error.name : "";
  return new CommerceProviderError(provider, operation, name === "AbortError" || name === "TimeoutError" ? "timeout" : "network");
}

function resendConfigurationError(error: unknown): CommerceProviderError {
  const failure = new CommerceProviderError("resend", "configuration", "invalid_configuration");
  const safeField = ["OGC_TEST_EMAIL_RECIPIENT", "RESEND_API_KEY", "RESEND_FROM_EMAIL", "OGC_REPLY_TO_EMAIL"]
    .find((field) => error instanceof Error && error.message.includes(field));
  if (safeField) failure.message = `resend configuration failed: ${safeField}.`;
  return failure;
}

export function resolveEnvelopeRecipient(requestedRecipient: string, environment: NodeJS.ProcessEnv = process.env): string {
  if (environment.OGC_DEPLOYMENT_PROFILE?.trim() === "production") return requestedRecipient;
  if (getCommerceMode(environment) !== "test") return requestedRecipient;
  const testRecipient = required(environment, "OGC_TEST_EMAIL_RECIPIENT");
  if (!isMailbox(testRecipient)) {
    throw new Error("OGC_TEST_EMAIL_RECIPIENT must be a valid single email address.");
  }
  return testRecipient;
}
