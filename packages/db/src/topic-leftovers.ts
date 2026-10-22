import { sql } from 'drizzle-orm';
import type { Db } from './client';

export interface TopicLeftover {
  table: string;
  column: string;
  rows: number;
}

/** Legacy review-sense names (15b-3a); `theme_<v>__<id>` question keys and C7 keys deliberately do not match. */
const LEGACY = String.raw`\m(theme_weakness|theme_strength|fix_theme)\M|\{\{theme\}\}`;

/** Tables that keep history or C7 keys verbatim (never rewritten by the topic rename). */
const EXCLUDED_TABLES = ['feedback', 'ask_message', 'ask_thread', 'ask_starter'];

const TEXT_COLUMNS: [string, string][] = [
  ['runbook_item', 'item_key'],
  ['playbook_override', 'playbook_id'],
  ['playbook_override', 'template'],
  ['brief_item', 'playbook_id'],
  ['recommendation', 'playbook_id'],
];

const rowsOf = async <T>(db: Db, q: ReturnType<typeof sql>) => (await db.execute(q)) as unknown as T[];
const id = (s: string) => sql.identifier(s);

/** Rows that still carry pre-rename review names. Empty means the rename has fully landed. */
export async function findTopicLeftovers(db: Db): Promise<TopicLeftover[]> {
  const out: TopicLeftover[] = [];
  const add = (table: string, column: string, rows: number) => {
    if (rows > 0) out.push({ table, column, rows });
  };
  const count = async (q: ReturnType<typeof sql>) => Number((await rowsOf<{ n: number }>(db, q))[0]?.n ?? 0);

  const jsonbCols = await rowsOf<{ table_name: string; column_name: string }>(
    db,
    sql`SELECT c.table_name, c.column_name FROM information_schema.columns c
        JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
        WHERE c.table_schema = 'public' AND c.data_type = 'jsonb' ORDER BY 1, 2`,
  );
  for (const { table_name: table, column_name: column } of jsonbCols) {
    if (EXCLUDED_TABLES.includes(table)) continue;
    add(table, column, await count(sql`SELECT count(*)::int AS n FROM ${id(table)} WHERE ${id(column)}::text ~ ${LEGACY}`));
  }
  for (const [table, column] of TEXT_COLUMNS) {
    add(table, column, await count(sql`SELECT count(*)::int AS n FROM ${id(table)} WHERE ${id(column)} ~ ${LEGACY}`));
  }
  add('vertical', 'config', await count(sql`SELECT count(*)::int AS n FROM vertical WHERE config ? 'themes'`));
  add('vertical', 'draft_evidence', await count(sql`SELECT count(*)::int AS n FROM vertical WHERE jsonb_typeof(draft_evidence) = 'object' AND draft_evidence ? 'themes'`));
  add('vertical_draft', 'draft', await count(sql`SELECT count(*)::int AS n FROM vertical_draft WHERE jsonb_typeof(draft) = 'object' AND draft ? 'themes'`));
  add('move', 'details', await count(sql`SELECT count(*)::int AS n FROM move WHERE details #> '{facts,theme}' IS NOT NULL`));
  for (const table of ['detected_change', 'event']) {
    add(table, 'details', await count(sql`SELECT count(*)::int AS n FROM ${id(table)} WHERE details ? 'theme' OR details ? 'themeName'`));
  }
  add(
    'model_batch',
    'items',
    await count(sql`SELECT count(*)::int AS n FROM model_batch b WHERE EXISTS (SELECT 1 FROM jsonb_each(b.items) e WHERE jsonb_typeof(e.value) = 'object' AND e.value ? 'themeIds')`),
  );
  return out.sort((a, b) => (a.table + a.column).localeCompare(b.table + b.column));
}
