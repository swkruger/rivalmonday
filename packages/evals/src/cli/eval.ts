import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAiFromEnv, DEFAULT_AI_CONFIG_PATH, loadAiConfigFile } from '@cs/ai';
import { createDb, type Db } from '@cs/db';
import { sql } from 'drizzle-orm';
import { budgetedAi, createSpendMeter } from '../budget';
import { buildCsDev } from '../build/cs-dev';
import { expandSuites, runEvals } from '../run';
import { DEFAULT_REPORT_DIR, parseEvalArgs, resolveMaxUsd } from './args';
import { runBuild, runLabel } from './dataset';

/** packages/evals/src/cli -> repo root. */
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
try {
  process.loadEnvFile(join(repoRoot, '.env'));
} catch {
  // .env is optional (variables may come from the shell or CI); never print it.
}

const parsed = parseEvalArgs(process.argv.slice(2));
if ('error' in parsed) {
  console.error(parsed.error);
  process.exit(1);
}

try {
  switch (parsed.cmd) {
    case 'build': {
      // cs_dev via the owner DATABASE_URL, every read inside a READ ONLY transaction.
      const url = process.env.DATABASE_URL;
      if (!url) throw new Error('eval build needs DATABASE_URL (cs_dev, read-only reads)');
      const { db, close } = createDb(url);
      try {
        await runBuild(parsed.suite as 'changes' | 'reviews', {
          csDev: (suite, limit) =>
            db.transaction(async (tx) => {
              await tx.execute(sql`set transaction read only`);
              return buildCsDev(suite, tx as unknown as Db, limit);
            }),
        });
      } finally {
        await close();
      }
      break;
    }
    case 'label': {
      const cmd = parsed;
      const outcome = await runLabel(cmd, {
        reportDir: DEFAULT_REPORT_DIR,
        makeAi: async () => {
          const maxUsd = resolveMaxUsd(cmd.maxUsd, process.env, true);
          if (typeof maxUsd === 'object') throw new Error(maxUsd.error);
          const meter = createSpendMeter();
          const config = await loadAiConfigFile(DEFAULT_AI_CONFIG_PATH);
          return budgetedAi(createAiFromEnv({ ...process.env, AI_SHADOW_RATE: '0' }, config, meter.ledger), maxUsd, meter);
        },
      });
      if (outcome.failed) process.exitCode = 1;
      break;
    }
    case 'run':
    case 'record': {
      const live = parsed.cmd === 'record' || parsed.mode === 'live';
      const maxUsd = resolveMaxUsd(parsed.maxUsd, process.env, live);
      if (typeof maxUsd === 'object') throw new Error(maxUsd.error);
      const outcome = await runEvals({
        suites: expandSuites(parsed.suite),
        mode: parsed.cmd === 'record' ? 'live' : parsed.mode,
        record: parsed.cmd === 'record',
        maxUsd,
        reportDir: parsed.reportDir,
        updateBaseline: parsed.cmd === 'run' && parsed.updateBaseline,
        config: await loadAiConfigFile(DEFAULT_AI_CONFIG_PATH),
        env: process.env,
      });
      for (const e of outcome.errors) console.error(`[eval] ${e}`);
      if (outcome.failed) process.exitCode = 1;
    }
  }
} catch (err) {
  console.error(`[eval] ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
}
