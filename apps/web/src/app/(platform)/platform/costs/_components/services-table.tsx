import { formatRelative } from '@/lib/format';
import { type ChipTone, StatusChip, Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from '@cs/ui';
import { daysLeftText, formatAmount } from './format';
import { ServiceSettingsDialog } from './service-settings-dialog';
import type { CostService, ServiceStatus } from './types';

export const STATUS_LABEL: Record<ServiceStatus, string> = {
  ok: 'OK', low: 'Low', error: 'Error', unavailable: 'Unavailable on this plan', not_configured: 'Not configured', disabled: 'Off',
};
const STATUS_TONE: Record<ServiceStatus, ChipTone> = {
  ok: 'success', low: 'warning', error: 'danger', unavailable: 'neutral', not_configured: 'neutral', disabled: 'neutral',
};

export const StatusBadge = ({ status }: { status: ServiceStatus }) => <StatusChip tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</StatusChip>;

/** Vendor balances and usage, one row each. `now` is passed in (server clock) so relative times match on hydration. */
export function ServicesTable({ services, now }: { services: CostService[]; now: Date }) {
  return (
    <TableFrame>
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
                {s.status === 'error' && s.error && <div className="text-xs text-muted-ink">{s.error}</div>}
              </TableCell>
              <TableCell className="text-right"><ServiceSettingsDialog service={s} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableFrame>
  );
}
