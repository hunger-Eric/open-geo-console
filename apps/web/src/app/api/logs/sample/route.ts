import { analyzeLogs, recommendedNginxLogFormat } from "@open-geo-console/log-parser";
import { NextResponse } from "next/server";
import { sampleCrawlerLog } from "@/data/sample-log";

export async function GET() {
  return NextResponse.json({
    input: sampleCrawlerLog,
    result: analyzeLogs(sampleCrawlerLog),
    recommendedNginxLogFormat
  });
}
