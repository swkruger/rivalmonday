import { sql } from 'drizzle-orm';
import { dbs } from '@/server/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  await dbs().service.execute(sql`select 1`);
  return Response.json({ ok: true });
}
