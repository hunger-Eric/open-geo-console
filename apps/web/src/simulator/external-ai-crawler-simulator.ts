import { parseLogs } from "@open-geo-console/log-parser";
import {
  compareSimulatorAttemptsWithLogEntries,
  DEFAULT_SIMULATOR_TARGET,
  selectSimulatorBotProfiles
} from "./index";

const PLAN_PATH = "/llms.txt";
const RUN_MARKER_PARAM = "ogc_run";

export interface ExternalAiCrawlerSimulationAttempt {
  runId: string;
  operator: string;
  bot: string;
  path: string;
  url: string;
  userAgent: string;
}

export interface ExternalAiCrawlerSimulationPlan {
  runId: string;
  attempts: ExternalAiCrawlerSimulationAttempt[];
}

export interface ExternalAiCrawlerSimulationObservedMatch {
  runId: string;
  operator: string;
  bot: string;
  path: string;
  status: number;
  userAgent: string;
}

export interface ExternalAiCrawlerSimulationLogMatchResult {
  runId: string;
  attempted: ExternalAiCrawlerSimulationAttempt[];
  observed: ExternalAiCrawlerSimulationObservedMatch[];
  unobserved: ExternalAiCrawlerSimulationAttempt[];
}

export function createExternalAiCrawlerSimulationPlan(input: {
  baseUrl?: string;
  runId: string;
}): ExternalAiCrawlerSimulationPlan {
  const baseUrl = new URL(input.baseUrl ?? DEFAULT_SIMULATOR_TARGET);
  const attempts = selectSimulatorBotProfiles().map((profile) => {
    const url = new URL(PLAN_PATH, baseUrl);
    url.searchParams.set(RUN_MARKER_PARAM, input.runId);
    return {
      runId: input.runId,
      operator: profile.operator,
      bot: profile.bot,
      path: `${url.pathname}${url.search}`,
      url: url.toString(),
      userAgent: profile.userAgent
    };
  });

  return {
    runId: input.runId,
    attempts
  };
}

export function matchExternalAiCrawlerSimulationLogs(input: {
  runId: string;
  attempts: ExternalAiCrawlerSimulationAttempt[];
  logs: string;
}): ExternalAiCrawlerSimulationLogMatchResult {
  const comparisons = compareSimulatorAttemptsWithLogEntries(
    input.runId,
    input.attempts.map((attempt, index) => ({ ...attempt, id: `attempt-${index}` })),
    parseLogs(input.logs)
  );
  const observed = comparisons.flatMap(({ attempt, matches }) =>
    matches.map((entry) => ({
      runId: input.runId,
      operator: attempt.operator,
      bot: attempt.bot,
      path: entry.path,
      status: entry.status ?? 0,
      userAgent: entry.userAgent ?? attempt.userAgent
    }))
  );
  const unobserved = comparisons
    .filter((comparison) => !comparison.matched)
    .map(({ attempt }) => ({
      runId: attempt.runId,
      operator: attempt.operator,
      bot: attempt.bot,
      path: attempt.path,
      url: attempt.url,
      userAgent: attempt.userAgent
    }));

  return {
    runId: input.runId,
    attempted: input.attempts,
    observed,
    unobserved
  };
}
