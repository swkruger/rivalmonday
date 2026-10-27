import { cn } from '../lib/cn';

/**
 * The assistant pill (docs/brand/brand.md): brand amber background
 * (#F5A524), #3B2300 text, weight 700. Agencies may rename the assistant.
 * `size="label"` is the compact 20px form for inline labels.
 */
export function FridayBadge({ name = 'Friday', size = 'default' }: { name?: string; size?: 'default' | 'label' }) {
  return (
    <span
      data-slot="friday-badge"
      data-size={size}
      className={cn(
        'rounded-full bg-amber font-bold text-amber-text',
        size === 'label' ? 'inline-flex h-5 items-center px-2 text-11' : 'px-2.5 py-0.5 text-xs',
      )}
    >
      {name}
    </span>
  );
}
