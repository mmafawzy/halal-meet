import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client, type S3ClientConfig } from '@aws-sdk/client-s3';

/**
 * Blob storage for member photos. Keys are opaque (`<accountId>/<photoId>.<ext>`) and never leave the
 * server: clients only ever see `GET /photos/:id`, which checks access first.
 *
 * Drivers (env `PHOTO_STORAGE`):
 * - `local` (default): files under `PHOTO_DIR` (default `.data/photos`, i.e. apps/api/.data/photos; gitignored).
 * - `memory`: in-process map (tests, throwaway demos).
 * - `s3`: S3-compatible object storage — AWS S3, Cloudflare R2, MinIO, Backblaze B2… Env: S3_BUCKET (required),
 *   S3_REGION (default us-east-1; `auto` for R2), S3_ENDPOINT (omit for AWS), S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY
 *   (omit to use the default AWS credential chain, e.g. an IAM role), S3_FORCE_PATH_STYLE=true for MinIO,
 *   S3_PREFIX (optional key prefix, e.g. `photos/`). Objects are private; the API streams them after its access check.
 */
export interface PhotoStorage {
  readonly driver: string;
  put(key: string, bytes: Buffer, mime: string): Promise<void>;
  /** Null when the key does not exist. */
  get(key: string): Promise<Buffer | null>;
  /** Idempotent. */
  delete(key: string): Promise<void>;
}

export const PHOTO_STORAGE = 'PHOTO_STORAGE';

const KEY_RE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|heic)$/i;

export function assertKey(key: string): void {
  if (!KEY_RE.test(key)) throw new Error(`Invalid photo storage key: ${key}`);
}

export class LocalDiskStorage implements PhotoStorage {
  readonly driver = 'local';
  constructor(private readonly root: string) {}

  private file(key: string): string {
    assertKey(key);
    return path.join(this.root, ...key.split('/'));
  }

  async put(key: string, bytes: Buffer): Promise<void> {
    const file = this.file(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.file(key));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.file(key), { force: true });
  }
}

export class MemoryStorage implements PhotoStorage {
  readonly driver = 'memory';
  private readonly files = new Map<string, Buffer>();

  async put(key: string, bytes: Buffer): Promise<void> {
    assertKey(key);
    this.files.set(key, Buffer.from(bytes));
  }

  async get(key: string): Promise<Buffer | null> {
    return this.files.get(key) ?? null;
  }

  async delete(key: string): Promise<void> {
    this.files.delete(key);
  }
}

export function createPhotoStorage(env: NodeJS.ProcessEnv = process.env): PhotoStorage {
  const driver = (env.PHOTO_STORAGE ?? 'local').toLowerCase();
  switch (driver) {
    case 'local':
      return new LocalDiskStorage(path.resolve(env.PHOTO_DIR ?? '.data/photos'));
    case 'memory':
      return new MemoryStorage();
    case 's3':
      return S3Storage.fromEnv(env);
    default:
      throw new Error(`Unknown PHOTO_STORAGE driver: ${driver}`);
  }
}

/** The subset of S3Client the driver uses (lets tests pass a fake). */
export interface S3Like {
  send(command: PutObjectCommand | GetObjectCommand | DeleteObjectCommand): Promise<unknown>;
}

export class S3Storage implements PhotoStorage {
  readonly driver = 's3';

  constructor(
    private readonly client: S3Like,
    private readonly bucket: string,
    private readonly prefix = '',
  ) {}

  static fromEnv(env: NodeJS.ProcessEnv): S3Storage {
    const bucket = env.S3_BUCKET;
    if (!bucket) throw new Error('PHOTO_STORAGE=s3 needs S3_BUCKET');
    const config: S3ClientConfig = {
      region: env.S3_REGION || 'us-east-1',
      endpoint: env.S3_ENDPOINT || undefined,
      forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
    };
    if (env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY) {
      config.credentials = { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY };
    }
    return new S3Storage(new S3Client(config), bucket, env.S3_PREFIX ?? '');
  }

  private objectKey(key: string): string {
    assertKey(key);
    return `${this.prefix}${key}`;
  }

  async put(key: string, bytes: Buffer, mime: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key), Body: bytes, ContentType: mime, CacheControl: 'private, max-age=0' }),
    );
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      const res = (await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) }))) as {
        Body?: { transformToByteArray(): Promise<Uint8Array> };
      };
      if (!res.Body) return null;
      return Buffer.from(await res.Body.transformToByteArray());
    } catch (e) {
      const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (err.name === 'NoSuchKey' || err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) return null;
      throw e;
    }
  }

  async delete(key: string): Promise<void> {
    // S3 DeleteObject is already idempotent (204 for missing keys).
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) }));
  }
}
