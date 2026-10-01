import { describe, expect, it } from 'vitest';
import type { ObjectStore } from './store';

export function runStoreContract(name: string, make: () => Promise<ObjectStore> | ObjectStore): void {
  describe(`${name} store contract`, () => {
    it('round-trips bytes and reports existence', async () => {
      const store = await make();
      const key = `contract/${crypto.randomUUID()}/a.txt`;
      expect(await store.exists(key)).toBe(false);
      expect(await store.get(key)).toBeNull();
      await store.put(key, new TextEncoder().encode('hello'), 'text/plain');
      expect(await store.exists(key)).toBe(true);
      expect(new TextDecoder().decode((await store.get(key)) ?? new Uint8Array())).toBe('hello');
    });

    it('returns a non-empty signed URL', async () => {
      const store = await make();
      const key = `contract/${crypto.randomUUID()}/b.bin`;
      await store.put(key, new Uint8Array([1, 2, 3]), 'application/octet-stream');
      expect(await store.signedUrl(key, 60)).toMatch(/\S+/);
    });

    it('rejects invalid keys', async () => {
      const store = await make();
      await expect(store.put('../escape.txt', new Uint8Array(), 'text/plain')).rejects.toThrow(/invalid object key/i);
    });
  });
}
