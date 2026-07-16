import { NextResponse } from "next/server";
import { getEvidenceAsset } from "@/db/evidence-assets";
import { createEvidenceStorage } from "@/evidence/storage";
import { requestHasReportAccess } from "@/server/report-access";
import { getActiveCombinedGeoReport } from "@/db/combined-reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string; assetId: string }> }) {
  const { id, assetId } = await context.params;
  const legacyAccess=await requestHasReportAccess(request,id,"legacy_website_audit_v1");
  const active=legacyAccess?null:await getActiveCombinedGeoReport(id);
  const combinedAccess=Boolean(active&&await requestHasReportAccess(request,id,active.report.artifactContract));
  if(!legacyAccess&&!combinedAccess)return privateError(404);
  const asset = await getEvidenceAsset(id, assetId);
  if(combinedAccess&&(!active||!asset||![active.report.originalPaidJobId,active.report.jobId].includes(asset.jobId)))return privateError(404);
  if (!asset || asset.status !== "ready" || !asset.storageKey) return privateError(404);
  const object = await createEvidenceStorage().get(asset.storageKey);
  if (!object) return privateError(404);
  return new NextResponse(copyArrayBuffer(object.body), {
    headers: privateHeaders(object.contentType, object.body.byteLength)
  });
}

function copyArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function privateError(status: number) {
  return NextResponse.json({ error: "Evidence asset is unavailable." }, { status, headers: privateHeaders("application/json") });
}

function privateHeaders(contentType: string, length?: number) {
  const headers = new Headers({
    "cache-control": "private, no-store, max-age=0",
    "content-type": contentType,
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY"
  });
  if (length !== undefined) headers.set("content-length", String(length));
  return headers;
}
