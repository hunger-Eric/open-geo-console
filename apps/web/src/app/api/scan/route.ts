import { auditSite } from "@open-geo-console/geo-auditor";
import { createSiteKey } from "@open-geo-console/site-crawler";
import { NextResponse } from "next/server";
import { enqueueScanJob } from "@/db/jobs";
import { deleteGeoReport, saveGeoReport } from "@/db/reports";
import { attachFreeTrialJob, claimFreeSiteTrial, getActiveFreeSiteTrial } from "@/db/trials";
import { consumeFreeAiDailyBudget } from "@/db/commercial-budget";
import { hmacSecret, requireSecret } from "@/db/secrets";
import { parseReportLocale } from "@/server/report-locale";
import { createSafeFetch } from "@/server/safe-fetch";
import { verifyTurnstile } from "@/security/turnstile";
import { getTrustedClientIp } from "@/security/client-ip";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: string; locale?: string; turnstileToken?: string };
    const locale = parseReportLocale(body.locale);
    if (!locale) throw new Error("Locale must be either en or zh.");
    const ipAddress = getTrustedClientIp(request);
    const challenge = await verifyTurnstile({ token: body.turnstileToken ?? "", remoteIp: ipAddress });
    if (!challenge.success) {
      return NextResponse.json({ error: "Human verification is required.", errorKey: "humanVerificationRequired" }, { status: 403 });
    }
    const url = normalizeUrl(body.url);
    const submittedSiteKey = createSiteKey(url);
    const submittedExisting = await getActiveFreeSiteTrial(submittedSiteKey);
    if (submittedExisting) return reusedTrialResponse(submittedExisting);
    const safeFetch = createSafeFetch();
    const preflight = await safeFetch(url, { headers: { "user-agent": "OpenGeoConsoleBot/1.0" } });
    const finalUrl = preflight.headers.get("x-ogc-final-url") ?? url;
    const siteKey = createSiteKey(finalUrl);
    if (siteKey !== submittedSiteKey) {
      const redirectedExisting = await getActiveFreeSiteTrial(siteKey);
      if (redirectedExisting) return reusedTrialResponse(redirectedExisting);
    }
    const report = await auditSite(finalUrl, { fetchImpl: safeFetch, pageLimit: 1 });
    const saved = await saveGeoReport(finalUrl, report, siteKey, undefined, locale);
    let claim: Awaited<ReturnType<typeof claimFreeSiteTrial>>;
    try {
      claim = await claimFreeSiteTrial({
        siteKey,
        reportId: saved.id,
        ipAddress,
        dailyDistinctSiteLimit: 2
      });
    } catch (error) {
      await deleteGeoReport(saved.id);
      throw error;
    }

    if (claim.outcome !== "created") {
      await deleteGeoReport(saved.id);
      if (claim.outcome === "rate_limited") {
        return NextResponse.json(
          {
            error: "The rolling 24-hour free preview limit has been reached.",
            errorKey: "freePreviewLimitReached",
            retryAfter: claim.retryAfter.toISOString()
          },
          { status: 429 }
        );
      }
      return reusedTrialResponse(claim);
    }

    const aiBudget = await consumeFreeAiDailyBudget({
      idempotencyHmac: hmacSecret(`free-ai:${saved.id}`, requireSecret("OGC_IP_HASH_SECRET")),
      limit: freeAiDailyLimit()
    });
    if (!aiBudget.granted) {
      return NextResponse.json({
        reportId: saved.id,
        jobId: null,
        tier: "free",
        status: "technical_only",
        aiPreview: aiBudget
      }, { status: 200 });
    }

    let job: Awaited<ReturnType<typeof enqueueScanJob>>;
    try {
      job = await enqueueScanJob({ reportId: saved.id, tier: "free", locale });
      if (!await attachFreeTrialJob(siteKey, saved.id, job.id)) throw new Error("The free preview could not be attached to its report.");
    } catch (error) {
      await deleteGeoReport(saved.id);
      throw error;
    }

    return NextResponse.json({
      reportId: saved.id,
      jobId: job.id,
      tier: "free",
      status: "queued"
    }, { status: 202 });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error(error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to scan this website.",
        errorKey:
          error instanceof ScanInputError
            ? error.errorKey
            : "scanFailed"
      },
      { status: 400 }
    );
  }
}

function freeAiDailyLimit(): number {
  const configured = Number(process.env.OGC_FREE_AI_DAILY_LIMIT ?? 50);
  return Number.isSafeInteger(configured) && configured >= 0 ? configured : 50;
}

function reusedTrialResponse(trial: { reportId: string; jobId: string | null }) {
  return NextResponse.json({
    reportId: trial.reportId,
    jobId: trial.jobId,
    tier: "free",
    status: "reused"
  });
}

function normalizeUrl(value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new ScanInputError("emptyUrl", "Enter a company website URL.");
  }

  const url = new URL(value.startsWith("http") ? value : `https://${value}`);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new ScanInputError("unsupportedUrl", "Only HTTP and HTTPS URLs are supported.");
  }
  url.hash = "";
  return url.href;
}

class ScanInputError extends Error {
  constructor(
    public readonly errorKey: "emptyUrl" | "unsupportedUrl",
    message: string
  ) {
    super(message);
  }
}
