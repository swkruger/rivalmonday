import { FileText } from 'lucide-react';
import { CLIENT_VIEW } from '../../../content/client-view';
import { formatDay } from '../../sample/format';
import { SAMPLE } from '../../sample/schema';
import { NoteMark } from './note-mark';

/** The Monday brief as it lands in the client's inbox, sent in the agency's name (sample data). */
export function BriefEmailMock() {
  const { agency, email } = CLIENT_VIEW;
  const items = SAMPLE.items.slice(0, 3);
  return (
    <div className="flex flex-col bg-canvas">
      <div className="flex flex-col gap-1 border-b border-line bg-surface px-4 py-3 md:px-6">
        <p className="text-base font-semibold text-ink">
          {email.subjectLead}: {SAMPLE.items.length} rival moves, week of {formatDay(SAMPLE.weekOf)}
        </p>
        <p className="text-13 text-ink-secondary">
          <span className="font-medium text-ink">{agency.name}</span> &lt;{agency.emailFrom}&gt; · to {SAMPLE.business.name} · Monday
        </p>
      </div>
      <div className="px-3 py-5 md:px-6 md:py-8">
        <article className="mx-auto flex max-w-xl flex-col gap-5 rounded-md border border-line bg-surface p-5 md:p-7">
          <span className="flex items-center gap-2">
            <span className="flex h-9 w-28 items-center justify-center rounded-md border border-dashed border-line-control text-xs font-medium text-muted-ink">
              {agency.logo}
            </span>
            <NoteMark n={1} />
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-xl font-semibold text-ink">Monday brief · {SAMPLE.business.name}</p>
            <p className="text-sm text-ink-secondary">{email.greeting}</p>
          </div>
          <div className="relative">
            <span className="absolute -left-2.5 top-1.5 z-10 md:-left-9"><NoteMark n={2} /></span>
            <ol className="flex flex-col gap-4">
              {items.map((item, i) => (
                <li key={item.id} className="flex gap-3 border-t border-line pt-4">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted-surface text-xs font-semibold text-ink">{i + 1}</span>
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="text-sm font-semibold text-ink">{item.headline}</p>
                    <p className="text-13 text-ink-secondary">{item.whyItMatters}</p>
                    <p className="text-13 text-ink">
                      <b className="font-semibold">Recommended:</b> {item.recommendedAction}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
            <span className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-ink">{email.button}</span>
            <NoteMark n={3} />
            <span className="flex items-center gap-1.5 text-13 text-link">
              <FileText aria-hidden="true" className="size-4" />
              {email.pdf}
            </span>
          </div>
          <p className="text-xs text-muted-ink">
            {email.footer} Sent by {agency.name}.
          </p>
        </article>
      </div>
    </div>
  );
}
