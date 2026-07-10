import { auditSite } from "@open-geo-console/geo-auditor";
import { createSiteKey } from "@open-geo-console/site-crawler";
import { NextResponse } from "next/server";
import { enqueueScanJob, ScanJobCapacityError } from "@/db/jobs";
import { deleteGeoReport, saveGeoReport } from "@/db/reports";
import {
  attachFreeTrialJob,
  attachStagingFreeRegeneration,
  beginStagingFreeRegeneration,
  cancelStagingFreeRegeneration,
  claimFreeSiteTrial,
  completeStagingFreeRegenerationWithoutJob,
  getActiveFreeSiteTrial
} from "@/db/trials";
import { consumeFreeAiDailyBudget } from "@/db/commercial-budget";
import { hmacSecret, requireSecret } from "@/db/secrets";
import { parseReportLocale } from "@/server/report-locale";
import { createSafeFetch } from "@/server/safe-fetch";
import { verifyTurnstile } from "@/security/turnstile";
import { getTrustedClientIdentity } from "@/security/client-ip";
import {
  DeploymentPolicyError,
  freeDistinctSiteLimit,
  isProtectedStagingPreview
} from "@/security/deployment-policy";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let createdReportId: string | null = null;
  let regeneration: { siteKey: string; reservationId: string } | null = null;
  try {
    const body = (await request.json()) as { url?: string; locale?: string; turnstileToken?: string; forceFresh?: boolean };
    const locale = parseReportLocale(body.locale);
    if (!locale) throw new Error("Locale must be either en or zh.");
    const stagingPreview = isProtectedStagingPreview();
    if (body.forceFresh === true && !stagingPreview) {
      return NextResponse.json(
        { error: "Forced regeneration is available only on the protected staging Preview.", errorKey: "forceFreshUnavailable" },
        { status: 403 }
      );
    }
    const clientIdentity = getTrustedClientIdentity(request);
    const ipAddress = clientIdentity.ipAddress;
    const challenge = await verifyTurnstile({ token: body.turnstileToken ?? "", remoteIp: ipAddress });
    if (!challenge.success) {
      return NextResponse.json({ error: "Human verification is required.", errorKey: "humanVerificationRequired" }, { status: 403 });
    }
    const url = normalizeUrl(body.url);
    const submittedSiteKey = createSiteKey(url);
    const submittedExisting = await getActiveFreeSiteTrial(submittedSiteKey);
    if (submittedExisting && body.forceFresh !== true) return reusedTrialResponse(submittedExisting);
    if (submittedExisting && body.forceFresh === true) {
      const reservation = await beginStagingFreeRegeneration({ siteKey: submittedSiteKey });
      if (reservation.outcome === "active") return activeRegenerationResponse(reservation, submittedExisting.reportId);
      regeneration = { siteKey: submittedSiteKey, reservationId: reservation.reservationId };
    }
    const safeFetch = createSafeFetch();
    const preflight = await safeFetch(url, { headers: { "user-agent": "OpenGeoConsoleBot/1.0" } });
    const finalUrl = preflight.headers.get("x-ogc-final-url") ?? url;
    const siteKey = createSiteKey(finalUrl);
    if (siteKey !== submittedSiteKey) {
      const redirectedExisting = await getActiveFreeSiteTrial(siteKey);
      if (regeneration) {
        await cancelStagingFreeRegeneration(regeneration.siteKey, regeneration.reservationId);
        regeneration = null;
      }
      if (redirectedExisting && body.forceFresh !== true) return reusedTrialResponse(redirectedExisting);
      if (redirectedExisting && body.forceFresh === true) {
        const reservation = await beginStagingFreeRegeneration({ siteKey });
        if (reservation.outcome === "active") return activeRegenerationResponse(reservation, redirectedExisting.reportId);
        regeneration = { siteKey, reservationId: reservation.reservationId };
      }
    }
    const report = await auditSite(finalUrl, { fetchImpl: safeFetch, pageLimit: 1 });
    const saved = await saveGeoReport(finalUrl, report, siteKey, undefined, locale);
    createdReportId = saved.id;
    if (!regeneration) {
      const claim = await claimFreeSiteTrial({
        siteKey,
        reportId: saved.id,
        ipAddress,
        dailyDistinctSiteLimit: freeDistinctSiteLimit()
      });
      if (claim.outcome !== "created") {
        await deleteGeoReport(saved.id);
        createdReportId = null;
        if (claim.outcome === "rate_limited") {
          return NextResponse.json(
            {
              error: "The rolling 24-hour free preview limit has been reached.",
              errorKey: stagingPreview ? "stagingFreePreviewLimitReached" : "freePreviewLimitReached",
              retryAfter: claim.retryAfter.toISOString()
            },
            { status: 429, headers: { "x-ogc-client-ip-source": clientIdentity.source } }
          );
        }
        return reusedTrialResponse(claim);
      }
    }

    const aiBudget = await consumeFreeAiDailyBudget({
      idempotencyHmac: hmacSecret(`free-ai:${saved.id}`, requireSecret("OGC_IP_HASH_SECRET")),
      limit: freeAiDailyLimit()
    });
    if (!aiBudget.granted) {
      if (regeneration) {
        const completed = await completeStagingFreeRegenerationWithoutJob({
          siteKey: regeneration.siteKey,
          reservationId: regeneration.reservationId,
          reportId: saved.id
        });
        if (!completed) throw new Error("The staging regeneration reservation was lost.");
        regeneration = null;
      }
      createdReportId = null;
      return NextResponse.json({
        reportId: saved.id,
        jobId: null,
        tier: "free",
        status: "technical_only",
        aiPreview: aiBudget
      }, { status: 200 });
    }

    const job: Awaited<ReturnType<typeof enqueueScanJob>> = await enqueueScanJob({
      reportId: saved.id,
      tier: "free",
      locale,
      ...(regeneration ? { reason: "staging_regeneration" as const } : {}),
      ...(stagingPreview ? { maxActiveTierJobs: 2 } : {})
    });
    const attached = regeneration
      ? await attachStagingFreeRegeneration({
          siteKey: regeneration.siteKey,
          reservationId: regeneration.reservationId,
          reportId: saved.id,
          jobId: job.id
        })
      : await attachFreeTrialJob(siteKey, saved.id, job.id);
    if (!attached) throw new Error("The free preview could not be attached to its report.");

    createdReportId = null;
    return NextResponse.json({
      reportId: saved.id,
      jobId: job.id,
      tier: "free",
      status: "queued"
    }, { status: 202 });
  } catch (error) {
    await Promise.allSettled([
      ...(regeneration ? [cancelStagingFreeRegeneration(regeneration.siteKey, regeneration.reservationId)] : []),
      ...(createdReportId ? [deleteGeoReport(createdReportId)] : [])
    ]);
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

function activeRegenerationResponse(
  regeneration: { reportId: string | null; jobId: string | null },
  activeReportId: string
) {
  return NextResponse.json({
    reportId: regeneration.reportId ?? activeReportId,
    activeReportId,
    jobId: regeneration.jobId,
    tier: "free",
    status: "regenerating"
  }, { status: 202 });
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
