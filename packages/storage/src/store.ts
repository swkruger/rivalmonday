export interface ObjectStore {
  readonly kind: 'memory' | 'fs' | 'r2';
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  exists(key: string): Promise<boolean>;
  /** Time-limited URL for reading the object (R2 presigned URL; file:// or memory:// in dev/test). */
  signedUrl(key: string, expiresInSeconds: number): Promise<string>;
}
