import Link from 'next/link';
import { Kpi, KpiStrip, type KpiTone } from '@cs/ui';

export interface StatPill {
  text: string;
  tone: 'up' | 'down' | 'warn' | 'info';
  /** Decorative arrow (hidden from assistive tech); `srLabel` is its spoken equivalent. */
  glyph?: string;
  srLabel?: string;
}

export interface StatItem { title: string; value: string; pill?: StatPill | null; hint?: string; help?: React.ReactNode; href?: string; trace?: readonly (number | null)[]; traceLabel?: string; tone?: KpiTone }

const TONE: Record<StatPill['tone'], string> = {
  up: 'bg-chip-success-bg text-chip-success-text',
  down: 'bg-chip-danger-bg text-chip-danger-text',
  warn: 'bg-chip-warning-bg text-chip-warning-text',
  info: 'bg-chip-neutral-bg text-chip-neutral-text',
};

/** Text pill for a KPI (design system v1 badge); the glyph is decorative, `srLabel` its spoken equivalent. */
export function StatBadge({ pill }: { pill: StatPill }) {
  return (
    <span data-tone={pill.tone} className={`inline-flex h-5 items-center gap-0.5 rounded-xs px-1.5 text-xs font-semibold tabular-nums ${TONE[pill.tone]}`}>
      {pill.glyph && <span aria-hidden="true">{pill.glyph} </span>}
      {pill.srLabel && <span className="sr-only">{pill.srLabel} </span>}
      {pill.text}
    </span>
  );
}

/** Overview KPI row (09 § 5.3): one hairline-framed strip; titles are `h2` (`headingLevel={3}` under a Section `h2`). */
export function StatStrip({ items, label, headingLevel = 2 }: { items: StatItem[]; label?: string; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  return (
    <KpiStrip aria-label={label}>
      {items.map((i) => (
        <Kpi
          key={i.title}
          linkAs={Link}
          href={i.href}
          label={<span className="flex items-center gap-1.5"><Heading className="text-13 font-normal text-muted-ink">{i.title}</Heading>{i.help}</span>}
          value={i.value}
          badge={i.pill ? <StatBadge pill={i.pill} /> : undefined}
          caption={i.hint}
          trace={i.trace}
          traceLabel={i.traceLabel}
          tone={i.tone}
        />
      ))}
    </KpiStrip>
  );
}
