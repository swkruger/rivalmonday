'use client';

import { FridayAvatar, FridayBadge, useMediaQuery } from '@cs/ui';
import { useEffect, useState } from 'react';
import type { CannedAnswer } from '../../../content/sample-friday';
import type { SampleBriefData } from '../../sample/schema';
import { EvidencePills, type OpenEvidence } from './brief-items';

/** Characters revealed per tick while an answer "types in" (instant under reduced motion). */
const STEP = 3;
const TICK_MS = 20;

/**
 * Friday on the sample: question buttons and canned answers from the sample data. No input, no network. Each part's
 * citation pill appears once that part has typed in, and opens the evidence sheet.
 */
export function FridayPanel({ answers, data, onOpen, initialId, label = 'Canned answers from the sample data' }: {
  answers: readonly CannedAnswer[];
  data: SampleBriefData;
  onOpen: OpenEvidence;
  /** An answer shown in full from the start (no typing), so the panel is never empty. */
  initialId?: string;
  label?: string;
}) {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)') === true;
  const [active, setActive] = useState<{ id: string; shown: number } | null>(initialId ? { id: initialId, shown: Number.POSITIVE_INFINITY } : null);
  const answer = active ? answers.find((a) => a.id === active.id) : undefined;
  const total = answer ? answer.answer.reduce((n, p) => n + p.text.length, 0) : 0;
  const typing = !!active && active.shown < total;

  useEffect(() => {
    if (!typing) return;
    const t = setInterval(() => setActive((a) => (a ? { ...a, shown: a.shown + STEP } : a)), TICK_MS);
    return () => clearInterval(t);
  }, [typing]);

  const ask = (a: CannedAnswer) => setActive({ id: a.id, shown: reduced ? Number.POSITIVE_INFINITY : 0 });

  let offset = 0;
  let pillNo = 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <FridayAvatar />
        <FridayBadge />
        <span className="text-sm text-ink-secondary">{label}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {answers.map((a) => (
          <button
            key={a.id}
            type="button"
            aria-pressed={active?.id === a.id}
            onClick={() => ask(a)}
            className="press min-h-11 rounded-sm border border-line-control bg-surface px-3 py-1.5 text-left text-sm text-ink hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:border-secondary aria-pressed:font-medium"
          >
            {a.question}
          </button>
        ))}
      </div>
      {/* Screen readers get the whole answer at once; the typed copy below is aria-hidden (its pills stay reachable). */}
      <p data-testid="friday-live" aria-live="polite" className="sr-only">
        {answer ? answer.answer.map((p) => p.text).join('') : ''}
      </p>
      <div data-testid="friday-answer" className={answer ? 'min-h-12 text-sm leading-relaxed text-ink' : 'text-sm leading-relaxed text-ink'}>
        {answer && (
          <p>
            {answer.answer.map((part, i) => {
              const start = offset;
              offset += part.text.length;
              const visible = part.text.slice(0, Math.max(0, (active?.shown ?? 0) - start));
              const done = visible.length === part.text.length;
              // Consecutive parts citing the same evidence share one pill, after the last of them.
              const pill = part.cite && answer.answer[i + 1]?.cite !== part.cite;
              const n = pill ? ++pillNo : 0;
              return (
                <span key={i}>
                  <span aria-hidden="true">{visible}</span>
                  {done && pill && part.cite && (
                    <>
                      {' '}
                      <EvidencePills ids={[part.cite]} data={data} onOpen={onOpen} start={n} />
                    </>
                  )}
                </span>
              );
            })}
          </p>
        )}
      </div>
    </div>
  );
}
