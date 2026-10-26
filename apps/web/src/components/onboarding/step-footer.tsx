'use client';
import { Button } from '@cs/ui';
import Link from 'next/link';

/**
 * Pinned footer (L7): Back (secondary) · spacer · optional "Skip for now" (text) · primary. `back` is a handler or, as a
 * string, a href. The primary button submits; `form` ties it to a form elsewhere in the tree. Its label colour is the
 * brand's `--color-primary-foreground`, so an agency's palette stays readable.
 */
export function StepFooter({ back, skip, primary }: {
  back?: (() => void) | string;
  skip?: { label: string; onSkip: () => void };
  primary: { label: string; pending?: boolean; disabled?: boolean; form?: string };
}) {
  return (
    <div className="mt-auto flex max-w-[440px] items-center gap-4 pt-8">
      {typeof back === 'string' ? (
        <Button asChild variant="outline" size="lg"><Link href={back}>Back</Link></Button>
      ) : back ? (
        <Button type="button" variant="outline" size="lg" onClick={back}>Back</Button>
      ) : null}
      <span className="flex-1" />
      {skip && <button type="button" onClick={skip.onSkip} className="text-sm font-medium text-muted-ink hover:text-ink">{skip.label}</button>}
      <Button type="submit" size="lg" form={primary.form} disabled={primary.disabled || primary.pending} aria-busy={primary.pending || undefined}>{primary.label}</Button>
    </div>
  );
}
