import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertValidKey } from './keys';
import type { ObjectStore } from './store';

/** Local-disk store for development. Not for production (no signed URLs, no replication). */
export function createFsStore(rootDir: string): ObjectStore {
  const root = resolve(rootDir);
  const pathFor = (key: string) => {
    assertValidKey(key);
    return join(root, ...key.split('/'));
  };
  return {
    kind: 'fs',
    async put(key, body) {
      const p = pathFor(key);
      await mkdir(dirname(p), { recursive: true });
      await writeFile(p, body);
    },
    async get(key) {
      try {
        return new Uint8Array(await readFile(pathFor(key)));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw err;
      }
    },
    async exists(key) {
      try {
        await stat(pathFor(key));
        return true;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
        throw err;
      }
    },
    async signedUrl(key) {
      return pathToFileURL(pathFor(key)).href;
    },
  };
}
