export type TrustedClientIpSource = "vercel" | "trusted-proxy" | "fallback";

export interface TrustedClientIdentity {
  ipAddress: string;
  source: TrustedClientIpSource;
}

export type TrustedClientCountryCode = string;

const ISO_ALPHA_2_COUNTRY_CODES = new Set((
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ "
  + "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR "
  + "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP "
  + "KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT "
  + "MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW "
  + "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG "
  + "UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(" "));

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

export function getTrustedClientCountry(
  request: Request,
  environment: NodeJS.ProcessEnv = process.env
): TrustedClientCountryCode | null {
  if (environment.VERCEL === "1" || environment.OGC_TRUST_VERCEL_HEADERS === "true") {
    return normalizeCountryCode(request.headers.get("x-vercel-ip-country"));
  }
  if (environment.TRUST_PROXY_HEADERS === "true") {
    return normalizeCountryCode(request.headers.get("cf-ipcountry"));
  }
  return null;
}

function normalizeIp(value: string): string {
  const normalized = value.replace(/^\[|\]$/g, "").trim().toLowerCase();
  return normalized.slice(0, 64) || "untrusted-direct-client";
}

function normalizeCountryCode(value: string | null): TrustedClientCountryCode | null {
  const normalized = value?.trim().toUpperCase() ?? "";
  return ISO_ALPHA_2_COUNTRY_CODES.has(normalized) ? normalized : null;
}

function fallbackIdentity(): TrustedClientIdentity {
  return { ipAddress: "untrusted-direct-client", source: "fallback" };
}
