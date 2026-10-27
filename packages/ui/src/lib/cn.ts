import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge only knows Tailwind's default theme. Our custom keys from
 * styles.css `@theme` must be registered, or `text-13` is read as a text
 * colour (and dropped next to `text-ink`) and `shadow-overlay` as a shadow
 * colour (never conflicting with `shadow-none`). Radii xs–lg are built-in.
 */
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ['11', '13'], shadow: ['overlay', 'dialog', 'card'] } },
});

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
