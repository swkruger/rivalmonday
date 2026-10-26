import { HelpProvider } from '@/components/help/help-provider';
import type { HelpViewer } from '@/components/help/help-context';
import { ReadOnlyProvider } from '@/components/read-only';
import { BillingBanner } from '@/components/shell/billing-banner';
import { ShellTheme } from '@/components/shell/shell-theme';
import { SpendBanner } from '@/components/shell/spend-banner';
import { SupportBanner } from '@/components/shell/support-banner';
import { TzCookie } from '@/components/shell/tz-cookie';
import type { BillingSnapshot } from '@/server/billing-state';

export interface ShellSupport { id: string; agencyName: string; reason: string; expiresAt: Date }

/**
 * What every signed-in page needs around it, extracted from `AppShell` (16 P1) so `(onboarding)/layout.tsx` can re-provide it
 * without the sidebar and top bar: read-only mode (support session or platform hold), the help provider, the themed wrapper
 * (and its `<html>` mirror), the viewer's timezone cookie and the support banner. `AppShell` adds its own chrome inside.
 */
export function ShellProviders({ readOnly, help, style, support, children }: { readOnly: boolean; help: HelpViewer; style: Record<string, string>; support: ShellSupport | null; children: React.ReactNode }) {
  return (
    <ReadOnlyProvider readOnly={readOnly}>
      <HelpProvider value={help}>
        <ShellTheme vars={style} />
        <TzCookie />
        <div data-shell-theme="" className="contents" style={style as React.CSSProperties}>
          {/* format-gate: machine value, SupportBanner formats it for display */}
          {support && <SupportBanner sessionId={support.id} agencyName={support.agencyName} reason={support.reason} expiresAt={support.expiresAt.toISOString()} />}
          {children}
        </div>
      </HelpProvider>
    </ReadOnlyProvider>
  );
}

/** The spend-pause and billing banners (the part of `AppShell`'s column that does not depend on the top bar). */
export function ShellNotices({ spend, billing, role, userViewer, agencyName }: {
  spend: { audience: 'agency' | 'client'; items: { clientId: string; name: string; until: string }[] } | null;
  billing: BillingSnapshot | null;
  role: string;
  userViewer: boolean;
  agencyName: string;
}) {
  return (
    <>
      {spend && <SpendBanner items={spend.items} audience={spend.audience} agencyName={agencyName} />}
      {userViewer && billing && <BillingBanner role={role} state={billing.state} trialEndsAt={billing.trialEndsAt} pausesOn={billing.pausesOn} onHold={billing.onHold} supportEmail={billing.supportEmail} />}
    </>
  );
}
