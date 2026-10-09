import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { openTestDbs, seedTenancy, testUrls, truncateAll } from '../test/helpers';
import { databaseNameOf } from './environments';
import { MIGRATIONS_FOLDER } from './migrate';
import { databaseExists, dropScratchDatabase, ensureDatabase, IDENT, redactSecrets, resetDatabase, wipeDatabase } from './reset';
import { agency } from './schema';

const name = databaseNameOf(testUrls.owner);

describe('wipeDatabase / resetDatabase', () => {
  it('refuses any name but the exact expected one and touches nothing (Review Focus 1)', async () => {
    const dbs = openTestDbs();
    try {
      await truncateAll(dbs.owner);
      await seedTenancy(dbs.owner);
      await expect(wipeDatabase(testUrls.owner, 'cs_demo')).rejects.toThrow(/expected exactly "cs_demo"/);
      await expect(wipeDatabase(testUrls.owner, `${name}x`)).rejects.toThrow(/expected exactly/);
      await expect(resetDatabase(testUrls.owner, 'cs_dev')).rejects.toThrow(/expected exactly "cs_dev"/);
      expect(await dbs.owner.select().from(agency)).toHaveLength(2);
    } finally {
      await dbs.closeAll();
    }
  });

  it('wipes and re-migrates the expected database', async () => {
    await resetDatabase(testUrls.owner, name);
    const dbs = openTestDbs();
    try {
      expect(await dbs.owner.select().from(agency)).toHaveLength(0);
      const journal = JSON.parse(readFileSync(join(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8')) as { entries: unknown[] };
      const [row] = [...(await dbs.owner.execute<{ n: number }>(sql`select count(*)::int as n from drizzle.__drizzle_migrations`))];
      expect(Number(row!.n)).toBe(journal.entries.length);
    } finally {
      await dbs.closeAll();
    }
  }, 120_000);
});

describe('ensureDatabase', () => {
  it('reports an existing database without creating anything', async () => {
    expect(await databaseExists(testUrls.owner, name)).toBe(true);
    expect(await databaseExists(testUrls.owner, 'cs_never_created_here')).toBe(false);
    expect(await ensureDatabase(testUrls.owner, name)).toBe('exists');
  });

  it('refuses names that are not plain lower-case identifiers', async () => {
    await expect(ensureDatabase(testUrls.owner, 'Bad-Name; drop')).rejects.toThrow(/Invalid database name/);
  });

  it('drops only cs_roundtrip_ scratch databases', async () => {
    await expect(dropScratchDatabase(testUrls.owner, name)).rejects.toThrow(/only cs_roundtrip_/);
    await expect(dropScratchDatabase(testUrls.owner, 'cs_dev')).rejects.toThrow(/only cs_roundtrip_/);
  });
});

describe('redactSecrets / IDENT', () => {
  it('strips postgres URLs and neon hostnames', () => {
    const out = redactSecrets('connect postgresql://u:pw@ep-x-123.eu-central-1.aws.neon.tech/db?sslmode=require failed; host ep-y.neon.tech down');
    expect(out).toBe('connect <redacted> failed; host <host> down');
    expect(out).not.toMatch(/pw|neon\.tech/);
    expect(redactSecrets('postgres://a:b@h/x')).toBe('<redacted>');
    expect(redactSecrets('permission denied to create database')).toBe('permission denied to create database');
  });

  it('IDENT accepts plain lower-case identifiers only', () => {
    expect(IDENT.test('cs_demo')).toBe(true);
    expect(IDENT.test('Bad-Name')).toBe(false);
  });
});
