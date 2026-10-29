/**
 * Deploy gate: fails while any `OWNER-PLACEHOLDER` marker remains in site content or source.
 * Wired into `deploy-site` (Task 14), not `build`, so previews still build.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const MARKER = 'OWNER-PLACEHOLDER';
const SCAN = ['content', 'src'];
const SKIP_DIRS = new Set(['node_modules', '.next']);
const IS_TEST = /\.test\.[cm]?[jt]sx?$/;

export interface Hit {
  file: string;
  line: number;
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return SKIP_DIRS.has(name) ? [] : walk(path);
    return IS_TEST.test(name) ? [] : [path];
  });
}

/** `root` = the site package directory; paths come back relative to it with `/` separators. */
export function findPlaceholders(root: string): Hit[] {
  const hits: Hit[] = [];
  for (const sub of SCAN) {
    for (const file of walk(join(root, sub))) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((text, i) => {
          if (text.includes(MARKER)) hits.push({ file: relative(root, file).split(sep).join('/'), line: i + 1 });
        });
    }
  }
  return hits;
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const hits = findPlaceholders(root);
  if (hits.length > 0) {
    for (const h of hits) console.error(`${h.file}:${h.line}  ${MARKER}`);
    console.error(`\n${hits.length} owner placeholder(s) remain. Replace them before deploying the site.`);
    process.exit(1);
  }
  console.log('No owner placeholders remain.');
}
