import { FridayAvatar, FridayBadge } from '@cs/ui';
import { ArrowUp } from 'lucide-react';
import { CLIENT_VIEW } from '../../../content/client-view';
import { FRIDAY_ANSWERS } from '../../../content/sample-friday';
import { SAMPLE } from '../../sample/schema';
import { evidenceSource } from '../sample/evidence-panel';
import { NoteMark } from './note-mark';

const ANSWER = FRIDAY_ANSWERS.find((a) => a.id === 'map-leader') ?? FRIDAY_ANSWERS[0]!;

/** Friday in the client's app: a question, a cited answer with numbered sources, and the next questions to ask. */
export function FridayChatMock({ marks = true }: { marks?: boolean } = {}) {
  // One number per distinct evidence id, in order of first citation.
  const cites = [...new Set(ANSWER.answer.flatMap((p) => (p.cite ? [p.cite] : [])))];
  const others = FRIDAY_ANSWERS.filter((a) => a.id !== ANSWER.id);
  return (
    <div className="flex flex-col gap-5 bg-chrome p-4 md:p-6">
      <div className="ml-auto max-w-md rounded-lg rounded-br-xs bg-ink px-4 py-3 text-sm text-surface">{ANSWER.question}</div>
      <div className="flex max-w-2xl flex-col gap-3">
        <span className="flex items-center gap-2"><FridayAvatar /> <FridayBadge /> {marks && <NoteMark n={1} />}</span>
        <p className="flex items-start gap-2 rounded-lg rounded-bl-xs border border-line bg-surface px-4 py-3.5 text-sm leading-relaxed text-ink">
          {marks && <NoteMark n={2} />}
          <span>
            {ANSWER.answer.map((part, i) => {
              const pill = part.cite && ANSWER.answer[i + 1]?.cite !== part.cite;
              return (
                <span key={i}>
                  {part.text}
                  {pill && part.cite && (
                    <sup className="ml-0.5 rounded-xs bg-chip-info-bg px-1 text-xs font-bold text-chip-info-text">{cites.indexOf(part.cite) + 1}</sup>
                  )}
                </span>
              );
            })}
          </span>
        </p>
        <div className="rounded-card border border-line bg-surface p-3.5">
          <p className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-ink"><span>{CLIENT_VIEW.friday.sourcesLabel}</span> {marks && <NoteMark n={3} />}</p>
          <ol className="flex flex-col gap-1.5">
            {cites.map((id, i) => {
              const ev = SAMPLE.evidence[id];
              if (!ev) return null;
              const { source, date } = evidenceSource(ev);
              return (
                <li key={id} className="flex items-center gap-2 text-13">
                  <span className="flex size-5 items-center justify-center rounded-sm bg-chip-info-bg text-xs font-bold text-chip-info-text">{i + 1}</span>
                  <span className="text-ink">{ev.kind === 'rank' ? ev.summary : source}</span>
                  <span className="text-muted-ink">· {date}</span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {others.map((a) => (
          <span key={a.id} className="rounded-lg border border-primary bg-primary-soft px-3 py-2 text-13 text-chip-info-text">{a.question}</span>
        ))}
      </div>
      <div className="flex min-h-11 items-center gap-2 rounded-lg border border-line-control bg-surface py-1 pl-3.5 pr-1">
        <span className="flex-1 text-sm text-muted-ink">{CLIENT_VIEW.friday.placeholder}</span>
        <span className="flex h-9 w-11 items-center justify-center rounded-md bg-primary text-ink">
          <ArrowUp aria-hidden="true" className="size-4" />
        </span>
      </div>
    </div>
  );
}
