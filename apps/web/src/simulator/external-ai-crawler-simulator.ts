import { matchUserAgent } from "@open-geo-console/crawler-rules";
import { parseLogs } from "@open-geo-console/log-parser";
import { DEFAULT_SIMULATOR_TARGET, selectSimulatorBotProfiles } from "./index";

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
  const observed = parseLogs(input.logs).flatMap((entry) => {
    const entryPath = new URL(entry.path, "https://log.local");
    if (entryPath.searchParams.get(RUN_MARKER_PARAM) !== input.runId) {
      return [];
    }

    const match = matchUserAgent(entry.userAgent);
    if (!match || !entry.userAgent) {
      return [];
    }

    const matchingAttempt = input.attempts.find((attempt) => {
      const attemptPath = new URL(attempt.path, "https://attempt.local");
      return attemptPath.pathname === entryPath.pathname && attempt.userAgent === entry.userAgent;
    });
    if (!matchingAttempt) {
      return [];
    }

    return [
      {
        runId: input.runId,
        operator: match.operator,
        bot: match.bot,
        path: entry.path,
        status: entry.status,
        userAgent: entry.userAgent
      }
    ];
  });

  const observedAttemptKeys = new Set(
    observed.map((match) => `${new URL(match.path, "https://log.local").pathname}|${match.userAgent}`)
  );
  const unobserved = input.attempts.filter((attempt) => {
    const attemptPath = new URL(attempt.path, "https://attempt.local");
    return !observedAttemptKeys.has(`${attemptPath.pathname}|${attempt.userAgent}`);
  });

  return {
    runId: input.runId,
    attempted: input.attempts,
    observed,
    unobserved
  };
}
