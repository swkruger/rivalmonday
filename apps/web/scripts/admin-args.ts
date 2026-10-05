import { parseArgs } from 'node:util';
import { isUuid, LINK_TARGETS, type LinkTarget, type Role, ROLES } from '@cs/core';

export type AdminCommand =
  | { cmd: 'agencies' }
  | { cmd: 'create-agency'; name: string }
  | { cmd: 'invite'; agency: string; email: string; role: Role; client?: string }
  | { cmd: 'link'; contact: string; target: LinkTarget; id: string; client?: string };

export const ADMIN_USAGE = `Usage: pnpm --filter @cs/web admin <command> [options]
  agencies                                    list agencies (id, name)
  create-agency --name <name>                 create an agency
  invite --agency <uuid> --email <address> --role <${ROLES.join('|')}> [--client <uuid>]
                                              create a 14-day invitation; the person signs in at APP_URL/sign-in
  link --contact <uuid> --target <${LINK_TARGETS.join('|')}> --id <uuid> [--client <uuid>]
                                              print a signed deep link for a contact (--client required for agency contacts)`;

export function parseAdminArgs(argv: string[]): AdminCommand | { error: string } {
  let values: Record<string, string | undefined>;
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: argv, allowPositionals: true, strict: true,
      options: { name: { type: 'string' }, agency: { type: 'string' }, email: { type: 'string' }, role: { type: 'string' }, client: { type: 'string' }, contact: { type: 'string' }, target: { type: 'string' }, id: { type: 'string' } },
    }) as { values: Record<string, string | undefined>; positionals: string[] });
  } catch (e) {
    return { error: (e as Error).message };
  }
  const uuid = (k: string) => (values[k] && isUuid(values[k]!) ? values[k]! : null);
  if (values.client && !uuid('client')) return { error: '--client must be a uuid' };
  const client = values.client ? { client: values.client } : {};
  switch (positionals[0]) {
    case 'agencies':
      return { cmd: 'agencies' };
    case 'create-agency':
      return values.name?.trim() ? { cmd: 'create-agency', name: values.name.trim() } : { error: '--name is required' };
    case 'invite': {
      const agency = uuid('agency');
      if (!agency || !values.email || !(ROLES as readonly string[]).includes(values.role ?? '')) return { error: 'invite needs --agency <uuid> --email <address> --role <role>' };
      return { cmd: 'invite', agency, email: values.email, role: values.role as Role, ...client };
    }
    case 'link': {
      const contact = uuid('contact');
      const id = uuid('id');
      if (!contact || !id || !(LINK_TARGETS as readonly string[]).includes(values.target ?? '')) return { error: 'link needs --contact <uuid> --target <target> --id <uuid>' };
      return { cmd: 'link', contact, target: values.target as LinkTarget, id, ...client };
    }
    default:
      return { error: 'Unknown command' };
  }
}
