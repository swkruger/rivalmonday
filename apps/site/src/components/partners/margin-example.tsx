'use client';

import { ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';
import { breakEvenClients, PARTNER_COPY, PARTNER_EXAMPLE, partnerExample, partnerUpsell } from '../../../content/partners';
import { PRICING } from '../../../content/pricing';
import { usePilot } from '../shell/pilot-context';

const usd = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US')}`;
const clientWord = (n: number) => (n === 1 ? 'client' : 'clients');

function Slider({ label, value, valueText, min, max, step, onChange, hint }: { label: string; value: number; valueText: string; min: number; max: number; step: number; onChange: (n: number) => void; hint: string }) {
  const id = useId();
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={id} className="text-sm font-medium text-ink">{label}</label>
        <span className="text-2xl font-semibold tabular-nums text-ink">{valueText}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} aria-valuetext={valueText} onChange={(ev) => onChange(Number(ev.currentTarget.value))} className="h-11 w-full accent-secondary" />
      <p className="text-13 text-muted-ink">{hint}</p>
    </div>
  );
}

/** The margin calculator: the partners page's floating sheet. Every figure comes from `partnerExample` and `partnerUpsell`; prices are labelled as examples. */
export function MarginExample() {
  const { pilotMode } = usePilot();
  const [clients, setClients] = useState<number>(PARTNER_EXAMPLE.clients);
  const [share, setShare] = useState<number>(PARTNER_EXAMPLE.upsellSharePct);
  const e = partnerExample(clients, PARTNER_EXAMPLE.clientPriceUsd);
  const u = partnerUpsell(e, share, PARTNER_EXAMPLE.upsellPriceUsd);
  const { monthlyUsd, extraSeatUsd } = PRICING.agency;
  const c = PARTNER_COPY.calculator;
  const breakEven = breakEvenClients(PARTNER_EXAMPLE.clientPriceUsd);
  const rows: [string, string][] = [
    [PARTNER_COPY.rows.clients, String(e.clients)],
    [PARTNER_COPY.rows.clientPrice, `${usd(e.clientPriceUsd)}/mo`],
    [PARTNER_COPY.rows.cost, e.extraSeats > 0 ? `${usd(monthlyUsd)} + ${e.extraSeats} × ${usd(extraSeatUsd)} = ${usd(e.costUsd)}` : usd(e.costUsd)],
    [PARTNER_COPY.rows.revenue, usd(e.revenueUsd)],
    [PARTNER_COPY.rows.margin, usd(e.marginUsd)],
    [PARTNER_COPY.rows.upsell, `${u.upsellClients} × ${usd(PARTNER_EXAMPLE.upsellPriceUsd)} = ${usd(u.upsellRevenueUsd)}`],
    [PARTNER_COPY.rows.total, usd(u.totalUsd)],
  ];
  // Grey for cost, then the two brand blues; the legend and the table carry every value, so colour is never alone.
  const parts = [
    { key: 'cost', label: c.cost, value: e.costUsd, swatch: 'bg-line-strong' },
    { key: 'margin', label: c.margin, value: e.marginUsd, swatch: 'bg-secondary' },
    { key: 'upsell', label: c.upsell, value: u.upsellRevenueUsd, swatch: 'bg-primary' },
  ];
  return (
    <div data-slot="margin-example" className="shadow-float rounded-lg bg-surface p-5 ring-1 ring-surface/15 sm:p-8">
      <h2 className="text-xl font-semibold tracking-tight text-ink">{PARTNER_COPY.exampleHeading}</h2>
      <p className="mt-1 text-sm text-ink-secondary">{PARTNER_COPY.plan}</p>
      {pilotMode ? <p className="mt-1 text-sm font-medium text-ink">{PARTNER_COPY.pilotNote}</p> : null}
      <div className="mt-6 flex flex-col gap-5">
        <Slider
          label={c.clients}
          value={clients}
          valueText={String(clients)}
          min={1}
          max={PARTNER_EXAMPLE.maxClients}
          step={1}
          onChange={setClients}
          hint={`Your plan pays for itself from ${breakEven} ${clientWord(breakEven)}, at an example price of ${usd(e.clientPriceUsd)}/mo.`}
        />
        <Slider
          label={c.upsellShare}
          value={share}
          valueText={`${share}%`}
          min={0}
          max={100}
          step={PARTNER_EXAMPLE.shareStepPct}
          onChange={setShare}
          hint={`${c.upsellServices} ${usd(PARTNER_EXAMPLE.upsellPriceUsd)}/mo.`}
        />
      </div>
      <output aria-live="polite" className="mt-6 block border-t border-line pt-6">
        <span className="text-numeral block font-semibold tabular-nums text-ink">{usd(u.totalUsd)}</span>
        <span className="mt-2 block text-sm font-medium text-ink">{c.resultLabel}</span>
        <span className="mt-1 block text-sm text-ink-secondary">{usd(u.totalUsd * 12)} {c.perYear}</span>
      </output>
      <div aria-hidden="true" className="mt-5 flex h-3 gap-0.5 overflow-hidden rounded-xs">
        {parts.filter((p) => p.value > 0).map((p) => (
          <div key={p.key} title={`${p.label}: ${usd(p.value)}`} style={{ flexGrow: p.value }} className={`basis-0 transition-[flex-grow] duration-300 ease-out ${p.swatch}`} />
        ))}
      </div>
      <ul className="mt-3 flex flex-col gap-1 text-13 text-ink-secondary">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-2">
            <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-xs ${p.swatch}`} />
            <span>{p.label}</span>
            <span className="ml-auto font-medium tabular-nums text-ink">{usd(p.value)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-13 text-muted-ink">
        Example: {e.clients} {clientWord(e.clients)} at an example price of {usd(e.clientPriceUsd)}/mo, with {u.upsellClients} also buying an upsell at an example {usd(PARTNER_EXAMPLE.upsellPriceUsd)}/mo. You set your own prices. Upsell revenue is before what the work costs you to deliver. Before Stripe processing fees and taxes.
      </p>
      <details className="group mt-4 border-t border-line pt-3">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
          {c.sums}
          <ChevronDown aria-hidden="true" className="size-4 text-muted-ink transition-transform group-open:rotate-180" />
        </summary>
        <table aria-label={c.sums} className="mt-1 w-full border-collapse text-sm">
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k} className="border-t border-line">
                <th scope="row" className="py-2 pr-4 text-left font-medium text-ink">{k}</th>
                <td className="py-2 text-right tabular-nums text-ink">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
