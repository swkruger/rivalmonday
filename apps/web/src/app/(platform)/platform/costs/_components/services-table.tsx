import { formatRelative } from '@/lib/format';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import { daysLeftText, formatAmount } from './format';
import { ServiceSettingsDialog } from './service-settings-dialog';
import type { CostService, ServiceStatus } from './types';

export const STATUS_LABEL: Record<ServiceStatus, string> = {
  ok: 'OK', low: 'Low', error: 'Error', unavailable: 'Unavailable on this plan', not_configured: 'Not configured', disabled: 'Off',
};
const STATUS_TONE: Record<ServiceStatus, string> = {
  ok: 'bg-[#DCFCE7] text-[#15803D]',
  low: 'bg-[#FFF3DC] text-[#B45309]',
  error: 'bg-[#FEE2E2] text-[#B91C1C]',
  unavailable: 'bg-muted-surface text-ink',
  not_configured: 'bg-muted-surface text-ink',
  disabled: 'bg-muted-surface text-ink',
};

export const StatusBadge = ({ status }: { status: ServiceStatus }) => (
  <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>
);

/** Vendor balances and usage, one row each. `now` is passed in (server clock) so relative times match on hydration. */
export function ServicesTable({ services, now }: { services: CostService[]; now: Date }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Service</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Balance / usage</TableHead>
          <TableHead>Days left</TableHead>
          <TableHead>Last read</TableHead>
          <TableHead><span className="sr-only">Actions</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {services.map((s) => (
          <TableRow key={s.service}>
            <TableCell className="font-medium">
              {s.billingUrl ? <a href={s.billingUrl} target="_blank" rel="noopener noreferrer" className="underline">{s.label}</a> : s.label}
            </TableCell>
            <TableCell><StatusBadge status={s.status} /></TableCell>
            <TableCell>{formatAmount(s)}</TableCell>
            <TableCell>{daysLeftText(s.daysLeft)}</TableCell>
            <TableCell>
              {s.takenAt ? formatRelative(s.takenAt, now) : '—'}
              {s.status === 'error' && s.error && <div className="text-xs text-muted-foreground">{s.error}</div>}
            </TableCell>
            <TableCell className="text-right"><ServiceSettingsDialog service={s} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
