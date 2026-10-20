import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// After `next build`: some server trace file must list the runtime AI config, else Vercel bundles ship without it.
const serverDir = fileURLToPath(new URL('../.next/server', import.meta.url));
function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith('.nft.json')) yield p;
  }
}
let scanned = 0;
for (const f of walk(serverDir)) {
  scanned++;
  const files = (JSON.parse(readFileSync(f, 'utf8')) as { files?: string[] }).files ?? [];
  if (files.some((x) => x.split(String.fromCharCode(92)).join('/').endsWith('packages/ai/config/ai.yaml'))) {
    console.log(`check:tracing ok (${scanned} trace files scanned): ${f}`);
    process.exit(0);
  }
}
console.error(`check:tracing FAILED: packages/ai/config/ai.yaml is in none of ${scanned} .next/server/**/*.nft.json files`);
process.exit(1);
