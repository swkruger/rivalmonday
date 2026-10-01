import { assertValidKey } from './keys';
import type { ObjectStore } from './store';

export function createMemoryStore(): ObjectStore {
  const objects = new Map<string, { body: Uint8Array; contentType: string }>();
  return {
    kind: 'memory',
    async put(key, body, contentType) {
      assertValidKey(key);
      objects.set(key, { body: new Uint8Array(body), contentType });
    },
    async get(key) {
      assertValidKey(key);
      const o = objects.get(key);
      return o ? new Uint8Array(o.body) : null;
    },
    async exists(key) {
      assertValidKey(key);
      return objects.has(key);
    },
    async signedUrl(key, expiresInSeconds) {
      assertValidKey(key);
      return `memory://${key}?expires=${expiresInSeconds}`;
    },
  };
}
