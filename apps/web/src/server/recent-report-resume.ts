import { hmacSecret, requireSecret, verifyHmacSecret } from "@/db/secrets";
import { getLatestScanJob } from "@/db/jobs";
import { getGeoReport } from "@/db/reports";
import { getReportV4PreAdmissionJob } from "@/db/report-v4-admission-jobs";
import type { Locale } from "@/i18n";
import { publicStateForStage } from "@/report/job-status";

const MARKER_VERSION = 1;
export const RECENT_REPORT_RESUME_COOKIE = "ogc_recent_report_task";
export const RECENT_REPORT_RESUME_TTL_SECONDS = 48 * 60 * 60;

interface RecentReportMarker {
  v: 1;
  reportId: string;
  locale: Locale;
  issuedAt: number;
  expiresAt: number;
}

export interface RecentReportResume { reportId: string; locale: Locale; domain: string; state: "generating" | "failed" }

export function issueRecentReportResumeMarker(input: {
  reportId: string;
  locale: Locale;
  now?: Date;
}): { raw: string; expiresAt: Date } {
  const now = input.now ?? new Date();
  const issuedAt = Math.floor(now.getTime() / 1_000);
  const expiresAt = new Date((issuedAt + RECENT_REPORT_RESUME_TTL_SECONDS) * 1_000);
  const marker: RecentReportMarker = {
    v: MARKER_VERSION,
    reportId: opaqueId(input.reportId),
    locale: input.locale,
    issuedAt,
    expiresAt: Math.floor(expiresAt.getTime() / 1_000)
  };
  const encoded = Buffer.from(JSON.stringify(marker), "utf8").toString("base64url");
  const signature = hmacSecret(encoded, requireSecret("OGC_TOKEN_HASH_SECRET"));
  return { raw: `${encoded}.${signature}`, expiresAt };
}

export function readRecentReportResumeMarker(raw: string, now = new Date()): RecentReportMarker | null {
  const [encoded, signature, extra] = raw.split(".");
  if (!encoded || !signature || extra || !/^[0-9a-f]{64}$/.test(signature)) return null;
  if (!verifyHmacSecret(encoded, signature, requireSecret("OGC_TOKEN_HASH_SECRET"))) return null;
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!isRecentReportMarker(value)) return null;
  const nowSeconds = Math.floor(now.getTime() / 1_000);
  if (value.issuedAt > nowSeconds || value.expiresAt < nowSeconds) return null;
  if (value.expiresAt - value.issuedAt !== RECENT_REPORT_RESUME_TTL_SECONDS) return null;
  return value;
}

export function recentReportResumeCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: true,
    path: "/",
    expires: expiresAt
  };
}

export async function resolveRecentReportResume(raw: string | undefined, now = new Date()): Promise<RecentReportResume | null> {
  if (!raw) return null;
  const marker = readRecentReportResumeMarker(raw, now);
  if (!marker) return null;
  const report = await getGeoReport(marker.reportId);
  if (!report) return null;
  const [baseJob, previewJob] = await Promise.all([
    getLatestScanJob(marker.reportId, "free", { excludeReasons: ["v4_pre_admission"] }),
    getReportV4PreAdmissionJob(marker.reportId)
  ]);
  const job = previewJob ?? baseJob;
  if (!job) return null;
  const publicState = publicStateForStage(job.stage);
  if (publicState === "completed" || publicState === "completed_limited") return null;
  let domain: string;
  try {
    domain = new URL(report.url).hostname;
  } catch {
    return null;
  }
  return {
    reportId: marker.reportId,
    locale: marker.locale,
    domain,
    state: publicState === "unavailable" ? "failed" : "generating"
  };
}

function isRecentReportMarker(value: unknown): value is RecentReportMarker {
  if (!value || typeof value !== "object") return false;
  const marker = value as Record<string, unknown>;
  return Object.keys(marker).length === 5
    && marker.v === MARKER_VERSION
    && typeof marker.reportId === "string"
    && /^[a-zA-Z0-9_-]{1,128}$/.test(marker.reportId)
    && (marker.locale === "en" || marker.locale === "zh")
    && Number.isInteger(marker.issuedAt)
    && Number.isInteger(marker.expiresAt);
}

function opaqueId(value: string): string {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(value)) throw new Error("A valid report identifier is required.");
  return value;
}
