import { Check, Minus } from 'lucide-react';
import { Frame, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import { FEATURE_ROWS } from '../../../content/pricing-page';

function Cell({ value }: { value: boolean | string }) {
  if (value === true) {
    return (
      <>
        <Check aria-hidden="true" className="mr-1.5 inline size-4 text-secondary" />
        <span>Included</span>
      </>
    );
  }
  if (value === false) {
    return (
      <>
        <Minus aria-hidden="true" className="mr-1.5 inline size-4 text-muted-ink" />
        <span>Not included</span>
      </>
    );
  }
  return <span>{value}</span>;
}

export function FeatureTable() {
  return (
    <Frame flush className="overflow-hidden px-4">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Feature</TableHead>
          <TableHead scope="col">Agency</TableHead>
          <TableHead scope="col">Local business</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {FEATURE_ROWS.map((r) => (
          <TableRow key={r.ledger}>
            <TableCell className="whitespace-normal py-2 align-top font-medium text-ink">{r.label}</TableCell>
            <TableCell className="whitespace-normal py-2 align-top text-ink-secondary"><Cell value={r.agency} /></TableCell>
            <TableCell className="whitespace-normal py-2 align-top text-ink-secondary"><Cell value={r.business} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </Frame>
  );
}
