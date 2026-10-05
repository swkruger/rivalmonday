import type { Db } from '@cs/db';
import { sql } from 'drizzle-orm';

export interface AuthUserSeed {
  id: string;
  email: string;
  /** Defaults to the email (Better Auth's `name` column is NOT NULL). */
  name?: string;
  verified?: boolean;
}

/** Inserts Better Auth users directly (owner connection), bypassing Better Auth. */
export async function seedAuthUsers(owner: Db, ...users: AuthUserSeed[]): Promise<void> {
  for (const u of users) {
    await owner.execute(sql`insert into auth."user" (id, name, email, "emailVerified") values (${u.id}, ${u.name ?? u.email}, ${u.email}, ${u.verified ?? true})`);
  }
}

/** Empties every Better Auth table: users (cascading to sessions, accounts and memberships), verification tokens and rate-limit counters. */
export async function truncateAuth(owner: Db): Promise<void> {
  await owner.execute(sql`truncate auth."user", auth.verification, auth."rateLimit" cascade`);
}
