import { createDb, resolveEnvironment } from '@cs/db';
import { demoSignInLinks } from '../links';
import { printDemoLinks } from '../reset';
import { loadRepoEnv, repoRoot } from './repo';

loadRepoEnv();
const name = process.argv.includes('--test') ? 'test' : 'demo';
try {
  const env = resolveEnvironment(name, { repoRoot: repoRoot() });
  const { db, close } = createDb(env.serviceUrl);
  try {
    const links = await demoSignInLinks(db, { secret: process.env.LINK_SIGNING_SECRET ?? '', baseUrl: process.env.APP_URL?.trim() || 'http://localhost:3000' });
    if (links.length === 0) console.log(`No demo users in ${name.toUpperCase()}. Run pnpm demo:reset first.`);
    else printDemoLinks(links);
  } finally {
    await close();
  }
} catch (e) {
  console.error(`[links] failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
