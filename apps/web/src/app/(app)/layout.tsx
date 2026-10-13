import { AppShell } from '@/components/shell/app-shell';
import { requireContext } from '@/server/current-viewer';

export const dynamic = 'force-dynamic';

/** `/agency/*`, `/c/*` and shared pages. During a support session this is the read-only support context (banner on). */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { viewer, ctx } = await requireContext();
  return (
    <AppShell viewer={viewer} ctx={ctx}>
      {children}
    </AppShell>
  );
}
