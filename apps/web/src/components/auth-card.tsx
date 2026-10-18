import type { Branding } from '@cs/email';
import { Card, CardContent, CardHeader, CardTitle, themeVars, Wordmark } from '@cs/ui';

/**
 * Centred card on the canvas background for every sign-in/access page. `branding.logoUrl` is only ever `https` or
 * `null` — `resolveBranding` (`@cs/email`) drops anything else before it reaches this `<img src>` (Review Focus 5).
 *
 * 15a §2.10: `branding: null` (the page doesn't know the agency, `authBranding`) is a neutral card — no wordmark, no
 * logo, no product name. An agency's branding also themes the page (`themeVars` = validated hex only). The Rival Monday
 * default (agency-facing sign-up/join pages, P4) keeps the product wordmark.
 */
export function AuthCard({ branding, title, children }: { branding: Branding | null; title: string; children: React.ReactNode }) {
  const whiteLabel = branding !== null && branding.displayName !== 'Rival Monday';
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-4" style={whiteLabel ? (themeVars(branding) as React.CSSProperties) : undefined}>
      <Card className="w-full max-w-md">
        <CardHeader className="gap-4">
          {branding?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt={branding.displayName} className="h-10 w-auto self-start" />
          ) : branding ? (
            <Wordmark name={whiteLabel ? branding.displayName : undefined} />
          ) : null}
          <CardTitle role="heading" aria-level={1} className="text-xl">{title}</CardTitle>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </main>
  );
}
