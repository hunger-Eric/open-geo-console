import type {
  ProviderClaimCandidate,
  ProviderEvidencePassage,
  ProviderQualificationPolicy,
  ProviderRole
} from "@open-geo-console/citation-intelligence";
import { AiClientError, type JsonCompletionClient } from "./client";

export const PROVIDER_CLAIM_EXTRACTION_CONTRACT = "provider-claim-extraction-v1" as const;

export interface ProviderClaimExtractionInput {
  locale: string;
  question: string;
  policy: ProviderQualificationPolicy;
  candidate: { entityId: string; canonicalName: string };
  source: {
    sourceEvidenceId: string;
    canonicalUrl: string;
    title: string;
    registrableDomain: string;
  };
  passages: readonly ProviderEvidencePassage[];
  signal?: AbortSignal;
}

export interface ProviderClaimExtractionResult {
  contractVersion: typeof PROVIDER_CLAIM_EXTRACTION_CONTRACT;
  modelId: string;
  candidates: ProviderClaimCandidate[];
}

export async function extractProviderClaimCandidates(
  client: JsonCompletionClient,
  input: ProviderClaimExtractionInput,
  options: { maxAttempts?: number; delay?: (milliseconds: number) => Promise<void> } = {}
): Promise<ProviderClaimExtractionResult> {
  validateInput(input);
  const maxAttempts = Math.min(3, Math.max(1, Math.trunc(options.maxAttempts ?? 3)));
  const delay = options.delay ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    input.signal?.throwIfAborted();
    try {
      const completion = await client.completeJson({
        signal: input.signal,
        temperature: 0.1,
        maxTokens: 2_500,
        messages: [
          {
            role: "system",
            content: "Extract only provider capability claims explicitly stated in the supplied public passages. Return JSON only. Never infer ownership, self-operation, direct operation, routes, or service scope. Every exactExcerpt must be copied verbatim from one supplied passage."
          },
          {
            role: "user",
            content: JSON.stringify({
              contractVersion: PROVIDER_CLAIM_EXTRACTION_CONTRACT,
              outputLanguage: input.locale,
              question: input.question,
              candidate: input.candidate,
              source: input.source,
              policy: {
                policyId: input.policy.policyId,
                policyVersion: input.policy.version,
                capabilityDimensions: input.policy.capabilityDimensions.map(({ id, states }) => ({ id, states }))
              },
              requiredShape: {
                claims: [{
                  subjectName: "exact candidate canonicalName",
                  genericRole: "service_provider|platform|software_vendor|directory_or_media|unknown",
                  policyRole: "policy-specific role",
                  capability: "exact capability dimension id",
                  operatingMode: "exact allowed state",
                  serviceScope: ["explicitly stated service"],
                  routeScope: ["explicitly stated route"],
                  exactExcerpt: "verbatim substring from one passage",
                  contradictionGroupId: "optional public contradiction identity"
                }]
              },
              passages: input.passages.map(({ passageId, exactExcerpt, relevanceScore }) => ({ passageId, exactExcerpt, relevanceScore }))
            })
          }
        ]
      });
      return {
        contractVersion: PROVIDER_CLAIM_EXTRACTION_CONTRACT,
        modelId: nonempty(completion.modelId, "$completion.modelId", 200),
        candidates: parseExtraction(completion.value, input)
      };
    } catch (error) {
      lastError = error;
      if (!isRetryableContractError(error) || attempt >= maxAttempts) throw error;
      await delayWithAbort(delay, 100 * 2 ** (attempt - 1), input.signal);
    }
  }
  throw lastError;
}

function parseExtraction(value: unknown, input: ProviderClaimExtractionInput): ProviderClaimCandidate[] {
  const root = strictRecord(value, "$model", ["claims"]);
  if (!Array.isArray(root.claims) || root.claims.length > 24) throw new TypeError("$model.claims must be an array with at most 24 items.");
  return root.claims.map((value, index) => parseCandidate(value, `$model.claims[${index}]`, input));
}

function parseCandidate(value: unknown, path: string, input: ProviderClaimExtractionInput): ProviderClaimCandidate {
  const row = strictRecord(value, path, ["subjectName", "genericRole", "policyRole", "capability", "operatingMode", "serviceScope", "routeScope", "exactExcerpt", "contradictionGroupId"], ["contradictionGroupId"]);
  const subjectName = nonempty(row.subjectName, `${path}.subjectName`, 300);
  if (normalize(subjectName) !== normalize(input.candidate.canonicalName)) throw new TypeError(`${path}.subjectName must match the exact candidate identity.`);
  const genericRole = enumeration(row.genericRole, `${path}.genericRole`, ["service_provider", "platform", "software_vendor", "directory_or_media", "unknown"] as const);
  const policyRole = nonempty(row.policyRole, `${path}.policyRole`, 100);
  const capability = nonempty(row.capability, `${path}.capability`, 100);
  const dimension = input.policy.capabilityDimensions.find(({ id }) => id === capability);
  if (!dimension) throw new TypeError(`${path}.capability is unsupported by the selected policy.`);
  const operatingMode = nonempty(row.operatingMode, `${path}.operatingMode`, 100);
  if (!dimension.states.includes(operatingMode)) throw new TypeError(`${path}.operatingMode is unsupported by the selected policy.`);
  const serviceScope = stringArray(row.serviceScope, `${path}.serviceScope`);
  const routeScope = stringArray(row.routeScope, `${path}.routeScope`);
  const exactExcerpt = nonempty(row.exactExcerpt, `${path}.exactExcerpt`, 1_200);
  const passage = input.passages.find(({ exactExcerpt: supplied }) => supplied.includes(exactExcerpt));
  if (!passage) throw new TypeError(`${path}.exactExcerpt must be copied from one supplied exact excerpt.`);
  if (!operatingModeBound(operatingMode, exactExcerpt)) throw new TypeError(`${path}.operatingMode is not stated in the exact excerpt.`);
  for (const value of [...serviceScope, ...routeScope]) if (!normalize(exactExcerpt).includes(normalize(value))) throw new TypeError(`${path} scope is not stated in the exact excerpt.`);
  const contradictionGroupId = row.contradictionGroupId == null ? undefined : nonempty(row.contradictionGroupId, `${path}.contradictionGroupId`, 200);
  return { subjectName, genericRole: genericRole as ProviderRole, policyRole, capability, operatingMode, serviceScope, routeScope, exactExcerpt, ...(contradictionGroupId ? { contradictionGroupId } : {}) };
}

function validateInput(input: ProviderClaimExtractionInput): void {
  nonempty(input.locale, "locale", 50);
  nonempty(input.question, "question", 2_000);
  nonempty(input.candidate.entityId, "candidate.entityId", 256);
  nonempty(input.candidate.canonicalName, "candidate.canonicalName", 300);
  nonempty(input.source.sourceEvidenceId, "source.sourceEvidenceId", 256);
  if (!input.passages.length || input.passages.length > 3) throw new TypeError("Provider extraction requires one to three selected passages.");
  if (new Set(input.passages.map(({ passageId }) => passageId)).size !== input.passages.length) throw new TypeError("Provider extraction passages must be unique.");
}

function operatingModeBound(state: string, excerpt: string): boolean {
  const text = normalize(excerpt).replaceAll("-", " ");
  const term = normalize(state).replaceAll("_", " ").replaceAll("-", " ");
  if (text.includes(term)) return true;
  const synonyms: Record<string, string[]> = {
    self_operated: ["self operated", "direct operated", "in house", "自营", "直营"],
    dedicated_controlled: ["dedicated", "fixed capacity", "专线", "固定运力"],
    dedicated_charter: ["dedicated charter", "charter", "包机"],
    purchased_capacity: ["purchased capacity", "booked capacity", "采购运力"],
    in_house_licensed: ["in house licensed", "licensed customs", "自有清关", "持牌清关"],
    managed_partner: ["managed partner", "partner managed", "合作方管理"],
    no_outsourcing_verified: ["no outsourcing", "without outsourcing", "不外包"],
    outsourcing_present: ["outsourced", "outsourcing", "外包"],
    verified: ["fixed route", "dedicated route", "固定线路", "专线"],
    unverified: ["unverified", "not verified", "未验证"]
  };
  return (synonyms[state] ?? []).some((candidate) => text.includes(normalize(candidate).replaceAll("-", " ")));
}

function strictRecord(value: unknown, path: string, allowed: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${path} must be an object.`);
  const row = value as Record<string, unknown>;
  for (const key of Object.keys(row)) if (!allowed.includes(key)) throw new TypeError(`${path} contains unsupported field ${key}.`);
  for (const key of allowed) if (!optional.includes(key) && !(key in row)) throw new TypeError(`${path}.${key} is required.`);
  return row;
}
function stringArray(value: unknown, path: string): string[] { if (!Array.isArray(value) || value.length > 20) throw new TypeError(`${path} must be an array.`); return [...new Set(value.map((item, index) => nonempty(item, `${path}[${index}]`, 300)))].sort(); }
function nonempty(value: unknown, path: string, max: number): string { if (typeof value !== "string" || !value.trim() || value.length > max) throw new TypeError(`${path} must be non-empty text.`); return value.normalize("NFC").trim(); }
function enumeration<T extends string>(value: unknown, path: string, allowed: readonly T[]): T { const text = nonempty(value, path, 100); if (!allowed.includes(text as T)) throw new TypeError(`${path} is unsupported.`); return text as T; }
function normalize(value: string): string { return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim(); }
function isRetryableContractError(error: unknown): boolean { return error instanceof TypeError || (error instanceof AiClientError && error.status !== 401 && error.status !== 403 && /invalid json|non-json|response envelope/i.test(error.message)); }
async function delayWithAbort(delay: (milliseconds: number) => Promise<void>, milliseconds: number, signal?: AbortSignal): Promise<void> { signal?.throwIfAborted(); await delay(milliseconds); signal?.throwIfAborted(); }
