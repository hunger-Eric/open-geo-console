export interface TurnstileResult {
  success: boolean;
  errorCodes: string[];
}

interface VerifyTurnstileInput {
  token: string;
  remoteIp?: string;
  environment?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}

export function isTurnstileRequired(environment: NodeJS.ProcessEnv = process.env): boolean {
  if (environment.TURNSTILE_REQUIRED === "true") return true;
  if (environment.TURNSTILE_REQUIRED === "false") return false;
  return environment.NODE_ENV === "production";
}

export async function verifyTurnstile(input: VerifyTurnstileInput): Promise<TurnstileResult> {
  const environment = input.environment ?? process.env;
  if (!isTurnstileRequired(environment)) return { success: true, errorCodes: [] };
  const secret = environment.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) throw new Error("TURNSTILE_SECRET_KEY is required when Turnstile is enabled.");
  if (!input.token.trim()) return { success: false, errorCodes: ["missing-input-response"] };
  const body = new URLSearchParams({ secret, response: input.token.trim() });
  if (input.remoteIp && input.remoteIp !== "untrusted-direct-client") body.set("remoteip", input.remoteIp);
  const response = await (input.fetchImpl ?? fetch)("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  if (!response.ok) throw new Error(`Turnstile verification failed with status ${response.status}.`);
  const payload = await response.json() as { success?: unknown; hostname?: unknown; "error-codes"?: unknown };
  const expectedHostname = environment.TURNSTILE_EXPECTED_HOSTNAME?.trim();
  const hostnameMatches = !expectedHostname || payload.hostname === expectedHostname;
  return {
    success: payload.success === true && hostnameMatches,
    errorCodes: Array.isArray(payload["error-codes"])
      ? payload["error-codes"].filter((value): value is string => typeof value === "string")
      : hostnameMatches ? [] : ["hostname-mismatch"]
  };
}
