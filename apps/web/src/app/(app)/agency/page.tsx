import { isAgencyRole } from '@cs/core';
import type { ClientSummary } from '@cs/tools';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';

const VERTICAL_LABELS: Record<string, string> = { hvac_plumbing: 'HVAC & plumbing', dental: 'Dental' };

/** 5a client list for agency roles; 5b turns this into the full portfolio view. */
export default async function AgencyClientsPage() {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const { items } = await callTool<{ items: ClientSummary[] }>(ctx, 'list_clients', {});
  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-tight">Clients</h1>
      {items.length === 0 ? (
        <p className="text-muted-foreground">No clients yet. Client onboarding arrives in the next release.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Vertical</TableHead>
              <TableHead>Time zone</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link href={`/c/${c.id}`} className="font-semibold text-primary-soft-text">
                    {c.name}
                  </Link>
                </TableCell>
                <TableCell>{VERTICAL_LABELS[c.verticalId] ?? c.verticalId}</TableCell>
                <TableCell>{c.timezone}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
