import type { Server } from 'node:http';
import { LedgerError } from '../ledger.js';
import { isMainModule, ledgerPathFor, repoRoot } from '../paths.js';
import { createServer } from '../server/app.js';

const DEFAULT_PORT = 4300;
const PORT_TRIES = 11;

/** Why the review server must not start here (deployed / production environment), or undefined. */
export function refuseReason(env: NodeJS.ProcessEnv): string | undefined {
  if (env.VERCEL) return 'Refusing to start: VERCEL is set (this tool is local-only).';
  if (env.NODE_ENV === 'production') return 'Refusing to start: NODE_ENV=production (this tool is local-only).';
  return undefined;
}

function parsePort(argv: string[]): number | undefined {
  const i = argv.indexOf('--port');
  if (i < 0) return DEFAULT_PORT;
  const n = Number(argv[i + 1]);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : undefined;
}

/** Listen on 127.0.0.1:port; on EADDRINUSE try the next ports (port … port+10). */
function listen(server: Server, port: number, triesLeft: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (e: NodeJS.ErrnoException) => {
      server.off('listening', onListening);
      if (e.code === 'EADDRINUSE' && triesLeft > 1) resolve(listen(server, port + 1, triesLeft - 1));
      else reject(e);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve(port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
}

async function main(argv: string[]): Promise<number> {
  const refused = refuseReason(process.env);
  if (refused) {
    console.error(refused);
    return 2;
  }
  const port = parsePort(argv);
  if (port === undefined) {
    console.error('Usage: pnpm copy:review [--port <1-65535>]');
    return 2;
  }
  const root = repoRoot();
  let server: Server;
  try {
    server = createServer({ root, ledgerPath: ledgerPathFor(root) });
  } catch (e) {
    if (e instanceof LedgerError) {
      console.error(e.message);
      return 2;
    }
    throw e;
  }
  const bound = await listen(server, port, PORT_TRIES);
  console.log(`Copy sign-off: http://127.0.0.1:${bound}/`);
  return -1;
}

if (isMainModule(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => {
      if (code >= 0) process.exit(code);
    },
    (e: unknown) => {
      console.error(e);
      process.exit(1);
    },
  );
}
