import { platformRole } from '@cs/tools';
import { AppShell } from '@/components/shell/app-shell';
import { requireOperatorContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { platformAdmins } from '@/server/runtime-env';
import { callTool } from '@/server/tools';
import { CostWarningStrip } from './platform/costs/_components/cost-warning-strip';
import type { CostService } from './platform/costs/_components/types';

export const dynamic = 'force-dynamic';

/**
 * Phase 8b M5 / R3: `/platform/**` always renders the operator's own shell (branding, nav, clients), never the support
 * context, and shows no support banner — `requireOperatorContext()` ignores `rm_support`.
 *
 * 15a: `zone="platform"` — always the platform menu, Rival Monday branding and the default theme (spec §2.3).
 *
 * 8c: the platform role is resolved once here. Owners get the Costs nav item and, when a service is low on balance, the
 * warning strip; the strip read must never break a page, so any failure shows no strip.
 */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { viewer, ctx } = await requireOperatorContext();
  const role = viewer.kind === 'user' ? await platformRole({ service: dbs().service, platformAdmins: platformAdmins() }, ctx) : null;
  let low: CostService[] = [];
  if (role === 'owner') {
    try {
      const costs = await callTool<{ services: CostService[] }>(ctx, 'list_platform_costs', {});
      low = costs.services.filter((s) => s.status === 'low');
    } catch {
      low = [];
    }
  }
  return (
    <AppShell viewer={viewer} ctx={ctx} platformRole={role} zone="platform">
      <CostWarningStrip low={low} />
      {children}
    </AppShell>
  );
}
