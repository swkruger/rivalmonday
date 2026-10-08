export interface StatPill {
  text: string;
  tone: 'up' | 'down' | 'warn' | 'info';
}

const TONE: Record<StatPill['tone'], string> = {
  up: 'bg-[#DCFCE7] text-[#15803D]',
  down: 'bg-[#FEE2E2] text-[#B91C1C]',
  warn: 'bg-[#FFF3DC] text-[#B45309]',
  info: 'bg-primary-soft text-primary-soft-text',
};

/** Overview KPI card (mockup 01): title, big number, optional tone pill, quiet hint. */
export function StatCard({ title, value, pill, hint }: { title: string; value: string; pill?: StatPill | null; hint: string }) {
  return (
    <div className="rounded-[14px] bg-surface p-6 shadow-card">
      <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-[34px] font-extrabold text-secondary">{value}</span>
        {pill && <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${TONE[pill.tone]}`}>{pill.text}</span>}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
