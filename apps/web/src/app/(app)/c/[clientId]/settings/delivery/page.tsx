import { isAgencyRole } from '@cs/core';
import type { ClientProfile } from '@cs/tools';
import { listClientRecipients } from '@cs/tools';
import { Badge, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { clientSettingsCrumbs } from '@/components/client-crumbs';
import { PageHeader } from '@/components/page-header';
import { WriteGuard } from '@/components/read-only';
import { requireContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { maskRecipientsForSupport } from '@/server/support-mask';
import { callTool } from '@/server/tools';
import { timezoneOptions } from '@/server/timezones';
import { AddRecipientForm, DeactivateRecipientButton, DeliveryForm } from './delivery-controls';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Delivery' };

const ROLE_LABEL: Record<string, string> = { client_owner: 'Owner', client_viewer: 'Viewer' };

export default async function ClientDeliveryPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const profile = await callTool<ClientProfile>(ctx, 'get_client_profile', { clientId });
  // Phase 8b: emails are masked in a support session before anything reaches a client component.
  const recipients = maskRecipientsForSupport(ctx, await listClientRecipients(dbs().service, ctx, clientId));

  return (
    <>
      <PageHeader title="Delivery" breadcrumb={clientSettingsCrumbs({ id: clientId, name: profile.name }, 'Delivery')} />
      <DeliveryForm
        clientId={clientId}
        alertMode={profile.alertMode ?? 'after_am_check'}
        briefAutoSend={profile.briefAutoSend ?? false}
        timezone={profile.timezone}
        timezoneOptions={timezoneOptions(profile.timezone)}
      />
      <Card>
        <CardHeader>
          <CardTitle>Recipients</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {recipients.length === 0 ? (
            <p className="text-muted-foreground">No recipients yet.</p>
          ) : (
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
                    <TableCell>{ROLE_LABEL[r.role] ?? r.role}</TableCell>
                    <TableCell>{r.hasAccount && <Badge variant="secondary">Has account</Badge>}</TableCell>
                    <TableCell>{r.active ? 'Active' : 'Inactive'}</TableCell>
                    <WriteGuard>
                      <TableCell>{r.active && <DeactivateRecipientButton clientId={clientId} contactId={r.contactId} email={r.email} />}</TableCell>
                    </WriteGuard>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <WriteGuard>
            <div className="border-t border-line pt-5">
              <AddRecipientForm clientId={clientId} />
            </div>
          </WriteGuard>
        </CardContent>
      </Card>
    </>
  );
}
