import { parseArgs } from 'node:util';

export const ARCHIVE_USAGE = [
  'Usage: pnpm --filter @cs/worker archive <agency|client> <id> [--undo]',
  '  archive agency <id>          hide the agency and all its clients (purge-archived deletes it later)',
  '  archive client <id>          hide one client',
  '  ... --undo                   clear archived_at again (lossless)',
].join('\n');

export type ArchiveArgs = { kind: 'agency' | 'client'; id: string; undo: boolean } | { error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const fail = (msg: string) => ({ error: `${msg}\n${ARCHIVE_USAGE}` });

export function parseArchiveArgs(argv: string[]): ArchiveArgs {
  let undo: boolean;
  let positionals: string[];
  try {
    const parsed = parseArgs({ args: argv, allowPositionals: true, options: { undo: { type: 'boolean', default: false } } });
    undo = parsed.values.undo ?? false;
    positionals = parsed.positionals;
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
  const [kind, rawId, ...extra] = positionals;
  if (kind !== 'agency' && kind !== 'client') return fail(kind ? `unknown kind "${kind}" (agency or client)` : 'missing kind');
  if (rawId === undefined || extra.length > 0) return fail(`${kind} needs exactly one <id>`);
  const id = rawId.trim().toLowerCase();
  if (!UUID.test(id)) return fail(`not a uuid: "${rawId}"`);
  return { kind, id, undo };
}
