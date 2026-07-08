import { NextResponse } from "next/server";
import {
  isNetworkFailure,
  runSimulator,
  SimulatorEngineUnavailableError,
  SimulatorInputError,
  type SimulatorRunRequest
} from "../_lib/simulator-api";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SimulatorRunRequest;
    const result = await runSimulator(body);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof SimulatorInputError) {
      return jsonError(error.code, error.message, 400);
    }
    if (error instanceof SimulatorEngineUnavailableError) {
      return jsonError(error.code, error.message, 503);
    }
    if (isNetworkFailure(error)) {
      return jsonError("simulator_network_failure", errorMessage(error), 502);
    }
    return jsonError("simulator_run_failed", errorMessage(error), 500);
  }
}

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Simulator run failed.";
}
