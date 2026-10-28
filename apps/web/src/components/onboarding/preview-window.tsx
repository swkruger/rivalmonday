/**
 * The one floating preview in the right panel (L7): 12px radius and the overlay shadow, the one allowed shadow.
 * `chrome` draws a browser title bar (a string is shown as its address); `false` leaves the content bare.
 */
export function PreviewWindow({ chrome = true, width = 420, children }: { chrome?: boolean | string; width?: number; children: React.ReactNode }) {
  return (
    <div className="max-w-full overflow-hidden rounded-lg bg-white shadow-overlay" style={{ width }}>
      {chrome !== false && (
        <div data-chrome="" className="flex h-[30px] items-center gap-1.5 bg-muted-surface px-3" aria-hidden={typeof chrome === 'string' ? undefined : true}>
          {[0, 1, 2].map((i) => <i key={i} className="size-2 rounded-full bg-line-control" aria-hidden="true" />)}
          {typeof chrome === 'string' && <span className="ml-2 truncate text-xs text-muted-ink">{chrome}</span>}
        </div>
      )}
      {children}
    </div>
  );
}
