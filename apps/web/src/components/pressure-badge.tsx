const TONE: Record<string, string> = {
  high: 'bg-[#FDE8E8] text-[#B42318]',
  elevated: 'bg-[#FFF3DC] text-accent-text',
  low: 'bg-muted-surface text-muted-ink',
};

/**
 * Words for the colour, so the level is never colour-only.
 * source: packages/tools/src/pressure.ts:combinePressure (score >= 70 high, >= 40 elevated, else low; a score of 0 reads "Quiet")
 */
export function pressureText(score: number, level: 'low' | 'elevated' | 'high'): string {
  if (level === 'high') return 'High pressure';
  if (level === 'elevated') return 'Medium pressure';
  return score > 0 ? 'Low pressure' : 'Quiet';
}

export function PressureBadge({ score, level }: { score: number; level: 'low' | 'elevated' | 'high' }) {
  return (
    <span aria-label={`Competitive pressure ${score} of 100, ${pressureText(score, level).toLowerCase()}`} className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-sm ${TONE[level]}`}>
      <span className="min-w-6 text-center font-bold tabular-nums">{score}</span>
      <span className="text-xs font-semibold">{pressureText(score, level)}</span>
    </span>
  );
}
