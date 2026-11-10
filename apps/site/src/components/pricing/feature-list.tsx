import { Check } from 'lucide-react';
import { FEATURE_ROWS } from '../../../content/pricing-page';

/** One column of what the side gets: rows whose cell for the side is `false` are left out; a string cell is the row's note. */
export function FeatureList({ side }: { side: 'agency' | 'business' }) {
  const rows = FEATURE_ROWS.filter((r) => r[side] !== false);
  return (
    <ul className="divide-y divide-line border-y border-line">
      {rows.map((r) => {
        const cell = r[side];
        return (
          <li key={r.ledger} className="flex gap-3 py-3">
            <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-secondary" />
            <div>
              <p className="font-medium text-ink">{r.label}</p>
              {typeof cell === 'string' ? <p className="mt-0.5 text-sm text-ink-secondary">{cell}</p> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
