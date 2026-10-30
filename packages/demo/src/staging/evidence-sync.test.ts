import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryStore, type ObjectStore } from '@cs/storage';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { contentTypeFor, stagingR2Config, syncEvidence } from './evidence-sync';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ev-sync-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const R2 = { R2_ACCOUNT_ID: 'acc', R2_ACCESS_KEY_ID: 'id', R2_SECRET_ACCESS_KEY: 'secret' };

describe('stagingR2Config', () => {
  it('accepts a bucket whose name ends in -staging', () => {
    expect(stagingR2Config({ ...R2, R2_BUCKET: 'rivalmonday-staging' })).toEqual({ accountId: 'acc', accessKeyId: 'id', secretAccessKey: 'secret', bucket: 'rivalmonday-staging' });
  });

  it('refuses any other bucket (never the production bucket)', () => {
    expect(() => stagingR2Config({ ...R2, R2_BUCKET: 'rivalmonday' })).toThrow(/-staging/);
  });

  it('names the missing variables, never their values', () => {
    expect(() => stagingR2Config({ R2_ACCOUNT_ID: 'acc', R2_BUCKET: 'x-staging' })).toThrow('Set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in the shell');
  });
});

describe('contentTypeFor', () => {
  it('maps the evidence extensions and falls back to octet-stream', () => {
    expect(contentTypeFor('raw/a/b.json.gz')).toBe('application/gzip');
    expect(contentTypeFor('briefs/a/b.v3.pdf')).toBe('application/pdf');
    expect(contentTypeFor('shots/a.PNG')).toBe('image/png');
    expect(contentTypeFor('x/a.webp')).toBe('image/webp');
    expect(contentTypeFor('x/a.txt')).toBe('text/plain');
    expect(contentTypeFor('x/noext')).toBe('application/octet-stream');
  });
});

describe('syncEvidence', () => {
  it('uploads every file under its relative key and skips keys already in the bucket', async () => {
    mkdirSync(join(root, 'briefs', 'a1'), { recursive: true });
    writeFileSync(join(root, 'briefs', 'a1', 'b.pdf'), 'pdf');
    writeFileSync(join(root, 'top.txt'), 'hello');
    const inner = createMemoryStore();
    await inner.put('top.txt', new TextEncoder().encode('already'), 'text/plain');
    const puts: [string, string][] = [];
    const store: ObjectStore = { ...inner, put: async (k, b, ct, o) => { puts.push([k, ct]); await inner.put(k, b, ct, o); } };

    expect(await syncEvidence({ dir: root, store })).toEqual({ uploaded: 1, skipped: 1 });
    expect(puts).toEqual([['briefs/a1/b.pdf', 'application/pdf']]);
    expect(new TextDecoder().decode((await inner.get('top.txt'))!)).toBe('already');
  });

  it('refuses a missing or empty evidence directory', async () => {
    await expect(syncEvidence({ dir: join(root, 'nope'), store: createMemoryStore() })).rejects.toThrow(/no evidence files/);
  });
});
