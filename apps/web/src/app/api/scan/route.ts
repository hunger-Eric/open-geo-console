import { auditSite } from "@open-geo-console/geo-auditor";
import { createSiteKey } from "@open-geo-console/site-crawler";
import { NextResponse } from "next/server";
import { enqueueScanJob } from "@/db/jobs";
import { deleteGeoReport, saveGeoReport } from "@/db/reports";
import { claimFreeSiteTrial, getActiveFreeSiteTrial } from "@/db/trials";
import { createSafeFetch } from "@/server/safe-fetch";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: string; locale?: string };
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
    const report = await auditSite(finalUrl, { fetchImpl: safeFetch });
    const saved = await saveGeoReport(finalUrl, report, siteKey);
    let job: Awaited<ReturnType<typeof enqueueScanJob>>;
    let claim: Awaited<ReturnType<typeof claimFreeSiteTrial>>;
    try {
      job = await enqueueScanJob({ reportId: saved.id, tier: "free", locale: body.locale === "zh" ? "zh" : "en" });
      claim = await claimFreeSiteTrial({
        siteKey,
        reportId: saved.id,
        jobId: job.id,
        ipAddress: clientIp(request)
      });
    } catch (error) {
      await deleteGeoReport(saved.id);
      throw error;
    }

    if (claim.outcome !== "created") {
      await deleteGeoReport(saved.id);
      if (claim.outcome === "rate_limited") {
        return NextResponse.json(
          { error: "The daily free AI preview limit has been reached.", retryAfter: claim.retryAfter.toISOString() },
          { status: 429 }
        );
      }
      return reusedTrialResponse(claim);
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

function reusedTrialResponse(trial: { reportId: string; jobId: string | null }) {
  return NextResponse.json({
    reportId: trial.reportId,
    jobId: trial.jobId,
    tier: "free",
    status: "reused"
  });
}

function clientIp(request: Request): string {
  const trustProxy = process.env.TRUST_PROXY_HEADERS === "true" || Boolean(process.env.VERCEL);
  if (trustProxy) {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
    if (forwarded) return forwarded;
    const realIp = request.headers.get("x-real-ip")?.trim();
    if (realIp) return realIp;
  }
  return "untrusted-direct-client";
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
