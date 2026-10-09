import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PORTABLE_BINARIES_URL, parseMajor, pgEnv, pgToolPath, redactPgOutput, runPg, versionProblem } from './pg-tools';

describe('version check (spec §6.1 step 1, §8)', () => {
  it('reads majors from client and server version strings', () => {
    expect(parseMajor('pg_dump (PostgreSQL) 17.5')).toBe(17);
    expect(parseMajor('pg_restore (PostgreSQL) 18.1 (Ubuntu 18.1-1)')).toBe(18);
    expect(parseMajor('18.6')).toBe(18);
    expect(parseMajor('nonsense')).toBeNull();
  });

  it('names the version needed and how to get it when the client is older', () => {
    const m = versionProblem('pg_dump', 17, 18)!;
    expect(m).toContain('pg_dump 17 is older than the server (PostgreSQL 18)');
    expect(m).toContain('PostgreSQL 18 client tools');
    expect(m).toContain('PG_BIN');
    expect(m).toContain(PORTABLE_BINARIES_URL);
    expect(versionProblem('pg_dump', null, 18)).toContain('pg_dump was not found');
    expect(versionProblem('pg_dump', 18, 18)).toBeNull();
    expect(versionProblem('pg_restore', 19, 18)).toBeNull();
  });

  it('uses PG_BIN when set', () => {
    const exe = process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump';
    expect(pgToolPath('pg_dump', { PG_BIN: join('C:', 'pg18', 'bin') } as unknown as NodeJS.ProcessEnv)).toBe(join('C:', 'pg18', 'bin', exe));
    expect(pgToolPath('pg_dump', {} as NodeJS.ProcessEnv)).toBe(exe);
  });
});

describe('pgEnv (Review Focus 5: secrets)', () => {
  it('passes the connection through PG* variables, never on the command line', () => {
    expect(pgEnv('postgresql://owner:s3cr%40t@ep-x.neon.tech/cs_dev?sslmode=require&channel_binding=require')).toEqual({
      PGHOST: 'ep-x.neon.tech', PGPORT: '5432', PGUSER: 'owner', PGPASSWORD: 's3cr@t', PGDATABASE: 'cs_dev', PGSSLMODE: 'require', PGCHANNELBINDING: 'require',
    });
  });

  it('reports a missing binary without throwing', async () => {
    const r = await runPg(join('no', 'such', 'pg_dump'), ['--version']);
    expect(r.code).not.toBe(0);
  });
});

describe('redactPgOutput (S5: one helper for all pg tool and Postgres text)', () => {
  it('strips hosts and addresses from a libpq connection failure but keeps the role', () => {
    const out = redactPgOutput('connection to server at "ep-x.us-east-2.aws.neon.tech" (1.2.3.4), port 5432 failed: FATAL: password authentication failed for user "neondb_owner"');
    expect(out).toBe('connection to server at "<host>" (<host>), port 5432 failed: FATAL: password authentication failed for user "neondb_owner"');
  });

  it('strips host= values, user:pass@, @host:port, and bare IPv4 with a port', () => {
    expect(redactPgOutput('could not connect: host=db.internal.example port=5432 dbname=cs_dev')).not.toContain('db.internal.example');
    expect(redactPgOutput("conninfo host='my db.local' user=x")).toBe('conninfo host=<host> user=x');
    expect(redactPgOutput('bad dsn neondb_owner:hunter2@10.0.0.5:5432/cs_dev')).toBe('bad dsn <redacted>@<host>/cs_dev');
    expect(redactPgOutput('role bob@db.example.com:6543 refused')).toBe('role bob@<host> refused');
    expect(redactPgOutput('connect to 192.168.1.20:5432 timed out')).toBe('connect to <host> timed out');
    expect(redactPgOutput('postgres://u:pw@h/x failed')).toBe('<redacted> failed');
  });

  it('keeps the download URL, version messages and plain text', () => {
    const v = `pg_dump 17 is older than the server (PostgreSQL 18). Install it (portable binaries: ${PORTABLE_BINARIES_URL}) and set PG_BIN.`;
    expect(redactPgOutput(v)).toBe(v);
    expect(redactPgOutput('pg_dump (PostgreSQL) 17.5')).toBe('pg_dump (PostgreSQL) 17.5');
    expect(redactPgOutput('permission denied for table agency')).toBe('permission denied for table agency');
  });
});
