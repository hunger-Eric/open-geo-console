import {chmod, writeFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {finalizeMiMoPublicSearchCertification, runMiMoPublicSearchProbe} from "@/public-search-adapters/mimo/certification";
import {assertPrivatePublicSearchCertificationArtifact, ensurePrivatePublicSearchCertificationDirectory, privatePublicSearchCertificationPath} from "@/public-search/certification-path";
import {readPublicSearchCertificationSigningConfig} from "@/public-search/certification-artifact";

export interface PublicSearchCertificationCommandOptions {
  adapterId: "mimo";
  locale: string;
  region: string;
  output: string;
  reviewedBy: string;
  termsReviewReference: string;
  commercialUseReviewReference: string;
  storageDisplayReviewReference: string;
}
export interface ApprovedPublicSearchCertificationAdapter {
  certify(input: PublicSearchCertificationCommandOptions & {environment: NodeJS.ProcessEnv}): Promise<void>;
}

export const approvedPublicSearchCertificationAdapters: ReadonlyMap<string, ApprovedPublicSearchCertificationAdapter> = new Map([
  ["mimo", {certify: certifyMiMoPublicSearchSurface}]
]);

export function parsePublicSearchCertificationCommand(args: string[]): PublicSearchCertificationCommandOptions {
  const values = pairs(args);
  const adapterId = values.get("adapter")?.trim();
  const locale = values.get("locale")?.trim();
  const region = values.get("region")?.trim();
  const output = values.get("output")?.trim();
  const reviewedBy = values.get("reviewed-by")?.trim();
  const termsReviewReference = values.get("terms-review-reference")?.trim();
  const commercialUseReviewReference = values.get("commercial-use-review-reference")?.trim();
  const storageDisplayReviewReference = values.get("storage-display-review-reference")?.trim();
  if (adapterId !== "mimo") throw new Error("No approved public-search certification adapter is installed; network certification remains fail-closed.");
  if (!locale || !region || !output || !reviewedBy || !termsReviewReference || !commercialUseReviewReference || !storageDisplayReviewReference) {
    throw new Error("--adapter, --locale, --region, --output, --reviewed-by, and all three --*-review-reference arguments are required.");
  }
  return {adapterId, locale, region, output: privatePublicSearchCertificationPath(output), reviewedBy, termsReviewReference, commercialUseReviewReference, storageDisplayReviewReference};
}

export async function runPublicSearchCertificationCommand(
  args: string[],
  dependencies: {environment?: NodeJS.ProcessEnv; certify?: ApprovedPublicSearchCertificationAdapter["certify"]} = {}
): Promise<void> {
  const options = parsePublicSearchCertificationCommand(args);
  const adapter = dependencies.certify ?? approvedPublicSearchCertificationAdapters.get(options.adapterId)?.certify;
  if (!adapter) throw new Error("No approved public-search certification adapter is installed; network certification remains fail-closed.");
  await adapter({...options, environment: dependencies.environment ?? process.env});
}

async function certifyMiMoPublicSearchSurface(input: PublicSearchCertificationCommandOptions & {environment: NodeJS.ProcessEnv}): Promise<void> {
  if (input.environment.OGC_DEPLOYMENT_PROFILE !== "staging") throw new Error("MiMo public-search certification is restricted to protected staging.");
  const probe = await runMiMoPublicSearchProbe({environment: input.environment, locale: input.locale, region: input.region});
  const artifact = finalizeMiMoPublicSearchCertification({
    probe,
    locale: input.locale,
    region: input.region,
    reviewedBy: input.reviewedBy,
    reviewedAt: new Date().toISOString(),
    review: {
      termsReviewReference: input.termsReviewReference,
      commercialUseReviewReference: input.commercialUseReviewReference,
      storageDisplayReviewReference: input.storageDisplayReviewReference
    },
    signing: readPublicSearchCertificationSigningConfig(input.environment)
  });
  await ensurePrivatePublicSearchCertificationDirectory();
  await writeFile(input.output, `${JSON.stringify(artifact, null, 2)}\n`, {encoding: "utf8", flag: "wx", mode: 0o600});
  await chmod(input.output, 0o600);
  await assertPrivatePublicSearchCertificationArtifact(input.output);
  console.log(JSON.stringify({adapterId: artifact.adapterId, mode: artifact.mode, installable: artifact.installable, artifactHash: artifact.artifactHash, output: input.output}));
}

function pairs(args: string[]): Map<string, string> {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index], value = args[index + 1];
    if (!flag?.startsWith("--") || !value || value.startsWith("--")) throw new Error("Certification arguments must be --name value pairs.");
    const name = flag.slice(2);
    if (values.has(name)) throw new Error(`Duplicate certification argument: ${flag}`);
    values.set(name, value);
  }
  return values;
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  runPublicSearchCertificationCommand(process.argv.slice(2))
    .catch((error) => { console.error(error instanceof Error ? error.message : "Certification failed."); process.exitCode = 1; });
}
