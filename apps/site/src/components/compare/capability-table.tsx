import { Check, CircleDot, Minus } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import { CAPABILITIES, RIVAL_MONDAY, type OurCell, type Rival, type RivalCell } from '../../../content/compare';
import { SourceLink } from './fact-list';

const ICON = 'mr-1.5 inline size-4 shrink-0 align-text-bottom';
const CELL = 'whitespace-normal py-2 align-top text-ink-secondary';

function Mark({ mark }: { mark: OurCell['mark'] | RivalCell['mark'] }) {
  if (mark === 'yes') return <Check aria-hidden="true" className={`${ICON} text-secondary`} />;
  if (mark === 'partial') return <CircleDot aria-hidden="true" className={`${ICON} text-secondary`} />;
  return <Minus aria-hidden="true" className={`${ICON} text-muted-ink`} />;
}

function OurCellView({ cell }: { cell: OurCell }) {
  const word = cell.mark === 'yes' ? 'Yes' : cell.mark === 'partial' ? 'Partly' : 'Not offered';
  return (
    <>
      <Mark mark={cell.mark} />
      <span>{cell.label ? (cell.mark === 'partial' ? `Partly: ${cell.label}` : cell.label) : word}</span>
    </>
  );
}

function RivalCellView({ cell }: { cell: RivalCell }) {
  if (cell.mark === 'unknown') return <span className="text-muted-ink">Not stated publicly</span>;
  const text =
    cell.mark === 'text'
      ? cell.label
      : cell.mark === 'yes'
        ? cell.label
          ? `Yes: ${cell.label}`
          : 'Yes'
        : cell.label
          ? `Partly: ${cell.label}`
          : 'Partly';
  return (
    <>
      <Mark mark={cell.mark} />
      <span>{text}</span>
      {cell.source ? <SourceLink id={cell.source} sup /> : null}
    </>
  );
}

/** Two-column capability table: Rival Monday (claims ledger) | the rival (sourced). A rival cell is never a cross. */
export function CapabilityTable({ rival }: { rival: Rival }) {
  return (
    <Table aria-label={`Rival Monday and ${rival.name}, capability by capability`}>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Capability</TableHead>
          <TableHead scope="col">Rival Monday</TableHead>
          <TableHead scope="col">{rival.name}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {CAPABILITIES.map((c) => (
          <TableRow key={c.key}>
            <TableHead scope="row" className="h-10 py-2 align-top font-medium whitespace-normal text-ink">
              {c.label}
            </TableHead>
            <TableCell className={CELL}>
              <OurCellView cell={RIVAL_MONDAY[c.key]} />
            </TableCell>
            <TableCell className={CELL}>
              <RivalCellView cell={rival.cells[c.key]} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
