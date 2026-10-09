import { describe, expect, it } from 'vitest';
import { spawnLines } from './spawn-lines';

describe('spawnLines', () => {
  it('yields stdout and stderr lines, then the exit code', async () => {
    const lines: string[] = [];
    for await (const l of spawnLines('node', ['-e', '"console.log(1);console.error(2);process.exit(3)"'], process.cwd())) lines.push(l);
    expect(lines.slice(0, -1).sort()).toEqual(['1', '2']);
    expect(lines.at(-1)).toBe('exit 3');
  });
});
