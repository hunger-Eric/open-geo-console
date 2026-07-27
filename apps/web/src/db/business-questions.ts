import { createHash } from "node:crypto";
import {
  BUSINESS_QUESTION_NEUTRALIZATION_VERSION,
  BUSINESS_QUESTION_SET_VERSION,
  confirmBusinessQuestionSet,
  generateBusinessQuestionCandidates,
  type BusinessQuestionCandidateSet,
  type ConfirmedBusinessQuestionSet
} from "@open-geo-console/public-search-observer";
import type { AiWebsiteReportV1 } from "@open-geo-console/ai-report-engine";
import { and, desc, eq } from "drizzle-orm";
import { ensureDatabase, getDb, getSqlClient } from "./index";
import { getAiReport } from "./ai-reports";
import { getGeoReport } from "./reports";
import { reportBusinessQuestions, reportBusinessQuestionSets } from "./schema";

export async function prepareBusinessQuestionCandidates(input: {
  reportId: string;
  locale?: string;
  region?: string;
  revision?: number;
  foundation?: AiWebsiteReportV1;
}): Promise<BusinessQuestionCandidateSet> {
  await ensureDatabase();
  const existing = await getLatestBusinessQuestionSet(input.reportId);
  if (existing && (!input.revision || existing.revision === input.revision)) return existing as BusinessQuestionCandidateSet;
  const report = await getGeoReport(input.reportId);
  if (!report) throw new Error("Report not found.");
  const foundation = input.foundation ?? await loadQuestionFoundation(input.reportId);
  const profile = foundation.organizationProfile;
  const locale = input.locale?.trim() || process.env.OGC_PUBLIC_SEARCH_LOCALE?.trim() || report.reportLocale || "en";
  const region = input.region?.trim() || process.env.OGC_PUBLIC_SEARCH_REGION?.trim() || "global";
  const revision = input.revision ?? ((existing?.revision ?? 0) + 1);
  const candidates = generateBusinessQuestionCandidates({
    locale,
    region,
    revision,
    profile: {
      organizationName: profile.organizationName,
      brandNames: profile.brandNames,
      legalEntity: profile.legalEntity,
      domain: new URL(report.url).hostname,
      businessModel: profile.businessModel,
      productsAndServices: profile.productsAndServices,
      capabilities: profile.capabilities?.length
        ? profile.capabilities
        : [profile.businessModel, ...profile.productsAndServices].filter((value): value is string => Boolean(value?.trim())),
      targetAudiences: profile.targetAudiences,
      marketsAndRegions: profile.marketsAndRegions,
      summary: profile.summary,
      confidence: profile.confidence,
      evidence: profile.evidence
    }
  });
  await getDb().transaction(async (tx) => {
    await tx.insert(reportBusinessQuestionSets).values({
      id: candidates.id,
      reportId: input.reportId,
      revision: candidates.revision,
      locale: candidates.locale,
      region: candidates.region,
      status: "candidate",
      confidence: candidates.confidence,
      generationRuleVersion: BUSINESS_QUESTION_SET_VERSION,
      neutralizationVersion: BUSINESS_QUESTION_NEUTRALIZATION_VERSION,
      profileEvidenceIdentity: candidates.profileEvidenceIdentity,
      payload: candidates
    }).onConflictDoNothing();
    await tx.insert(reportBusinessQuestions).values(candidates.questions.map((question, index) => ({
      id: `${candidates.id}:${index + 1}`,
      questionSetId: candidates.id,
      ordinal: index + 1,
      purpose: question.purpose,
      generatedText: question.generatedText,
      neutralPublicText: question.neutralPublicText,
      neutralContentHash: sha(question.neutralPublicText),
      derivation: {
        evidenceUrls: question.evidenceUrls,
        service: question.service,
        audience: question.audience,
        marketRegion: question.marketRegion
      }
    }))).onConflictDoNothing();
  });
  return candidates;
}

export async function confirmBusinessQuestions(input: {
  reportId: string;
  questionSetId: string;
  finalTexts: readonly string[];
  acknowledgedLowConfidence: boolean;
}): Promise<ConfirmedBusinessQuestionSet> {
  await ensureDatabase();
  const outcome = await getSqlClient().begin(async (tx) => {
    const rows = await tx<Array<{ status: string; payload: BusinessQuestionCandidateSet | ConfirmedBusinessQuestionSet }>>`
      SELECT status,payload FROM report_business_question_sets
      WHERE id=${input.questionSetId} AND report_id=${input.reportId} FOR UPDATE`;
    const row = rows[0];
    if (!row?.payload) throw new Error("Business question set not found.");
    if (row.status === "locked") throw new Error("Paid business questions are permanently locked.");
    if (row.status !== "candidate" && row.status !== "confirmed") throw new Error("Business questions are not correctable in their current state.");
    let confirmed: ConfirmedBusinessQuestionSet;
    try {
      confirmed = confirmBusinessQuestionSet({
        candidates: row.payload as BusinessQuestionCandidateSet,
        finalTexts: input.finalTexts,
        acknowledgedLowConfidence: input.acknowledgedLowConfidence,
        confirmedAt: new Date().toISOString()
      });
    } catch (error) {
      if (error instanceof TypeError && error.message.includes("neutralized")) {
        await tx`UPDATE report_business_question_sets SET status='neutralization_failed',updated_at=now() WHERE id=${input.questionSetId}`;
        return { neutralizationError: error.message } as const;
      }
      throw error;
    }
    for (const [index, question] of confirmed.questions.entries()) {
      await tx`UPDATE report_business_questions SET private_text=${question.privateText},
        neutral_public_text=${question.neutralPublicText},edited=${question.edited},
        neutral_content_hash=${question.neutralContentHash}
        WHERE question_set_id=${input.questionSetId} AND ordinal=${index + 1}`;
    }
    await tx`UPDATE report_business_question_sets SET status='confirmed',
      acknowledged_low_confidence=${confirmed.acknowledgedLowConfidence},content_hash=${confirmed.contentHash},
      neutral_content_hash=${sha(confirmed.questions.map(({ neutralContentHash }) => neutralContentHash).join("|"))},
      payload=${JSON.stringify(confirmed)}::jsonb,confirmed_at=${confirmed.confirmedAt},updated_at=now()
      WHERE id=${input.questionSetId}`;
    return { confirmed } as const;
  });
  if ("neutralizationError" in outcome) throw new TypeError(outcome.neutralizationError);
  return outcome.confirmed;
}

export async function getBusinessQuestionSet(reportId: string, id: string): Promise<BusinessQuestionCandidateSet | ConfirmedBusinessQuestionSet | null> {
  await ensureDatabase();
  const [row] = await getDb().select({ payload: reportBusinessQuestionSets.payload }).from(reportBusinessQuestionSets)
    .where(and(eq(reportBusinessQuestionSets.reportId, reportId), eq(reportBusinessQuestionSets.id, id))).limit(1);
  return row?.payload ?? null;
}

export async function getConfirmedBusinessQuestionSet(reportId: string, id: string): Promise<ConfirmedBusinessQuestionSet | null> {
  await ensureDatabase();
  const rows = await getSqlClient()<Array<{ status: string; payload: ConfirmedBusinessQuestionSet }>>`
    SELECT status,payload FROM report_business_question_sets
    WHERE report_id=${reportId} AND id=${id} AND status IN ('confirmed','locked') LIMIT 1`;
  const row = rows[0];
  return row?.payload?.confirmedAt && row.payload.questions?.length === 3 ? row.payload : null;
}

export async function getLatestBusinessQuestionSet(reportId: string): Promise<(BusinessQuestionCandidateSet | ConfirmedBusinessQuestionSet) | null> {
  await ensureDatabase();
  const [row] = await getDb().select({ payload: reportBusinessQuestionSets.payload }).from(reportBusinessQuestionSets)
    .where(eq(reportBusinessQuestionSets.reportId, reportId)).orderBy(desc(reportBusinessQuestionSets.revision)).limit(1);
  return row?.payload ?? null;
}

async function loadQuestionFoundation(reportId: string): Promise<AiWebsiteReportV1> {
  const deep = await getAiReport(reportId, "deep", "recommendation_forensics_v1");
  const free = await getAiReport(reportId, "free", "legacy_website_audit_v1");
  const foundation = deep?.payload ?? free?.payload;
  if (!foundation) throw new Error("A completed website profile is required before business questions can be prepared.");
  return foundation;
}

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
