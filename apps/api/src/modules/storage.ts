import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Blob storage for member photos. Keys are opaque (`<accountId>/<photoId>.<ext>`) and never leave the
 * server: clients only ever see `GET /photos/:id`, which checks access first.
 *
 * Drivers (env `PHOTO_STORAGE`):
 * - `local` (default): files under `PHOTO_DIR` (default `.data/photos`, i.e. apps/api/.data/photos; gitignored).
 * - `memory`: in-process map (tests, throwaway demos).
 * - `s3`: S3-compatible object storage (S3_BUCKET, S3_REGION, S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY).
 *   Not implemented yet — this interface is the seam; production should also serve through signed CDN URLs.
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
      throw new Error('PHOTO_STORAGE=s3 is not implemented yet: add an S3-compatible PhotoStorage driver (see storage.ts).');
    default:
      throw new Error(`Unknown PHOTO_STORAGE driver: ${driver}`);
  }
}
