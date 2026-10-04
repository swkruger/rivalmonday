import { cn } from '../lib/cn';

/**
 * Brand wordmark (docs/brand/brand.md): `rival` in secondary, `monday` in
 * brand amber, weight 800. `amber` here is the fixed brand token (#F5A524),
 * not shadcn's semantic `accent` (which is the muted hover/focus surface —
 * see styles.css). White-label agencies show their display name instead.
 */
export function Wordmark({ name, className }: { name?: string; className?: string }) {
  if (name) return <span className={cn('text-2xl font-extrabold tracking-tight text-secondary', className)}>{name}</span>;
  return (
    <span className={cn('text-2xl font-extrabold tracking-[-1px]', className)}>
      <span data-part="rival" className="text-secondary">rival</span>
      <span className="text-amber">monday</span>
    </span>
  );
}
