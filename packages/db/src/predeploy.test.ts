import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testUrls } from '../test/helpers';
import { createDb } from './client';
import { MIGRATIONS_FOLDER } from './migrate';
import { findPredeployProblems, MODEL_OPS_TAG } from './predeploy';

const journal = JSON.parse(readFileSync(join(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8')) as {
  entries: { tag: string; when: number }[];
};
const when = journal.entries.find((e) => e.tag === MODEL_OPS_TAG)!.when;

const admin = postgres(testUrls.owner, { max: 1, onnotice: () => {} });
const dbName = `cs_predeploy_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const urlFor = (name: string) => {
  const u = new URL(testUrls.owner);
  u.pathname = `/${name}`;
  return u.toString();
};
const BAD = '00000000-0000-4000-8000-0000000000aa';
const GOOD = '00000000-0000-4000-8000-0000000000bb';

let scenario = 0;
// Each scenario gets its own throwaway database, dropped in afterAll.
const names: string[] = [];
async function scenarioDb(setup: string[]) {
  const name = `${dbName}_${scenario++}`;
  names.push(name);
  await admin.unsafe(`CREATE DATABASE ${name}`);
  const raw = postgres(urlFor(name), { max: 1, onnotice: () => {} });
  for (const s of setup) await raw.unsafe(s);
  await raw.end();
  return createDb(urlFor(name));
}

const clientTable = `CREATE TABLE client (id uuid PRIMARY KEY, score_thresholds jsonb)`;
const clientRows = `INSERT INTO client VALUES
  ('${BAD}', '{"alert": 50, "brief": 80}'),
  ('${GOOD}', '{"alert": 80, "brief": 50}')`;
const migrationsTable = `CREATE SCHEMA drizzle; CREATE TABLE drizzle.__drizzle_migrations (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint)`;

beforeAll(async () => {
  await admin`SELECT 1`;
});
afterAll(async () => {
  for (const n of names) await admin.unsafe(`DROP DATABASE IF EXISTS ${n} WITH (FORCE)`);
  await admin.end();
});

describe('findPredeployProblems', () => {
  it('journal has 0025_model_ops', () => {
    expect(when).toBeTypeOf('number');
  });

  it('fresh database → no problems', async () => {
    const { db, close } = await scenarioDb([]);
    expect(await findPredeployProblems(db)).toEqual([]);
    await close();
  });

  it('0025 applied → no problems even with odd data', async () => {
    const { db, close } = await scenarioDb([
      migrationsTable,
      `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('x', ${when})`,
      clientTable,
      clientRows,
    ]);
    expect(await findPredeployProblems(db)).toEqual([]);
    await close();
  });

  it('0025 pending + a malformed score_thresholds row → problem naming its id', async () => {
    const { db, close } = await scenarioDb([migrationsTable, clientTable, clientRows]);
    const problems = await findPredeployProblems(db);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(BAD);
    expect(problems[0]).not.toContain(GOOD);
    await close();
  });

  it('0025 pending with no migrations table at all + bad row → still reported', async () => {
    const { db, close } = await scenarioDb([clientTable, clientRows]);
    expect((await findPredeployProblems(db))[0]).toContain(BAD);
    await close();
  });

  it('0025 pending and only valid rows → no problems', async () => {
    const { db, close } = await scenarioDb([migrationsTable, clientTable, `INSERT INTO client VALUES ('${GOOD}', NULL)`]);
    expect(await findPredeployProblems(db)).toEqual([]);
    await close();
  });
});
