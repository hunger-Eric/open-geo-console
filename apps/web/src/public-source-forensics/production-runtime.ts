import type { PublicSourceForensicsDependencies } from "@/worker/public-source-forensics";

/** Phase 5 deployment boundary: no live vendor/authority is installed yet. Phase 8 replaces this inert factory. */
export async function createProductionPublicSourceForensicsDependencies(): Promise<PublicSourceForensicsDependencies | null> {
  return null;
}
