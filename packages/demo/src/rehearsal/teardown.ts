import { writeFile } from 'node:fs/promises';
import { agency, type Db } from '@cs/db';
import { and, asc, isNull, like } from 'drizzle-orm';
import { REHEARSAL_AGENCY_PREFIX } from './guards';

/** Decision 14: the owner's cleanup after the archive script; nothing here is automated. */
export const TEARDOWN_MANUAL_STEPS = [
  'Run the archive script from the repo root with SERVICE_DATABASE_URL pointing at the staging branch (purge-archived deletes the tenants after the grace period).',
  'Evidence is never deleted: keep the rivalmonday-staging bucket until you no longer need the rehearsal evidence, then delete the bucket in Cloudflare R2.',
  'Delete (or keep for the next rehearsal) the Neon staging branch.',
  'Delete the Railway project rivalmonday-staging (worker and fixture-hosts services) and the fx1-fx5.rehearsal CNAMEs in Namecheap.',
  'Unset the rehearsal variables (AI_PROVIDER_MODE, REHEARSAL_LIVE_CLIENT_IDS, VENDOR_FAKE_MODE, CRAWL_HOST_ALLOWLIST) wherever they were set; delete rehearsal-manifest.json and rehearsal-archive.sh.',
];

/**
 * Decision 14: archive every live rehearsal agency through the existing 7a2 archive CLI (`@cs/demo` cannot import the
 * worker), so this writes the commands instead of running them. Archived = deleted for tenants; evidence stays.
 */
export async function teardownRehearsal(db: Db, o: { outFile: string }): Promise<{ agencies: { id: string; name: string }[]; manualSteps: string[] }> {
  const agencies = await db.select({ id: agency.id, name: agency.name }).from(agency)
    .where(and(like(agency.name, `${REHEARSAL_AGENCY_PREFIX}%`), isNull(agency.archivedAt)))
    .orderBy(asc(agency.name));
  const script = [
    '#!/usr/bin/env bash',
    '# Rival Monday rehearsal teardown: archives every rehearsal agency (7a2 archive CLI). Run from the repo root.',
    'set -euo pipefail',
    ...agencies.map((a) => `pnpm --filter @cs/worker archive agency ${a.id}`),
    '',
  ].join('\n');
  await writeFile(o.outFile, script, { encoding: 'utf8', mode: 0o755 });
  return { agencies, manualSteps: TEARDOWN_MANUAL_STEPS };
}
