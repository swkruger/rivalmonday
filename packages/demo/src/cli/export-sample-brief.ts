import { createDb, redactSecrets, resolveEnvironment } from '@cs/db';
import { createFsStore } from '@cs/storage';
import { collectSampleBrief, finalizeSampleBrief, SampleBriefGuardError } from '../site-export/sample-brief';
import { writeSiteContent } from '../site-export/write';
import { loadRepoEnv, repoRoot } from './repo';

loadRepoEnv();
try {
  const env = resolveEnvironment('demo', { repoRoot: repoRoot() });
  const { db, close } = createDb(env.serviceUrl);
  try {
    const { raw, sources } = await collectSampleBrief(db, createFsStore(env.evidenceDir));
    const out = finalizeSampleBrief(raw, sources);
    await writeSiteContent(repoRoot(), 'sample-brief.json', out);
    const withEvidence = out.items.filter((i) => i.evidenceIds.length > 0).length;
    console.log(`[export:sample-brief] ${out.items.length} items (${withEvidence} with evidence), ${Object.keys(out.evidence).length} evidence, ${out.rivals.length} rivals, ${out.rankGrid.weeks.length} weeks`);
  } finally {
    await close();
  }
} catch (e) {
  if (e instanceof SampleBriefGuardError) {
    // Paths and reasons only — never the flagged text. Nothing was written.
    for (const h of e.hits) console.error(`${h.path} ${h.reason}`);
    console.error(`[export:sample-brief] ${e.hits.length} guard hit(s); nothing written`);
  } else {
    console.error(`[export:sample-brief] failed: ${redactSecrets(e instanceof Error ? e.message : String(e))}`);
  }
  process.exitCode = 1;
}
