import path from "node:path";
import { FilesystemEvidenceStorage } from "./storage-filesystem";
import { S3EvidenceStorage } from "./storage-s3";
import { VercelBlobEvidenceStorage } from "./storage-vercel-blob";

export interface StoredEvidenceObject {
  body: Uint8Array;
  contentType: string;
}

export interface EvidenceStorage {
  readonly provider: "filesystem" | "s3" | "vercel-blob";
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredEvidenceObject | null>;
  delete(key: string): Promise<void>;
}

export function evidenceStorageKey(reportId: string, assetId: string, extension = "webp"): string {
  const safeReportId = safeSegment(reportId);
  const safeAssetId = safeSegment(assetId);
  const safeExtension = extension.replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (!safeExtension) throw new Error("Evidence asset extension is invalid.");
  return `reports/${safeReportId}/evidence/${safeAssetId}.${safeExtension}`;
}

export function assertEvidenceStorageKey(key: string): string {
  const normalized = key.replace(/\\/g, "/");
  if (!/^reports\/[a-zA-Z0-9_-]+\/evidence\/[a-zA-Z0-9_-]+\.[a-z0-9]+$/.test(normalized)) {
    throw new Error("Evidence storage key is invalid.");
  }
  return normalized;
}

export function createEvidenceStorage(environment: NodeJS.ProcessEnv = process.env): EvidenceStorage {
  const configured = environment.OGC_EVIDENCE_STORAGE?.trim().toLowerCase();
  const deployed = environment.OGC_DEPLOYMENT_PROFILE === "staging" || environment.OGC_DEPLOYMENT_PROFILE === "production";
  const provider = configured || (deployed ? "" : "filesystem");
  if (provider === "filesystem") {
    if (deployed) throw new Error("Filesystem evidence storage is not allowed in staging or production.");
    const root = environment.OGC_EVIDENCE_FILESYSTEM_ROOT?.trim() || path.join(process.cwd(), ".data", "evidence-assets");
    return new FilesystemEvidenceStorage(root);
  }
  if (provider === "s3") return S3EvidenceStorage.fromEnvironment(environment);
  if (provider === "vercel-blob") return new VercelBlobEvidenceStorage();
  throw new Error("OGC_EVIDENCE_STORAGE must be s3 or vercel-blob in staging/production, or filesystem in local development.");
}

function safeSegment(value: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error("Evidence storage identifier is invalid.");
  return value;
}
