import type { EmailGateway, SendEmailInput, SendEmailResult } from "./gateway";
import { renderTransactionalEmail } from "./templates";

interface ResendOptions {
  environment?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}

export class ResendRequestError extends Error {
  constructor(public readonly status: number) {
    super(`Resend request failed with status ${status}.`);
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
    const response = await this.fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${required(this.environment, "RESEND_API_KEY")}`,
        "content-type": "application/json",
        "idempotency-key": input.idempotencyKey
      },
      body: JSON.stringify({
        from: required(this.environment, "RESEND_FROM_EMAIL"),
        to: [input.to],
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text
      })
    });
    if (!response.ok) throw new ResendRequestError(response.status);
    const payload = await response.json() as { id?: unknown };
    if (typeof payload.id !== "string") throw new Error("Resend did not return an email ID.");
    return { provider: "resend", providerEmailId: payload.id };
  }
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
