import { CATEGORY_TABLE } from '../../../content/compare';
import { SAMPLE_MAP_SRC } from '../sample/rank-map';

const CELL = 'block lg:table-cell lg:px-6 lg:py-6 lg:align-top';
const OTHER = `${CELL} mt-4 text-sm text-ink-secondary lg:mt-0 lg:border-b lg:border-line lg:group-last:border-b-0`;

/**
 * Rival Monday as one raised ink column over the site's night map; the other groups stay quiet on white.
 * Wide screens: a fixed-layout table, so the column behind the text can line up by percentage. Phones: each topic stacks,
 * with the roles spelled out because `display: block` removes a table's semantics.
 */
export function CategoryTable() {
  const { columns, rows } = CATEGORY_TABLE;
  const [ours, ...others] = columns;
  return (
    <div className="relative mt-10 lg:py-6">
      <div aria-hidden="true" className="shadow-float absolute inset-y-0 left-[16%] hidden w-[30%] overflow-hidden rounded-lg bg-ink lg:block">
        <img src={SAMPLE_MAP_SRC} alt="" width={960} height={960} loading="lazy" decoding="async" className="night-map absolute inset-0 size-full" />
        <div className="night-veil-even absolute inset-0" />
      </div>
      <table role="table" aria-label="Rival Monday compared with other kinds of tools" className="relative block w-full border-separate border-spacing-0 lg:table lg:table-fixed">
        <thead role="rowgroup" className="max-lg:sr-only">
          <tr role="row">
            <th role="columnheader" scope="col" className="lg:w-[16%]">
              <span className="sr-only">Topic</span>
            </th>
            <th role="columnheader" scope="col" className="px-6 pt-2 pb-6 text-left text-xl font-semibold text-surface lg:w-[30%] lg:border-b lg:border-surface/20">
              {ours}
            </th>
            {others.map((c) => (
              <th key={c} role="columnheader" scope="col" className="px-6 pt-2 pb-6 text-left align-bottom text-sm font-semibold text-ink lg:w-[18%] lg:border-b lg:border-line">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup" className="block divide-y divide-line lg:table-row-group lg:divide-y-0">
          {rows.map((r) => {
            const [ourCell, ...otherCells] = r.cells;
            return (
              <tr key={r.label} role="row" className="group block py-8 first:pt-0 last:pb-0 lg:table-row lg:py-0">
                <th role="rowheader" scope="row" className="block pb-4 text-left text-lg font-semibold text-ink lg:table-cell lg:border-b lg:border-line lg:py-6 lg:pr-4 lg:align-top lg:text-base lg:group-last:border-b-0">
                  {r.label}
                </th>
                <td role="cell" className={`${CELL} rounded-lg bg-ink p-5 text-base font-medium text-surface lg:rounded-none lg:border-b lg:border-surface/20 lg:bg-transparent lg:group-last:border-b-0`}>
                  <span aria-hidden="true" className="mb-1 block text-sm font-semibold text-muted-surface lg:hidden">
                    {ours}
                  </span>
                  {ourCell}
                </td>
                {otherCells.map((cell, i) => (
                  <td key={others[i]} role="cell" className={OTHER}>
                    <span aria-hidden="true" className="mb-1 block font-semibold text-ink lg:hidden">
                      {others[i]}
                    </span>
                    {cell}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
