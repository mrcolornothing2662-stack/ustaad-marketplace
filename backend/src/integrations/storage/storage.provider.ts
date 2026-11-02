import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHmac, createHash } from "node:crypto";
import { AppError } from "../../common/errors/app-error";

export interface StorageUploadParams {
  storageKey: string;
  buffer: Buffer;
  mimeType: string;
  isPublic?: boolean;
}

export interface StorageUploadResult {
  storageKey: string;
  url: string;
  sizeBytes: number;
  mimeType: string;
}

export interface StorageProvider {
  upload(params: StorageUploadParams): Promise<StorageUploadResult>;
  download(storageKey: string): Promise<Buffer>;
  delete(storageKey: string): Promise<void>;
  getDownloadUrl(storageKey: string, expiresInSeconds?: number): Promise<string>;
}

/**
 * Local disk storage provider (default for local development and test suites).
 */
export class LocalStorageProvider implements StorageProvider {
  private readonly baseDir: string;
  private readonly baseUrl: string;

  constructor(
    baseDir: string = process.env.STORAGE_LOCAL_DIR || "private-uploads",
    baseUrl: string = process.env.APP_BASE_URL || "http://localhost:3000",
  ) {
    this.baseDir = resolve(baseDir);
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private getFilePath(storageKey: string): string {
    // Prevent directory traversal
    const safeKey = storageKey.replace(/[^a-zA-Z0-9_\-\.]/g, "");
    return join(this.baseDir, safeKey);
  }

  async upload(params: StorageUploadParams): Promise<StorageUploadResult> {
    await mkdir(this.baseDir, { recursive: true, mode: 0o700 });
    const target = this.getFilePath(params.storageKey);
    await writeFile(target, params.buffer, { mode: 0o600 });
    return {
      storageKey: params.storageKey,
      url: `${this.baseUrl}/api/v1/files/${params.storageKey}`,
      sizeBytes: params.buffer.length,
      mimeType: params.mimeType,
    };
  }

  async download(storageKey: string): Promise<Buffer> {
    const target = this.getFilePath(storageKey);
    if (!existsSync(target)) {
      throw new AppError(404, "Requested file not found in storage");
    }
    return await readFile(target);
  }

  async delete(storageKey: string): Promise<void> {
    const target = this.getFilePath(storageKey);
    if (existsSync(target)) {
      await unlink(target);
    }
  }

  async getDownloadUrl(storageKey: string): Promise<string> {
    return `${this.baseUrl}/api/v1/files/${storageKey}`;
  }
}

/**
 * S3-compatible cloud object storage provider (AWS S3, Cloudflare R2, MinIO, DigitalOcean Spaces).
 * Uses standard AWS SigV4 without requiring external vendor SDK bloat.
 */
export class S3StorageProvider implements StorageProvider {
  private readonly bucket: string;
  private readonly region: string;
  private readonly endpoint: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;

  constructor(options?: {
    bucket?: string;
    region?: string;
    endpoint?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
  }) {
    this.bucket = options?.bucket || process.env.AWS_S3_BUCKET || "ustaad-uploads";
    this.region = options?.region || process.env.AWS_REGION || "ap-south-1";
    this.endpoint =
      options?.endpoint ||
      process.env.AWS_S3_ENDPOINT ||
      `https://${this.bucket}.s3.${this.region}.amazonaws.com`;
    this.accessKeyId =
      options?.accessKeyId || process.env.AWS_ACCESS_KEY_ID || "";
    this.secretAccessKey =
      options?.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY || "";
  }

  private sha256(data: string | Buffer): string {
    return createHash("sha256").update(data).digest("hex");
  }

  private hmacSha256(key: string | Buffer, data: string): Buffer {
    return createHmac("sha256", key).update(data).digest();
  }

  private getSignatureKey(
    key: string,
    dateStamp: string,
    regionName: string,
    serviceName: string,
  ): Buffer {
    const kDate = this.hmacSha256(`AWS4${key}`, dateStamp);
    const kRegion = this.hmacSha256(kDate, regionName);
    const kService = this.hmacSha256(kRegion, serviceName);
    return this.hmacSha256(kService, "aws4_request");
  }

  async upload(params: StorageUploadParams): Promise<StorageUploadResult> {
    const safeKey = params.storageKey.replace(/[^a-zA-Z0-9_\-\.]/g, "");
    const url = `${this.endpoint.replace(/\/$/, "")}/${safeKey}`;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.substring(0, 8);
    const payloadHash = this.sha256(params.buffer);

    const canonicalHeaders = `content-type:${params.mimeType}\nhost:${new URL(url).host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = `PUT\n/${safeKey}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${this.sha256(canonicalRequest)}`;
    const signingKey = this.getSignatureKey(this.secretAccessKey, dateStamp, this.region, "s3");
    const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

    const authHeader = `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    try {
      const res = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": params.mimeType,
          "x-amz-date": amzDate,
          "x-amz-content-sha256": payloadHash,
          Authorization: authHeader,
          ...(params.isPublic ? { "x-amz-acl": "public-read" } : {}),
        },
        body: new Uint8Array(params.buffer),
      });

      if (!res.ok) {
        throw new AppError(502, `S3 upload failed with HTTP status ${res.status}`);
      }
    } catch (e) {
      if (e instanceof AppError) throw e;
      // In development fallback to local file if S3 endpoint is unreachable
      if (process.env.NODE_ENV !== "production") {
        return new LocalStorageProvider().upload(params);
      }
      throw new AppError(502, `Cloud storage upload unreachable: ${(e as Error).message}`);
    }

    return {
      storageKey: params.storageKey,
      url,
      sizeBytes: params.buffer.length,
      mimeType: params.mimeType,
    };
  }

  async download(storageKey: string): Promise<Buffer> {
    const url = await this.getDownloadUrl(storageKey);
    const res = await fetch(url);
    if (!res.ok) {
      throw new AppError(res.status === 404 ? 404 : 502, "Failed to download object from S3");
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async delete(storageKey: string): Promise<void> {
    const safeKey = storageKey.replace(/[^a-zA-Z0-9_\-\.]/g, "");
    const url = `${this.endpoint.replace(/\/$/, "")}/${safeKey}`;
    try {
      await fetch(url, { method: "DELETE" });
    } catch {
      // Best-effort delete
    }
  }

  async getDownloadUrl(storageKey: string, expiresInSeconds: number = 3600): Promise<string> {
    const safeKey = storageKey.replace(/[^a-zA-Z0-9_\-\.]/g, "");
    const baseUrl = `${this.endpoint.replace(/\/$/, "")}/${safeKey}`;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.substring(0, 8);
    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;

    const queryParams = new URLSearchParams({
      "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
      "X-Amz-Credential": `${this.accessKeyId}/${credentialScope}`,
      "X-Amz-Date": amzDate,
      "X-Amz-Expires": String(expiresInSeconds),
      "X-Amz-SignedHeaders": "host",
    });

    const canonicalQuery = queryParams.toString().split("&").sort().join("&");
    const host = new URL(baseUrl).host;
    const canonicalRequest = `GET\n/${safeKey}\n${canonicalQuery}\nhost:${host}\n\nhost\nUNSIGNED-PAYLOAD`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${this.sha256(canonicalRequest)}`;
    const signingKey = this.getSignatureKey(this.secretAccessKey, dateStamp, this.region, "s3");
    const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

    return `${baseUrl}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  }
}

let storageInstance: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (!storageInstance) {
    if (
      process.env.STORAGE_DRIVER === "s3" &&
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY
    ) {
      storageInstance = new S3StorageProvider();
    } else {
      storageInstance = new LocalStorageProvider();
    }
  }
  return storageInstance;
}

