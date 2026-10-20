export interface StatPill {
  text: string;
  tone: 'up' | 'down' | 'warn' | 'info';
  /** Decorative arrow (hidden from assistive tech); `srLabel` is its spoken equivalent. */
  glyph?: string;
  srLabel?: string;
}

const TONE: Record<StatPill['tone'], string> = {
  up: 'bg-[#DCFCE7] text-[#15803D]',
  down: 'bg-[#FEE2E2] text-[#B91C1C]',
  warn: 'bg-[#FFF3DC] text-[#B45309]',
  info: 'bg-primary-soft text-primary-soft-text',
};

/** Overview KPI card (mockup 01): title, big number, optional tone pill, quiet hint. `help` (15b): a `HelpTip` beside the title. */
export function StatCard({ title, value, pill, hint, help }: { title: string; value: string; pill?: StatPill | null; hint: string; help?: React.ReactNode }) {
  return (
    <div className="rounded-[14px] bg-surface p-6 shadow-card">
      {help ? (
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
          {help}
        </div>
      ) : (
        <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-[34px] font-extrabold text-secondary">{value}</span>
        {pill && <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${TONE[pill.tone]}`}>{pill.glyph && <span aria-hidden="true">{pill.glyph} </span>}{pill.srLabel && <span className="sr-only">{pill.srLabel} </span>}{pill.text}</span>}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
