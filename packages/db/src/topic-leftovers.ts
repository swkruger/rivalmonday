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

/** generic's pre-15b-3b topic id (now `staff_professionalism`); hvac_plumbing keeps it in its own topic list. */
const OLD_GENERIC_TOPIC = 'technician_professionalism';
const OLD_GENERIC_KEY = String.raw`^theme_(.+)__technician_professionalism$`;
/** Verticals whose effective seed topic list (own `topics`, else generic's) lacks the old id: rows of theirs holding it are leftovers. */
const STALE_VERTICALS = sql`(SELECT v.id FROM vertical v LEFT JOIN vertical g ON g.id = 'generic'
  WHERE NOT coalesce(CASE WHEN v.config ? 'topics' THEN v.config -> 'topics' ELSE g.config -> 'topics' END, '[]'::jsonb)
    @> ${JSON.stringify([{ id: OLD_GENERIC_TOPIC }])}::jsonb)`;

const rowsOf = async <T>(db: Db, q: ReturnType<typeof sql>) => (await db.execute(q)) as unknown as T[];
const id = (s: string) => sql.identifier(s);

/** Sums entries reported twice for one column (e.g. a legacy `theme` key and the old generic topic id). */
function mergeLeftovers(list: TopicLeftover[]): TopicLeftover[] {
  const by = new Map<string, TopicLeftover>();
  for (const l of list) {
    const k = `${l.table}.${l.column}`;
    const prev = by.get(k);
    by.set(k, prev ? { ...prev, rows: prev.rows + l.rows } : l);
  }
  return [...by.values()];
}

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
    add(table, 'details', await count(sql`SELECT count(*)::int AS n FROM ${id(table)} WHERE details ? 'theme' OR details ? 'themeName'
        OR (details ->> 'topic' = ${OLD_GENERIC_TOPIC} AND details ->> 'verticalId' IN ${STALE_VERTICALS})`));
  }
  add(
    'model_batch',
    'items',
    await count(sql`SELECT count(*)::int AS n FROM model_batch b WHERE EXISTS (SELECT 1 FROM jsonb_each(b.items) e WHERE jsonb_typeof(e.value) = 'object' AND e.value ? 'themeIds')`),
  );
  for (const column of ['asked', 'topics']) {
    add('review_analysis', column, await count(sql`SELECT count(*)::int AS n FROM review_analysis WHERE vertical_id IN ${STALE_VERTICALS} AND ${id(column)} ? ${OLD_GENERIC_TOPIC}`));
  }
  add('topic_proposal', 'topic_id', await count(sql`SELECT count(*)::int AS n FROM topic_proposal WHERE topic_id = ${OLD_GENERIC_TOPIC} AND vertical_id IN ${STALE_VERTICALS}`));
  add('decision_label', 'question_key', await count(sql`SELECT count(*)::int AS n FROM decision_label WHERE substring(question_key from ${OLD_GENERIC_KEY}) IN ${STALE_VERTICALS}`));
  add(
    'decision_sample',
    'questions',
    await count(sql`SELECT count(*)::int AS n FROM decision_sample s WHERE jsonb_typeof(s.questions) = 'object'
      AND EXISTS (SELECT 1 FROM jsonb_object_keys(s.questions) k WHERE substring(k from ${OLD_GENERIC_KEY}) IN ${STALE_VERTICALS})`),
  );
  add(
    'decision_sample',
    'needs_review',
    await count(sql`SELECT count(*)::int AS n FROM decision_sample s WHERE jsonb_typeof(s.needs_review) = 'array'
      AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(s.needs_review) k WHERE substring(k from ${OLD_GENERIC_KEY}) IN ${STALE_VERTICALS})`),
  );
  return mergeLeftovers(out).sort((a, b) => (a.table + a.column).localeCompare(b.table + b.column));
}
