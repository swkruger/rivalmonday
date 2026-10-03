import { type Db, decisionLabel, decisionSample, type LabelSource, type SampleAnswers } from '@cs/db';
import { desc, eq, inArray, sql } from 'drizzle-orm';

export const LABEL_COLUMNS = ['sample_id', 'task', 'question_key', 'question_type', 'allowed', 'state', 'primary', 'fallback', 'final', 'label'] as const;
const STATE_CHARS = 2000;

export interface LabelRow {
  sampleId: string;
  task: string;
  questionKey: string;
  questionType: string;
  allowed: string;
  state: string;
  primary: string;
  fallback: string;
  final: string;
  label: string;
}

type Q = { type?: string; options?: Record<string, string>; levels?: string[] };

export function allowedValues(q: unknown): string[] {
  const x = q as Q;
  if (x.type === 'noul') return ['true', 'false'];
  if (x.type === 'choice') return Object.keys(x.options ?? {});
  if (x.type === 'score') return (x.levels ?? []).map((_, i) => String(i));
  return [];
}

/** A label in the question's own vocabulary; Noul accepts yes/no/1/0 too. Null when not allowed. */
export function normalizeLabel(q: unknown, raw: string): string | null {
  let v = raw.trim();
  if ((q as Q).type === 'noul') v = ({ yes: 'true', y: 'true', '1': 'true', no: 'false', n: 'false', '0': 'false' } as Record<string, string>)[v.toLowerCase()] ?? v.toLowerCase();
  return allowedValues(q).includes(v) ? v : null;
}

const valueOf = (a: unknown) => {
  const v = (a as { value?: unknown } | undefined)?.value;
  return v === undefined || v === null ? '' : String(v);
};
const sideValue = (s: SampleAnswers | null, key: string) => valueOf(s?.answers[key]);

/** Newest samples first; one row per question that has no label yet. */
export async function exportUnlabeled(db: Db, opts: { task?: string; limit: number }): Promise<LabelRow[]> {
  const samples = await db
    .select()
    .from(decisionSample)
    .where(opts.task ? eq(decisionSample.task, opts.task) : undefined)
    .orderBy(desc(decisionSample.createdAt))
    .limit(opts.limit);
  if (samples.length === 0) return [];
  const done = new Set(
    (await db.select({ s: decisionLabel.sampleId, k: decisionLabel.questionKey }).from(decisionLabel).where(inArray(decisionLabel.sampleId, samples.map((s) => s.id)))).map(
      (r) => `${r.s}|${r.k}`,
    ),
  );
  const rows: LabelRow[] = [];
  for (const s of samples) {
    for (const [key, q] of Object.entries(s.questions)) {
      if (done.has(`${s.id}|${key}`)) continue;
      rows.push({
        sampleId: s.id, task: s.task, questionKey: key, questionType: String((q as Q).type ?? ''), allowed: allowedValues(q).join('|'),
        state: JSON.stringify(s.state).slice(0, STATE_CHARS), primary: sideValue(s.primary, key), fallback: sideValue(s.fallback, key), final: valueOf(s.final[key]), label: '',
      });
    }
  }
  return rows;
}

const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function toCsv(rows: LabelRow[]): string {
  const lines = [LABEL_COLUMNS.join(',')];
  for (const r of rows) lines.push([r.sampleId, r.task, r.questionKey, r.questionType, r.allowed, r.state, r.primary, r.fallback, r.final, r.label].map(cell).join(','));
  return `${lines.join('\n')}\n`;
}

/** RFC 4180: quoted fields may hold commas, doubled quotes and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Rows with an empty label are skipped (not yet labelled). */
export function parseLabelCsv(text: string): { sampleId: string; questionKey: string; label: string }[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`label CSV has no "${name}" column`);
    return i;
  };
  const [s, k, l] = [col('sample_id'), col('question_key'), col('label')];
  return rows.filter((r) => (r[l] ?? '').trim() !== '').map((r) => ({ sampleId: r[s] ?? '', questionKey: r[k] ?? '', label: r[l] ?? '' }));
}

export async function importLabels(
  db: Db,
  items: { sampleId: string; questionKey: string; label: string }[],
  opts: { labeledBy: string; source?: LabelSource },
): Promise<{ imported: number; errors: string[] }> {
  const errors: string[] = [];
  let imported = 0;
  const ids = [...new Set(items.map((i) => i.sampleId))].filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
  const samples = new Map(
    ids.length === 0 ? [] : (await db.select({ id: decisionSample.id, questions: decisionSample.questions }).from(decisionSample).where(inArray(decisionSample.id, ids))).map((s) => [s.id, s.questions]),
  );
  for (const it of items) {
    const questions = samples.get(it.sampleId);
    if (!questions) {
      errors.push(`${it.sampleId}: no such sample`);
      continue;
    }
    const q = questions[it.questionKey];
    if (!q) {
      errors.push(`${it.sampleId}/${it.questionKey}: the sample has no such question`);
      continue;
    }
    const value = normalizeLabel(q, it.label);
    if (value === null) {
      errors.push(`${it.sampleId}/${it.questionKey}: "${it.label}" is not one of ${allowedValues(q).join('|')}`);
      continue;
    }
    await db
      .insert(decisionLabel)
      .values({ sampleId: it.sampleId, questionKey: it.questionKey, value, source: opts.source ?? 'human', labeledBy: opts.labeledBy })
      .onConflictDoUpdate({ target: [decisionLabel.sampleId, decisionLabel.questionKey], set: { value, source: opts.source ?? 'human', labeledBy: opts.labeledBy, createdAt: sql`now()` } });
    imported++;
  }
  return { imported, errors };
}
