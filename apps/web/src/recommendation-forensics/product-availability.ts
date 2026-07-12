import { createAnswerEngineSurfaceKey, type AnswerEngineRegistry, type CertificationAuthoritySnapshot } from "@open-geo-console/answer-engine-observer";
import { isDeepStrictEqual } from "node:util";
import {
  createProductionAnswerEngineRegistry,
  loadPersistedAuthorities,
  productionRecommendationReportBuilderAvailable
} from "./production-runtime";

export type RecommendationProductAvailabilityCode =
  | "ready" | "disabled" | "environment" | "runtime_incomplete" | "authority_unavailable" | "authority_mismatch";

export interface RecommendationProductAvailability {
  ready: boolean;
  lane: "operator" | "public" | null;
  code: RecommendationProductAvailabilityCode;
}

export function recommendationRuntimeMatchesAuthority(
  registry: AnswerEngineRegistry,
  authority: CertificationAuthoritySnapshot
): boolean {
  const runtime = registry.listCertified();
  const runtimeKeys = new Set(runtime.map(({ surface }) => createAnswerEngineSurfaceKey(surface)));
  const authorityKeys = new Set(authority.certifications.map(({ surface }) => createAnswerEngineSurfaceKey(surface)));
  const providerIds = new Set(runtime.map(({ surface }) => surface.providerId));
  const authorityByKey = new Map(authority.certifications.map((item) => [
    createAnswerEngineSurfaceKey(item.surface), item.evidence
  ]));
  return providerIds.size >= 2 && runtimeKeys.size === authorityKeys.size &&
    [...runtimeKeys].every((key) => authorityKeys.has(key)) &&
    runtime.every(({ surface, certificationEvidence }) =>
      isDeepStrictEqual(certificationEvidence, authorityByKey.get(createAnswerEngineSurfaceKey(surface)))
    );
}

export function evaluateRecommendationProductAvailability(input: {
  environment: NodeJS.ProcessEnv;
  registry: AnswerEngineRegistry;
  authority: CertificationAuthoritySnapshot | null;
  authorityPersisted: boolean;
  builderAvailable: boolean;
}): RecommendationProductAvailability {
  const profile = input.environment.OGC_DEPLOYMENT_PROFILE?.trim();
  const operator = profile === "staging" && input.environment.OGC_RECOMMENDATION_OPERATOR_ENABLED === "true";
  const publicLane = profile === "production" && input.environment.OGC_RECOMMENDATION_PUBLIC_ENABLED === "true";
  const lane = operator ? "operator" : publicLane ? "public" : null;
  if (!lane) return { ready: false, lane: null, code: "disabled" };
  if (lane === "public" && input.environment.COMMERCE_MODE !== "live") return { ready: false, lane, code: "environment" };
  if (!input.builderAvailable || input.registry.listCertified().length < 2) return { ready: false, lane, code: "runtime_incomplete" };
  if (!input.authority || !input.authorityPersisted) return { ready: false, lane, code: "authority_unavailable" };
  if (!recommendationRuntimeMatchesAuthority(input.registry, input.authority)) {
    return { ready: false, lane, code: "authority_mismatch" };
  }
  return { ready: true, lane, code: "ready" };
}

export async function getRecommendationProductAvailability(
  environment: NodeJS.ProcessEnv = process.env
): Promise<RecommendationProductAvailability> {
  const configured = await loadPersistedAuthorities(environment);
  const authority = configured?.certificationAuthority ?? null;
  const authorityPersisted = Boolean(configured);
  const registry = createProductionAnswerEngineRegistry(environment, authority ?? undefined);
  return evaluateRecommendationProductAvailability({
    environment, registry, authority, authorityPersisted,
    builderAvailable: productionRecommendationReportBuilderAvailable
  });
}

export async function assertRecommendationProductAvailable(environment: NodeJS.ProcessEnv = process.env): Promise<void> {
  const availability = await getRecommendationProductAvailability(environment);
  if (!availability.ready) throw new Error("The recommendation-forensics product is not available.");
}
