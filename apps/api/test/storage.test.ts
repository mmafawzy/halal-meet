import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';
import { S3Storage, createPhotoStorage, type S3Like } from '../src/modules/storage';

const KEY = '01a217f7-2d19-7866-812a-c38702e3971a/01a217fa-1256-7ff2-9bb6-d316b0311fa0.png';

/** In-memory stand-in for an S3 bucket that speaks the three commands the driver uses. */
function fakeS3() {
  const objects = new Map<string, { body: Buffer; type?: string }>();
  const calls: string[] = [];
  const client: S3Like = {
    async send(cmd) {
      const input = cmd.input as { Bucket: string; Key: string; Body?: Buffer; ContentType?: string };
      calls.push(`${cmd.constructor.name} ${input.Bucket}/${input.Key}`);
      if (cmd instanceof PutObjectCommand) {
        objects.set(input.Key, { body: Buffer.from(input.Body!), type: input.ContentType });
        return {};
      }
      if (cmd instanceof GetObjectCommand) {
        const o = objects.get(input.Key);
        if (!o) throw Object.assign(new Error('missing'), { name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } });
        return { Body: { transformToByteArray: async () => new Uint8Array(o.body) } };
      }
      if (cmd instanceof DeleteObjectCommand) {
        objects.delete(input.Key);
        return {};
      }
      throw new Error('unexpected command');
    },
  };
  return { client, objects, calls };
}

describe('S3 photo storage', () => {
  it('puts, gets and deletes private objects under the configured bucket and prefix', async () => {
    const s3 = fakeS3();
    const storage = new S3Storage(s3.client, 'hm-photos', 'photos/');
    await storage.put(KEY, Buffer.from('png-bytes'), 'image/png');
    expect(s3.objects.get(`photos/${KEY}`)).toMatchObject({ type: 'image/png' });
    expect((await storage.get(KEY))?.toString()).toBe('png-bytes');
    await storage.delete(KEY);
    await storage.delete(KEY); // idempotent
    expect(await storage.get(KEY)).toBeNull(); // NoSuchKey → null, not an error
    expect(s3.calls[0]).toBe(`PutObjectCommand hm-photos/photos/${KEY}`);
  });

  it('rejects keys that are not photo keys (no path tricks reach the bucket)', async () => {
    const s3 = fakeS3();
    const storage = new S3Storage(s3.client, 'hm-photos');
    await expect(storage.put('../etc/passwd', Buffer.from('x'), 'image/png')).rejects.toThrow(/Invalid photo storage key/);
    expect(s3.calls).toHaveLength(0);
  });

  it('rethrows real storage failures', async () => {
    const storage = new S3Storage(
      { send: async () => Promise.reject(Object.assign(new Error('denied'), { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } })) },
      'hm-photos',
    );
    await expect(storage.get(KEY)).rejects.toThrow('denied');
  });

  it('is selected by PHOTO_STORAGE=s3 and requires a bucket', () => {
    expect(() => createPhotoStorage({ PHOTO_STORAGE: 's3' })).toThrow(/S3_BUCKET/);
    const storage = createPhotoStorage({ PHOTO_STORAGE: 's3', S3_BUCKET: 'b', S3_ENDPOINT: 'http://localhost:9000', S3_FORCE_PATH_STYLE: 'true' });
    expect(storage.driver).toBe('s3');
  });
});
