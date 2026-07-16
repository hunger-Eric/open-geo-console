import {
  isSimulatorMatchResponse,
  isSimulatorRunResponse,
  type SimulatorMatchRequest,
  type SimulatorMatchResponse,
  type SimulatorRunRequest,
  type SimulatorRunResponse
} from "./contracts";

const SIMULATOR_API_TIMEOUT_MS = 20_000;

export class SimulatorClientError extends Error {
  constructor(public readonly code: "invalid_response" | "request_failed") {
    super(code);
  }
}

export function requestSimulatorRun(
  input: SimulatorRunRequest,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<SimulatorRunResponse> {
  return postSimulatorJson("/api/simulator/runs", input, isSimulatorRunResponse, fetchImpl);
}

export function requestSimulatorMatch(
  input: SimulatorMatchRequest,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<SimulatorMatchResponse> {
  return postSimulatorJson("/api/simulator/match-logs", input, isSimulatorMatchResponse, fetchImpl);
}

async function postSimulatorJson<TResponse>(
  url: string,
  body: SimulatorRunRequest | SimulatorMatchRequest,
  isResponse: (value: unknown) => value is TResponse,
  fetchImpl: typeof fetch
): Promise<TResponse> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), SIMULATOR_API_TIMEOUT_MS);

  try {
    const response = await fetchImpl(url, {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal: controller.signal
    });
    if (!response.ok) {
      throw new SimulatorClientError("request_failed");
    }
    const value: unknown = await response.json();
    if (!isResponse(value)) {
      throw new SimulatorClientError("invalid_response");
    }

    return value;
  } catch (error) {
    if (error instanceof SimulatorClientError) {
      throw error;
    }
    throw new SimulatorClientError("request_failed");
  } finally {
    globalThis.clearTimeout(timeout);
  }
}
