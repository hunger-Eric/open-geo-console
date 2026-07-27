import {NextResponse} from "next/server";
import {runStagingProviderProbe} from "@/commerce/staging-provider-probe";
import {assertProtectedStagingCommercePreview} from "@/security/deployment-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACCEPTANCE_PROBE = {
  paymentIntentId: "int_hkdmp9krrhkepyhp2bz",
  orderId: "d738b38f-63cb-4886-bdda-c8f745bf5b81"
} as const;

export async function POST(): Promise<Response> {
  try {
    assertProtectedStagingCommercePreview();
  } catch {
    return new NextResponse(null, {status: 404});
  }

  try {
    const result = await runStagingProviderProbe(ACCEPTANCE_PROBE);
    return NextResponse.json(result, {headers: {"cache-control": "no-store"}});
  } catch {
    return NextResponse.json(
      {error: "staging_provider_probe_unavailable"},
      {status: 503, headers: {"cache-control": "no-store"}}
    );
  }
}
