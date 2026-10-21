/** Thrown by `put` when the key already exists and `overwrite` is not set (objects are never replaced by accident). */
export class ObjectExistsError extends Error {
  readonly code = 'object_exists';
  constructor(readonly key: string) {
    super(`object already exists: ${key}`);
    this.name = 'ObjectExistsError';
  }
}

export interface ObjectStore {
  readonly kind: 'memory' | 'fs' | 'r2';
  /** Refuses an existing key with ObjectExistsError unless `opts.overwrite` is true. */
  put(key: string, body: Uint8Array, contentType: string, opts?: { overwrite?: boolean }): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  exists(key: string): Promise<boolean>;
  /** Time-limited URL for reading the object (R2 presigned URL; file:// or memory:// in dev/test). */
  signedUrl(key: string, expiresInSeconds: number): Promise<string>;
}
