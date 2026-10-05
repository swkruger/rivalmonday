import { fileURLToPath } from 'node:url';
import { signLink } from '@cs/core';
import { agency, contact, createDb } from '@cs/db';
import { createInvitation } from '@cs/tools';
import { asc, eq } from 'drizzle-orm';
import { ADMIN_USAGE, parseAdminArgs } from './admin-args';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
} catch {
  // optional
}

const parsed = parseAdminArgs(process.argv.slice(2));
if ('error' in parsed) {
  console.error(`${parsed.error}\n\n${ADMIN_USAGE}`);
  process.exit(2);
}
const { db, close } = createDb(process.env.SERVICE_DATABASE_URL!);
try {
  if (parsed.cmd === 'agencies') {
    for (const a of await db.select({ id: agency.id, name: agency.name }).from(agency).orderBy(asc(agency.name))) console.log(`${a.id}  ${a.name}`);
  } else if (parsed.cmd === 'create-agency') {
    const [a] = await db.insert(agency).values({ name: parsed.name }).returning({ id: agency.id });
    console.log(a!.id);
  } else if (parsed.cmd === 'invite') {
    const r = await createInvitation(db, { agencyId: parsed.agency, email: parsed.email, role: parsed.role, clientId: parsed.client ?? null, invitedBy: 'cli' });
    console.log(`Invitation ${r.id} expires ${r.expiresAt.toISOString()}. Sign in at ${process.env.APP_URL}/sign-in with ${parsed.email}.`);
  } else {
    const [c] = await db.select().from(contact).where(eq(contact.id, parsed.contact));
    if (!c) throw new Error('contact not found');
    const clientId = c.clientId ?? parsed.client;
    if (!clientId) throw new Error('--client is required for an agency contact');
    console.log(`${process.env.APP_URL}/l/${signLink(process.env.LINK_SIGNING_SECRET!, { sub: c.id, agency: c.agencyId, client: clientId, t: parsed.target, id: parsed.id })}`);
  }
} finally {
  await close();
}
