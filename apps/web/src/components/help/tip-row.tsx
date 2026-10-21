'use client';
import { visibleAudiences } from '@cs/core';
import type { TipKey } from '@/help/copy';
import { useHelp } from './help-context';
import { HelpTip } from './help-tip';

/**
 * A row of small labels, each with a `?` tip beside it, for pages whose terms sit in a shared component. An item whose tip
 * is not for the viewer's audience (not in the provider's copy) is left out whole, label included.
 */
export function TipRow({ items }: { items: { label: string; tip: TipKey }[] }) {
  const { audience, copy } = useHelp();
  const ok = visibleAudiences(audience);
  const shown = items.filter((i) => {
    const tip = copy.tips[i.tip];
    return tip !== undefined && ok.includes(tip.audience ?? 'all');
  });
  if (shown.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
      {shown.map((i) => (
        <span key={i.tip} className="inline-flex items-center gap-1.5">
          {i.label}
          <HelpTip tip={i.tip} />
        </span>
      ))}
    </div>
  );
}
