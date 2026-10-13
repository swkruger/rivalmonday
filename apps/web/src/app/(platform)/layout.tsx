import { AppShell } from '@/components/shell/app-shell';
import { requireOperatorContext } from '@/server/current-viewer';

export const dynamic = 'force-dynamic';

/**
 * Phase 8b M5 / R3: `/platform/**` always renders the operator's own shell (branding, nav, clients), never the support
 * context, and shows no support banner — `requireOperatorContext()` ignores `rm_support`.
 */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { viewer, ctx } = await requireOperatorContext();
  return (
    <AppShell viewer={viewer} ctx={ctx}>
      {children}
    </AppShell>
  );
}
