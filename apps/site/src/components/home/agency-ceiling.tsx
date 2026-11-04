import { CEILING_LINES, SECTIONS } from '../../../content/home';
import { HomeSectionShell, SectionHeading } from './section-heading';

/** §3: three plain lines divided by hairlines, then the closing line (stored as the section body). */
export function AgencyCeiling() {
  const section = SECTIONS.ceiling;
  return (
    <HomeSectionShell id={section.id} labelledBy={`${section.id}-heading`} className="border-t border-line bg-canvas py-20 lg:py-28">
      <SectionHeading section={section} body={false} />
      <ul className="mt-10 max-w-2xl">
        {CEILING_LINES.map((line) => (
          <li key={line.lead} className="border-t border-line py-5 first:border-t-0 first:pt-0">
            <b className="font-semibold text-ink">{line.lead}</b>{' '}
            <span className="text-ink-secondary">{line.body}</span>
          </li>
        ))}
      </ul>
      <p className="mt-6 max-w-2xl border-t border-line pt-6 text-lg text-ink">{section.body}</p>
    </HomeSectionShell>
  );
}
