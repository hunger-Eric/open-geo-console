import { NextResponse } from "next/server";
import { getEvidenceAsset } from "@/db/evidence-assets";
import { createEvidenceStorage } from "@/evidence/storage";
import { requestHasReportAccess } from "@/server/report-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string; assetId: string }> }) {
  const { id, assetId } = await context.params;
  if (!await requestHasReportAccess(request, id, "recommendation_forensics_v1")) return privateError();
  const asset = await getEvidenceAsset(id, assetId);
  if (!asset || asset.status !== "ready" || !asset.storageKey) return privateError();
  const object = await createEvidenceStorage().get(asset.storageKey);
  if (!object) return privateError();
  const body = new ArrayBuffer(object.body.byteLength);
  new Uint8Array(body).set(object.body);
  return new NextResponse(body, { headers: privateHeaders(object.contentType, object.body.byteLength) });
}

function privateError() {
  return NextResponse.json({ error: "Evidence asset is unavailable." }, { status: 404, headers: privateHeaders("application/json") });
}

function privateHeaders(contentType: string, length?: number) {
  const headers = new Headers({
    "cache-control": "private, no-store, max-age=0", "content-type": contentType,
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'", "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff", "x-frame-options": "DENY"
  });
  if (length !== undefined) headers.set("content-length", String(length));
  return headers;
}
