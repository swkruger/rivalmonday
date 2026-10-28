import { Lock } from 'lucide-react';

const BARS: { title: string; rows: [label: string, pct: number, value: string, colour: string][] }[] = [
  { title: 'Rating', rows: [['you', 94, '4.7', 'var(--you)'], ['Rival 1', 90, '4.5', 'var(--chart-rival-1)'], ['Rival 2', 96, '4.8', 'var(--chart-rival-2)'], ['Rival 3', 86, '4.3', 'var(--chart-context)']] },
  { title: 'Reviews', rows: [['you', 44, '212', 'var(--you)'], ['Rival 1', 100, '486', 'var(--chart-rival-1)'], ['Rival 2', 27, '133', 'var(--chart-rival-2)'], ['Rival 3', 62, '301', 'var(--chart-context)']] },
];

/**
 * Intake step 1 preview: a blurred "you vs 3 nearby rivals" snapshot with a lock pill (spec 16 §8). The numbers are invented
 * placeholders and stay blurred and hidden from assistive tech; chart roles are you, two rivals, then grey (chart tokens).
 */
export function SnapshotTeaser({ name }: { name: string }) {
  const you = name.trim() || 'Your business';
  return (
    <div className="relative">
      <div className="px-7 py-6">
        <div className="text-base font-semibold">{you} vs 3 nearby rivals</div>
        <div className="mt-1 text-xs text-muted-ink">Google rating, reviews and map rank</div>
        <div aria-hidden="true" className="blur-[5px]">
          {BARS.map((g) => (
            <div key={g.title}>
              <div className="mb-2.5 mt-5 text-11 font-medium text-muted-ink">{g.title}</div>
              {g.rows.map(([label, pct, value, colour]) => (
                <div key={label} className="mb-2 grid grid-cols-[130px_1fr_44px] items-center gap-3 text-13">
                  <span className="truncate">{label === 'you' ? you : label}</span>
                  <div><div className="h-3.5 rounded-r" style={{ width: `${pct}%`, background: colour }} /></div>
                  <span className="text-right font-semibold">{value}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <span className="absolute left-1/2 top-[58%] inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-white px-4 py-2 text-13 font-medium shadow-overlay">
        <Lock aria-hidden className="size-3.5" />
        Your snapshot unlocks after you confirm your email
      </span>
    </div>
  );
}
