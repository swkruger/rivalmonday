import { cn } from '../lib/cn';
import { RadarMark } from './radar-mark';

/**
 * Brand wordmark (docs/brand/brand.md): the radar mark, then `rival` in secondary, `monday` in
 * brand amber, weight 800. `amber` here is the fixed brand token (#F5A524),
 * not shadcn's semantic `accent` (which is the muted hover/focus surface —
 * see styles.css). White-label agencies show their display name instead (no mark).
 */
export function Wordmark({ name, className }: { name?: string; className?: string }) {
  if (name) return <span className={cn('text-2xl font-extrabold tracking-tight text-secondary', className)}>{name}</span>;
  return (
    <span className={cn('inline-flex items-center gap-[0.3em] text-2xl font-extrabold tracking-[-1px]', className)}>
      {/* Sized in em so it follows the wordmark's text size wherever a caller resizes it. */}
      <RadarMark className="size-[1.1em]" />
      <span>
        <span data-part="rival" className="text-secondary">rival</span>
        <span data-part="monday" className="text-amber">monday</span>
      </span>
    </span>
  );
}
