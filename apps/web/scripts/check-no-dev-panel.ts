import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPanelCode } from './no-dev-panel';

const nextDir = fileURLToPath(new URL('../.next', import.meta.url));
let hits: string[];
try {
  hits = await findPanelCode(nextDir);
} catch (e) {
  console.error(`Dev-panel check could not run: ${(e as Error).message.replace(nextDir, relative(process.cwd(), nextDir) || '.next')}`);
  process.exit(1);
}
if (hits.length) {
  console.error(`Dev-panel code found in the production build (spec §5.3):\n  ${hits.join('\n  ')}`);
  process.exit(1);
}
console.log('No dev-panel code in the production build.');
