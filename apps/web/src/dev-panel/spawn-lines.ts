import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { PassThrough } from 'node:stream';

/**
 * Runs a fixed command line (never user input) through the shell (pnpm is a .cmd shim on Windows) and yields its
 * stdout and stderr lines, then `exit <code>`.
 */
export async function* spawnLines(cmd: string, args: string[], cwd: string): AsyncGenerator<string> {
  const child = spawn([cmd, ...args].join(' '), { cwd, env: process.env, shell: true, windowsHide: true });
  const merged = new PassThrough();
  let open = 2;
  const end = () => {
    if (--open === 0) merged.end();
  };
  child.stdout.on('end', end);
  child.stderr.on('end', end);
  child.stdout.pipe(merged, { end: false });
  child.stderr.pipe(merged, { end: false });
  const exit = new Promise<number>((done) => {
    child.on('error', (e) => {
      if (!merged.writableEnded) merged.end(`error ${e.message}\n`);
      done(1);
    });
    child.on('close', (code) => done(code ?? 1));
  });
  for await (const line of createInterface({ input: merged, crlfDelay: Infinity })) yield line;
  yield `exit ${await exit}`;
}
