import type {
  AnswerEngineAdapter,
  AnswerEngineCertificationEvidence,
  CertifiedAnswerEngineSurface,
  RegisteredAnswerEngine
} from "./types";
import { parseAnswerEngineSurface } from "./validation";

export class AnswerEngineRegistry {
  private readonly entries = new Map<string, RegisteredAnswerEngine>();

  register(adapter: AnswerEngineAdapter, certificationEvidence?: AnswerEngineCertificationEvidence): void {
    const surface = parseAnswerEngineSurface(adapter.surface);
    if (surface.certificationState === "certified") {
      if (!certificationEvidence || certificationEvidence.environment !== "protected_staging" ||
          !Number.isFinite(Date.parse(certificationEvidence.certifiedAt)) || !certificationEvidence.evidenceReference.trim()) {
        throw new Error("A certified adapter requires protected-staging certification evidence.");
      }
    } else if (certificationEvidence) {
      throw new Error("An uncertified adapter cannot carry certification evidence.");
    }
    const key = createAnswerEngineSurfaceKey(surface);
    if (this.entries.has(key)) throw new Error(`Answer-engine surface is already registered: ${key}`);
    this.entries.set(key, { adapter, surface, ...(certificationEvidence ? { certificationEvidence } : {}) });
  }

  list(): RegisteredAnswerEngine[] {
    return [...this.entries.values()];
  }

  listCertified(): RegisteredAnswerEngine[] {
    return this.list().filter(({ surface, certificationEvidence }) =>
      surface.certificationState === "certified" && Boolean(certificationEvidence)
    );
  }

  listCertifications(): CertifiedAnswerEngineSurface[] {
    return this.listCertified().map(({ surface, certificationEvidence }) => ({
      surface,
      evidence: certificationEvidence!
    }));
  }
}

export function createAnswerEngineSurfaceKey(surface: AnswerEngineAdapter["surface"]): string {
  return [surface.providerId, surface.productId, surface.modelId, surface.collectionSurface, surface.locale, surface.region].join("/");
}
