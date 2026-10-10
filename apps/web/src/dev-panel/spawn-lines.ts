import { type ChildProcess, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { PassThrough } from 'node:stream';

/**
 * Final-review M1: `shell: true` puts a shell between us and the real command (and pnpm adds more processes), so
 * killing `child` alone would orphan the work. Windows: `taskkill /T` ends the whole tree. Elsewhere the child leads
 * its own process group (`detached`), and the group is signalled.
 */
function killTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => child.kill());
    return;
  }
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
}

/**
 * Runs a fixed command line (never user input) through the shell (pnpm is a .cmd shim on Windows) and yields its
 * stdout and stderr lines, then `exit <code>`.
 *
 * Final-review M1: when `signal` aborts, or the consumer stops early (`break`, `return()`), the child process tree is
 * killed; the generator does not finish until the child has actually exited, so a caller that waits for it knows the
 * work has stopped.
 */
export async function* spawnLines(cmd: string, args: string[], cwd: string, signal?: AbortSignal): AsyncGenerator<string> {
  const child = spawn([cmd, ...args].join(' '), { cwd, env: process.env, shell: true, windowsHide: true, detached: process.platform !== 'win32' });
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
  const abort = () => killTree(child);
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const lines = createInterface({ input: merged, crlfDelay: Infinity });
  let finished = false;
  try {
    for await (const line of lines) yield line;
    const code = await exit;
    finished = true;
    yield `exit ${code}`;
  } finally {
    signal?.removeEventListener('abort', abort);
    if (!finished) {
      lines.close();
      killTree(child);
      merged.resume(); // keep draining so the child's pipes can close
      await exit;
    }
  }
}
