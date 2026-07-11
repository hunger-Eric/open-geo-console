import { and, asc, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { ensureDatabase, getDb } from "./index";
import {
  reportEvidenceAssets,
  type EvidenceAssetKind,
  type EvidenceAssetStatus,
  type ReportEvidenceAssetRow
} from "./schema";

export interface SaveEvidenceAssetInput {
  reportId: string;
  jobId: string;
  findingId: string;
  citationIndex: number;
  kind: EvidenceAssetKind;
  status: EvidenceAssetStatus;
  sourceUrl: string;
  quote: string;
  pageElement?: string;
  capturedAt: Date;
  viewportWidth: number;
  viewportHeight: number;
  contentHash: string;
  evidenceHash: string;
  assetHash?: string;
  storageProvider?: "filesystem" | "s3";
  storageKey?: string;
  mimeType?: string;
  byteSize?: number;
  failureCode?: string;
}

export function evidenceAssetId(input: Pick<SaveEvidenceAssetInput, "jobId" | "findingId" | "citationIndex" | "kind">): string {
  return createHash("sha256")
    .update(`${input.jobId}\0${input.findingId}\0${input.citationIndex}\0${input.kind}`)
    .digest("hex")
    .slice(0, 40);
}

export async function saveEvidenceAsset(input: SaveEvidenceAssetInput): Promise<ReportEvidenceAssetRow> {
  await ensureDatabase();
  const now = new Date();
  const values = {
    id: evidenceAssetId(input),
    ...input,
    pageElement: input.pageElement ?? null,
    assetHash: input.assetHash ?? null,
    storageProvider: input.storageProvider ?? null,
    storageKey: input.storageKey ?? null,
    mimeType: input.mimeType ?? null,
    byteSize: input.byteSize ?? null,
    failureCode: input.failureCode ?? null,
    updatedAt: now
  };
  const [row] = await getDb().insert(reportEvidenceAssets).values(values).onConflictDoUpdate({
    target: [
      reportEvidenceAssets.jobId,
      reportEvidenceAssets.findingId,
      reportEvidenceAssets.citationIndex,
      reportEvidenceAssets.kind
    ],
    set: {
      status: values.status,
      sourceUrl: values.sourceUrl,
      quote: values.quote,
      pageElement: values.pageElement,
      capturedAt: values.capturedAt,
      viewportWidth: values.viewportWidth,
      viewportHeight: values.viewportHeight,
      contentHash: values.contentHash,
      evidenceHash: values.evidenceHash,
      assetHash: values.assetHash,
      storageProvider: values.storageProvider,
      storageKey: values.storageKey,
      mimeType: values.mimeType,
      byteSize: values.byteSize,
      failureCode: values.failureCode,
      updatedAt: now
    }
  }).returning();
  return row;
}

export async function listEvidenceAssets(reportId: string, jobId?: string): Promise<ReportEvidenceAssetRow[]> {
  await ensureDatabase();
  return getDb().select().from(reportEvidenceAssets)
    .where(jobId
      ? and(eq(reportEvidenceAssets.reportId, reportId), eq(reportEvidenceAssets.jobId, jobId))
      : eq(reportEvidenceAssets.reportId, reportId))
    .orderBy(asc(reportEvidenceAssets.findingId), asc(reportEvidenceAssets.citationIndex));
}

export async function getEvidenceAsset(reportId: string, assetId: string): Promise<ReportEvidenceAssetRow | null> {
  await ensureDatabase();
  const [row] = await getDb().select().from(reportEvidenceAssets)
    .where(and(eq(reportEvidenceAssets.reportId, reportId), eq(reportEvidenceAssets.id, assetId)))
    .limit(1);
  return row ?? null;
}
