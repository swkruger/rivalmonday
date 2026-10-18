import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import { formatUsd } from '@/server/format';
import type { AiVerticalCost } from './types';

/** AI spend by business type for the last 30 days (owner-only page; the tool folds merged and draft ids). */
export function AiByVerticalTable({ rows }: { rows: AiVerticalCost[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No AI calls with a business type in the last 30 days.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Business type</TableHead>
          <TableHead className="text-right">Calls</TableHead>
          <TableHead className="text-right">Cost</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.verticalId}>
            <TableCell>{r.name}</TableCell>
            <TableCell className="text-right tabular-nums">{r.calls}</TableCell>
            <TableCell className="text-right tabular-nums">{formatUsd(r.costUsd)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
