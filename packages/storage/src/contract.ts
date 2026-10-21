import { describe, expect, it } from 'vitest';
import { ObjectExistsError, type ObjectStore } from './store';

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

    it('second put without overwrite throws ObjectExistsError', async () => {
      const store = await make();
      const key = `contract/${crypto.randomUUID()}/c.txt`;
      const enc = new TextEncoder();
      await store.put(key, enc.encode('one'), 'text/plain');
      const err = await store.put(key, enc.encode('two'), 'text/plain').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ObjectExistsError);
      expect((err as ObjectExistsError).code).toBe('object_exists');
      expect((err as ObjectExistsError).key).toBe(key);
      expect(new TextDecoder().decode((await store.get(key)) ?? new Uint8Array())).toBe('one');
    });

    it('overwrite: true replaces', async () => {
      const store = await make();
      const key = `contract/${crypto.randomUUID()}/d.txt`;
      const enc = new TextEncoder();
      await store.put(key, enc.encode('one'), 'text/plain');
      await store.put(key, enc.encode('two'), 'text/plain', { overwrite: true });
      expect(new TextDecoder().decode((await store.get(key)) ?? new Uint8Array())).toBe('two');
    });

    it('rejects invalid keys', async () => {
      const store = await make();
      await expect(store.put('../escape.txt', new Uint8Array(), 'text/plain')).rejects.toThrow(/invalid object key/i);
    });
  });
}
