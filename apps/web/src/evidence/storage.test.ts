import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertEvidenceStorageKey,
  createEvidenceStorage,
  evidenceStorageKey
} from "./storage";
import { FilesystemEvidenceStorage } from "./storage-filesystem";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("private evidence storage", () => {
  it("builds opaque report-scoped keys and rejects traversal", () => {
    expect(evidenceStorageKey("report_1", "asset-1")).toBe("reports/report_1/evidence/asset-1.webp");
    expect(() => assertEvidenceStorageKey("reports/../secret")).toThrow("invalid");
    expect(() => evidenceStorageKey("../report", "asset")).toThrow("identifier");
  });

  it("round-trips bytes through the development filesystem adapter", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ogc-evidence-"));
    roots.push(root);
    const storage = new FilesystemEvidenceStorage(root);
    const key = evidenceStorageKey("report", "asset");

    await storage.put(key, new Uint8Array([1, 2, 3]), "image/webp");
    const stored = await storage.get(key);

    expect(stored?.contentType).toBe("image/webp");
    expect([...stored!.body]).toEqual([1, 2, 3]);
    await storage.delete(key);
    expect(await storage.get(key)).toBeNull();
  });

  it("refuses filesystem storage in staging and requires complete S3 configuration", () => {
    expect(() => createEvidenceStorage({
      OGC_DEPLOYMENT_PROFILE: "staging",
      OGC_EVIDENCE_STORAGE: "filesystem"
    })).toThrow("not allowed");
    expect(() => createEvidenceStorage({
      OGC_DEPLOYMENT_PROFILE: "production",
      OGC_EVIDENCE_STORAGE: "s3"
    })).toThrow("OGC_EVIDENCE_S3_ENDPOINT");
    expect(createEvidenceStorage({
      OGC_DEPLOYMENT_PROFILE: "staging",
      OGC_EVIDENCE_STORAGE: "vercel-blob"
    }).provider).toBe("vercel-blob");
  });
});
