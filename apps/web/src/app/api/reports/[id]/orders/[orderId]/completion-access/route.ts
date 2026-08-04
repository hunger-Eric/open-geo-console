import { NextResponse } from "next/server";
import { getAnyActiveCombinedGeoReport } from "@/db/combined-reports";
import { getPaymentOrderForReport } from "@/db/commercial-orders";
import { getGeoReport } from "@/db/reports";
import { issueReportAccessToken } from "@/db/report-tokens";
import { reportAccessCookieName } from "@/server/report-access";
import {
  activeArtifactBelongsToPaymentOrder,
  paymentReturnAccessCookieName,
  requestHasPaymentReturnAccess
} from "@/server/payment-return-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string; orderId: string }> };

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const { id, orderId } = await context.params;
    if (!requestHasPaymentReturnAccess(request, { reportId: id, orderId })) return denied();
    const [order, report, active] = await Promise.all([
      getPaymentOrderForReport(orderId, id),
      getGeoReport(id),
      getAnyActiveCombinedGeoReport(id)
    ]);
    const deliverable = order?.fulfillmentStatus === "completed"
      || order?.fulfillmentStatus === "completed_limited";
    if (!order || order.paymentStatus !== "paid" || !deliverable
      || !report?.activeArtifactRevisionId || !active
      || active.artifactRevisionId !== report.activeArtifactRevisionId) return denied();
    if (!await activeArtifactBelongsToPaymentOrder({
      artifactRevisionId: active.artifactRevisionId,
      reportId: id,
      orderId
    })) return denied();

    const artifactScope = active.report.artifactContract;
    const access = await issueReportAccessToken({
      reportId: id,
      ttlDays: 30,
      idempotencyKey: `payment-return/${order.id}/${artifactScope}`,
      artifactScope
    });
    const destination = `/reports/${encodeURIComponent(id)}/report.html`;
    const response = NextResponse.json({ destination }, {
      headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" }
    });
    response.cookies.set(reportAccessCookieName(id, artifactScope), access.rawToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      expires: access.expiresAt
    });
    response.cookies.set(paymentReturnAccessCookieName(id), "", {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 0
    });
    return response;
  } catch {
    return denied();
  }
}

function denied(): Response {
  return NextResponse.json({ error: "Completion access unavailable." }, {
    status: 404,
    headers: { "cache-control": "no-store" }
  });
}
