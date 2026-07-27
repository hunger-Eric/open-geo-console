import { and, desc, eq, gt, isNotNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { ensureDatabase, getDb, getSqlClient } from "./index";
import { crawlEvidence, type CrawlEvidenceRow } from "./schema";

export interface SaveCrawlEvidenceInput {
  reportId: string;
  jobId: string;
  url: string;
  canonicalUrl?: string;
  pageType?: string;
  fetchStatus: string;
  httpStatus?: number;
  contentHash?: string;
  normalizedContent?: string;
  evidenceExcerpts?: string[];
  fetchedAt?: Date;
}

export async function saveCrawlEvidence(input: SaveCrawlEvidenceInput): Promise<CrawlEvidenceRow> {
  await ensureDatabase();
  const fetchedAt = input.fetchedAt ?? new Date();
  const contentExpiresAt = new Date(fetchedAt.getTime() + 7 * 86_400_000);
  const values = {
    id: randomUUID(),
    reportId: input.reportId,
    jobId: input.jobId,
    url: input.url,
    canonicalUrl: input.canonicalUrl ?? null,
    pageType: input.pageType ?? null,
    fetchStatus: input.fetchStatus,
    httpStatus: input.httpStatus ?? null,
    contentHash: input.contentHash ?? null,
    normalizedContent: input.normalizedContent ?? null,
    evidenceExcerpts: input.evidenceExcerpts ?? [],
    fetchedAt,
    contentExpiresAt
  };
  const [row] = await getDb()
    .insert(crawlEvidence)
    .values(values)
    .onConflictDoUpdate({
      target: [crawlEvidence.jobId, crawlEvidence.url],
      set: {
        canonicalUrl: values.canonicalUrl,
        pageType: values.pageType,
        fetchStatus: values.fetchStatus,
        httpStatus: values.httpStatus,
        contentHash: values.contentHash,
        normalizedContent: values.normalizedContent,
        evidenceExcerpts: values.evidenceExcerpts,
        fetchedAt,
        contentExpiresAt
      }
    })
    .returning();
  return row;
}

export async function getCrawlEvidence(jobId: string, url: string): Promise<CrawlEvidenceRow | null> {
  await ensureDatabase();
  const [row] = await getDb()
    .select()
    .from(crawlEvidence)
    .where(and(eq(crawlEvidence.jobId, jobId), eq(crawlEvidence.url, url)))
    .limit(1);
  return row ?? null;
}

export async function getReusableCrawlEvidence(
  reportId: string,
  url: string,
  now = new Date()
): Promise<CrawlEvidenceRow | null> {
  await ensureDatabase();
  const [row] = await getDb()
    .select()
    .from(crawlEvidence)
    .where(
      and(
        eq(crawlEvidence.reportId, reportId),
        eq(crawlEvidence.url, url),
        gt(crawlEvidence.contentExpiresAt, now),
        isNotNull(crawlEvidence.normalizedContent)
      )
    )
    .orderBy(desc(crawlEvidence.fetchedAt))
    .limit(1);
  return row ?? null;
}

export async function purgeExpiredCrawlContent(now = new Date()): Promise<number> {
  await ensureDatabase();
  const rows = await getSqlClient()<{ id: string }[]>`
    UPDATE crawl_evidence
    SET normalized_content = NULL
    WHERE content_expires_at <= ${now.toISOString()} AND normalized_content IS NOT NULL
    RETURNING id
  `;
  return rows.length;
}
