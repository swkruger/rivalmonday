import { isAgencyRole } from '@cs/core';
import type { ClientProfile, RecipientView } from '@cs/tools';
import { DotStatus, Section, Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow, Tag } from '@cs/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { clientSettingsCrumbs } from '@/components/client-crumbs';
import { EmptyState } from '@/components/help/empty-state';
import { HelpText } from '@/components/help/help-context';
import { HelpTip } from '@/components/help/help-tip';
import { PageHeader } from '@/components/page-header';
import { WriteGuard } from '@/components/read-only';
import { PAGE_COPY } from '@/help/copy';
import { hasClientSettings } from '@/server/client-settings-nav';
import { requireContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { labelFor, MEMBERSHIP_ROLE } from '@/lib/labels';
import { callTool } from '@/server/tools';
import { timezoneOptions } from '@/server/timezones';
import { AddRecipientForm, DeactivateRecipientButton, DeliveryForm } from './delivery-controls';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Delivery' };

const HELP_KEY = 'page:client.settings.delivery';
const COPY = PAGE_COPY['client.settings.delivery'];

export default async function ClientDeliveryPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  // 7a2: a registered read (audited in a support session); 8b masks its emails there before anything reaches a client component.
  const [profile, settingsLinked, { items: recipients }, guides] = await Promise.all([
    callTool<ClientProfile>(ctx, 'get_client_profile', { clientId }),
    hasClientSettings(clientId),
    callTool<{ items: RecipientView[] }>(ctx, 'list_client_recipients', { clientId }),
    helpGuides(ctx, 'client', clientId),
  ]);

  return (
    <>
      <PageHeader
        title="Delivery"
        breadcrumb={clientSettingsCrumbs({ id: clientId, name: profile.name }, 'Delivery', settingsLinked)}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      <DeliveryForm
        clientId={clientId}
        alertMode={profile.alertMode ?? 'after_am_check'}
        briefAutoSend={profile.briefAutoSend ?? false}
        timezone={profile.timezone}
        timezoneOptions={timezoneOptions(profile.timezone)}
      />
      <Section title="Recipients" titleAside={<HelpTip tip="client.settings.delivery.recipients" />}>
          {recipients.length === 0 ? (
            <EmptyState {...COPY.empty.noRecipients} guideAnchor="how-to-use-it" />
          ) : (
            <TableFrame>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Active</TableHead>
                  <WriteGuard>
                    <TableHead />
                  </WriteGuard>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recipients.map((r) => (
                  <TableRow key={r.contactId}>
                    <TableCell className="font-medium">{r.email}</TableCell>
                    <TableCell>{r.name ?? '—'}</TableCell>
                    <TableCell>{labelFor(MEMBERSHIP_ROLE, r.role).label}</TableCell>
                    <TableCell>{r.hasAccount && <Tag>Has account</Tag>}</TableCell>
                    <TableCell><DotStatus tone={r.active ? 'success' : 'off'}>{r.active ? 'Active' : 'Inactive'}</DotStatus></TableCell>
                    <WriteGuard>
                      <TableCell>{r.active && <DeactivateRecipientButton clientId={clientId} contactId={r.contactId} email={r.email} />}</TableCell>
                    </WriteGuard>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </TableFrame>
          )}
          <WriteGuard>
            <div className="max-w-[640px]">
              <AddRecipientForm clientId={clientId} />
            </div>
          </WriteGuard>
      </Section>
    </>
  );
}
