import { MODEL_PROFILE_OPERATIONS, parseModelProfile, type ModelProfile, type ModelProfileOperation } from "./model-profile";
import type { ModelTokenBudgetInput } from "./model-token-budget";

export interface ModelTokenEstimator {
  readonly estimatorId: string;
  readonly tokenizer: string;
  estimateTokens(text: string): number;
}

export interface ModelTokenEstimatorRegistry {
  resolve(tokenizer: string): ModelTokenEstimator;
}

export interface BuildModelOperationTokenBudgetInput {
  readonly profile: ModelProfile;
  readonly operation: ModelProfileOperation;
  readonly estimate: {
    readonly systemText: string;
    readonly inputText: string;
    readonly reservedOutputTokens: number;
    readonly providerSafetyMarginTokens: number;
  };
  readonly estimators: ModelTokenEstimatorRegistry;
}

const ESTIMATOR_FIELDS = new Set(["estimatorId", "tokenizer", "estimateTokens"]);
const BUILD_FIELDS = new Set(["profile", "operation", "estimate", "estimators"]);
const ESTIMATE_FIELDS = new Set(["systemText", "inputText", "reservedOutputTokens", "providerSafetyMarginTokens"]);
const estimatorRegistries = new WeakSet<object>();

export function createModelTokenEstimatorRegistry(values: readonly unknown[]): ModelTokenEstimatorRegistry {
  if (!Array.isArray(values) || values.length < 1) throw new TypeError("At least one model Token estimator is required.");
  const byId = new Set<string>();
  const byTokenizer = new Map<string, ModelTokenEstimator>();
  for (const [index, value] of values.entries()) {
    const path = `model Token estimators[${index}]`;
    const row = strictObject(value, path, ESTIMATOR_FIELDS);
    const estimatorId = identifier(row.estimatorId, `${path}.estimatorId`);
    const tokenizer = identifier(row.tokenizer, `${path}.tokenizer`);
    if (byId.has(estimatorId)) throw new TypeError(`Duplicate model Token estimator identity ${estimatorId}.`);
    if (byTokenizer.has(tokenizer)) throw new TypeError(`Duplicate model Token tokenizer identity ${tokenizer}.`);
    if (typeof row.estimateTokens !== "function") throw new TypeError(`${path}.estimateTokens must be a function.`);
    const implementation = row.estimateTokens as (text: string) => number;
    const estimator = Object.freeze({
      estimatorId,
      tokenizer,
      estimateTokens(text: string): number {
        if (typeof text !== "string") throw new TypeError("Model Token estimator input must be text.");
        const estimated = implementation(text);
        if (!Number.isSafeInteger(estimated) || estimated < 0) {
          throw new TypeError(`Model Token estimator ${estimatorId} must return a nonnegative safe integer estimate.`);
        }
        return estimated;
      }
    });
    byId.add(estimatorId);
    byTokenizer.set(tokenizer, estimator);
  }
  const registry = Object.freeze({
    resolve(tokenizerValue: string): ModelTokenEstimator {
      const tokenizer = identifier(tokenizerValue, "tokenizer");
      const estimator = byTokenizer.get(tokenizer);
      if (!estimator) throw new TypeError(`Unknown model Token estimator for tokenizer ${tokenizer}.`);
      return estimator;
    }
  });
  estimatorRegistries.add(registry);
  return registry;
}

export function isModelTokenEstimatorRegistry(value: unknown): value is ModelTokenEstimatorRegistry {
  return Boolean(value) && typeof value === "object" && estimatorRegistries.has(value as object);
}

export function buildModelOperationTokenBudget(value: unknown): ModelTokenBudgetInput {
  const root = strictObject(value, "model operation Token budget", BUILD_FIELDS);
  const profile = parseModelProfile(root.profile);
  const operation = modelOperation(root.operation, "operation");
  if (!isModelTokenEstimatorRegistry(root.estimators)) {
    throw new TypeError("estimators must be a registered model Token estimator registry.");
  }
  const estimate = strictObject(root.estimate, "estimate", ESTIMATE_FIELDS);
  const systemText = text(estimate.systemText, "estimate.systemText");
  const inputText = text(estimate.inputText, "estimate.inputText");
  const reservedOutputTokens = nonnegativeInteger(estimate.reservedOutputTokens, "estimate.reservedOutputTokens");
  const providerSafetyMarginTokens = nonnegativeInteger(
    estimate.providerSafetyMarginTokens,
    "estimate.providerSafetyMarginTokens"
  );
  const operationProfile = profile.operations[operation];
  const estimator = root.estimators.resolve(operationProfile.tokenizer);
  return Object.freeze({
    contextWindowTokens: operationProfile.contextWindowTokens,
    maxInputTokens: operationProfile.maxInputTokens,
    maxOutputTokens: operationProfile.maxOutputTokens,
    estimatedSystemTokens: estimator.estimateTokens(systemText),
    estimatedInputTokens: estimator.estimateTokens(inputText),
    reservedOutputTokens,
    providerSafetyMarginTokens
  });
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

function text(value: unknown, path: string): string {
  if (typeof value !== "string") throw new TypeError(`${path} must be text.`);
  return value;
}

function nonnegativeInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${path} must be a nonnegative safe integer.`);
  }
  return value;
}

function modelOperation(value: unknown, path: string): ModelProfileOperation {
  if (typeof value !== "string" || !MODEL_PROFILE_OPERATIONS.includes(value as ModelProfileOperation)) {
    throw new TypeError(`${path} must name an approved V4 model operation, not ${String(value)}.`);
  }
  return value as ModelProfileOperation;
}
