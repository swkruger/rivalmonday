import type { Branding } from '@cs/email';
import { themeVars, Wordmark } from '@cs/ui';

/**
 * Centred 400 px column on the white surface (D-22, no card) for every sign-in/access page. `branding.logoUrl` is only ever `https` or
 * `null` — `resolveBranding` (`@cs/email`) drops anything else before it reaches this `<img src>` (Review Focus 5).
 *
 * 15a §2.10: `branding: null` (the page doesn't know the agency, `authBranding`) is a neutral column — no wordmark, no
 * logo, no product name. An agency's branding also themes the page (`themeVars` = validated hex only). The Rival Monday
 * default (agency-facing sign-up/join pages, P4) keeps the product wordmark.
 */
export function AuthCard({ branding, title, children }: { branding: Branding | null; title: string; children: React.ReactNode }) {
  const whiteLabel = branding !== null && branding.displayName !== 'Rival Monday';
  return (
    <main data-slot="auth-column" className="min-h-screen bg-surface px-4 py-16" style={whiteLabel ? (themeVars(branding) as React.CSSProperties) : undefined}>
      <div className="mx-auto flex w-full max-w-[400px] flex-col gap-4">
        {branding?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt={branding.displayName} className="h-10 w-auto self-start" />
          ) : branding ? (
            <Wordmark name={whiteLabel ? branding.displayName : undefined} />
          ) : null}
          <h1 className="text-2xl font-semibold text-ink">{title}</h1>
        <div>{children}</div>
      </div>
    </main>
  );
}
