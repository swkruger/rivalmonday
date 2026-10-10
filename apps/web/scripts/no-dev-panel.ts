import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

/** Strings that exist only in `src/dev-panel/` (banner attribute and request/response header). */
export const PANEL_MARKERS = ['data-rm-dev-panel', 'x-rm-dev-panel'] as const;
const SCANNED = /\.(js|mjs|cjs|html|rsc|body|json)$/;

/** Files under `.next/server` and `.next/static` that contain a panel marker (paths relative to `nextDir`). */
export async function findPanelCode(nextDir: string): Promise<string[]> {
  const hits: string[] = [];
  const walk = async (dir: string) => {
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      return;
    }
    for (const name of names) {
      const p = join(dir, name);
      if ((await stat(p)).isDirectory()) await walk(p);
      else if (SCANNED.test(name) && !name.endsWith('.map')) {
        const text = await readFile(p, 'utf8');
        if (PANEL_MARKERS.some((m) => text.includes(m))) hits.push(relative(nextDir, p));
      }
    }
  };
  await walk(join(nextDir, 'server'));
  await walk(join(nextDir, 'static'));
  return hits;
}
