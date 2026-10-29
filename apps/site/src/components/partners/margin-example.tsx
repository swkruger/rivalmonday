'use client';

import { Frame } from '@cs/ui';
import { PARTNER_COPY, PARTNER_EXAMPLE, partnerExample } from '../../../content/partners';
import { PRICING } from '../../../content/pricing';
import { usePilot } from '../shell/pilot-context';

const usd = (n: number) => `$${n.toLocaleString('en-US')}`;

/** The worked margin example. Every figure comes from `partnerExample`; it is labelled as an example. */
export function MarginExample() {
  const { pilotMode } = usePilot();
  const e = partnerExample(PARTNER_EXAMPLE.clients, PARTNER_EXAMPLE.clientPriceUsd);
  const { monthlyUsd, extraSeatUsd } = PRICING.agency;
  const rows: [string, string][] = [
    ['Clients', String(e.clients)],
    ['Your example client price', `${usd(e.clientPriceUsd)}/mo`],
    ['Your monthly cost', `${usd(monthlyUsd)} + ${e.extraSeats} × ${usd(extraSeatUsd)} = ${usd(e.costUsd)}`],
    ['Your monthly revenue', usd(e.revenueUsd)],
    ['Your monthly margin', usd(e.marginUsd)],
  ];
  return (
    <div data-slot="margin-example">
      <p className="text-sm text-ink-secondary">{PARTNER_COPY.plan}</p>
      {pilotMode ? <p className="mt-1 text-sm font-medium text-ink">{PARTNER_COPY.pilotNote}</p> : null}
      <Frame flush className="mt-4 max-w-[640px] overflow-x-auto px-4">
      <table className="w-full border-collapse text-sm">
        <caption className="mb-3 text-left text-sm text-ink-secondary">
          Example: {e.clients} clients at an example price of {usd(e.clientPriceUsd)}/mo. You set your own prices. Before Stripe processing fees and taxes.
        </caption>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-t border-line">
              <th scope="row" className="py-2 pr-4 text-left font-medium text-ink">{k}</th>
              <td className="py-2 text-right text-ink">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </Frame>
    </div>
  );
}
