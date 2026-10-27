import { formatMoney } from '@/lib/format';
import { Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from '@cs/ui';
import { EmptyState } from '@/components/help/empty-state';
import { PAGE_COPY } from '@/help/copy';
import type { AiVerticalCost } from './types';

/** AI spend by business type for the last 30 days (owner-only page; the tool folds merged and draft ids). */
export function AiByVerticalTable({ rows }: { rows: AiVerticalCost[] }) {
  if (rows.length === 0) return <EmptyState {...PAGE_COPY['platform.costs'].empty.ai} guideAnchor="common-questions" />;
  return (
    <TableFrame>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Business type</TableHead>
            <TableHead numeric>Calls</TableHead>
            <TableHead numeric>Cost</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.verticalId}>
              <TableCell>{r.name}</TableCell>
              <TableCell numeric>{r.calls}</TableCell>
              <TableCell numeric>{formatMoney(r.costUsd, { cents: true })}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableFrame>
  );
}
