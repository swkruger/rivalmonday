import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

/** Strings that exist only in `src/dev-panel/` (banner attribute and request/response header). */
export const PANEL_MARKERS = ['data-rm-dev-panel', 'x-rm-dev-panel'] as const;
const SCANNED = /\.(js|mjs|cjs|html|rsc|body|json)$/;

/**
 * Files under `.next/server` and `.next/static` that contain a panel marker (paths relative to `nextDir`).
 * Throws when either root is missing or nothing at all was scanned, so a wrong path or a changed output layout can
 * never read as "clean".
 */
export async function findPanelCode(nextDir: string): Promise<string[]> {
  const hits: string[] = [];
  let scanned = 0;
  const walk = async (dir: string) => {
    for (const name of await readdir(dir)) {
      const p = join(dir, name);
      let info;
      try {
        info = await stat(p);
      } catch {
        continue; // vanished mid-walk
      }
      if (info.isDirectory()) await walk(p);
      else if (SCANNED.test(name) && !name.endsWith('.map')) {
        scanned++;
        const text = await readFile(p, 'utf8');
        if (PANEL_MARKERS.some((m) => text.includes(m))) hits.push(relative(nextDir, p));
      }
    }
  };
  for (const root of ['server', 'static']) {
    const dir = join(nextDir, root);
    let isDir = false;
    try {
      isDir = (await stat(dir)).isDirectory();
    } catch {
      // handled below
    }
    if (!isDir) throw new Error(`Build output directory not found: ${root} (looked in ${nextDir}). Run the production build first.`);
    await walk(dir);
  }
  if (scanned === 0) throw new Error(`The dev-panel check scanned no files under ${nextDir}; the build output layout may have changed.`);
  return hits;
}
