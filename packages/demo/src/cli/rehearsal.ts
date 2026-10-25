import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { createDb, redactSecrets } from '@cs/db';
import { deliveryConfigFromEnv } from '@cs/engine';
import { approveRehearsalBriefs } from '../rehearsal/approve';
import { parseRehearsalArgs } from '../rehearsal/args';
import { seedFault } from '../rehearsal/fault';
import { dbIdentity, guardRehearsalWrite } from '../rehearsal/guards';
import { measureRehearsalLatency } from '../rehearsal/latency';
import { readManifest, REHEARSAL_ARCHIVE_FILE, REHEARSAL_MANIFEST_FILE, writeManifest } from '../rehearsal/manifest';
import { fetchFixtureLog, formatReport, rehearsalReport } from '../rehearsal/report';
import { seedRehearsal } from '../rehearsal/seed';
import { teardownRehearsal } from '../rehearsal/teardown';
import { loadRepoEnv, repoRoot } from './repo';

loadRepoEnv();

/** Relative paths are taken from where the owner ran pnpm (`INIT_CWD`), not from packages/demo. */
const fromInvocation = (p: string) => (isAbsolute(p) ? p : resolve(process.env.INIT_CWD ?? process.cwd(), p));
const manifestPath = (p?: string) => (p ? fromInvocation(p) : join(repoRoot(), REHEARSAL_MANIFEST_FILE));

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

async function withDb<T>(url: string, fn: (db: ReturnType<typeof createDb>['db']) => Promise<T>): Promise<T> {
  const { db, close } = createDb(url, { max: 2 });
  try {
    return await fn(db);
  } finally {
    await close();
  }
}

async function main(): Promise<number> {
  const args = parseRehearsalArgs(process.argv.slice(2));
  if ('error' in args) {
    console.error(args.error);
    return 1;
  }
  switch (args.cmd) {
    case 'seed': {
      const url = env('SERVICE_DATABASE_URL');
      const m = await withDb(url, async (db) => {
        await guardRehearsalWrite(db, url, { confirmDb: args.confirmDb });
        return seedRehearsal(db, { agencies: args.agencies, clients: args.clients, startingPoints: args.startingPoints, liveClients: args.liveClients, database: dbIdentity(url), log: (l) => console.log(`[seed] ${l}`) });
      });
      const file = manifestPath(args.manifest);
      await writeManifest(file, m);
      console.log(`Seeded ${m.weeklyClientIds.length} weekly + ${m.startingPointClientIds.length} starting-point clients for delivery ${m.deliveryDate}. Manifest: ${file}`);
      console.log('Set this on the staging worker and redeploy:');
      console.log(`REHEARSAL_LIVE_CLIENT_IDS=${m.liveClientIds.join(',')}`);
      return 0;
    }
    case 'fault': {
      const url = env('SERVICE_DATABASE_URL');
      const f = await withDb(url, async (db) => {
        await guardRehearsalWrite(db, url, { requireConfirm: false });
        return seedFault(db, { clients: args.clients });
      });
      const file = manifestPath(args.manifest);
      if (existsSync(file)) await writeManifest(file, { ...(await readManifest(file)), fault: { agencyId: f.agencyId, clientIds: f.clientIds } });
      console.log(`Fault agency ${f.agencyId}: ${f.clientIds.length} clients pre-failed for ${f.deliveryDate}. Expect a critical generation_closed alert + email Friday 12:00 local.`);
      return 0;
    }
    case 'approve': {
      const m = await readManifest(manifestPath(args.manifest));
      const serviceUrl = env('SERVICE_DATABASE_URL');
      const app = createDb(env('APP_DATABASE_URL'), { max: 2 });
      try {
        const r = await withDb(serviceUrl, async (service) => {
          await guardRehearsalWrite(service, serviceUrl, { requireConfirm: false });
          const delivery = deliveryConfigFromEnv(process.env);
          if (!delivery) console.warn('APP_URL / LINK_SIGNING_SECRET not set: approved starting points stay approved (send them with "send now").');
          return approveRehearsalBriefs({ app: app.db, service, delivery }, m);
        });
        console.log(`Approved ${r.approved} briefs.`);
        for (const f of r.failed) console.error(`  ${f.briefId}: ${f.error}`);
        return r.failed.length > 0 ? 1 : 0;
      } finally {
        await app.close();
      }
    }
    case 'report': {
      const m = await readManifest(manifestPath(args.manifest));
      const fixtureLog = args.fixtureLogUrl ? await fetchFixtureLog(args.fixtureLogUrl, env(args.fixtureLogTokenEnv!)) : null;
      const lines = await withDb(env('DATABASE_URL'), (db) => rehearsalReport(db, { manifest: m, memoryMb: args.memoryMb, fixtureLog }));
      const text = formatReport(lines);
      console.log(text);
      return /^RESULT: PASS/m.test(text) ? 0 : 1;
    }
    case 'teardown': {
      const url = env('SERVICE_DATABASE_URL');
      const outFile = args.out ? fromInvocation(args.out) : join(repoRoot(), REHEARSAL_ARCHIVE_FILE);
      const r = await withDb(url, async (db) => {
        await guardRehearsalWrite(db, url, { confirmDb: args.confirmDb });
        return teardownRehearsal(db, { outFile });
      });
      console.log(`Wrote ${outFile} (${r.agencies.length} agencies). Nothing was archived yet. Then:`);
      r.manualSteps.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
      return 0;
    }
    case 'latency': {
      const outFile = fromInvocation(args.out);
      const r = await withDb(env('DATABASE_URL'), (db) => measureRehearsalLatency(db, { outFile, days: args.days }));
      console.log(`Wrote ${outFile}: measured ${r.updated.length} tasks (${r.updated.join(', ') || 'none'}); kept ${r.kept.length}.`);
      return 0;
    }
  }
}

try {
  process.exitCode = await main();
} catch (e) {
  console.error(`[rehearsal] failed: ${redactSecrets(e instanceof Error ? e.message : String(e))}`);
  process.exitCode = 1;
}
