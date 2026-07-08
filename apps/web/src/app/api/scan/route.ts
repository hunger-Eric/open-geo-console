import { auditSite } from "@open-geo-console/geo-auditor";
import { NextResponse } from "next/server";
import { saveGeoReport } from "@/db/reports";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: string };
    const url = normalizeUrl(body.url);
    const report = await auditSite(url);
    const saved = await saveGeoReport(url, report);

    return NextResponse.json({
      id: saved.id,
      url: saved.url,
      score: saved.score,
      report
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to scan this website.",
        errorKey:
          error instanceof ScanInputError
            ? error.errorKey
            : "scanFailed"
      },
      { status: 400 }
    );
  }
}

function normalizeUrl(value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new ScanInputError("emptyUrl", "Enter a company website URL.");
  }

  const url = new URL(value.startsWith("http") ? value : `https://${value}`);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new ScanInputError("unsupportedUrl", "Only HTTP and HTTPS URLs are supported.");
  }
  url.hash = "";
  return url.href;
}

class ScanInputError extends Error {
  constructor(
    public readonly errorKey: "emptyUrl" | "unsupportedUrl",
    message: string
  ) {
    super(message);
  }
}
