import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../../../.env', import.meta.url)));
} catch {
  // optional
}

const { createDb } = await import('@cs/db');
const { sql } = await import('drizzle-orm');
const { parsePlatformAdminArgs } = await import('./platform-admin-args');

const args = parsePlatformAdminArgs(process.argv.slice(2));
if ('error' in args) {
  console.error(args.error);
  process.exit(1);
}
// Service role: platform_admin has forced RLS with no policies (8a d2); app_user cannot see it.
const url = process.env.SERVICE_DATABASE_URL;
if (!url) {
  console.error('SERVICE_DATABASE_URL is required');
  process.exit(1);
}

const { db, close } = createDb(url);
const NO_USER = 'No user with that email.';
let code = 0;
try {
  switch (args.cmd) {
    case 'add': {
      const done = await db.transaction(async (tx) => {
        const [user] = [...(await tx.execute<{ id: string }>(sql`select id from auth."user" where lower(email) = ${args.email}`))];
        if (!user) return false;
        await tx.execute(sql`update platform_admin set revoked_at = now() where user_id = ${user.id} and revoked_at is null`);
        await tx.execute(sql`insert into platform_admin (user_id, role, created_by) values (${user.id}, ${args.role}, 'cli')`);
        return true;
      });
      if (!done) {
        console.error(NO_USER);
        code = 1;
      } else console.log(`${args.email} is now a platform ${args.role}.`);
      break;
    }
    case 'revoke': {
      const [user] = [...(await db.execute<{ id: string }>(sql`select id from auth."user" where lower(email) = ${args.email}`))];
      if (!user) {
        console.error(NO_USER);
        code = 1;
        break;
      }
      const revoked = [...(await db.execute<{ id: string }>(sql`update platform_admin set revoked_at = now() where user_id = ${user.id} and revoked_at is null returning id`))];
      console.log(revoked.length > 0 ? `Revoked platform access for ${args.email}.` : `${args.email} had no active platform grant.`);
      break;
    }
    case 'list': {
      const rows = [...(await db.execute<{ email: string; role: string; created_at: Date | string; created_by: string | null }>(sql`
        select u.email, pa.role, pa.created_at, pa.created_by from platform_admin pa join auth."user" u on u.id = pa.user_id
        where pa.revoked_at is null order by u.email`))];
      if (rows.length === 0) console.log('No active platform admins (PLATFORM_ADMIN_EMAILS owners are not listed here).');
      for (const r of rows) console.log(`${r.email}  ${r.role}  since ${new Date(r.created_at).toISOString().slice(0, 10)}  by ${r.created_by ?? '-'}`);
      break;
    }
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  code = 1;
} finally {
  await close();
}
process.exit(code);
