import { printDemoLinks, runDemoReset } from '../reset';
import { loadRepoEnv, repoRoot } from './repo';

loadRepoEnv();
try {
  printDemoLinks(await runDemoReset({ repoRoot: repoRoot() }));
} catch (e) {
  console.error(`[reset] failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
