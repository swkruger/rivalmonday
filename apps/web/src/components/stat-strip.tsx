import Link from 'next/link';
import { Kpi, KpiStrip } from '@cs/ui';
import type { StatPill } from '@/components/stat-card';

export interface StatItem { title: string; value: string; pill?: StatPill | null; hint?: string; help?: React.ReactNode; href?: string }

const TONE: Record<StatPill['tone'], string> = {
  up: 'bg-chip-success-bg text-chip-success-text',
  down: 'bg-chip-danger-bg text-chip-danger-text',
  warn: 'bg-chip-warning-bg text-accent-text',
  info: 'bg-muted-surface text-muted-ink',
};

/** Text pill for a KPI (design system v1 badge); same spoken text as `StatCard`'s pill. */
export function StatBadge({ pill }: { pill: StatPill }) {
  return (
    <span data-tone={pill.tone} className={`inline-flex h-5 items-center gap-0.5 rounded-xs px-1.5 text-xs font-semibold tabular-nums ${TONE[pill.tone]}`}>
      {pill.glyph && <span aria-hidden="true">{pill.glyph} </span>}
      {pill.srLabel && <span className="sr-only">{pill.srLabel} </span>}
      {pill.text}
    </span>
  );
}

/** Overview KPI row (09 § 5.3): one hairline-framed strip; titles stay `h2`. */
export function StatStrip({ items, label }: { items: StatItem[]; label?: string }) {
  return (
    <KpiStrip aria-label={label}>
      {items.map((i) => (
        <Kpi
          key={i.title}
          linkAs={Link}
          href={i.href}
          label={<span className="flex items-center gap-1.5"><h2 className="text-13 font-normal text-muted-ink">{i.title}</h2>{i.help}</span>}
          value={i.value}
          badge={i.pill ? <StatBadge pill={i.pill} /> : undefined}
          caption={i.hint}
        />
      ))}
    </KpiStrip>
  );
}
