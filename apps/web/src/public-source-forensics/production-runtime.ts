import type { PublicSearchSurfaceAdapter, PublicSearchSurfaceAuthority } from "@open-geo-console/public-search-observer";
import { createApprovedPublicSearchAdapterRegistry, selectApprovedPublicSearchAdapterFactory } from "@/public-search-adapters/registry";
import { createMiMoPublicSearchAdapterFactory } from "@/public-search-adapters/mimo/adapter";
import type { PublicSearchAdapterFactory, PublicSearchAdapterIdentity } from "@/public-search-adapters/types";
import { getActivePublicSearchSurfaceAuthority } from "@/db/public-search-authority";
import type { PublicSearchSurfaceAuthorityRow } from "@/db/schema";
import type { PublicSourceForensicsDependencies } from "@/worker/public-source-forensics";
import { PublicSourceRuntimeError } from "@/worker/job-errors";
import { resolveMiMoGenerativeSearchAnswerProvider } from "@/public-search-adapters/mimo/generative-answer";
import type { GenerativeSearchAnswerProvider } from "@open-geo-console/ai-report-engine";

export const APPROVED_FACTORIES = createApprovedPublicSearchAdapterRegistry([createMiMoPublicSearchAdapterFactory()]);

export function resolveGenerativeSearchAnswerProvider(environment: NodeJS.ProcessEnv, input: { locale: string; region: string }, dependencies: { fetch?: typeof fetch; now?: () => Date } = {}): GenerativeSearchAnswerProvider {
  const adapter = environment.OGC_PUBLIC_SEARCH_ADAPTER ?? "mimo";
  if (adapter !== "mimo") throw new PublicSourceRuntimeError("Generative-search answer provider is unavailable.", "public_source_runtime_unsupported");
  return resolveMiMoGenerativeSearchAnswerProvider(environment, input, dependencies);
}

export interface ProductionPublicSourceForensicsRuntimeOptions {
  resolveRuntime?: typeof resolveProductionPublicSearchRuntime;
  createDependencies?: (runtime: {
    adapter: PublicSearchSurfaceAdapter;
    authority: PublicSearchSurfaceAuthority;
    identity: PublicSearchAdapterIdentity;
  }) => Promise<PublicSourceForensicsDependencies>;
}

export async function resolveProductionPublicSearchRuntime(input:{environment:NodeJS.ProcessEnv;getAuthority:typeof getActivePublicSearchSurfaceAuthority;registry?:ReadonlyMap<string,PublicSearchAdapterFactory>}):Promise<{adapter:PublicSearchSurfaceAdapter;authority:PublicSearchSurfaceAuthority;identity:PublicSearchAdapterIdentity}> {
  const environment=input.environment;
  if(environment.OGC_PUBLIC_SEARCH_RUNTIME_ENABLED!=="true") throw new PublicSourceRuntimeError("Public-search runtime is disabled.", "public_source_runtime_disabled");
  const profile=environment.OGC_DEPLOYMENT_PROFILE;
  if(profile!=="staging"&&profile!=="production") throw new PublicSourceRuntimeError("Public-search runtime environment is invalid.", "public_source_runtime_environment_invalid");
  const locale=required(environment.OGC_PUBLIC_SEARCH_LOCALE,"OGC_PUBLIC_SEARCH_LOCALE"),region=required(environment.OGC_PUBLIC_SEARCH_REGION,"OGC_PUBLIC_SEARCH_REGION");
  const factory=selectApprovedPublicSearchAdapterFactory({environment,registry:input.registry??APPROVED_FACTORIES});
  const identity=factory.resolveIdentity({environment,locale,region});
  const row=await input.getAuthority({environment:profile,adapterId:identity.adapterId,providerId:identity.providerId,productId:identity.productId,modelId:identity.modelId,adapterVersion:identity.adapterVersion,surfaceId:identity.surface.surfaceId,surfaceVersion:identity.surface.surfaceVersion,locale,region,authorityVersion:environment.OGC_PUBLIC_SEARCH_AUTHORITY_VERSION});
  assertRow(row,identity,profile,locale,region);
  const references=Array.isArray(row.evidenceReferences)&&row.evidenceReferences.every((value):value is string=>typeof value==="string")?row.evidenceReferences:[];
  const locales=Array.isArray(row.localeCapabilities)&&row.localeCapabilities.every((value):value is string=>typeof value==="string")?row.localeCapabilities:[];
  const regions=Array.isArray(row.regionCapabilities)&&row.regionCapabilities.every((value):value is string=>typeof value==="string")?row.regionCapabilities:[];
  const authority:PublicSearchSurfaceAuthority={authorityId:row.authorityVersion,environment:profile==="staging"?"protected_staging":"production",surface:identity.surface,active:row.active,certifiedAt:row.capturedAt.toISOString(),evidenceReference:references[0]??"",supportedLocales:locales,supportedRegions:regions};
  return {adapter:factory.create({environment,authority}),authority,identity};
}
export async function createProductionPublicSourceForensicsDependencies(
  environment: NodeJS.ProcessEnv = process.env,
  options: ProductionPublicSourceForensicsRuntimeOptions = {}
): Promise<PublicSourceForensicsDependencies> {
  try {
    const runtime = await (options.resolveRuntime ?? resolveProductionPublicSearchRuntime)({
      environment,
      getAuthority: getActivePublicSearchSurfaceAuthority
    });
    if (!options.createDependencies) throw new PublicSourceRuntimeError("Required public-source Worker collaborator is unavailable.", "public_source_dependency_missing");
    const dependencies = await options.createDependencies(runtime);
    if (!sameAuthority(dependencies.authority, runtime.authority)) throw new PublicSourceRuntimeError("Public-source runtime dependency authority mismatch.", "public_source_authority_mismatch");
    return dependencies;
  } catch (error) {
    if (error instanceof PublicSourceRuntimeError) throw error;
    throw new PublicSourceRuntimeError(error instanceof Error ? error.message : "Public-source runtime resolution failed.", "public_source_runtime_resolution_failed", { cause: error });
  }
}
function required(value:string|undefined,name:string){if(!value?.trim())throw new PublicSourceRuntimeError(`${name} is required.`, "public_source_required_configuration");return value.trim();}
function assertRow(row:PublicSearchSurfaceAuthorityRow,identity:PublicSearchAdapterIdentity,environment:"staging"|"production",locale:string,region:string){const locales=Array.isArray(row.localeCapabilities)?row.localeCapabilities.filter((value):value is string=>typeof value==="string"):[];const regions=Array.isArray(row.regionCapabilities)?row.regionCapabilities.filter((value):value is string=>typeof value==="string"):[];if(!row.active||row.environment!==environment||row.adapterId!==identity.adapterId||row.providerId!==identity.providerId||row.productId!==identity.productId||row.modelId!==identity.modelId||row.adapterVersion!==identity.adapterVersion||row.surfaceId!==identity.surface.surfaceId||row.surfaceVersion!==identity.surface.surfaceVersion||!locales.includes(locale)||!regions.includes(region))throw new PublicSourceRuntimeError("Public-search authority identity mismatch.", "public_source_authority_mismatch");}
function sameAuthority(left: PublicSearchSurfaceAuthority, right: PublicSearchSurfaceAuthority): boolean {
  const surfaceKeys: Array<keyof PublicSearchSurfaceAuthority["surface"]> = ["surfaceId", "providerId", "productId", "surfaceKind", "contractVersion", "surfaceVersion", "adapterVersion", "locale", "region"];
  return left.authorityId === right.authorityId && left.environment === right.environment && left.active === right.active &&
    left.certifiedAt === right.certifiedAt && left.evidenceReference === right.evidenceReference &&
    surfaceKeys.every((key) => left.surface[key] === right.surface[key]) &&
    sameStringSet(left.supportedLocales, right.supportedLocales) && sameStringSet(left.supportedRegions, right.supportedRegions);
}
function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}
