import { cn } from '../lib/cn';

const SIZE = { sm: 'size-6', md: 'size-10', lg: 'size-20' } as const;

/**
 * The assistant's mascot (docs/brand/friday.md), served from each app's `public/`. It carries no name or company mark, so it
 * stays right under a white-label agency and a renamed assistant. Decorative: the name always sits beside it in text.
 */
export function FridayAvatar({ size = 'sm', className }: { size?: keyof typeof SIZE; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      data-slot="friday-avatar"
      src={size === 'lg' ? '/friday-mascot.webp' : '/friday-mascot-96.webp'}
      alt=""
      width={size === 'lg' ? 512 : 96}
      height={size === 'lg' ? 512 : 96}
      loading="lazy"
      decoding="async"
      className={cn('shrink-0 rounded-full object-cover', SIZE[size], className)}
    />
  );
}
