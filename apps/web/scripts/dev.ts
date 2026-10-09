import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { devEnvFile, webRepoRoot, writeDevEnv } from '../src/server/dev-guard';
import { parseDevArgs } from './dev-args';

/** Deviation 7: npm scripts run under cmd.exe on Windows, so `DEV_PANEL=1 next dev` can't be written inline. */
const webDir = fileURLToPath(new URL('..', import.meta.url));
const { env: target, rest } = parseDevArgs(process.argv.slice(2));
const environment: NodeJS.ProcessEnv = { ...process.env, DEV_PANEL: '1' };
if (target) await writeDevEnv(devEnvFile(environment, webRepoRoot(webDir)), target);
const nextBin = createRequire(import.meta.url).resolve('next/dist/bin/next');
const child = spawn(process.execPath, [nextBin, 'dev', ...rest], { cwd: webDir, env: environment, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
