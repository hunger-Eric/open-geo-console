export interface ResendConfiguration {
  apiKey: string;
  from: string;
  replyTo: string;
}

const EMAIL_ADDRESS = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
const RESEND_API_KEY = /^re_[A-Za-z0-9_-]+$/;

export function readResendConfiguration(environment: NodeJS.ProcessEnv): ResendConfiguration {
  const apiKey = required(environment, "RESEND_API_KEY");
  const from = required(environment, "RESEND_FROM_EMAIL");
  const replyTo = required(environment, "OGC_REPLY_TO_EMAIL");
  if (!RESEND_API_KEY.test(apiKey)) throw new Error("RESEND_API_KEY must be a valid Resend API key.");
  if (!isMailbox(from) && !isNamedMailbox(from)) {
    throw new Error("RESEND_FROM_EMAIL must be a valid email address or named mailbox.");
  }
  if (!isMailbox(replyTo)) throw new Error("OGC_REPLY_TO_EMAIL must be a valid single email address.");
  return { apiKey, from, replyTo };
}

export function isMailbox(value: string | undefined): boolean {
  return Boolean(value?.trim() && EMAIL_ADDRESS.test(value.trim()));
}

function isNamedMailbox(value: string): boolean {
  const match = value.match(/^([^<>]+)\s*<([^<>]+)>$/);
  return Boolean(match?.[1]?.trim() && isMailbox(match?.[2]));
}

export function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
