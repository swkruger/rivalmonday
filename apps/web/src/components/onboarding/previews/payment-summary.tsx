const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** Client step 6 preview: the payment page the owner opens from the email, in the agency's name. Amounts are whole cents. */
export function PaymentSummary({ agency, client, priceCents, setupFeeCents }: { agency: string; client: string; priceCents: number | null; setupFeeCents: number }) {
  const first = (priceCents ?? 0) + setupFeeCents;
  return (
    <div className="px-8 py-7">
      <div className="flex items-center gap-2.5 text-sm font-semibold">
        <span aria-hidden="true" className="inline-flex size-7 items-center justify-center rounded-md bg-primary text-[13px] text-primary-foreground">{agency.slice(0, 1).toUpperCase() || '·'}</span>
        {agency || 'Your agency'}
      </div>
      <div className="mt-5 text-[13px] text-muted-ink">{client || 'Your client'}</div>
      <div className="text-sm">Competitor monitoring</div>
      <div className="mt-2.5">
        <span className="text-[30px] font-semibold">{priceCents === null ? '$0.00' : money(priceCents)}</span>
        <span className="text-sm text-muted-ink"> / month</span>
      </div>
      <dl className="mt-4 border-t border-line text-sm">
        <div className="flex justify-between border-b border-line py-2.5"><dt className="text-muted-ink">Setup fee</dt><dd>{setupFeeCents > 0 ? money(setupFeeCents) : 'None'}</dd></div>
        <div className="flex justify-between py-2.5 font-semibold"><dt>Due today</dt><dd>{money(first)}</dd></div>
      </dl>
      <div aria-hidden="true" className="mt-4 flex h-10 items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground">Pay with card</div>
      <div className="mt-2.5 text-center text-xs text-muted-ink">Secure payment by Stripe</div>
    </div>
  );
}
