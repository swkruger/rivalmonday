import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { databaseNameOf, redactSecrets } from '@cs/db';
import type postgres from 'postgres';

export type PgTool = 'pg_dump' | 'pg_restore';
export const PORTABLE_BINARIES_URL = 'https://www.enterprisedb.com/download-postgresql-binaries';

/**
 * S5: the one place text from pg_dump, pg_restore or Postgres is cleaned before it is printed or thrown.
 * Hosts, addresses and credentials go; role and database names stay. Wraps `redactSecrets` from `@cs/db`.
 */
export const redactPgOutput = (text: string): string => redactSecrets(text);

/** `PG_BIN` points at a folder of (portable) client binaries; otherwise PATH. */
export function pgToolPath(tool: PgTool, env: NodeJS.ProcessEnv = process.env): string {
  const exe = process.platform === 'win32' ? `${tool}.exe` : tool;
  const bin = env.PG_BIN?.trim();
  return bin ? join(bin, exe) : exe;
}

export function parseMajor(text: string): number | null {
  const m = /PostgreSQL\)\s*(\d+)/i.exec(text) ?? /^\s*(\d+)(?:\.\d+)?/.exec(text);
  return m ? Number(m[1]) : null;
}

/** Spec §6.1 step 1: a client older than the server stops the snapshot with the version needed and where to get it. */
export function versionProblem(tool: PgTool, client: number | null, server: number): string | null {
  const how = `Install the PostgreSQL ${server} client tools (portable binaries: ${PORTABLE_BINARIES_URL}) and set PG_BIN to their bin folder.`;
  if (client === null) return `${tool} was not found. ${how}`;
  if (client < server) return `${tool} ${client} is older than the server (PostgreSQL ${server}). ${how}`;
  return null;
}

/** Connection details for libpq tools through the environment, so no password ever appears on a command line or in output. */
export function pgEnv(url: string): Record<string, string> {
  const u = new URL(url);
  const out: Record<string, string> = {
    PGHOST: u.hostname, PGPORT: u.port || '5432', PGUSER: decodeURIComponent(u.username), PGPASSWORD: decodeURIComponent(u.password), PGDATABASE: databaseNameOf(url),
  };
  const ssl = u.searchParams.get('sslmode');
  if (ssl) out.PGSSLMODE = ssl;
  const cb = u.searchParams.get('channel_binding');
  if (cb) out.PGCHANNELBINDING = cb;
  return out;
}

export interface PgRun {
  code: number;
  stdout: string;
  /** Already passed through `redactPgOutput`. */
  stderr: string;
}

export function runPg(bin: string, args: string[], extraEnv: Record<string, string> = {}): Promise<PgRun> {
  return new Promise((done) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(bin, args, { env: { ...process.env, ...extraEnv }, windowsHide: true });
    child.stdout.on('data', (d) => (stdout += String(d)));
    child.stderr.on('data', (d) => (stderr += String(d)));
    child.on('error', (e) => done({ code: -1, stdout, stderr: redactPgOutput(e.message) }));
    child.on('close', (code) => done({ code: code ?? -1, stdout, stderr: redactPgOutput(stderr) }));
  });
}

export async function clientMajor(tool: PgTool, env: NodeJS.ProcessEnv = process.env): Promise<number | null> {
  const r = await runPg(pgToolPath(tool, env), ['--version']);
  return r.code === 0 ? parseMajor(r.stdout) : null;
}

export async function serverMajor(sql: postgres.Sql): Promise<{ major: number; version: string }> {
  const [row] = await sql<{ server_version: string }[]>`show server_version`;
  const version = row!.server_version;
  const major = parseMajor(version);
  if (major === null) throw new Error(`Unrecognised server version "${redactPgOutput(version)}"`);
  return { major, version };
}
