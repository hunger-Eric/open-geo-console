import { createAnswerEngineSurfaceKey, type AnswerEngineRegistry, type CertificationAuthoritySnapshot } from "@open-geo-console/answer-engine-observer";
import { isDeepStrictEqual } from "node:util";

export type RecommendationProductAvailabilityCode =
  | "ready" | "disabled" | "environment" | "runtime_incomplete" | "authority_unavailable" | "authority_mismatch"
  | "methodology_migration";

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
  // Phase 0 deliberately closes all new recommendation admission. Historical
  // V1 authority remains available only to drain already-paid persisted jobs.
  void input;
  return { ready: false, lane: null, code: "methodology_migration" };
}

export async function getRecommendationProductAvailability(
  environment: NodeJS.ProcessEnv = process.env
): Promise<RecommendationProductAvailability> {
  void environment;
  return { ready: false, lane: null, code: "methodology_migration" };
}

export async function assertRecommendationProductAvailable(environment: NodeJS.ProcessEnv = process.env): Promise<void> {
  const availability = await getRecommendationProductAvailability(environment);
  if (!availability.ready) throw new Error("The recommendation-forensics product is not available.");
}
