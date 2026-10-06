const TONE: Record<string, string> = {
  high: 'bg-[#FDE8E8] text-[#B42318]',
  elevated: 'bg-[#FFF3DC] text-accent-text',
  low: 'bg-muted-surface text-muted-ink',
};

export function PressureBadge({ score, level }: { score: number; level: 'low' | 'elevated' | 'high' }) {
  return (
    <span aria-label={`Competitive pressure ${score} of 100, ${level}`} className={`inline-flex min-w-10 justify-center rounded-md px-2 py-0.5 text-sm font-bold tabular-nums ${TONE[level]}`}>
      {score}
    </span>
  );
}
