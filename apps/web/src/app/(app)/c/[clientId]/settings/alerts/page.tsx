import { hasFeature, hasPermission, isAgencyRole } from '@cs/core';
import { ALERTS_PER_DAY } from '@cs/engine';
import type { AlertRulesView } from '@cs/tools';
import { Band } from '@cs/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { clientSettingsCrumbs } from '@/components/client-crumbs';
import { HelpText } from '@/components/help/help-context';
import { TipRow } from '@/components/help/tip-row';
import { PageHeader } from '@/components/page-header';
import { PAGE_COPY } from '@/help/copy';
import { hasClientSettings } from '@/server/client-settings-nav';
import { requireContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { callTool } from '@/server/tools';
import { saveAlertRulesAction } from './actions';
import { AlertRulesForm } from './alert-rules-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Alert rules' };

const HELP_KEY = 'page:client.settings.alerts';
const COPY = PAGE_COPY['client.settings.alerts'];

export default async function AlertRulesPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { ctx } = await requireContext();
  if (!hasFeature(ctx, 'alert_rules')) notFound();
  const [rules, profile, settingsLinked, guides] = await Promise.all([
    callTool<AlertRulesView>(ctx, 'get_alert_rules', { clientId }),
    callTool<{ name: string }>(ctx, 'get_client_profile', { clientId }),
    hasClientSettings(clientId),
    helpGuides(ctx, 'client', clientId),
  ]);
  return (
    <>
      <PageHeader
        title="Alert rules"
        breadcrumb={clientSettingsCrumbs({ id: clientId, name: profile.name }, 'Alert rules', settingsLinked)}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      <TipRow
        items={[
          { label: 'Alert and brief levels', tip: 'client.settings.alerts.levels' },
          { label: 'Instant alerts per day', tip: 'client.settings.alerts.dailyLimit' },
        ]}
      />
      <Band className="flex max-w-[640px] flex-col gap-2">
          <p>Every competitor change gets a score from 0 to 100 for how much it matters to {profile.name}.</p>
          <p>New thresholds apply to changes detected from now on; changes already scored keep their place.</p>
          {isAgencyRole(ctx.role) && <p>Instant alerts are still limited to {ALERTS_PER_DAY} a day; extra ones go into the daily digest.</p>}
          {isAgencyRole(ctx.role) && (
            <p>
              <Link href={`/c/${clientId}/settings/delivery`} className="font-semibold text-primary-soft-text">
                Alert delivery (direct / after review / digest only) is under Delivery.
              </Link>
            </p>
          )}
      </Band>
      <AlertRulesForm
        clientId={clientId} rules={rules} action={saveAlertRulesAction}
        canEdit={hasPermission(ctx, 'manage') && !ctx.userId.startsWith('contact:')}
      />
    </>
  );
}
