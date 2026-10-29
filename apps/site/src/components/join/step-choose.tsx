import { Button, DialogDescription, DialogHeader, DialogTitle } from '@cs/ui';
import { JOIN_COPY } from './copy';

export type JoinChoice = 'agency' | 'business';

const OPTION =
  'flex cursor-pointer flex-col gap-1 rounded-md border border-line-control bg-surface p-4 text-left transition-colors hover:bg-canvas has-[:checked]:border-primary has-[:checked]:bg-canvas has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring';

/** Step 1: agency or business. With the pilot off the agency option is a link to the app's sign-up. */
export function StepChoose({ choice, onChoice, onNext, agencySignUpHref }: {
  choice: JoinChoice;
  onChoice: (c: JoinChoice) => void;
  onNext: () => void;
  /** Set when the pilot is off: the agency option then leaves for the app. */
  agencySignUpHref: string | null;
}) {
  const c = JOIN_COPY.step1;
  return (
    <>
      <DialogHeader>
        <p className="text-xs text-muted-ink">{c.eyebrow}</p>
        <DialogTitle tabIndex={-1} className="text-lg leading-snug outline-none">{c.title}</DialogTitle>
        <DialogDescription>{c.sub}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-3">
        {/* A link is not a radio: with the pilot off it sits outside the radiogroup. */}
        {agencySignUpHref ? (
          <a href={agencySignUpHref} className={OPTION}>
            <span className="text-sm font-semibold text-ink">{c.agency.title}</span>
            <span className="text-sm text-ink-secondary">{c.agency.body}</span>
          </a>
        ) : null}
        <div role="radiogroup" aria-label="Who are you?" className="flex flex-col gap-3">
          {agencySignUpHref ? null : (
            <label className={OPTION}>
              <input type="radio" name="join-kind" className="sr-only" checked={choice === 'agency'} onChange={() => onChoice('agency')} />
              <span className="text-sm font-semibold text-ink">{c.agency.title}</span>
              <span className="text-sm text-ink-secondary">{c.agency.body}</span>
            </label>
          )}
          <label className={OPTION}>
            <input type="radio" name="join-kind" className="sr-only" checked={choice === 'business'} onChange={() => onChoice('business')} />
            <span className="text-sm font-semibold text-ink">{c.business.title}</span>
            <span className="text-sm text-ink-secondary">{c.business.body}</span>
          </label>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-ink">{c.foot}</p>
        <Button type="button" onClick={onNext}>{c.next}</Button>
      </div>
    </>
  );
}
