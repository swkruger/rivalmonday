const STEPS = [
  ['Emails your snapshot link', 'Open it to confirm your email and see the snapshot.'],
  ['Compares you with nearby rivals', 'Rating, reviews and map rank, from public information only.'],
  ['Gets in touch if you asked', 'Only about your request. No mailing lists.'],
] as const;

/** Intake step 2 preview: what happens with the request. `who` is the agency's name, or null on the platform page. */
export function IntakeNext({ who }: { who: string | null }) {
  return (
    <div className="px-8 py-7">
      <div className="text-base font-semibold">{who ? `What ${who} does next` : 'What happens next'}</div>
      <ol className="mt-5 flex flex-col gap-4.5">
        {STEPS.map(([title, text], i) => (
          <li key={title} className="grid grid-cols-[28px_1fr] gap-3 text-sm leading-normal">
            <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-full bg-primary-soft text-13 font-semibold text-primary-soft-text">{i + 1}</span>
            <div><b className="font-semibold">{title}</b><div className="text-muted-ink">{text}</div></div>
          </li>
        ))}
      </ol>
    </div>
  );
}
