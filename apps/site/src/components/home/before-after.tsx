import { BEFORE_AFTER, SECTIONS } from '../../../content/home';
import { HomeSectionShell, SectionHeading } from './section-heading';

/** §7: a real table, stacked below `md` with CSS only. The H2 names the table. */
export function BeforeAfter() {
  const section = SECTIONS['before-after'];
  const [beforeCol, afterCol] = BEFORE_AFTER.columns;
  return (
    <HomeSectionShell id={section.id} labelledBy={`${section.id}-heading`} className="border-t border-line bg-surface py-20 lg:py-28">
      <SectionHeading section={section} />
      <table aria-labelledby={`${section.id}-heading`} className="mt-12 block w-full text-left md:table md:table-fixed">
        <thead className="sr-only md:table-header-group md:not-sr-only">
          <tr className="md:border-b md:border-line">
            <td className="md:w-40" />
            <th scope="col" className="pb-3 pr-8 text-sm font-medium text-ink-secondary">{beforeCol}</th>
            <th scope="col" className="pb-3 text-sm font-medium text-ink">{afterCol}</th>
          </tr>
        </thead>
        <tbody className="block md:table-row-group">
          {BEFORE_AFTER.rows.map((row) => (
            <tr key={row.who} className="block border-t border-line py-6 first:border-t-0 md:table-row md:border-t-0">
              <th scope="row" className="block pb-3 text-base font-semibold text-ink md:table-cell md:border-b md:border-line md:py-6 md:pr-8 md:align-top">{row.who}</th>
              <td className="block pb-3 text-base text-ink-secondary md:table-cell md:border-b md:border-line md:py-6 md:pr-8 md:align-top">{row.before}</td>
              <td className="block text-base font-medium text-ink md:table-cell md:border-b md:border-line md:py-6 md:align-top">{row.after}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </HomeSectionShell>
  );
}
