import { CircleHelp, Clock, Copy, type LucideIcon } from 'lucide-react';
import { CEILING_LINES, SECTIONS } from '../../../content/home';
import { HomeSectionShell, SectionHeading } from './section-heading';

/** One quiet icon per line, in `CEILING_LINES` order (same report, questioned retainer, unbilled hours). */
const ICONS: LucideIcon[] = [Copy, CircleHelp, Clock];

/** §3: the heading beside three lines divided by hairlines, then the closing line (stored as the section body). */
export function AgencyCeiling() {
  const section = SECTIONS.ceiling;
  return (
    <HomeSectionShell id={section.id} labelledBy={`${section.id}-heading`} className="border-t border-line bg-canvas py-20 lg:py-28">
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-5">
          <SectionHeading section={section} body={false} />
        </div>
        <div className="lg:col-span-7 lg:pt-2">
          <ul>
            {CEILING_LINES.map((line, i) => {
              const Icon = ICONS[i] ?? Copy;
              return (
                <li key={line.lead} className="flex gap-5 border-t border-line py-6 first:border-t-0 first:pt-0">
                  <span aria-hidden="true" className="flex size-11 flex-none items-center justify-center rounded-lg bg-chip-danger-bg text-chip-danger-text">
                    <Icon className="size-5" strokeWidth={2} />
                  </span>
                  <p className="text-lg text-ink-secondary">
                    <b className="block text-xl font-semibold text-ink">{line.lead}</b> <span className="mt-1 block">{line.body}</span>
                  </p>
                </li>
              );
            })}
          </ul>
          <p className="text-display-sub mt-4 border-t border-line pt-8 font-semibold text-ink">{section.body}</p>
        </div>
      </div>
    </HomeSectionShell>
  );
}
