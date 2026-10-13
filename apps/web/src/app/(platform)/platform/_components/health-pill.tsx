export type Health = 'at_risk' | 'idle' | 'growing' | 'steady';

/**
 * Text label + fill, never colour alone. Fills: danger token, grey panel (#EEF2F6), primary (#47A8E7), secondary (#2A6BAC).
 * Text colours are chosen for contrast (ink on the light fills, white on the dark ones) — see task-7 report for the dataviz check.
 */
const STYLE: Record<Health, { label: string; cls: string }> = {
  at_risk: { label: 'At risk', cls: 'bg-destructive text-white' },
  idle: { label: 'Idle', cls: 'bg-[#EEF2F6] text-ink' },
  growing: { label: 'Growing', cls: 'bg-primary text-ink' },
  steady: { label: 'Steady', cls: 'bg-secondary text-white' },
};

export function HealthPill({ health }: { health: Health }) {
  const s = STYLE[health];
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${s.cls}`}>{s.label}</span>;
}
