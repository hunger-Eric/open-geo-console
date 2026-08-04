import { hmacSecret, requireSecret, verifyHmacSecret } from "@/db/secrets";
import { ensureDatabase, getSqlClient } from "@/db";

const CAPABILITY_VERSION = 1;
export const PAYMENT_RETURN_ACCESS_TTL_SECONDS = 36 * 60 * 60;

interface CapabilityPayload {
  v: 1;
  reportId: string;
  orderId: string;
  expiresAt: number;
}

export function paymentReturnAccessCookieName(reportId: string): string {
  return `ogc_payment_return_${opaqueId(reportId)}`;
}

export function issuePaymentReturnAccessCapability(input: {
  reportId: string;
  orderId: string;
  now?: Date;
}): { raw: string; expiresAt: Date } {
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + PAYMENT_RETURN_ACCESS_TTL_SECONDS * 1_000);
  const payload: CapabilityPayload = {
    v: CAPABILITY_VERSION,
    reportId: opaqueId(input.reportId),
    orderId: opaqueId(input.orderId),
    expiresAt: Math.floor(expiresAt.getTime() / 1_000)
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = hmacSecret(encoded, requireSecret("OGC_TOKEN_HASH_SECRET"));
  return { raw: `${encoded}.${signature}`, expiresAt };
}

export function requestHasPaymentReturnAccess(
  request: Request,
  input: { reportId: string; orderId: string; now?: Date }
): boolean {
  const reportId = opaqueId(input.reportId);
  const raw = readCookie(request.headers.get("cookie") ?? "", paymentReturnAccessCookieName(reportId));
  return raw ? verifyPaymentReturnAccessCapability(raw, { ...input, reportId }) : false;
}

export function verifyPaymentReturnAccessCapability(
  raw: string,
  input: { reportId: string; orderId: string; now?: Date }
): boolean {
  const [encoded, signature, extra] = raw.split(".");
  if (!encoded || !signature || extra) return false;
  if (!/^[0-9a-f]{64}$/.test(signature)) return false;
  if (!verifyHmacSecret(encoded, signature, requireSecret("OGC_TOKEN_HASH_SECRET"))) return false;
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return false;
  }
  if (!isCapabilityPayload(payload)) return false;
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1_000);
  return payload.reportId === opaqueId(input.reportId)
    && payload.orderId === opaqueId(input.orderId)
    && payload.expiresAt >= nowSeconds
    && payload.expiresAt <= nowSeconds + PAYMENT_RETURN_ACCESS_TTL_SECONDS;
}

export function paymentReturnAccessCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: true,
    path: "/",
    expires: expiresAt
  };
}

export async function activeArtifactBelongsToPaymentOrder(input: {
  artifactRevisionId: string;
  reportId: string;
  orderId: string;
}): Promise<boolean> {
  const artifactRevisionId = opaqueId(input.artifactRevisionId);
  const reportId = opaqueId(input.reportId);
  const orderId = opaqueId(input.orderId);
  await ensureDatabase();
  const rows = await getSqlClient()<{ belongs: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM report_artifact_revisions
      WHERE id = ${artifactRevisionId}
        AND report_id = ${reportId}
        AND order_id = ${orderId}
        AND status = 'active'
    ) AS belongs
  `;
  return rows[0]?.belongs === true;
}

function isCapabilityPayload(value: unknown): value is CapabilityPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return Object.keys(payload).length === 4
    && payload.v === CAPABILITY_VERSION
    && typeof payload.reportId === "string"
    && typeof payload.orderId === "string"
    && Number.isInteger(payload.expiresAt);
}

function opaqueId(value: string): string {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(value)) throw new Error("A valid opaque identifier is required.");
  return value;
}

function readCookie(header: string, name: string): string | undefined {
  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) return decodeURIComponent(rawValue.join("="));
  }
  return undefined;
}
