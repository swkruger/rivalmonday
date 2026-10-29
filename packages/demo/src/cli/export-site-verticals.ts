import { createDb, redactSecrets, resolveEnvironment } from '@cs/db';
import { exportSiteVerticals } from '../site-export/verticals';
import { writeSiteContent } from '../site-export/write';
import { loadRepoEnv, repoRoot } from './repo';

loadRepoEnv();
try {
  const env = resolveEnvironment('dev', { repoRoot: repoRoot() });
  const { db, close } = createDb(env.serviceUrl);
  try {
    const list = await exportSiteVerticals(db);
    await writeSiteContent(repoRoot(), 'verticals.json', list);
    console.log(`[export:site-verticals] ${list.length} verticals`);
  } finally {
    await close();
  }
} catch (e) {
  console.error(`[export:site-verticals] failed: ${redactSecrets(e instanceof Error ? e.message : String(e))}`);
  process.exitCode = 1;
}
