import type { Db } from '@cs/db';
import { sql } from 'drizzle-orm';

export async function seedUser(owner: Db, id: string, email: string, verified = true): Promise<void> {
  await owner.execute(sql`insert into auth."user" (id, name, email, "emailVerified") values (${id}, ${email}, ${email}, ${verified})`);
}

export async function truncateAuth(owner: Db): Promise<void> {
  await owner.execute(sql`truncate auth."user", auth.verification, auth."rateLimit" cascade`);
}
