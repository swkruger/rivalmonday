import type { Branding } from '@cs/email';
import { Card, CardContent, CardHeader, CardTitle, Wordmark } from '@cs/ui';

/**
 * Centred card on the canvas background for every sign-in/access page. `branding.logoUrl` is only ever `https` or
 * `null` — `resolveBranding` (`@cs/email`) drops anything else before it reaches this `<img src>` (Review Focus 5).
 */
export function AuthCard({ branding, title, children }: { branding: Branding; title: string; children: React.ReactNode }) {
  const whiteLabel = branding.displayName !== 'Rival Monday';
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="gap-4">
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt={branding.displayName} className="h-10 w-auto self-start" />
          ) : (
            <Wordmark name={whiteLabel ? branding.displayName : undefined} />
          )}
          <CardTitle className="text-xl">{title}</CardTitle>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </main>
  );
}
