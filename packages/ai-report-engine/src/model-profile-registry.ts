import {
  MODEL_PROFILE_OPERATIONS,
  parseModelProfile,
  type ModelOperationProfile,
  type ModelProfile,
  type ModelProfileOperation
} from "./model-profile";
import {
  isModelTokenEstimatorRegistry,
  type ModelTokenEstimatorRegistry
} from "./model-token-estimator";

export interface ModelProviderOperationCapability {
  readonly operation: ModelProfileOperation;
  readonly endpointCapability: string;
  readonly nativeWebSearch: boolean;
  readonly structuredOutput: boolean;
}

export interface ModelProviderAdapterCapability {
  readonly provider: string;
  readonly adapterId: string;
  readonly operations: Readonly<Record<ModelProfileOperation, ModelProviderOperationCapability>>;
}

export interface ModelProviderCapabilityRegistry {
  resolve(adapterId: string): ModelProviderAdapterCapability;
}

export interface ResolvedModelOperationProfile extends ModelOperationProfile {
  readonly endpointCapability: string;
  readonly estimatorId: string;
}

export interface ResolvedModelProfile extends Omit<ModelProfile, "operations"> {
  readonly operations: Readonly<Record<ModelProfileOperation, ResolvedModelOperationProfile>>;
}

export interface ModelProfileRegistry {
  load(profileId: string): ResolvedModelProfile;
}

const PROVIDER_FIELDS = new Set(["provider", "adapterId", "operations"]);
const CAPABILITY_FIELDS = new Set(["operation", "endpointCapability", "nativeWebSearch", "structuredOutput"]);
const PROFILE_REGISTRY_FIELDS = new Set(["profiles", "providers", "estimators"]);
const providerRegistries = new WeakSet<object>();

export function createModelProviderCapabilityRegistry(values: readonly unknown[]): ModelProviderCapabilityRegistry {
  if (!Array.isArray(values) || values.length < 1) throw new TypeError("At least one model provider adapter capability is required.");
  const byAdapter = new Map<string, ModelProviderAdapterCapability>();
  for (const [index, value] of values.entries()) {
    const path = `model provider capabilities[${index}]`;
    const row = strictObject(value, path, PROVIDER_FIELDS);
    const provider = identifier(row.provider, `${path}.provider`);
    const adapterId = identifier(row.adapterId, `${path}.adapterId`);
    if (byAdapter.has(adapterId)) throw new TypeError(`Duplicate model provider adapter identity ${adapterId}.`);
    if (!Array.isArray(row.operations)) throw new TypeError(`${path}.operations must be an array.`);
    const operations = new Map<ModelProfileOperation, ModelProviderOperationCapability>();
    for (const [operationIndex, operationValue] of row.operations.entries()) {
      const operationPath = `${path}.operations[${operationIndex}]`;
      const operationRow = strictObject(operationValue, operationPath, CAPABILITY_FIELDS);
      const operation = modelOperation(operationRow.operation, `${operationPath}.operation`);
      if (operations.has(operation)) throw new TypeError(`Duplicate model provider capability for ${operation}.`);
      operations.set(operation, Object.freeze({
        operation,
        endpointCapability: identifier(operationRow.endpointCapability, `${operationPath}.endpointCapability`),
        nativeWebSearch: boolean(operationRow.nativeWebSearch, `${operationPath}.nativeWebSearch`),
        structuredOutput: boolean(operationRow.structuredOutput, `${operationPath}.structuredOutput`)
      }));
    }
    for (const operation of MODEL_PROFILE_OPERATIONS) {
      if (!operations.has(operation)) throw new TypeError(`${path}.operations is missing ${operation}.`);
    }
    if (operations.size !== MODEL_PROFILE_OPERATIONS.length) throw new TypeError(`${path}.operations must contain exactly four operations.`);
    const normalizedOperations = Object.freeze(Object.fromEntries(MODEL_PROFILE_OPERATIONS.map((operation) => (
      [operation, operations.get(operation)!]
    ))) as Record<ModelProfileOperation, ModelProviderOperationCapability>);
    byAdapter.set(adapterId, Object.freeze({ provider, adapterId, operations: normalizedOperations }));
  }
  const registry = Object.freeze({
    resolve(adapterIdValue: string): ModelProviderAdapterCapability {
      const adapterId = identifier(adapterIdValue, "adapterId");
      const capability = byAdapter.get(adapterId);
      if (!capability) throw new TypeError(`Unsupported model provider adapter ${adapterId}.`);
      return capability;
    }
  });
  providerRegistries.add(registry);
  return registry;
}

export function createModelProfileRegistry(value: unknown): ModelProfileRegistry {
  const root = strictObject(value, "model profile registry", PROFILE_REGISTRY_FIELDS);
  if (!Array.isArray(root.profiles) || root.profiles.length < 1) {
    throw new TypeError("model profile registry profiles must be a non-empty array.");
  }
  const providers = root.providers;
  if (!isModelProviderCapabilityRegistry(providers)) {
    throw new TypeError("providers must be a registered model provider capability registry.");
  }
  const estimators = root.estimators;
  if (!isModelTokenEstimatorRegistry(estimators)) {
    throw new TypeError("estimators must be a registered model Token estimator registry.");
  }
  const byProfile = new Map<string, ResolvedModelProfile>();
  for (const profileValue of root.profiles) {
    const profile = parseModelProfile(profileValue);
    if (byProfile.has(profile.profileId)) throw new TypeError(`Duplicate model profile identity ${profile.profileId}.`);
    const provider = providers.resolve(profile.adapterId);
    if (provider.provider !== profile.provider) {
      throw new TypeError(`Model profile ${profile.profileId} provider is unsupported by adapter ${profile.adapterId}.`);
    }
    const operations = Object.freeze(Object.fromEntries(MODEL_PROFILE_OPERATIONS.map((operation) => {
      const requested = profile.operations[operation];
      const supported = provider.operations[operation];
      assertCapabilities(operation, requested, supported);
      const estimator = estimators.resolve(requested.tokenizer);
      return [operation, Object.freeze({
        ...requested,
        endpointCapability: supported.endpointCapability,
        estimatorId: estimator.estimatorId
      })];
    })) as Record<ModelProfileOperation, ResolvedModelOperationProfile>);
    byProfile.set(profile.profileId, Object.freeze({
      profileId: profile.profileId,
      provider: profile.provider,
      adapterId: profile.adapterId,
      operations
    }));
  }
  return Object.freeze({
    load(profileIdValue: string): ResolvedModelProfile {
      const profileId = identifier(profileIdValue, "profileId");
      const profile = byProfile.get(profileId);
      if (!profile) throw new TypeError(`Unknown model profile ${profileId}.`);
      return profile;
    }
  });
}

function isModelProviderCapabilityRegistry(value: unknown): value is ModelProviderCapabilityRegistry {
  return Boolean(value) && typeof value === "object" && providerRegistries.has(value as object);
}

function assertCapabilities(
  operation: ModelProfileOperation,
  requested: ModelOperationProfile,
  supported: ModelProviderOperationCapability
): void {
  if (!requested.structuredOutput) {
    throw new TypeError(`${operation} structuredOutput is required by the V4 model operation contract.`);
  }
  const requiresNativeWebSearch = operation === "questionAnswer";
  if (requested.nativeWebSearch !== requiresNativeWebSearch) {
    throw new TypeError(`${operation} nativeWebSearch must be ${String(requiresNativeWebSearch)} for the V4 model operation contract.`);
  }
  if (requested.nativeWebSearch && !supported.nativeWebSearch) {
    throw new TypeError(`${operation} nativeWebSearch capability is unsupported by the configured adapter endpoint.`);
  }
  if (requested.structuredOutput && !supported.structuredOutput) {
    throw new TypeError(`${operation} structuredOutput capability is unsupported by the configured adapter endpoint.`);
  }
}

function strictObject(value: unknown, path: string, allowed: ReadonlySet<string>): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${path} must be an object.`);
  const row = value as Record<string, unknown>;
  const unknown = Object.keys(row).filter((key) => !allowed.has(key)).sort()[0];
  if (unknown) throw new TypeError(`${path} contains unknown field ${unknown}.`);
  return row;
}

function identifier(value: unknown, path: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)) {
    throw new TypeError(`${path} must be a bounded identifier.`);
  }
  return value;
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${path} must be a boolean.`);
  return value;
}

function modelOperation(value: unknown, path: string): ModelProfileOperation {
  if (typeof value !== "string" || !MODEL_PROFILE_OPERATIONS.includes(value as ModelProfileOperation)) {
    throw new TypeError(`${path} must name an approved V4 model operation, not ${String(value)}.`);
  }
  return value as ModelProfileOperation;
}
