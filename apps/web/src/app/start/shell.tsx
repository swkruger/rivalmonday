import { cn, Wordmark } from '@cs/ui';
import type { IntakeBrand } from './brand';

/**
 * Centred column on the canvas for every public intake page. `brand.logoUrl` is only ever `https` or null
 * (`resolveBranding` drops anything else before it reaches this `<img src>`).
 */
export function IntakeShell({ brand, wide = false, children }: { brand: IntakeBrand; wide?: boolean; children: React.ReactNode }) {
  return (
    <div style={brand.style as React.CSSProperties} className="min-h-screen bg-canvas px-4 py-10 text-ink">
      <main className={cn('mx-auto flex w-full flex-col gap-6', wide ? 'max-w-3xl' : 'max-w-xl')}>
        {brand.kind !== 'neutral' && (
          <header>
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logoUrl} alt={brand.displayName} className="h-10 w-auto" />
            ) : (
              <Wordmark name={brand.kind === 'agency' ? brand.displayName : undefined} />
            )}
          </header>
        )}
        {children}
      </main>
    </div>
  );
}

export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn('flex flex-col gap-4 rounded-[14px] bg-surface p-6 shadow-card', className)}>{children}</section>;
}
