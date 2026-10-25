/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Text } from 'react-email';
import { Layout } from '../layout';
import type { PlatformOpsAlertProps } from '../types';

const LIST_MAX = 20;

/** 7c2 Task 6 (copy decided; owner signs off). */
export const platformOpsAlertSubject = (p: Pick<PlatformOpsAlertProps, 'checkpoint' | 'severity' | 'deliveryDate' | 'clients'>) => {
  if (p.checkpoint === 'starting_point_late') return `Rival Monday ops: starting point late for ${p.clients[0]?.clientName ?? 'a client'}`;
  const n = p.clients.length;
  return p.severity === 'warning'
    ? `Rival Monday ops: ${n} brief(s) awaiting approval for ${p.deliveryDate}`
    : `Rival Monday ops: ${n} brief(s) not ready for ${p.deliveryDate}`;
};

export const platformOpsAlertLead = (p: Pick<PlatformOpsAlertProps, 'checkpoint' | 'deliveryDate'>) => {
  switch (p.checkpoint) {
    case 'generation_closed':
      return `Generation closed at Friday 12:00 client time and these clients have no ready brief for ${p.deliveryDate}.`;
    case 'pre_delivery':
      return 'Delivery is Monday 07:00 client time and these briefs are missing or failed.';
    case 'pre_delivery_unapproved':
      return 'These briefs are ready but not approved, and auto-send is off: they will not go out Monday 07:00 unless approved.';
    case 'starting_point_late':
      return 'This starting point is not ready 6 hours after it was due.';
  }
};

/** Platform staff only; always Rival Monday branded. */
export function PlatformOpsAlertEmail(p: PlatformOpsAlertProps) {
  const subject = platformOpsAlertSubject(p);
  const shown = p.clients.slice(0, LIST_MAX);
  const more = p.clients.length - shown.length;
  return (
    <Layout branding={p.branding} title={subject} preview={subject} footer="Platform ops alert">
      <Text>{platformOpsAlertLead(p)}</Text>
      {shown.map((c, i) => (
        <Text key={i} style={{ margin: '0 0 4px' }}>{`${c.agencyName} — ${c.clientName}`}</Text>
      ))}
      {more > 0 ? <Text style={{ margin: '0 0 4px' }}>{`and ${more} more`}</Text> : null}
      <Text>{`Open Health: ${p.healthUrl}`}</Text>
    </Layout>
  );
}
