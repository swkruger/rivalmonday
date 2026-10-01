import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll } from 'vitest';
import { runStoreContract } from './contract';
import { createFsStore } from './fs';

const dirs: string[] = [];
afterAll(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
});

runStoreContract('fs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cs-store-'));
  dirs.push(dir);
  return createFsStore(dir);
});
