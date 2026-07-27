import { del, get, put } from "@vercel/blob";
import { assertEvidenceStorageKey, type EvidenceStorage, type StoredEvidenceObject } from "./storage";

interface PrivateBlobResult {
  statusCode: number;
  stream: ReadableStream<Uint8Array> | null;
  blob: { contentType: string | null };
}

export interface PrivateBlobClient {
  put(pathname: string, body: Uint8Array, options: {
    access: "private";
    addRandomSuffix: false;
    allowOverwrite: true;
    contentType: string;
  }): Promise<unknown>;
  get(pathname: string, options: { access: "private"; useCache: false }): Promise<PrivateBlobResult | null>;
  delete(pathname: string): Promise<void>;
}

const sdkClient: PrivateBlobClient = {
  put: (pathname, body, options) => put(pathname, Buffer.from(body), options),
  get: (pathname, options) => get(pathname, options),
  delete: (pathname) => del(pathname)
};

export class VercelBlobEvidenceStorage implements EvidenceStorage {
  readonly provider = "vercel-blob" as const;

  constructor(private readonly client: PrivateBlobClient = sdkClient) {}

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    const pathname = assertEvidenceStorageKey(key);
    await this.client.put(pathname, body, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType
    });
  }

  async get(key: string): Promise<StoredEvidenceObject | null> {
    const result = await this.client.get(assertEvidenceStorageKey(key), {
      access: "private",
      useCache: false
    });
    if (result?.statusCode !== 200 || !result.stream) return null;
    return {
      body: new Uint8Array(await new Response(result.stream).arrayBuffer()),
      contentType: result.blob.contentType ?? "application/octet-stream"
    };
  }

  async delete(key: string): Promise<void> {
    await this.client.delete(assertEvidenceStorageKey(key));
  }
}
