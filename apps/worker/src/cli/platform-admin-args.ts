import { parseArgs } from 'node:util';

export const PLATFORM_ROLES = ['owner', 'staff', 'viewer'] as const;
export type PlatformAdminRole = (typeof PLATFORM_ROLES)[number];

export const PLATFORM_ADMIN_USAGE = [
  'Usage: pnpm --filter @cs/worker platform-admin <command>',
  '  add <email> [--role owner|staff|viewer]   grant platform access (default viewer; replaces any active grant)',
  '  revoke <email>                            revoke the active grant',
  '  list                                      active grants',
].join('\n');

export type PlatformAdminCommand =
  | { cmd: 'add'; email: string; role: PlatformAdminRole }
  | { cmd: 'revoke'; email: string }
  | { cmd: 'list' };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const fail = (msg: string) => ({ error: `${msg}\n${PLATFORM_ADMIN_USAGE}` });

export function parsePlatformAdminArgs(argv: string[]): PlatformAdminCommand | { error: string } {
  const [cmd, ...rest] = argv;
  let role: string | undefined;
  let positionals: string[];
  try {
    const parsed = parseArgs({ args: rest, allowPositionals: true, options: { role: { type: 'string' } } });
    role = parsed.values.role;
    positionals = parsed.positionals;
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
  const oneEmail = (): string | { error: string } => {
    if (positionals.length !== 1) return fail(`${cmd} needs exactly one <email>`);
    const email = positionals[0]!.trim().toLowerCase();
    return EMAIL.test(email) ? email : fail(`not an email address: "${positionals[0]}"`);
  };
  switch (cmd) {
    case 'add': {
      const email = oneEmail();
      if (typeof email !== 'string') return email;
      const r = role ?? 'viewer';
      if (!(PLATFORM_ROLES as readonly string[]).includes(r)) return fail(`--role must be owner, staff or viewer (got "${r}")`);
      return { cmd, email, role: r as PlatformAdminRole };
    }
    case 'revoke': {
      if (role !== undefined) return fail('revoke takes no --role');
      const email = oneEmail();
      return typeof email === 'string' ? { cmd, email } : email;
    }
    case 'list':
      if (positionals.length > 0 || role !== undefined) return fail('list takes no arguments');
      return { cmd };
    default:
      return fail(cmd ? `unknown command "${cmd}"` : 'missing command');
  }
}
