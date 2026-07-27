import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  activatePublicSearchSurfaceAuthority,
  listPublicSearchSurfaceAuthorities
} from "@/db/public-search-authority";
import { closeDatabase, ensureDatabase, getDatabaseEnvironmentStatus } from "@/db";
import { prepareStagingCommand } from "./staging-guard";

/** Activates one already-installed authority only after the staging DB guard. */
export async function activateStagingPublicSearchAuthority(input: {
  authorityVersion: string;
  environment: NodeJS.ProcessEnv;
}) {
  const authorityVersion = input.authorityVersion.trim();
  if (!/^public-search-authority-[a-f0-9]{64}$/.test(authorityVersion)) {
    throw new Error("An exact public-search authority version is required.");
  }
  await prepareStagingCommand({ environment: input.environment, ensureDatabase, getDatabaseStatus: getDatabaseEnvironmentStatus });
  const row = (await listPublicSearchSurfaceAuthorities({ environment: "staging" }))
    .find((candidate) => candidate.authorityVersion === authorityVersion);
  if (!row) throw new Error("The requested staging public-search authority is not installed.");
  const active = await activatePublicSearchSurfaceAuthority({
    authorityVersion: row.authorityVersion,
    environment: "staging",
    adapterId: row.adapterId,
    providerId: row.providerId,
    productId: row.productId,
    modelId: row.modelId,
    adapterVersion: row.adapterVersion,
    surfaceId: row.surfaceId,
    surfaceVersion: row.surfaceVersion
  });
  return { activated: true, authorityVersion: active.authorityVersion, environment: active.environment, active: active.active };
}

async function main() {
  const args = process.argv.slice(2);
  const index = args.indexOf("--authority-version");
  const authorityVersion = index < 0 ? undefined : args[index + 1];
  if (!authorityVersion) throw new Error("--authority-version is required.");
  console.log(JSON.stringify(await activateStagingPublicSearchAuthority({ authorityVersion, environment: process.env })));
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Authority activation failed.");
    process.exitCode = 1;
  }).finally(closeDatabase);
}
