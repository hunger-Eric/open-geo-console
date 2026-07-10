export function getTrustedClientIp(request: Request, environment: NodeJS.ProcessEnv = process.env): string {
  if (environment.VERCEL === "1" || environment.OGC_TRUST_VERCEL_HEADERS === "true") {
    const vercelIp = request.headers.get("x-vercel-forwarded-for")?.split(",", 1)[0]?.trim()
      ?? request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim()
      ?? request.headers.get("x-real-ip")?.trim();
    return vercelIp ? normalizeIp(vercelIp) : "untrusted-direct-client";
  }
  if (environment.TRUST_PROXY_HEADERS !== "true") return "untrusted-direct-client";
  const cloudflareIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cloudflareIp) return normalizeIp(cloudflareIp);
  const forwarded = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  if (forwarded) return normalizeIp(forwarded);
  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp ? normalizeIp(realIp) : "untrusted-direct-client";
}

function normalizeIp(value: string): string {
  const normalized = value.replace(/^\[|\]$/g, "").trim().toLowerCase();
  return normalized.slice(0, 64) || "untrusted-direct-client";
}
