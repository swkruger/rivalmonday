/** Fixed lookup: Tailwind only sees whole class names, so the column count never builds one. */
const COLUMNS: Record<number, string> = { 3: 'md:grid-cols-3', 4: 'md:grid-cols-4' };

/** Labelled figures: two per row on phones, one row from `md` (three or four cells). Each cell is one `dt`/`dd` pair. */
export function ValueCells({ cells }: { cells: { value: string; label: string }[] }) {
  return (
    <dl className={`grid grid-cols-2 gap-x-6 gap-y-5 ${COLUMNS[cells.length] ?? 'md:grid-cols-4'}`}>
      {cells.map((c) => (
        <div key={c.label}>
          <dt className="text-xl font-semibold tabular-nums text-ink">{c.value}</dt>
          <dd className="mt-1 text-sm text-ink-secondary">{c.label}</dd>
        </div>
      ))}
    </dl>
  );
}
