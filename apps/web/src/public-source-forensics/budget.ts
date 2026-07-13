export interface PublicSourceExecutionBudget {
  dailyRequestCap: number; dailyCostMicrosCap: number; maxResultsPerQuestion: number;
  timeoutMs: number; maxTransientRetries: 1; sourceFetchMaxBytes: number; sourceFetchMaxRedirects: number;
}

export function readPublicSourceExecutionBudget(environment: NodeJS.ProcessEnv): PublicSourceExecutionBudget {
  return {
    dailyRequestCap: integer(environment.OGC_PUBLIC_SEARCH_DAILY_REQUEST_CAP, 100, 1, 10_000),
    dailyCostMicrosCap: integer(environment.OGC_PUBLIC_SEARCH_DAILY_COST_MICROS_CAP, 10_000_000, 0, 1_000_000_000),
    maxResultsPerQuestion: integer(environment.OGC_PUBLIC_SEARCH_MAX_RESULTS_PER_QUESTION, 10, 1, 50),
    timeoutMs: integer(environment.OGC_PUBLIC_SEARCH_TIMEOUT_MS, 30_000, 1_000, 120_000),
    maxTransientRetries: 1,
    sourceFetchMaxBytes: integer(environment.OGC_PUBLIC_SOURCE_FETCH_MAX_BYTES, 2_097_152, 1_024, 5_242_880),
    sourceFetchMaxRedirects: integer(environment.OGC_PUBLIC_SOURCE_FETCH_MAX_REDIRECTS, 5, 0, 10)
  };
}
function integer(value:string|undefined,fallback:number,min:number,max:number):number{const parsed=value===undefined?fallback:Number(value);if(!Number.isSafeInteger(parsed)||parsed<min||parsed>max)throw new Error(`Public-source budget must be an integer from ${min} through ${max}.`);return parsed;}
