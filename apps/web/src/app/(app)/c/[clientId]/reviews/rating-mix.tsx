/** Decision 7: your star mix, 5★ first. `mix[0]` is 1★. */
export function RatingMix({ mix }: { mix: number[] }) {
  const total = mix.reduce((a, b) => a + b, 0);
  if (total === 0) return <p className="text-sm text-muted-foreground">No reviews yet.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {[5, 4, 3, 2, 1].map((stars) => {
        const n = mix[stars - 1] ?? 0;
        return (
          <li key={stars} className="grid grid-cols-[2.5rem_1fr_2.5rem] items-center gap-2 text-sm">
            <span className="font-semibold text-ink">{stars}★</span>
            <span className="h-2.5 rounded-full bg-muted-surface">
              <span data-testid="bar" className="block h-2.5 rounded-full bg-secondary" style={{ width: `${Math.round((n / total) * 100)}%` }} />
            </span>
            <span className="text-right text-muted-foreground">{n}</span>
          </li>
        );
      })}
    </ul>
  );
}
