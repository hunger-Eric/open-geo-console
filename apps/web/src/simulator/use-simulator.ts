"use client";

import { useState } from "react";
import { requestSimulatorMatch, requestSimulatorRun, SimulatorClientError } from "./client";
import type { SimulatorComparisonResult, SimulatorRunResponse } from "./contracts";

interface SimulatorErrorMessages {
  invalidRun: string;
  runFailed: string;
  matchFailed: string;
}

export function useSimulator({
  errors,
  sourceUrl
}: {
  errors: SimulatorErrorMessages;
  sourceUrl: string;
}) {
  const [run, setRun] = useState<SimulatorRunResponse | null>(null);
  const [comparison, setComparison] = useState<SimulatorComparisonResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isMatching, setIsMatching] = useState(false);

  async function runSimulator() {
    setIsRunning(true);
    setError(null);
    setComparison(null);

    try {
      setRun(await requestSimulatorRun({ sourceUrl }));
    } catch (requestError) {
      setError(
        requestError instanceof SimulatorClientError && requestError.code === "invalid_response"
          ? errors.invalidRun
          : errors.runFailed
      );
    } finally {
      setIsRunning(false);
    }
  }

  async function compareLogs(logInput: string) {
    if (!run) {
      return;
    }

    setIsMatching(true);
    setError(null);
    try {
      const response = await requestSimulatorMatch({
        attempted: run.attempted,
        logInput,
        runId: run.runId
      });
      setComparison(response.comparison);
    } catch {
      setError(errors.matchFailed);
    } finally {
      setIsMatching(false);
    }
  }

  function clearComparison() {
    setComparison(null);
    setError(null);
  }

  return {
    clearComparison,
    compareLogs,
    comparison,
    error,
    isMatching,
    isRunning,
    run,
    runSimulator,
    setError
  };
}
