import { NextResponse } from "next/server";
import { runCommercialOperations } from "@/commerce/run-operations";
import { ensureDatabase, getDatabaseEnvironmentStatus } from "@/db";
import { assertProtectedStagingCommercePreview } from "@/security/deployment-policy";
import { prepareStagingCommand } from "@/scripts/staging-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  try {
    assertProtectedStagingCommercePreview();
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  try {
    await prepareStagingCommand({ ensureDatabase, getDatabaseStatus: getDatabaseEnvironmentStatus });
    const output = await runCommercialOperations("all");
    return NextResponse.json({ profile: "staging", output }, {
      headers: { "cache-control": "no-store" }
    });
  } catch {
    return NextResponse.json({ error: "staging_commerce_unavailable" }, {
      status: 503,
      headers: { "cache-control": "no-store" }
    });
  }
}
