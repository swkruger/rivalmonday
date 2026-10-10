import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findPanelCode } from './no-dev-panel';

let next: string;
beforeEach(() => {
  next = mkdtempSync(join(tmpdir(), 'next-'));
  mkdirSync(join(next, 'server', 'app'), { recursive: true });
  mkdirSync(join(next, 'static', 'chunks'), { recursive: true });
  writeFileSync(join(next, 'server', 'app', 'page.js'), 'export default 1');
});
afterEach(() => rmSync(next, { recursive: true, force: true }));

describe('findPanelCode (spec §5.3 build check)', () => {
  it('finds nothing in a clean build', async () => {
    expect(await findPanelCode(next)).toEqual([]);
  });

  it('flags server or client chunks that carry a panel marker, ignoring source maps', async () => {
    writeFileSync(join(next, 'static', 'chunks', 'a.js'), 'x("data-rm-dev-panel")');
    writeFileSync(join(next, 'server', 'app', 'b.js'), 'h["x-rm-dev-panel"]');
    writeFileSync(join(next, 'static', 'chunks', 'a.js.map'), 'data-rm-dev-panel');
    expect((await findPanelCode(next)).sort()).toEqual([join('server', 'app', 'b.js'), join('static', 'chunks', 'a.js')]);
  });

  it('refuses a build directory with no server or static output, so a wrong path cannot pass', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'next-empty-'));
    try {
      await expect(findPanelCode(empty)).rejects.toThrow(/server/);
      await expect(findPanelCode(join(empty, 'missing'))).rejects.toThrow(/server/);
      mkdirSync(join(empty, 'server'));
      await expect(findPanelCode(empty)).rejects.toThrow(/static/);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it('refuses when the roots exist but hold no scannable file', async () => {
    const hollow = mkdtempSync(join(tmpdir(), 'next-hollow-'));
    try {
      mkdirSync(join(hollow, 'server'));
      mkdirSync(join(hollow, 'static'));
      writeFileSync(join(hollow, 'static', 'a.js.map'), 'data-rm-dev-panel');
      await expect(findPanelCode(hollow)).rejects.toThrow(/no files/i);
    } finally {
      rmSync(hollow, { recursive: true, force: true });
    }
  });
});
