export type TrustedClientIpSource = "vercel" | "trusted-proxy" | "fallback";

export interface TrustedClientIdentity {
  ipAddress: string;
  source: TrustedClientIpSource;
}

export function getTrustedClientIdentity(
  request: Request,
  environment: NodeJS.ProcessEnv = process.env
): TrustedClientIdentity {
  if (environment.VERCEL === "1" || environment.OGC_TRUST_VERCEL_HEADERS === "true") {
    const vercelIp = request.headers.get("x-vercel-forwarded-for")?.split(",", 1)[0]?.trim()
      ?? request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim()
      ?? request.headers.get("x-real-ip")?.trim();
    return vercelIp
      ? { ipAddress: normalizeIp(vercelIp), source: "vercel" }
      : fallbackIdentity();
  }
  if (environment.TRUST_PROXY_HEADERS !== "true") return fallbackIdentity();
  const cloudflareIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cloudflareIp) return { ipAddress: normalizeIp(cloudflareIp), source: "trusted-proxy" };
  const forwarded = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  if (forwarded) return { ipAddress: normalizeIp(forwarded), source: "trusted-proxy" };
  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp
    ? { ipAddress: normalizeIp(realIp), source: "trusted-proxy" }
    : fallbackIdentity();
}

export function getTrustedClientIp(request: Request, environment: NodeJS.ProcessEnv = process.env): string {
  return getTrustedClientIdentity(request, environment).ipAddress;
}

function normalizeIp(value: string): string {
  const normalized = value.replace(/^\[|\]$/g, "").trim().toLowerCase();
  return normalized.slice(0, 64) || "untrusted-direct-client";
}

function fallbackIdentity(): TrustedClientIdentity {
  return { ipAddress: "untrusted-direct-client", source: "fallback" };
}
