import { Skeleton } from '@cs/ui';

/**
 * Loading placeholder for a main area: header block shaped like `PageHeader` (26px title, one description line), then
 * card-height blocks. It renders inside the shell's `<main>`, which already supplies the max-width and padding, so
 * nothing shifts when the page arrives. Server component, no client JS.
 */
export function PageSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div role="status" className="flex flex-col gap-5">
      <span className="sr-only">Loading…</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-[26px] w-[220px] max-w-full" />
        <Skeleton className="mt-1 h-3.5 w-[420px] max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} data-skeleton-card="">
            <Skeleton className="h-[120px] w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
