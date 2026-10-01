import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { assertValidKey } from './keys';
import type { ObjectStore } from './store';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e.name === 'NoSuchKey' || e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404;
}

export function createR2Store(cfg: R2Config, client?: S3Client): ObjectStore {
  const s3 =
    client ??
    new S3Client({
      region: 'auto',
      endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
      // Newer AWS SDKs add CRC checksums by default; R2 only needs them when required.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  return {
    kind: 'r2',
    async put(key, body, contentType) {
      assertValidKey(key);
      await s3.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: key, Body: body, ContentType: contentType }));
    },
    async get(key) {
      assertValidKey(key);
      try {
        const res = await s3.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
        return res.Body ? await res.Body.transformToByteArray() : new Uint8Array();
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },
    async exists(key) {
      assertValidKey(key);
      try {
        await s3.send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }));
        return true;
      } catch (err) {
        if (isNotFound(err)) return false;
        throw err;
      }
    },
    async signedUrl(key, expiresInSeconds) {
      assertValidKey(key);
      return getSignedUrl(s3, new GetObjectCommand({ Bucket: cfg.bucket, Key: key }), { expiresIn: expiresInSeconds });
    },
  };
}
