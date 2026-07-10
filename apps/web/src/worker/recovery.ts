import type { PageAnalysis, PlannedPage } from "@open-geo-console/ai-report-engine";
import { classifyPageFailure } from "@open-geo-console/site-crawler";

export const MAX_PAGE_ATTEMPTS = 3;

export interface PermanentPageFailure {
  url: string;
  error: string;
  code?: string;
}

export interface RecoveryCheckpoint {
  targetPageCount?: number;
  rankedCandidateUrls?: string[];
  rankedCandidates?: PlannedPage[];
  effectivePlannedUrls?: string[];
  effectivePlan?: PlannedPage[];
  permanentFailures?: PermanentPageFailure[];
  transientAttemptCounts?: Record<string, number>;
  completedCrawlUrls?: string[];
  completedPageAnalyses?: CompletedPageAnalysis[];
  synthesisInputHash?: string;
  exhaustedTransientUrls?: string[];
  planningCompleted?: boolean;
  [key: string]: unknown;
}

export interface CompletedPageAnalysis {
  url: string;
  contentHash: string;
  analysis: PageAnalysis;
}

export type ResumeStage = "discovering" | "planning" | "fetching" | "analyzing" | "synthesizing";

export function determineResumeStage(checkpoint: RecoveryCheckpoint): ResumeStage {
  const ranked = checkpoint.rankedCandidates ?? [];
  if (ranked.length === 0 || !checkpoint.targetPageCount) return "discovering";
  const effective = checkpoint.effectivePlan ?? [];
  if (effective.length === 0 && !checkpoint.planningCompleted) return "planning";
  const completed = new Set(checkpoint.completedCrawlUrls ?? []);
  const permanent = new Set((checkpoint.permanentFailures ?? []).map(({ url }) => url));
  const exhausted = new Set(checkpoint.exhaustedTransientUrls ?? []);
  if (effective.some(({ url }) => !completed.has(url) && !permanent.has(url) && !exhausted.has(url))) {
    return "fetching";
  }
  const analyzed = new Set((checkpoint.completedPageAnalyses ?? []).map(({ url }) => url));
  if ([...completed].some((url) => !analyzed.has(url))) return "analyzing";
  return "synthesizing";
}

export function calculateEffectiveCoverage(input: {
  discoveredCandidateCount: number;
  effectivePlannedUrls: readonly string[];
  completedCrawlUrls: readonly string[];
  permanentFailures: readonly PermanentPageFailure[];
  exhaustedTransientUrls: readonly string[];
}) {
  const effective = new Set(input.effectivePlannedUrls);
  const analyzed = new Set(input.completedCrawlUrls.filter((url) => effective.has(url))).size;
  const denominator = effective.size;
  return {
    discoveredPages: input.discoveredCandidateCount,
    permanentlyInvalidPages: new Set(input.permanentFailures.map(({ url }) => url)).size,
    effectivePlannedPages: denominator,
    analyzedPages: analyzed,
    exhaustedTransientPages: new Set(input.exhaustedTransientUrls.filter((url) => effective.has(url))).size,
    ratio: denominator === 0 ? 0 : analyzed / denominator
  };
}

interface RecoveredPage {
  contentHash: string;
}

export async function fetchPlannedPagesWithRecovery<T extends RecoveredPage>(input: {
  targetPageCount: number;
  rankedCandidates: readonly PlannedPage[];
  effectivePlan: readonly PlannedPage[];
  checkpoint?: RecoveryCheckpoint;
  loadCompleted: (page: PlannedPage) => Promise<T>;
  fetchPage: (page: PlannedPage) => Promise<T>;
  saveCheckpoint: (checkpoint: RecoveryCheckpoint) => Promise<void>;
  delay?: (milliseconds: number) => Promise<void>;
}): Promise<{
  pages: T[];
  checkpoint: RecoveryCheckpoint;
  exhaustedTransientUrls: string[];
}> {
  const checkpoint: RecoveryCheckpoint = {
    ...(input.checkpoint ?? {}),
    targetPageCount: input.targetPageCount,
    rankedCandidates: [...input.rankedCandidates],
    rankedCandidateUrls: input.rankedCandidates.map(({ url }) => url),
    effectivePlan: [...input.effectivePlan],
    effectivePlannedUrls: input.effectivePlan.map(({ url }) => url),
    permanentFailures: [...(input.checkpoint?.permanentFailures ?? [])],
    transientAttemptCounts: { ...(input.checkpoint?.transientAttemptCounts ?? {}) },
    completedCrawlUrls: [...(input.checkpoint?.completedCrawlUrls ?? [])],
    exhaustedTransientUrls: [...(input.checkpoint?.exhaustedTransientUrls ?? [])]
  };
  const results = new Map<string, T>();
  const completed = new Set(checkpoint.completedCrawlUrls);
  const permanent = new Set(checkpoint.permanentFailures!.map(({ url }) => url));
  const exhausted = new Set(checkpoint.exhaustedTransientUrls);
  const everSelected = new Set([
    ...checkpoint.effectivePlan!.map(({ url }) => url),
    ...permanent,
    ...completed,
    ...exhausted
  ]);
  const delay = input.delay ?? defaultDelay;

  const persist = async () => {
    checkpoint.effectivePlannedUrls = checkpoint.effectivePlan!.map(({ url }) => url);
    checkpoint.completedCrawlUrls = [...completed];
    checkpoint.exhaustedTransientUrls = [...exhausted];
    await input.saveCheckpoint(checkpoint);
  };
  const appendReplacement = () => {
    const replacement = input.rankedCandidates.find(({ url }) => !everSelected.has(url));
    if (!replacement) return false;
    checkpoint.effectivePlan!.push(replacement);
    everSelected.add(replacement.url);
    return true;
  };

  for (const page of [...checkpoint.effectivePlan!]) {
    if (!completed.has(page.url)) continue;
    try {
      results.set(page.url, await input.loadCompleted(page));
    } catch {
      completed.delete(page.url);
    }
  }

  for (let index = 0; index < checkpoint.effectivePlan!.length; index += 1) {
    const page = checkpoint.effectivePlan![index]!;
    if (completed.has(page.url) || permanent.has(page.url) || exhausted.has(page.url)) continue;
    let resolved = false;
    while (!resolved) {
      const previousAttempts = checkpoint.transientAttemptCounts![page.url] ?? 0;
      if (previousAttempts >= MAX_PAGE_ATTEMPTS) {
        exhausted.add(page.url);
        appendReplacement();
        await persist();
        break;
      }
      const attempt = previousAttempts + 1;
      checkpoint.transientAttemptCounts![page.url] = attempt;
      await persist();
      try {
        const fetched = await input.fetchPage(page);
        results.set(page.url, fetched);
        completed.add(page.url);
        exhausted.delete(page.url);
        await persist();
        resolved = true;
      } catch (error) {
        const classified = classifyPageFailure(error);
        if (classified.disposition === "permanent") {
          permanent.add(page.url);
          delete checkpoint.transientAttemptCounts![page.url];
          checkpoint.permanentFailures!.push({
            url: page.url,
            error: classified.message,
            code: classified.code
          });
          checkpoint.effectivePlan = checkpoint.effectivePlan!.filter(({ url }) => url !== page.url);
          index -= 1;
          appendReplacement();
          await persist();
          resolved = true;
          continue;
        }
        if (attempt >= MAX_PAGE_ATTEMPTS) {
          exhausted.add(page.url);
          appendReplacement();
          await persist();
          resolved = true;
          continue;
        }
        await delay(Math.min(2_000, 250 * (2 ** (attempt - 1))));
      }
    }
  }

  return { pages: [...results.values()], checkpoint, exhaustedTransientUrls: [...exhausted] };
}

function defaultDelay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
