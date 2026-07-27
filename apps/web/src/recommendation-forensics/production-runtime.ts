import { isDeepStrictEqual } from "node:util";
import {
  AnswerEngineRegistry,
  createAnswerEngineSurfaceKey,
  type CertificationAuthoritySnapshot,
  type ProviderExecutionBudget
} from "@open-geo-console/answer-engine-observer";
import {
  getPersistedRecommendationCertificationAuthority,
  getPersistedSourceClassificationAuthority,
  parseRecommendationCertificationAuthorityConfig,
  parseSourceClassificationAuthorityConfig
} from "@/db/recommendation-authority";
import type { RecommendationForensicsDependencies } from "@/worker/recommendation-forensics";
import { createOpenAIWebSearchAdapter } from "./adapters/openai-web-search";
import { createPerplexitySonarAdapter } from "./adapters/perplexity-sonar";
import { ProductionRecommendationReportBuilder } from "./production-report-builder";

export { ProductionRecommendationReportBuilder } from "./production-report-builder";

export function createProductionAnswerEngineRegistry(
  environment: NodeJS.ProcessEnv = process.env,
  authority?: CertificationAuthoritySnapshot
): AnswerEngineRegistry {
  const registry = new AnswerEngineRegistry();
  if (environment.OGC_RECOMMENDATION_RUNTIME_ENABLED !== "true" || !authority) return registry;
  for (const certification of authority.certifications) {
    const surface = certification.surface;
    try {
      const adapter = surface.providerId === "openai"
        ? createConfiguredOpenAI(environment, surface)
        : surface.providerId === "perplexity"
          ? createConfiguredPerplexity(environment, surface)
          : null;
      if (!adapter || createAnswerEngineSurfaceKey(adapter.surface) !== createAnswerEngineSurfaceKey(surface)) continue;
      registry.register(adapter, certification.evidence);
    } catch {
      continue;
    }
  }
  return registry;
}

export const productionRecommendationReportBuilderAvailable = true;

export async function createProductionRecommendationDependencies(
  environment: NodeJS.ProcessEnv = process.env
): Promise<RecommendationForensicsDependencies | null> {
  const configured = await loadPersistedAuthorities(environment);
  if (!configured) return null;
  const registry = createProductionAnswerEngineRegistry(environment, configured.certificationAuthority);
  const certified = registry.listCertified();
  if (certified.length !== configured.certificationAuthority.certifications.length ||
      new Set(certified.map(({ surface }) => surface.providerId)).size < 2) return null;
  return {
    registry,
    adapters: certified.map(({ adapter }) => adapter),
    certificationAuthority: configured.certificationAuthority,
    sourceClassificationAuthority: configured.sourceClassificationAuthority,
    builder: new ProductionRecommendationReportBuilder(),
    budgets: Object.fromEntries(certified.map(({ surface }) => [surface.providerId, providerBudget(environment, surface.providerId)]))
  };
}

export async function loadPersistedAuthorities(environment: NodeJS.ProcessEnv = process.env) {
  if (environment.OGC_RECOMMENDATION_RUNTIME_ENABLED !== "true") return null;
  const certificationRaw = environment.OGC_RECOMMENDATION_CERTIFICATION_AUTHORITY_JSON?.trim();
  const sourceRaw = environment.OGC_SOURCE_CLASSIFICATION_AUTHORITY_JSON?.trim();
  if (!certificationRaw || !sourceRaw) return null;
  try {
    const certificationAuthority = parseRecommendationCertificationAuthorityConfig(certificationRaw);
    const sourceClassificationAuthority = parseSourceClassificationAuthorityConfig(sourceRaw);
    const [persistedCertification, persistedSource] = await Promise.all([
      getPersistedRecommendationCertificationAuthority(certificationAuthority.authorityVersion),
      getPersistedSourceClassificationAuthority(sourceClassificationAuthority.authorityVersion)
    ]);
    if (!isDeepStrictEqual(persistedCertification, certificationAuthority) ||
        !isDeepStrictEqual(persistedSource, sourceClassificationAuthority)) return null;
    return { certificationAuthority, sourceClassificationAuthority };
  } catch {
    return null;
  }
}

function createConfiguredOpenAI(environment: NodeJS.ProcessEnv, surface: CertificationAuthoritySnapshot["certifications"][number]["surface"]) {
  if (surface.productId !== "responses-web-search" || surface.collectionSurface !== "developer_api" ||
      !exact(environment.OGC_ANSWER_OPENAI_MODEL, surface.modelId) ||
      !exact(environment.OGC_ANSWER_OPENAI_LOCALE, surface.locale) ||
      !exact(environment.OGC_ANSWER_OPENAI_REGION, surface.region) || !present(environment.OGC_ANSWER_OPENAI_API_KEY)) return null;
  return createOpenAIWebSearchAdapter({
    apiKey: environment.OGC_ANSWER_OPENAI_API_KEY, model: surface.modelId,
    locale: surface.locale, region: surface.region, certificationState: "certified"
  });
}

function createConfiguredPerplexity(environment: NodeJS.ProcessEnv, surface: CertificationAuthoritySnapshot["certifications"][number]["surface"]) {
  if (surface.productId !== "sonar-api" || surface.collectionSurface !== "developer_api" ||
      !exact(environment.OGC_ANSWER_PERPLEXITY_MODEL, surface.modelId) ||
      !exact(environment.OGC_ANSWER_PERPLEXITY_LOCALE, surface.locale) ||
      !exact(environment.OGC_ANSWER_PERPLEXITY_REGION, surface.region) || !present(environment.OGC_ANSWER_PERPLEXITY_API_KEY)) return null;
  return createPerplexitySonarAdapter({
    environment: {
      OGC_ANSWER_PERPLEXITY_API_KEY: environment.OGC_ANSWER_PERPLEXITY_API_KEY,
      OGC_ANSWER_PERPLEXITY_MODEL: surface.modelId
    },
    locale: surface.locale, region: surface.region, certificationState: "certified"
  });
}

function providerBudget(environment: NodeJS.ProcessEnv, providerId: string): ProviderExecutionBudget {
  const prefix = `OGC_ANSWER_${providerId.toUpperCase()}`;
  return {
    maxRequests: positiveInteger(environment[`${prefix}_MAX_REQUESTS`], 5),
    maxEstimatedCostMicros: positiveInteger(environment[`${prefix}_MAX_COST_MICROS`], 5_000_000),
    timeoutMs: positiveInteger(environment[`${prefix}_TIMEOUT_MS`], 60_000),
    maxTransientRetries: positiveInteger(environment[`${prefix}_MAX_TRANSIENT_RETRIES`], 1)
  };
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
function exact(value: string | undefined, expected: string) { return value?.trim() === expected; }
function present(value: string | undefined) { return Boolean(value?.trim()); }
