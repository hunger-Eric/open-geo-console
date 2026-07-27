export type CommerceProvider = "airwallex" | "resend";
export type CommerceProviderOperation = "authentication" | "checkout" | "retrieve" | "refund" | "configuration" | "send";
export type CommerceFailureCategory = "http" | "timeout" | "network" | "invalid_response" | "invalid_configuration" | "provider_rejected";

export class CommerceProviderError extends Error {
  constructor(
    readonly provider: CommerceProvider,
    readonly operation: CommerceProviderOperation,
    readonly category: CommerceFailureCategory,
    readonly status?: number,
    options?: ErrorOptions
  ) {
    super(`${provider} ${operation} failed.`, options);
    this.name = "CommerceProviderError";
  }
}

export function safeCommerceFailureCode(error: unknown): string {
  if (!(error instanceof CommerceProviderError)) return "unknown_error";
  const suffix = error.category === "http" && Number.isInteger(error.status)
    ? `http_${error.status}`
    : error.category;
  return `${error.provider}_${error.operation}_${suffix}`.slice(0, 64);
}

export function isPermanentCommerceProviderError(error: unknown): boolean {
  if (!(error instanceof CommerceProviderError)) return false;
  if (error.category === "invalid_configuration" || error.category === "invalid_response") return true;
  return error.category === "http"
    && typeof error.status === "number"
    && error.status >= 400
    && error.status < 500
    && error.status !== 409
    && error.status !== 429;
}
