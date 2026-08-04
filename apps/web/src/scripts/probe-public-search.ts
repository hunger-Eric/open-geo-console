import {fileURLToPath} from "node:url";
import path from "node:path";
import {runMiMoPublicSearchProbe, type MiMoPublicSearchProbeSummary} from "@/public-search-adapters/mimo/certification";
import {runAnySearchPublicSearchProbe, type AnySearchPublicSearchProbeSummary} from "@/public-search-adapters/anysearch/certification";

export type PublicSearchProbeSummary = MiMoPublicSearchProbeSummary | AnySearchPublicSearchProbeSummary;
export interface PublicSearchProbeCommandOptions {adapter: "mimo" | "anysearch"; locale: string; region: string;}

export function parsePublicSearchProbeCommand(args: string[]): PublicSearchProbeCommandOptions {
  const values = pairs(args);
  const adapter = values.get("adapter")?.trim();
  const locale = values.get("locale")?.trim();
  const region = values.get("region")?.trim();
  if (adapter !== "mimo" && adapter !== "anysearch") throw new Error("--adapter must name the approved MiMo or AnySearch adapter.");
  if (!locale || !region) throw new Error("--locale and --region are required.");
  return {adapter, locale, region};
}

export async function runPublicSearchProbeCommand(
  args: string[],
  dependencies: {environment?: NodeJS.ProcessEnv; runProbe?: (input: Parameters<typeof runMiMoPublicSearchProbe>[0]) => Promise<PublicSearchProbeSummary>} = {}
): Promise<PublicSearchProbeSummary> {
  const options = parsePublicSearchProbeCommand(args);
  const runProbe = dependencies.runProbe ?? (options.adapter === "mimo"
    ? runMiMoPublicSearchProbe
    : runAnySearchPublicSearchProbe);
  return runProbe({
    environment: dependencies.environment ?? process.env,
    locale: options.locale,
    region: options.region
  });
}

export function formatPublicSearchProbeSummary(summary: PublicSearchProbeSummary): string {
  return JSON.stringify({
    adapterId: summary.adapterId,
    surface: {
      surfaceId: summary.identity.surface.surfaceId,
      providerId: summary.identity.providerId,
      productId: summary.identity.productId,
      modelId: summary.identity.modelId,
      adapterVersion: summary.identity.adapterVersion,
      surfaceVersion: summary.identity.surface.surfaceVersion,
      locale: summary.identity.surface.locale,
      region: summary.identity.surface.region
    },
    cases: summary.cases.map(({id, status, passed, sourceDomains, sourceCount, usage, sanitizedErrorClass}) => ({
      id, status, passed, sourceDomains, sourceCount, usage,
      ...(sanitizedErrorClass === undefined ? {} : {sanitizedErrorClass})
    })),
    failureSemantics: summary.failureSemantics
  });
}

export function assertPublicSearchProbeReadiness(summary: PublicSearchProbeSummary): void {
  if (summary.cases.length !== 3 || summary.cases.some(({passed}) => passed !== true)) {
    throw new Error("Public-search quality readiness did not pass every required case.");
  }
  if (Object.values(summary.failureSemantics).some((passed) => passed !== true)) {
    throw new Error("Public-search deterministic failure semantics are not ready.");
  }
}

function pairs(args: string[]): Map<string, string> {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index], value = args[index + 1];
    if (!flag?.startsWith("--") || !value || value.startsWith("--")) throw new Error("Probe arguments must be --name value pairs.");
    if (values.has(flag.slice(2))) throw new Error(`Duplicate probe argument: ${flag}`);
    values.set(flag.slice(2), value);
  }
  if (values.size !== 3 || [...values.keys()].some((name) => !["adapter", "locale", "region"].includes(name))) {
    throw new Error("Only --adapter, --locale, and --region are accepted.");
  }
  return values;
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  runPublicSearchProbeCommand(process.argv.slice(2))
    .then((summary) => {
      console.log(formatPublicSearchProbeSummary(summary));
      assertPublicSearchProbeReadiness(summary);
    })
    .catch((error) => { console.error(error instanceof Error ? error.message : "Public-search probe failed."); process.exitCode = 1; });
}
