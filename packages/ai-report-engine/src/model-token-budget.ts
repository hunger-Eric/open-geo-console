export interface ModelTokenBudgetInput {
  readonly contextWindowTokens: number;
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
  readonly estimatedSystemTokens: number;
  readonly estimatedInputTokens: number;
  readonly reservedOutputTokens: number;
  readonly providerSafetyMarginTokens: number;
}

export type ModelTokenBudgetRejectionCode =
  | "invalid_budget_limit"
  | "invalid_token_estimate"
  | "max_input_exceeded"
  | "max_output_exceeded"
  | "context_window_exceeded";

export type ModelTokenBudgetResult =
  | {
      readonly accepted: true;
      readonly estimatedTotalTokens: number;
    }
  | {
      readonly accepted: false;
      readonly code: "invalid_budget_limit" | "invalid_token_estimate";
      readonly field: keyof ModelTokenBudgetInput | "estimatedTotalTokens";
    }
  | {
      readonly accepted: false;
      readonly code: "max_input_exceeded" | "max_output_exceeded";
      readonly estimatedTokens: number;
      readonly limitTokens: number;
    }
  | {
      readonly accepted: false;
      readonly code: "context_window_exceeded";
      readonly estimatedTotalTokens: number;
      readonly limitTokens: number;
    };

export type ModelTokenBudgetRejection = Exclude<ModelTokenBudgetResult, { accepted: true }>;

const LIMIT_FIELDS = ["contextWindowTokens", "maxInputTokens", "maxOutputTokens"] as const;
const ESTIMATE_FIELDS = [
  "estimatedSystemTokens",
  "estimatedInputTokens",
  "reservedOutputTokens",
  "providerSafetyMarginTokens"
] as const;

export function evaluateModelTokenBudget(input: ModelTokenBudgetInput): ModelTokenBudgetResult {
  for (const field of LIMIT_FIELDS) {
    if (!Number.isSafeInteger(input[field]) || input[field] <= 0) {
      return { accepted: false, code: "invalid_budget_limit", field };
    }
  }
  for (const field of ESTIMATE_FIELDS) {
    if (!Number.isSafeInteger(input[field]) || input[field] < 0) {
      return { accepted: false, code: "invalid_token_estimate", field };
    }
  }

  if (input.estimatedInputTokens > input.maxInputTokens) {
    return {
      accepted: false,
      code: "max_input_exceeded",
      estimatedTokens: input.estimatedInputTokens,
      limitTokens: input.maxInputTokens
    };
  }
  if (input.reservedOutputTokens > input.maxOutputTokens) {
    return {
      accepted: false,
      code: "max_output_exceeded",
      estimatedTokens: input.reservedOutputTokens,
      limitTokens: input.maxOutputTokens
    };
  }

  const estimatedTotalTokens = input.estimatedSystemTokens
    + input.estimatedInputTokens
    + input.reservedOutputTokens
    + input.providerSafetyMarginTokens;
  if (!Number.isSafeInteger(estimatedTotalTokens)) {
    return { accepted: false, code: "invalid_token_estimate", field: "estimatedTotalTokens" };
  }
  if (estimatedTotalTokens > input.contextWindowTokens) {
    return {
      accepted: false,
      code: "context_window_exceeded",
      estimatedTotalTokens,
      limitTokens: input.contextWindowTokens
    };
  }
  return { accepted: true, estimatedTotalTokens };
}

export class ModelTokenBudgetError extends Error {
  readonly code: ModelTokenBudgetRejectionCode;
  readonly retryable = false as const;
  readonly rejection: ModelTokenBudgetRejection;

  constructor(rejection: ModelTokenBudgetRejection) {
    super(messageForRejection(rejection));
    this.name = "ModelTokenBudgetError";
    this.code = rejection.code;
    this.rejection = rejection;
  }
}

export async function runWithModelTokenBudget<T>(
  input: ModelTokenBudgetInput,
  providerCall: () => Promise<T>
): Promise<T> {
  const result = evaluateModelTokenBudget(input);
  if (!result.accepted) throw new ModelTokenBudgetError(result);
  return providerCall();
}

function messageForRejection(rejection: ModelTokenBudgetRejection): string {
  switch (rejection.code) {
    case "invalid_budget_limit":
      return `Model Token budget limit ${rejection.field} is invalid.`;
    case "invalid_token_estimate":
      return `Model Token estimate ${rejection.field} is invalid.`;
    case "max_input_exceeded":
      return `Model input estimate ${rejection.estimatedTokens} exceeds the operation limit ${rejection.limitTokens}.`;
    case "max_output_exceeded":
      return `Model output reservation ${rejection.estimatedTokens} exceeds the operation limit ${rejection.limitTokens}.`;
    case "context_window_exceeded":
      return `Model Token budget ${rejection.estimatedTotalTokens} exceeds the context window ${rejection.limitTokens}.`;
  }
}
