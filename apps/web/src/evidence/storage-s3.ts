import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { assertEvidenceStorageKey, type EvidenceStorage, type StoredEvidenceObject } from "./storage";

export class S3EvidenceStorage implements EvidenceStorage {
  readonly provider = "s3" as const;

  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
    private readonly prefix = ""
  ) {}

  static fromEnvironment(environment: NodeJS.ProcessEnv): S3EvidenceStorage {
    const endpoint = required(environment, "OGC_EVIDENCE_S3_ENDPOINT");
    const region = required(environment, "OGC_EVIDENCE_S3_REGION");
    const bucket = required(environment, "OGC_EVIDENCE_S3_BUCKET");
    const accessKeyId = required(environment, "OGC_EVIDENCE_S3_ACCESS_KEY_ID");
    const secretAccessKey = required(environment, "OGC_EVIDENCE_S3_SECRET_ACCESS_KEY");
    return new S3EvidenceStorage(new S3Client({
      endpoint,
      region,
      forcePathStyle: environment.OGC_EVIDENCE_S3_FORCE_PATH_STYLE !== "false",
      credentials: { accessKeyId, secretAccessKey }
    }), bucket, environment.OGC_EVIDENCE_S3_PREFIX?.trim() ?? "");
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: this.key(key),
      Body: body,
      ContentType: contentType,
      CacheControl: "private, no-store"
    }));
  }

  async get(key: string): Promise<StoredEvidenceObject | null> {
    try {
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.key(key) }));
      if (!response.Body) return null;
      return {
        body: await response.Body.transformToByteArray(),
        contentType: response.ContentType ?? "application/octet-stream"
      };
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404) return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.key(key) }));
  }

  private key(key: string): string {
    const normalized = assertEvidenceStorageKey(key);
    const prefix = this.prefix.replace(/^\/+|\/+$/g, "");
    return prefix ? `${prefix}/${normalized}` : normalized;
  }
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required for private S3 evidence storage.`);
  return value;
}
