import { describe, expect, it } from 'vitest';
import { spawnLines } from './spawn-lines';

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const until = async (check: () => boolean, ms = 10_000) => {
  const end = Date.now() + ms;
  while (!check() && Date.now() < end) await new Promise((r) => setTimeout(r, 100));
  return check();
};
// A child that prints its own pid (the shell's grandchild on Windows) and then runs until killed.
const FOREVER = ['-e', '"console.log(process.pid);setInterval(()=>{},1000)"'];

describe('spawnLines', () => {
  it('yields stdout and stderr lines, then the exit code', async () => {
    const lines: string[] = [];
    for await (const l of spawnLines('node', ['-e', '"console.log(1);console.error(2);process.exit(3)"'], process.cwd())) lines.push(l);
    expect(lines.slice(0, -1).sort()).toEqual(['1', '2']);
    expect(lines.at(-1)).toBe('exit 3');
  });

  it('kills the child when the consumer stops early (final-review M1)', async () => {
    let pid = 0;
    for await (const l of spawnLines('node', FOREVER, process.cwd())) {
      pid = Number(l);
      break;
    }
    expect(pid).toBeGreaterThan(0);
    // The generator's cleanup waits for the child to exit, so it is gone once the loop has returned.
    expect(alive(pid)).toBe(false);
  });

  it('kills the child when the signal aborts, then reports its exit (final-review M1)', async () => {
    const ac = new AbortController();
    const lines: string[] = [];
    let pid = 0;
    for await (const l of spawnLines('node', FOREVER, process.cwd(), ac.signal)) {
      lines.push(l);
      if (!pid) {
        pid = Number(l);
        ac.abort();
      }
    }
    expect(lines.at(-1)).toMatch(/^exit /);
    expect(await until(() => !alive(pid))).toBe(true);
  });
});
