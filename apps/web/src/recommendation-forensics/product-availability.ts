import type { PublicSearchSurfaceAuthorityRow } from "@/db/schema";

export type RecommendationProductAvailabilityCode="ready"|"disabled"|"environment"|"runtime_incomplete"|"authority_unavailable"|"authority_mismatch";
export interface RecommendationProductAvailability{ready:boolean;lane:"public"|null;code:RecommendationProductAvailabilityCode;}
export function evaluateRecommendationProductAvailability(input:{environment:NodeJS.ProcessEnv;authority:PublicSearchSurfaceAuthorityRow|null;registryReady:boolean;builderAvailable:boolean;artifactGateAvailable:boolean;}):RecommendationProductAvailability{
  if(input.environment.OGC_PUBLIC_SEARCH_RUNTIME_ENABLED!=="true")return closed("disabled");
  if(input.environment.OGC_DEPLOYMENT_PROFILE!=="staging"&&input.environment.OGC_DEPLOYMENT_PROFILE!=="production")return closed("environment");
  if(!input.authority)return closed("authority_unavailable");
  const exact=input.authority.active&&input.authority.environment===input.environment.OGC_DEPLOYMENT_PROFILE&&input.authority.surfaceId===input.environment.OGC_PUBLIC_SEARCH_SURFACE_ID&&input.authority.surfaceVersion===input.environment.OGC_PUBLIC_SEARCH_SURFACE_VERSION&&
    stringArray(input.authority.localeCapabilities).includes(input.environment.OGC_PUBLIC_SEARCH_LOCALE!)&&stringArray(input.authority.regionCapabilities).includes(input.environment.OGC_PUBLIC_SEARCH_REGION!)&&(!input.environment.OGC_PUBLIC_SEARCH_AUTHORITY_VERSION||input.authority.authorityVersion===input.environment.OGC_PUBLIC_SEARCH_AUTHORITY_VERSION);
  if(!exact)return closed("authority_mismatch");
  if(!input.registryReady||!input.builderAvailable||!input.artifactGateAvailable)return closed("runtime_incomplete");
  return {ready:true,lane:"public",code:"ready"};
}
export async function getRecommendationProductAvailability(environment:NodeJS.ProcessEnv=process.env):Promise<RecommendationProductAvailability>{
  if(environment.OGC_PUBLIC_SEARCH_RUNTIME_ENABLED!=="true")return closed("disabled");
  const profile=environment.OGC_DEPLOYMENT_PROFILE; if(profile!=="staging"&&profile!=="production")return closed("environment");
  const required=[environment.OGC_PUBLIC_SEARCH_ADAPTER,environment.OGC_PUBLIC_SEARCH_LOCALE,environment.OGC_PUBLIC_SEARCH_REGION]; if(required.some((value)=>!value?.trim()))return closed("runtime_incomplete");
  try{
    const {resolveProductionPublicSearchRuntime}=await import("@/public-source-forensics/production-runtime");
    await resolveProductionPublicSearchRuntime({environment,getAuthority:(await import("@/db/public-search-authority")).getActivePublicSearchSurfaceAuthority});
    // Resolving the production runtime verifies the compile-time-reviewed
    // adapter, exact active authority, and its configured capabilities. The
    // report builder and pre-terminal artifact gate are statically imported by
    // the V2 Worker graph; reaching this point is therefore the live checkout
    // admission condition rather than an incomplete-runtime state.
    return {ready:true,lane:"public",code:"ready"};
  }catch{return closed("authority_unavailable");}
}
export async function assertRecommendationProductAvailable(environment:NodeJS.ProcessEnv=process.env):Promise<void>{if(!(await getRecommendationProductAvailability(environment)).ready)throw new Error("The recommendation-forensics product is not available.");}
function closed(code:RecommendationProductAvailabilityCode):RecommendationProductAvailability{return {ready:false,lane:null,code};}
function stringArray(value:unknown):string[]{return Array.isArray(value)&&value.every((item)=>typeof item==="string")?value:[];}
