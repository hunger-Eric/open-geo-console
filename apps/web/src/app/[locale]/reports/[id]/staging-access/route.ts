import { NextResponse } from "next/server";
import { getPaymentOrder, productContractForCode } from "@/db/commercial-orders";
import { issueReportAccessToken } from "@/db/report-tokens";
import { getGeoReport } from "@/db/reports";
import { getActiveCombinedGeoReport } from "@/db/combined-reports";
import { reportAccessCookieName } from "@/server/report-access";

type RouteContext = { params: Promise<{ locale: string; id: string }> };

export async function GET(request: Request, context: RouteContext) {
  if (process.env.OGC_DEPLOYMENT_PROFILE !== "staging" || process.env.COMMERCE_MODE !== "test") {
    return new NextResponse(null, { status: 404 });
  }
  const { id } = await context.params;
  const orderId = new URL(request.url).searchParams.get("order") ?? "";
  const [order, report, active] = await Promise.all([getPaymentOrder(orderId), getGeoReport(id), getActiveCombinedGeoReport(id)]);
  const isDeliverable = order?.fulfillmentStatus === "completed"
    || order?.fulfillmentStatus === "completed_limited";
  if (!order || !report?.reportLocale || order.reportId !== id
    || order.paymentStatus !== "paid" || !isDeliverable) {
    return new NextResponse(null, { status: 404 });
  }

  const artifactScope = report.activeArtifactRevisionId ? active?.report.artifactContract : productContractForCode(order.productCode);
  if (!artifactScope) return new NextResponse(null, { status: 404 });
  const access = await issueReportAccessToken({
    reportId: id,
    ttlDays: 1,
    idempotencyKey: `staging-operator-preview/${order.id}/${artifactScope}`,
    artifactScope
  });
  const destination = artifactScope === "recommendation_forensics_v1" || artifactScope === "combined_geo_report_v1" || artifactScope === "combined_geo_report_v2"
    ? new URL(`/reports/${id}/report.html`, request.url)
    : new URL(`/${report.reportLocale}/reports/${id}/analysis`, request.url);
  const response = NextResponse.redirect(destination, 303);
  response.cookies.set(reportAccessCookieName(id, artifactScope), access.rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    expires: access.expiresAt
  });
  response.headers.set("cache-control", "no-store");
  response.headers.set("referrer-policy", "no-referrer");
  return response;
}
