import fs from "node:fs/promises";
import path from "node:path";
import { assertEvidenceStorageKey, type EvidenceStorage, type StoredEvidenceObject } from "./storage";

export class FilesystemEvidenceStorage implements EvidenceStorage {
  readonly provider = "filesystem" as const;

  constructor(private readonly root: string) {}

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    const target = this.resolve(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await Promise.all([
      fs.writeFile(target, body),
      fs.writeFile(`${target}.meta`, JSON.stringify({ contentType }), "utf8")
    ]);
  }

  async get(key: string): Promise<StoredEvidenceObject | null> {
    const target = this.resolve(key);
    try {
      const [body, metadata] = await Promise.all([
        fs.readFile(target),
        fs.readFile(`${target}.meta`, "utf8")
      ]);
      const parsed = JSON.parse(metadata) as { contentType?: unknown };
      return {
        body,
        contentType: typeof parsed.contentType === "string" ? parsed.contentType : "application/octet-stream"
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    const target = this.resolve(key);
    await Promise.all([
      fs.rm(target, { force: true }),
      fs.rm(`${target}.meta`, { force: true })
    ]);
  }

  private resolve(key: string): string {
    const normalized = assertEvidenceStorageKey(key);
    const root = path.resolve(this.root);
    const target = path.resolve(root, ...normalized.split("/"));
    if (!target.startsWith(`${root}${path.sep}`)) throw new Error("Evidence storage path escapes its private root.");
    return target;
  }
}
