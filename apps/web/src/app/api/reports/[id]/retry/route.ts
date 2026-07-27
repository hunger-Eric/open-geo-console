import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "Manual checkpoint retry is deprecated. Recoverable work is retried automatically; start a new analysis after a final unavailable result."
    },
    { status: 410 }
  );
}
