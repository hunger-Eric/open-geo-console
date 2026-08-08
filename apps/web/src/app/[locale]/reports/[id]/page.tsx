import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ReportView } from "@/components/report-view";
import { PendingReportView } from "@/components/pending-report-view";
import { StoredReportFallback } from "@/components/stored-report-fallback";
import { CommercialCheckout } from "@/components/commercial-checkout";
import { CombinedGeoReportV4Teaser } from "@/components/combined-geo-report-v4-teaser";
import { PaymentReturnBanner } from "@/components/payment-return-banner";
import { getBotEvidence } from "@/db/bot-evidence";
import { getGeoReport } from "@/db/reports";
import { getAnyActiveCombinedGeoReport } from "@/db/combined-reports";
import { getDictionary, getLocaleAlternates, isLocale, type Locale } from "@/i18n";
import { getVisibleReportBundle } from "@/server/visible-ai-report";
import { cookies } from "next/headers";
import { reportAccessCookieName, tokenGrantsReportAccess } from "@/server/report-access";
import { getReportV4PreAdmissionJob } from "@/db/report-v4-admission-jobs";
import { readFreeDirectSemanticsVersion, readSemanticReviewContractVersion } from "@/db/report-semantic-review-activation";
import {
  freeTeaserCheckpointFromJobCheckpoint,
  parseReadyFreeTeaserCheckpoint
} from "@/worker/report-v4-free-teaser";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params
}: {
  params: Promise<{ id: string; locale: string }>;
}): Promise<Metadata> {
  const { id, locale } = await params;
  return isLocale(locale) ? { alternates: getLocaleAlternates(locale, `/reports/${id}`) } : {};
}

export default async function ReportPage({
  params
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) {
    notFound();
  }

  const row = await getGeoReport(id);
  const locale: Locale = rawLocale;
  if (!row) {
    return <StoredReportFallback dictionary={getDictionary(locale)} locale={locale} reportId={id} section="overview" />;
  }
  const reportLocale: Locale = row.reportLocale ?? locale;
  if (row.activeArtifactRevisionId) {
    const active=await getAnyActiveCombinedGeoReport(id);
    if(!active) notFound();
    const scope=active.report.artifactContract;
    const token=(await cookies()).get(reportAccessCookieName(id,scope))?.value;
    if(!await tokenGrantsReportAccess(token,id,scope)) notFound();
  }
  if (!row.payload) {
    return (
      <PendingReportView
        createdAt={row.createdAt}
        dictionary={getDictionary(locale)}
        locale={locale}
        reportId={id}
        reportLocale={reportLocale}
        url={row.url}
      />
    );
  }

  const [evidence, visible] = await Promise.all([getBotEvidence(id), getVisibleReportBundle(id, row.payload)]);

  if (!row.activeArtifactRevisionId && visible.tier === "free") {
    const preAdmissionJob = await getReportV4PreAdmissionJob(id);
    if (preAdmissionJob) {
      const checkpoint = freeTeaserCheckpointFromJobCheckpoint(preAdmissionJob.checkpoint);
      const semanticReviewContractVersion = readSemanticReviewContractVersion(preAdmissionJob.checkpoint);
      const freeDirectSemanticsVersion = readFreeDirectSemanticsVersion(preAdmissionJob.checkpoint);
      const markerPresent = semanticReviewContractVersion !== null || freeDirectSemanticsVersion !== null;
      const carrierOptions = freeDirectSemanticsVersion
        ? { freeDirectSemanticsVersion }
        : semanticReviewContractVersion
          ? { semanticReviewContractVersion }
          : undefined;
      let ready = null;
      try {
        ready = checkpoint
          ? parseReadyFreeTeaserCheckpoint(
              checkpoint,
              carrierOptions
            )
          : null;
      } catch {
        ready = null;
      }
      const canRenderTeaser = Boolean(ready && visible.aiReport && (
        markerPresent
          ? (freeDirectSemanticsVersion ? ready.q1AnswerDraft : ready.reviewedFoundation && ready.q1AnswerCard)
          : ready.reviewedFoundation
      ));
      if (!markerPresent && !canRenderTeaser) {
        // Marker-absent: preserve the original free-teaser readiness seam.
        return <PendingReportView
          createdAt={row.createdAt}
          dictionary={getDictionary(locale)}
          locale={locale}
          reportId={id}
          reportLocale={reportLocale}
          url={row.url}
        />;
      }
      if (canRenderTeaser && ready) {
        const dictionary = getDictionary(locale);
        return <>
          <CombinedGeoReportV4Teaser model={{
            reportId: id,
            targetUrl: row.url,
            locale: reportLocale === "zh" ? "zh" : "en",
            generatedAt: ready.readyAt!,
            technicalReport: {
              score: visible.technicalReport.score,
              findings: visible.technicalReport.findings
            },
            aiReport: freeDirectSemanticsVersion ? visible.aiReport! : ready.reviewedFoundation!,
            freeQuestion: ready.freeQuestion ?? ready.directQuestionTexts?.[0] ?? ready.q1AnswerDraft?.exactQuestion ?? ready.q1AnswerCard!.exactQuestion,
            q1AnswerCard: freeDirectSemanticsVersion ? ready.q1AnswerDraft! : ready.q1AnswerCard!,
            ...(freeDirectSemanticsVersion
              ? {
                  directAnalysisStatus: ready.directAnalysisStatus!,
                  directAnalysis: ready.directAnalysis ?? null
                }
              : {
                  brandMentionCount: ready.metrics!.brandMentionCount,
                  competitorMentionCount: ready.metrics!.competitorMentionCount
                })
          }}/>
          <div id="checkout" className="mx-auto w-full max-w-[1120px] px-5 pb-12">
            <Suspense fallback={null}>
              <PaymentReturnBanner dictionary={dictionary} reportId={id} />
            </Suspense>
            <CommercialCheckout dictionary={dictionary} locale={reportLocale} reportId={id} />
          </div>
        </>;
      }
      // Marker-present terminal failures fall through to ReportView so the
      // already persisted technical and Free AI reports remain visible.
    }
  }
  return (
    <ReportView
      aiReport={visible.aiReport}
      htmlEnabled={visible.canAccessHtmlArtifact}
      dictionary={getDictionary(locale)}
      evidence={evidence?.summary ?? null}
      locale={locale}
      report={visible.technicalReport}
      reportId={id}
      reportLocale={reportLocale}
      reportTier={visible.tier}
    />
  );
}
