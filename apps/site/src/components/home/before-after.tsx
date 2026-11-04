import { BEFORE_AFTER, SECTIONS } from '../../../content/home';
import { HomeSectionShell, SectionHeading } from './section-heading';

const ROW = 'md:grid md:grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)] md:gap-8';

/**
 * §7: a two-row contrast grid with ARIA table roles, so screen readers keep the table at every width. Below `md` the
 * rows stack and each cell shows its own Before/After label (`aria-hidden`: the column header already names it).
 * The H2 names the table.
 */
export function BeforeAfter() {
  const section = SECTIONS['before-after'];
  const [beforeCol, afterCol] = BEFORE_AFTER.columns;
  return (
    <HomeSectionShell id={section.id} labelledBy={`${section.id}-heading`} className="border-t border-line bg-surface py-20 lg:py-28">
      <SectionHeading section={section} />
      <div role="table" aria-labelledby={`${section.id}-heading`} className="mt-10 text-left md:mt-12">
        <div role="rowgroup" className="sr-only md:not-sr-only">
          <div role="row" className={`${ROW} md:border-b md:border-line md:pb-3`}>
            <span role="cell" />
            <span role="columnheader" className="text-sm font-medium text-ink-secondary">{beforeCol}</span>
            <span role="columnheader" className="text-sm font-medium text-ink">{afterCol}</span>
          </div>
        </div>
        <div role="rowgroup">
          {BEFORE_AFTER.rows.map((row) => (
            <div key={row.who} role="row" className={`${ROW} border-t border-line py-6 first:border-t-0 md:border-t-0 md:border-b`}>
              <span role="rowheader" className="block text-base font-semibold text-ink">{row.who}</span>
              <div role="cell" className="mt-4 md:mt-0">
                <span aria-hidden="true" className="block text-xs font-medium text-muted-ink md:hidden">{beforeCol}</span>
                <span className="mt-1 block text-base text-ink-secondary md:mt-0">{row.before}</span>
              </div>
              <div role="cell" className="mt-4 md:mt-0">
                <span aria-hidden="true" className="block text-xs font-medium text-muted-ink md:hidden">{afterCol}</span>
                <span className="mt-1 block text-base font-medium text-ink md:mt-0">{row.after}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </HomeSectionShell>
  );
}
