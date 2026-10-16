import { STEPS, STEP_TITLES, type StepStates, type WizardStep } from './flow';

const LABEL = { done: 'Done', skipped: 'Skipped', open: '' } as const;

/** Four steps with done/skipped state; the current one is marked `aria-current="step"`. Calm, no colour-only meaning. */
export function Stepper({ current, steps }: { current: WizardStep; steps: StepStates }) {
  return (
    <ol className="flex flex-wrap gap-2">
      {STEPS.map((s, i) => {
        const state = steps[s];
        const active = s === current;
        return (
          <li
            key={s}
            aria-current={active ? 'step' : undefined}
            className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm ${active ? 'bg-primary-soft font-semibold text-ink' : 'bg-muted-surface text-ink'}`}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface text-xs font-semibold">{state === 'done' ? '✓' : i + 1}</span>
            <span>{STEP_TITLES[s]}</span>
            {LABEL[state] && <span className="text-xs text-muted-foreground">{LABEL[state]}</span>}
          </li>
        );
      })}
    </ol>
  );
}
