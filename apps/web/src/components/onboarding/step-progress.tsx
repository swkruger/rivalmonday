/** "Step n of N · label" over one 4px segment per step: done and current segments `primary`, the rest the grey panel. */
export function StepProgress({ n, of, label }: { n: number; of: number; label: string }) {
  return (
    <div>
      <p className="mb-2.5 text-[13px] font-medium text-muted-ink">{`Step ${n} of ${of} · ${label}`}</p>
      <div role="progressbar" aria-valuemin={1} aria-valuenow={n} aria-valuemax={of} aria-label={`Step ${n} of ${of}`} className="flex gap-1.5">
        {Array.from({ length: of }, (_, i) => (
          <i key={i} className={`h-1 flex-1 rounded-full ${i < n ? 'bg-primary' : 'bg-[#EEF2F6]'}`} />
        ))}
      </div>
    </div>
  );
}
