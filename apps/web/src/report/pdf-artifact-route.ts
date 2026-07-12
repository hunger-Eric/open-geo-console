import "server-only";
import { NextResponse } from "next/server";
import type { ReportArtifactScope } from "@/db/schema";
import { loadPrivateReportArtifact } from "./artifact-model";
import { exportReportPdf } from "./pdf-export";
import {
  requestHasReportAccess,
  scopedReportAccessCookieHeader
} from "@/server/report-access";

export async function serveScopedReportPdf(input: {
  request: Request;
  reportId: string;
  artifactScope: ReportArtifactScope;
  htmlPath: string;
  filename: string;
  accessAlreadyVerified?: boolean;
}) {
  if (!input.accessAlreadyVerified && !await requestHasReportAccess(input.request, input.reportId, input.artifactScope)) {
    return denied();
  }
  const cookieHeader = scopedReportAccessCookieHeader(input.request, input.reportId, input.artifactScope);
  if (!cookieHeader) return denied();
  const model = await loadPrivateReportArtifact(input.reportId, input.artifactScope);
  if (!model || model.productContract !== input.artifactScope) return denied();
  try {
    const htmlUrl = new URL(input.htmlPath, input.request.url).href;
    const pdf = await exportReportPdf({ htmlUrl, cookieHeader });
    return new NextResponse(copyArrayBuffer(pdf), {
      headers: {
        "cache-control": "private, no-store, max-age=0",
        "content-disposition": `inline; filename="${input.filename}"`,
        "content-type": "application/pdf",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY"
      }
    });
  } catch (error) {
    console.error("PDF artifact export failed.", error instanceof Error ? error.message : "unknown_error");
    return NextResponse.json({ error: "PDF export is temporarily unavailable. The HTML report remains available." }, {
      status: 503,
      headers: { "cache-control": "private, no-store", "retry-after": "30" }
    });
  }
}

function copyArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function denied() {
  return NextResponse.json({ error: "Report artifact is unavailable." }, {
    status: 404,
    headers: { "cache-control": "private, no-store" }
  });
}
