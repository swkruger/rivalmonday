import { isAgencyRole } from '@cs/core';
import type { ClientProfile } from '@cs/tools';
import { listClientRecipients } from '@cs/tools';
import { Badge, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { callTool } from '@/server/tools';
import { AddRecipientForm, DeactivateRecipientButton, DeliveryForm } from './delivery-controls';

export const dynamic = 'force-dynamic';

const ROLE_LABEL: Record<string, string> = { client_owner: 'Owner', client_viewer: 'Viewer' };

export default async function ClientDeliveryPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const profile = await callTool<ClientProfile>(ctx, 'get_client_profile', { clientId });
  const recipients = await listClientRecipients(dbs().service, ctx, clientId);

  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-tight">Delivery — {profile.name}</h1>
      <DeliveryForm clientId={clientId} alertMode={profile.alertMode ?? 'after_am_check'} briefAutoSend={profile.briefAutoSend ?? false} timezone={profile.timezone} />
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
                  <TableHead />
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
                    <TableCell>{r.active && <DeactivateRecipientButton clientId={clientId} contactId={r.contactId} email={r.email} />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <div className="border-t border-line pt-5">
            <AddRecipientForm clientId={clientId} />
          </div>
        </CardContent>
      </Card>
    </>
  );
}
