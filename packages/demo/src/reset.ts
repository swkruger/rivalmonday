import { mkdir, rm } from 'node:fs/promises';
import { basename } from 'node:path';
import { requireSalt } from '@cs/collectors';
import { assertDatabase, createDb, DEMO_DATABASE, ensureDatabase, resetDatabase, resolveEnvironment } from '@cs/db';
import { createFsStore } from '@cs/storage';
import { type DemoLink, demoSignInLinks } from './links';
import { seedDemo } from './seed';

/** The DEMO evidence directory is the only one a reset may empty. */
export async function clearDemoEvidence(dir: string): Promise<void> {
  if (basename(dir) !== '.evidence-demo') throw new Error(`Refusing to clear "${dir}": only a directory named .evidence-demo`);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
}

const roleOf = (url: string) => decodeURIComponent(new URL(url).username);

/** Spec §7 `demo:reset`: create cs_demo if missing, wipe, migrate, seed, write evidence, return sign-in links. */
export async function runDemoReset(o: { repoRoot: string; env?: NodeJS.ProcessEnv; now?: Date; log?: (line: string) => void }): Promise<DemoLink[]> {
  const env = o.env ?? process.env;
  const log = o.log ?? console.log;
  const demo = resolveEnvironment('demo', { repoRoot: o.repoRoot, env });
  const dev = resolveEnvironment('dev', { repoRoot: o.repoRoot, env });
  for (const url of [demo.ownerUrl, demo.appUrl, demo.serviceUrl]) assertDatabase(url, DEMO_DATABASE);
  const salt = requireSalt(env);
  const secret = env.LINK_SIGNING_SECRET ?? '';
  if (secret.length < 32) throw new Error('LINK_SIGNING_SECRET must be set (at least 32 characters) to sign demo links');

  log(`[reset] checking that ${DEMO_DATABASE} exists…`);
  const made = await ensureDatabase(dev.ownerUrl, DEMO_DATABASE, [roleOf(demo.appUrl), roleOf(demo.serviceUrl)]);
  log(made === 'created' ? `[reset] created ${DEMO_DATABASE}` : `[reset] ${DEMO_DATABASE} exists`);
  log(`[reset] wiping and migrating ${DEMO_DATABASE}…`);
  await resetDatabase(demo.ownerUrl, DEMO_DATABASE);
  log('[reset] clearing the DEMO evidence directory…');
  await clearDemoEvidence(demo.evidenceDir);
  await seedDemo({ ownerUrl: demo.ownerUrl, expected: DEMO_DATABASE, store: createFsStore(demo.evidenceDir), salt, now: o.now, log });

  const { db, close } = createDb(demo.serviceUrl);
  try {
    return await demoSignInLinks(db, { secret, baseUrl: env.APP_URL?.trim() || 'http://localhost:3000' });
  } finally {
    await close();
  }
}

export function printDemoLinks(links: DemoLink[], log: (line: string) => void = console.log): void {
  log('Sign-in links (they work while the app runs with the dev panel on, DEMO selected):');
  for (const l of links) log(`  ${l.label} <${l.email}>\n    ${l.url}`);
}
