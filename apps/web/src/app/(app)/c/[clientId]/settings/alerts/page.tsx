import { hasFeature, hasPermission, isAgencyRole } from '@cs/core';
import type { AlertRulesView } from '@cs/tools';
import { Card, CardContent } from '@cs/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';
import { saveAlertRulesAction } from './actions';
import { AlertRulesForm } from './alert-rules-form';

export const dynamic = 'force-dynamic';

export default async function AlertRulesPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { ctx } = await requireContext();
  if (!hasFeature(ctx, 'alert_rules')) notFound();
  const [rules, profile] = await Promise.all([
    callTool<AlertRulesView>(ctx, 'get_alert_rules', { clientId }),
    callTool<{ name: string }>(ctx, 'get_client_profile', { clientId }),
  ]);
  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-tight">Alert rules — {profile.name}</h1>
      <Card>
        <CardContent className="flex flex-col gap-2">
          <p>Every competitor change gets a score from 0 to 100 for how much it matters to {profile.name}.</p>
          <p>
            From {rules.alert}: an instant alert. From {rules.brief} to {rules.alert - 1}: the weekly brief. Below {rules.brief}: archived — still visible under Changes.
          </p>
          <p>New thresholds apply to changes detected from now on; changes already scored keep their place.</p>
          <p>Instant alerts are still limited to 3 a day; extra ones go into the daily digest.</p>
          {isAgencyRole(ctx.role) && (
            <p>
              <Link href={`/c/${clientId}/settings/delivery`} className="font-semibold text-primary-soft-text">
                Alert delivery (direct / after review / digest only) is under Delivery.
              </Link>
            </p>
          )}
        </CardContent>
      </Card>
      <AlertRulesForm
        clientId={clientId} rules={rules} action={saveAlertRulesAction}
        canEdit={hasPermission(ctx, 'manage') && !ctx.userId.startsWith('contact:')}
      />
    </>
  );
}
