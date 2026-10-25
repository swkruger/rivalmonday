import { Skeleton } from '@cs/ui';

/**
 * Suspense fallback for a page's slow sections (NOT a route `loading.tsx`: see page-skeleton.test.tsx). The header block
 * mirrors `PageHeader`'s line boxes: breadcrumb row 20px, h1 (26px text) ~31px, description line ~24px under a 4px gap,
 * so nothing shifts when the content arrives. It renders inside the shell's `<main>`, which supplies max-width and padding.
 */
export function PageSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div role="status" className="flex flex-col gap-5">
      <span className="sr-only">Loading…</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-[160px] max-w-full" />
        <div>
          <Skeleton className="h-[31px] w-[220px] max-w-full" />
          <Skeleton className="mt-1 h-6 w-[420px] max-w-full" />
        </div>
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

/** Suspense fallback for one streamed section inside an already-rendered card (no page-header placeholder). */
export function SectionSkeleton() {
  return (
    <div role="status">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-[200px] w-full" />
    </div>
  );
}
