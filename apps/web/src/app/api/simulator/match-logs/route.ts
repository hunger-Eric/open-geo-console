import { NextResponse } from "next/server";
import {
  analyzeSimulatorLogs,
  isNetworkFailure,
  maybeRunSimulatorMatcher,
  SimulatorInputError,
  type MatchLogsRequest
} from "../_lib/simulator-api";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as MatchLogsRequest;
    const parsed = analyzeSimulatorLogs(body);
    const simulatorComparison = await maybeRunSimulatorMatcher({
      runId: parsed.comparison.runId,
      attempted: parsed.attempted,
      logInput: body.logInput ?? "",
      analysis: parsed.analysis,
      entries: parsed.entries
    });

    return NextResponse.json({
      runId: parsed.comparison.runId,
      analysis: parsed.analysis,
      comparison: parsed.comparison,
      simulatorComparison
    });
  } catch (error) {
    if (error instanceof SimulatorInputError) {
      return jsonError(error.code, error.message, 400);
    }
    if (isNetworkFailure(error)) {
      return jsonError("simulator_match_network_failure", errorMessage(error), 502);
    }
    return jsonError("simulator_match_failed", errorMessage(error), 500);
  }
}

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Simulator log matching failed.";
}
