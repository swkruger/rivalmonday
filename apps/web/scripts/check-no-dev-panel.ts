import { fileURLToPath } from 'node:url';
import { findPanelCode } from './no-dev-panel';

const hits = await findPanelCode(fileURLToPath(new URL('../.next', import.meta.url)));
if (hits.length) {
  console.error(`Dev-panel code found in the production build (spec §5.3):\n  ${hits.join('\n  ')}`);
  process.exit(1);
}
console.log('No dev-panel code in the production build.');
