import { createSiteKey } from "@open-geo-console/site-crawler";
import { NextResponse } from "next/server";
import { ScanJobCapacityError } from "@/db/jobs";
import { admitFreeScan } from "@/db/scan-admission";
import { parseReportLocale } from "@/server/report-locale";
import { verifyTurnstile } from "@/security/turnstile";
import { getTrustedClientIdentity } from "@/security/client-ip";
import {
  DeploymentPolicyError,
  freeDistinctSiteLimit,
  isProtectedStagingPreview
} from "@/security/deployment-policy";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      url?: string;
      locale?: string;
      turnstileToken?: string;
      forceFresh?: boolean;
    };
    const locale = parseReportLocale(body.locale);
    if (!locale) throw new ScanInputError("scanFailed", "Locale must be either en or zh.");
    const stagingPreview = isProtectedStagingPreview();
    if (body.forceFresh === true && !stagingPreview) {
      return NextResponse.json(
        { error: "Forced regeneration is available only on the protected staging Preview.", errorKey: "forceFreshUnavailable" },
        { status: 403 }
      );
    }
    const idempotencyKey = request.headers.get("idempotency-key")?.trim() ?? "";
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) {
      throw new ScanInputError("scanFailed", "A valid Idempotency-Key header is required.");
    }
    const url = normalizeUrl(body.url);
    const siteKey = createSiteKey(url);
    const clientIdentity = getTrustedClientIdentity(request);
    const challenge = await verifyTurnstile({
      token: body.turnstileToken ?? "",
      remoteIp: clientIdentity.ipAddress
    });
    if (!challenge.success) {
      return NextResponse.json(
        { error: "Human verification is required.", errorKey: "humanVerificationRequired" },
        { status: 403 }
      );
    }

    const admission = await admitFreeScan({
      url,
      siteKey,
      locale,
      idempotencyKey,
      ipAddress: clientIdentity.ipAddress,
      forceFresh: body.forceFresh === true,
      stagingPreview,
      dailyDistinctSiteLimit: freeDistinctSiteLimit(),
      aiDailyLimit: freeAiDailyLimit()
    });
    if (admission.outcome === "rate_limited") {
      return NextResponse.json(
        {
          error: "The rolling 24-hour free preview limit has been reached.",
          errorKey: stagingPreview ? "stagingFreePreviewLimitReached" : "freePreviewLimitReached",
          retryAfter: admission.retryAfter.toISOString()
        },
        { status: 429, headers: { "x-ogc-client-ip-source": clientIdentity.source } }
      );
    }
    if (admission.outcome === "reused") {
      return NextResponse.json({
        reportId: admission.reportId,
        jobId: admission.jobId,
        tier: "free",
        status: "reused"
      });
    }
    if (admission.outcome === "active_regeneration") {
      return NextResponse.json({
        reportId: admission.reportId,
        activeReportId: admission.activeReportId,
        jobId: admission.jobId,
        tier: "free",
        status: "regenerating"
      }, { status: 202 });
    }
    return NextResponse.json({
      reportId: admission.reportId,
      jobId: admission.jobId,
      tier: "free",
      status: "queued",
      aiPreview: { granted: admission.aiEnabled }
    }, { status: 202 });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error(error);
    if (error instanceof ScanJobCapacityError) {
      return NextResponse.json(
        { error: error.message, errorKey: "stagingConcurrencyLimitReached" },
        { status: 429 }
      );
    }
    if (error instanceof DeploymentPolicyError) {
      return NextResponse.json(
        { error: "The deployment policy is not configured safely.", errorKey: "deploymentConfigurationInvalid" },
        { status: 500 }
      );
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to accept this website analysis.",
        errorKey: error instanceof ScanInputError ? error.errorKey : "scanFailed"
      },
      { status: 400 }
    );
  }
}

function freeAiDailyLimit(): number {
  const configured = Number(process.env.OGC_FREE_AI_DAILY_LIMIT ?? 50);
  return Number.isSafeInteger(configured) && configured >= 0 ? configured : 50;
}

function normalizeUrl(value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new ScanInputError("emptyUrl", "Enter a company website URL.");
  }
  const url = new URL(value.startsWith("http") ? value : `https://${value}`);
  if (!url || !["http:", "https:"].includes(url.protocol)) {
    throw new ScanInputError("unsupportedUrl", "Only HTTP and HTTPS URLs are supported.");
  }
  url.hash = "";
  return url.href;
}

class ScanInputError extends Error {
  constructor(
    public readonly errorKey: "emptyUrl" | "unsupportedUrl" | "scanFailed",
    message: string
  ) {
    super(message);
  }
}
