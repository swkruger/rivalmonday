import { platformRole } from '@cs/tools';
import type { Metadata } from 'next';
import { AppShell, startShellReads } from '@/components/shell/app-shell';
import { requireOperatorContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { platformAdmins } from '@/server/runtime-env';
import { callTool } from '@/server/tools';
import { AiGuardBanner, type AiGuardBannerState } from './platform/_components/ai-guard-banner';
import { CostWarningStrip } from './platform/costs/_components/cost-warning-strip';
import type { CostService } from './platform/costs/_components/types';

export const dynamic = 'force-dynamic';

/** 15a §2.7: platform pages may name the product. */
export const metadata: Metadata = { title: { default: 'Rival Monday', template: '%s · Rival Monday' } };

/**
 * Phase 8b M5 / R3: `/platform/**` always renders the operator's own shell (branding, nav, clients), never the support
 * context, and shows no support banner — `requireOperatorContext()` ignores `rm_support`.
 *
 * 15a: `zone="platform"` — always the platform menu, Rival Monday branding and the default theme (spec §2.3).
 *
 * 7b1: every operator role sees the AI spend guard banner (C7 warn / C8 paused) from `get_ai_guard_state`; a failed read shows none.
 *
 * 8c: the platform role is resolved once here. Owners get the Costs nav item and, when a service is low on balance, the
 * warning strip; the strip read must never break a page, so any failure shows no strip.
 *
 * Launch gate (Task 5): after the operator context and the platform role, the shell batch, costs (owners) and the guard read run as one stage.
 */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  // Access first: a non-operator 404s here, before any read below starts.
  const { viewer, ctx } = await requireOperatorContext();
  const role = viewer.kind === 'user' ? await platformRole({ service: dbs().service, platformAdmins: platformAdmins() }, ctx) : null;
  // Launch gate (Task 5): the shell batch, the owner-only cost strip read and the guard banner read depend only on the
  // context and role above, so they run together — one stage. The no-op catch only keeps an unawaited rejection quiet;
  // AppShell still sees any failure when it awaits the batch.
  const reads = startShellReads(viewer, ctx, { zone: 'platform', platformRole: role });
  reads.catch(() => {});
  const [low, guard] = await Promise.all([
    role === 'owner'
      ? callTool<{ services: CostService[] }>(ctx, 'list_platform_costs', {}).then(
          (costs) => costs.services.filter((s) => s.status === 'low'),
          (): CostService[] => [],
        )
      : Promise.resolve<CostService[]>([]),
    callTool<AiGuardBannerState>(ctx, 'get_ai_guard_state', {}).then(
      (g): AiGuardBannerState | null => g,
      () => null,
    ),
  ]);
  return (
    <AppShell viewer={viewer} ctx={ctx} platformRole={role} zone="platform" reads={reads}>
      <AiGuardBanner state={guard} />
      <CostWarningStrip low={low} />
      {children}
    </AppShell>
  );
}
