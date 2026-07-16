import { describe, expect, it } from "vitest";
import { VercelBlobEvidenceStorage, type PrivateBlobClient } from "./storage-vercel-blob";

describe("Vercel private Blob evidence storage", () => {
  it("round-trips report-scoped bytes using private, uncached SDK calls", async () => {
    const objects = new Map<string, { body: Uint8Array; contentType: string }>();
    const client: PrivateBlobClient = {
      async put(pathname, body, options) {
        expect(options).toMatchObject({
          access: "private",
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: "image/jpeg"
        });
        objects.set(pathname, { body, contentType: options.contentType });
      },
      async get(pathname, options) {
        expect(options).toEqual({ access: "private", useCache: false });
        const object = objects.get(pathname);
        if (!object) return null;
        return {
          statusCode: 200,
          stream: new Blob([object.body]).stream(),
          blob: { contentType: object.contentType }
        };
      },
      async delete(pathname) {
        objects.delete(pathname);
      }
    };
    const storage = new VercelBlobEvidenceStorage(client);
    const key = "reports/report_1/evidence/asset-1.jpg";

    await storage.put(key, new Uint8Array([4, 5, 6]), "image/jpeg");
    expect(await storage.get(key)).toEqual({
      body: new Uint8Array([4, 5, 6]),
      contentType: "image/jpeg"
    });
    await storage.delete(key);
    expect(await storage.get(key)).toBeNull();
  });

  it("rejects paths outside the report evidence namespace", async () => {
    const storage = new VercelBlobEvidenceStorage({
      put: async () => undefined,
      get: async () => null,
      delete: async () => undefined
    });
    await expect(storage.put("../secret.jpg", new Uint8Array(), "image/jpeg")).rejects.toThrow("invalid");
  });
});
