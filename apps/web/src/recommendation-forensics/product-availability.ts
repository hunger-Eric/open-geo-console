import { createAnswerEngineSurfaceKey, type AnswerEngineRegistry, type CertificationAuthoritySnapshot } from "@open-geo-console/answer-engine-observer";
import { isDeepStrictEqual } from "node:util";
import {
  getPersistedRecommendationCertificationAuthority,
  parseRecommendationCertificationAuthorityConfig
} from "@/db/recommendation-authority";
import {
  createProductionAnswerEngineRegistry,
  productionRecommendationReportBuilderAvailable
} from "./production-runtime";

export type RecommendationProductAvailabilityCode =
  | "ready" | "disabled" | "environment" | "runtime_incomplete" | "authority_unavailable" | "authority_mismatch";

export interface RecommendationProductAvailability {
  ready: boolean;
  lane: "operator" | "public" | null;
  code: RecommendationProductAvailabilityCode;
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
  const runtime = input.registry.listCertified();
  const runtimeKeys = new Set(runtime.map(({ surface }) => createAnswerEngineSurfaceKey(surface)));
  const authorityKeys = new Set(input.authority.certifications.map(({ surface }) => createAnswerEngineSurfaceKey(surface)));
  const providerIds = new Set(runtime.map(({ surface }) => surface.providerId));
  const authorityByKey = new Map(input.authority.certifications.map((item) => [
    createAnswerEngineSurfaceKey(item.surface), item.evidence
  ]));
  const evidenceDrift = runtime.some(({ surface, certificationEvidence }) =>
    !isDeepStrictEqual(certificationEvidence, authorityByKey.get(createAnswerEngineSurfaceKey(surface)))
  );
  if (providerIds.size < 2 || runtimeKeys.size !== authorityKeys.size ||
      [...runtimeKeys].some((key) => !authorityKeys.has(key)) || evidenceDrift) {
    return { ready: false, lane, code: "authority_mismatch" };
  }
  return { ready: true, lane, code: "ready" };
}

export async function getRecommendationProductAvailability(
  environment: NodeJS.ProcessEnv = process.env
): Promise<RecommendationProductAvailability> {
  const registry = createProductionAnswerEngineRegistry();
  const rawAuthority = environment.OGC_RECOMMENDATION_CERTIFICATION_AUTHORITY_JSON?.trim();
  let authority: CertificationAuthoritySnapshot | null = null;
  let authorityPersisted = false;
  try {
    if (rawAuthority) {
      authority = parseRecommendationCertificationAuthorityConfig(rawAuthority);
      const persisted = await getPersistedRecommendationCertificationAuthority(authority.authorityVersion);
      authorityPersisted = isDeepStrictEqual(persisted, authority);
    }
  } catch {
    authority = null;
  }
  return evaluateRecommendationProductAvailability({
    environment, registry, authority, authorityPersisted,
    builderAvailable: productionRecommendationReportBuilderAvailable
  });
}

export async function assertRecommendationProductAvailable(environment: NodeJS.ProcessEnv = process.env): Promise<void> {
  const availability = await getRecommendationProductAvailability(environment);
  if (!availability.ready) throw new Error("The recommendation-forensics product is not available.");
}
