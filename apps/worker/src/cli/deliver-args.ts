import { isUuid } from '@cs/core';
import { parseArgs } from 'node:util';

const ROLES = ['agency_admin', 'account_manager', 'client_owner', 'client_viewer'] as const;
const MODES = ['direct', 'after_am_check', 'digest_only'] as const;
type Role = (typeof ROLES)[number];
type Mode = (typeof MODES)[number];

export type DeliverCommand =
  | { cmd: 'contact-add'; agency: string; client?: string; role: Role; email: string; name?: string; tz?: string; quiet?: { start: string; end: string }; scope?: string[] }
  | { cmd: 'settings'; client: string; alertMode?: Mode; autoSend?: boolean }
  | { cmd: 'alerts' | 'digest' | 'dispatch' | 'deliver' | 'report'; now?: Date }
  | { cmd: 'alert-dry'; client: string; event: string }
  | { cmd: 'send'; brief: string }
  | { cmd: 'pdf'; brief?: string; report?: string; out: string }
  | { cmd: 'link'; verify: string };

export const DELIVER_ONCE_USAGE = `Usage: pnpm --filter @cs/worker deliver-once <command> [options]
  contact-add --agency <uuid> [--client <uuid>] --role <${ROLES.join('|')}> --email <address> [--name <n>] [--tz <IANA zone>] [--quiet HH:MM-HH:MM] [--scope <client uuid>]...
  settings --client <uuid> [--alert-mode ${MODES.join('|')}] [--auto-send on|off]
  alerts [--now <ISO>]                       sweep alert-routed events, then write and route every drafting alert
  alert-dry --client <uuid> --event <uuid>   write and verify alert text for one event and print it (stores nothing)
  digest | dispatch | deliver | report [--now <ISO>]
  send --brief <uuid>                        approve (as "cli") if ready, then send now
  pdf (--brief <uuid> | --report <uuid>) --out <file.pdf>
  link --verify <token>`;

export function parseDeliverArgs(argv: string[]): DeliverCommand | { error: string } {
  let values: Record<string, string | string[] | undefined>;
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: argv, allowPositionals: true,
      options: {
        agency: { type: 'string' }, client: { type: 'string' }, role: { type: 'string' }, email: { type: 'string' }, name: { type: 'string' }, tz: { type: 'string' },
        quiet: { type: 'string' }, scope: { type: 'string', multiple: true }, 'alert-mode': { type: 'string' }, 'auto-send': { type: 'string' }, now: { type: 'string' },
        event: { type: 'string' }, brief: { type: 'string' }, report: { type: 'string' }, out: { type: 'string' }, verify: { type: 'string' },
      },
    }));
  } catch (err) {
    return { error: `${err instanceof Error ? err.message : String(err)}\n${DELIVER_ONCE_USAGE}` };
  }
  const v = values as Record<string, string | undefined> & { scope?: string[] };
  const fail = (msg: string) => ({ error: `${msg}\n${DELIVER_ONCE_USAGE}` });
  const uuid = (k: string) => (v[k] && isUuid(v[k]!) ? v[k]! : null);
  let now: Date | undefined;
  if (v.now !== undefined) {
    now = new Date(v.now);
    if (Number.isNaN(now.getTime())) return fail('--now must be an ISO time');
  }
  switch (positionals[0]) {
    case 'contact-add': {
      const agency = uuid('agency');
      if (!agency || !v.email || !ROLES.includes(v.role as Role)) return fail('contact-add needs --agency <uuid>, --role and --email');
      if (v.client !== undefined && !uuid('client')) return fail('--client must be a uuid');
      if (v.scope && !v.scope.every(isUuid)) return fail('--scope takes client uuids');
      let quiet: { start: string; end: string } | undefined;
      if (v.quiet !== undefined) {
        const m = /^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/.exec(v.quiet);
        if (!m) return fail('--quiet must be HH:MM-HH:MM');
        quiet = { start: `${m[1]}:${m[2]}`, end: `${m[3]}:${m[4]}` };
      }
      return {
        cmd: 'contact-add', agency, role: v.role as Role, email: v.email,
        ...(v.client ? { client: v.client } : {}), ...(v.name ? { name: v.name } : {}), ...(v.tz ? { tz: v.tz } : {}), ...(quiet ? { quiet } : {}), ...(v.scope ? { scope: v.scope } : {}),
      };
    }
    case 'settings': {
      const client = uuid('client');
      if (!client) return fail('settings needs --client <uuid>');
      const mode = v['alert-mode'];
      if (mode !== undefined && !MODES.includes(mode as Mode)) return fail(`--alert-mode must be one of ${MODES.join(', ')}`);
      const auto = v['auto-send'];
      if (auto !== undefined && auto !== 'on' && auto !== 'off') return fail('--auto-send must be on or off');
      return { cmd: 'settings', client, ...(mode ? { alertMode: mode as Mode } : {}), ...(auto ? { autoSend: auto === 'on' } : {}) };
    }
    case 'alerts':
    case 'digest':
    case 'dispatch':
    case 'deliver':
    case 'report':
      return { cmd: positionals[0], ...(now ? { now } : {}) };
    case 'alert-dry': {
      const client = uuid('client');
      const event = uuid('event');
      return client && event ? { cmd: 'alert-dry', client, event } : fail('alert-dry needs --client <uuid> and --event <uuid>');
    }
    case 'send': {
      const brief = uuid('brief');
      return brief ? { cmd: 'send', brief } : fail('send needs --brief <uuid>');
    }
    case 'pdf': {
      const brief = uuid('brief');
      const report = uuid('report');
      if (!v.out || (!brief === !report)) return fail('pdf needs exactly one of --brief/--report and --out <file>');
      return { cmd: 'pdf', ...(brief ? { brief } : { report: report! }), out: v.out };
    }
    case 'link':
      return v.verify ? { cmd: 'link', verify: v.verify } : fail('link needs --verify <token>');
    default:
      return fail(positionals[0] ? `Unknown command ${positionals[0]}` : 'Missing command');
  }
}
