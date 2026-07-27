export const MODEL_PROFILE_OPERATIONS = [
  "pageAnalysis",
  "websiteSynthesis",
  "questionAnswer",
  "sourceDiagnosis"
] as const;

export type ModelProfileOperation = (typeof MODEL_PROFILE_OPERATIONS)[number];

export interface ModelOperationProfile {
  readonly model: string;
  readonly contextWindowTokens: number;
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
  readonly nativeWebSearch: boolean;
  readonly structuredOutput: boolean;
  readonly tokenizer: string;
}

export interface ModelProfile {
  readonly profileId: string;
  readonly provider: string;
  readonly adapterId: string;
  readonly operations: Readonly<Record<ModelProfileOperation, ModelOperationProfile>>;
}

const TOP_LEVEL_KEYS = new Set(["profileId", "provider", "adapterId", "operations"]);
const OPERATION_KEYS = new Set(MODEL_PROFILE_OPERATIONS);
const OPERATION_PROFILE_KEYS = new Set([
  "model",
  "contextWindowTokens",
  "maxInputTokens",
  "maxOutputTokens",
  "timeoutMs",
  "nativeWebSearch",
  "structuredOutput",
  "tokenizer"
]);

export function parseModelProfile(value: unknown): ModelProfile {
  const record = requireRecord(value, "model profile");
  rejectUnknownKeys(record, TOP_LEVEL_KEYS, "model profile");
  const operationsValue = requireRecord(record.operations, "operations");
  rejectUnknownKeys(operationsValue, OPERATION_KEYS, "operations");

  const operations = Object.fromEntries(MODEL_PROFILE_OPERATIONS.map((operation) => {
    if (!(operation in operationsValue)) {
      throw new TypeError(`Model profile is missing the ${operation} operation.`);
    }
    return [operation, parseOperationProfile(operation, operationsValue[operation])];
  })) as Record<ModelProfileOperation, ModelOperationProfile>;

  return Object.freeze({
    profileId: requireIdentifier(record.profileId, "profileId"),
    provider: requireIdentifier(record.provider, "provider"),
    adapterId: requireIdentifier(record.adapterId, "adapterId"),
    operations: Object.freeze(operations)
  });
}

function parseOperationProfile(operation: ModelProfileOperation, value: unknown): ModelOperationProfile {
  const record = requireRecord(value, `${operation} operation`);
  rejectUnknownKeys(record, OPERATION_PROFILE_KEYS, `${operation} operation`);
  const contextWindowTokens = requirePositiveInteger(record.contextWindowTokens, `${operation}.contextWindowTokens`);
  const maxInputTokens = requirePositiveInteger(record.maxInputTokens, `${operation}.maxInputTokens`);
  const maxOutputTokens = requirePositiveInteger(record.maxOutputTokens, `${operation}.maxOutputTokens`);

  if (maxInputTokens + maxOutputTokens > contextWindowTokens) {
    throw new TypeError(`${operation} operation limits cannot fit inside its context window.`);
  }

  return Object.freeze({
    model: requireIdentifier(record.model, `${operation}.model`),
    contextWindowTokens,
    maxInputTokens,
    maxOutputTokens,
    timeoutMs: requirePositiveInteger(record.timeoutMs, `${operation}.timeoutMs`),
    nativeWebSearch: requireBoolean(record.nativeWebSearch, `${operation}.nativeWebSearch`),
    structuredOutput: requireBoolean(record.structuredOutput, `${operation}.structuredOutput`),
    tokenizer: requireIdentifier(record.tokenizer, `${operation}.tokenizer`)
  });
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function rejectUnknownKeys(record: Record<string, unknown>, allowed: ReadonlySet<string>, path: string): void {
  const unknown = Object.keys(record).filter((key) => !allowed.has(key)).sort();
  if (unknown.length > 0) {
    throw new TypeError(`${path} contains unknown key ${unknown[0]}.`);
  }
}

function requireIdentifier(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${path} must be a nonblank string.`);
  }
  return value.trim();
}

function requirePositiveInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${path} must be a positive integer.`);
  }
  return value;
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new TypeError(`${path} must be a boolean.`);
  }
  return value;
}
