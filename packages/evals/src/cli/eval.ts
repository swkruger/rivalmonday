import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_AI_CONFIG_PATH, loadAiConfigFile } from '@cs/ai';
import { expandSuites, runEvals } from '../run';
import { parseEvalArgs, resolveMaxUsd } from './args';

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
    case 'build':
    case 'label':
      // Suite builders and labelling arrive with the suites (Tasks 10-12).
      throw new Error(`eval ${parsed.cmd}: no builder is registered for suite "${parsed.suite}" yet`);
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
