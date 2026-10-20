'use client';
import { Sheet, SheetContent, SheetTitle } from '@cs/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadPageGuide } from '@/app/(app)/kb/actions';
import { ErrorNote } from '@/components/form-error';
import { KbMarkdown } from '@/components/kb/article-view';
import { useReadOnly } from '@/components/read-only';
import { OPEN_PAGE_GUIDE_EVENT } from '@/help/copy';
import { useHelp, useRegisterPageGuide } from './help-context';

export interface PageGuideData { id: string; title: string; sections: { heading: string; markdown: string }[] }
/** `canAsk` is resolved server-side: the viewer's Ask module is on (and not a support session). */
export interface PageGuideResult { guide: PageGuideData | null; canAsk: boolean }
export type HelpScope = { context: 'platform' | 'agency' } | { context: 'client'; clientId: string };
type Loader = (helpKey: string, context: HelpScope['context'], clientId?: string) => Promise<PageGuideResult>;
type State = { status: 'idle' | 'loading' | 'error' } | { status: 'ready'; result: PageGuideResult };

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const CLIENT_PATH = new RegExp(`^/c/(${UUID})(?:/|$)`, 'i');

/** Which help context a path is in: `/platform/**` platform, `/c/<id>/**` client, anything else agency. */
export function helpScopeOf(pathname: string): HelpScope {
  if (pathname === '/platform' || pathname.startsWith('/platform/')) return { context: 'platform' };
  const m = CLIENT_PATH.exec(pathname);
  return m ? { context: 'client', clientId: m[1]! } : { context: 'agency' };
}

/** A stable element id for a section heading, e.g. "How to use it" becomes `how-to-use-it`. `guideAnchor` values are these slugs. */
export function guideSlug(heading: string): string {
  return heading.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const FAILED = 'We could not load this guide. Close it and try again.';

/**
 * 15b-1: the "? Guide" button in `PageHeader` and its right-hand sheet (full-screen below `md`). The guide loads on first
 * open (once; a failure retries on the next open). A `HelpTip`'s "More in the guide" dispatches `open-page-guide`: the
 * sheet opens and scrolls to the section whose slug equals `detail.anchor`.
 */
export function PageGuide({ helpKey, pageTitle, load = loadPageGuide }: { helpKey: string; pageTitle: string; load?: Loader }) {
  const scope = helpScopeOf(usePathname() ?? '');
  const clientId = scope.context === 'client' ? scope.clientId : undefined;
  const { names } = useHelp();
  useRegisterPageGuide();
  const readOnly = useReadOnly();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ status: 'idle' });
  const [scrollTick, setScrollTick] = useState(0);
  const anchor = useRef<string | undefined>(undefined);
  const started = useRef(false);

  const start = useCallback(() => {
    if (started.current) return;
    started.current = true;
    setState({ status: 'loading' });
    load(helpKey, scope.context, clientId).then(
      (result) => setState({ status: 'ready', result }),
      () => {
        started.current = false;
        setState({ status: 'error' });
      },
    );
  }, [helpKey, scope.context, clientId, load]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      anchor.current = (e as CustomEvent<{ anchor?: string }>).detail?.anchor;
      setOpen(true);
      start();
      setScrollTick((n) => n + 1);
    };
    window.addEventListener(OPEN_PAGE_GUIDE_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_PAGE_GUIDE_EVENT, onOpen);
  }, [start]);

  // Scroll once the sections are in the DOM (after the load, or at once when the sheet already shows the guide).
  useEffect(() => {
    if (!open || state.status !== 'ready' || !anchor.current) return;
    const el = document.getElementById(anchor.current);
    anchor.current = undefined;
    if (!el) return;
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView?.({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
  }, [open, state, scrollTick]);

  const guide = state.status === 'ready' ? state.result.guide : null;
  const canAsk = state.status === 'ready' && state.result.canAsk && scope.context === 'client' && !readOnly;
  return (
    <>
      <button
        type="button"
        onClick={() => {
          anchor.current = undefined;
          setOpen(true);
          start();
        }}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm font-medium text-ink hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <span aria-hidden className="inline-flex size-4 items-center justify-center rounded-full border border-current text-[10px] font-bold leading-none">?</span>
        Guide
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" aria-describedby={undefined} className="w-full max-w-full gap-4 overflow-y-auto px-5 md:w-[480px] md:max-w-[480px]">
          <SheetTitle className="text-lg">{guide?.title ?? 'Page guide'}</SheetTitle>
          {state.status === 'loading' && (
            <div role="status" aria-label="Loading the guide" className="flex flex-col gap-3">
              <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
              <div className="h-4 w-full animate-pulse rounded bg-muted" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
              <div className="h-4 w-4/6 animate-pulse rounded bg-muted" />
            </div>
          )}
          {state.status === 'error' && <ErrorNote>{FAILED}</ErrorNote>}
          {state.status === 'ready' && !guide && <ErrorNote>This guide is not available.</ErrorNote>}
          {guide && (
            <>
              {guide.sections.map((s) => (
                <section key={s.heading} className="flex flex-col gap-2">
                  <h2 id={guideSlug(s.heading)} className="scroll-mt-4 text-base font-bold">{s.heading}</h2>
                  <KbMarkdown>{s.markdown}</KbMarkdown>
                </section>
              ))}
              <div className="mt-2 flex flex-col gap-2 border-t border-border pt-4 text-sm">
                {canAsk && clientId && (
                  <Link href={`/c/${clientId}/ask?q=${encodeURIComponent(`Explain the ${pageTitle} page`)}`} className="font-medium text-secondary underline-offset-2 hover:underline">
                    Ask {names.assistant} about this page
                  </Link>
                )}
                {/* Ruling R6: operator-audience guides are not readable on /kb (get_kb_article filters by role only). */}
                {scope.context !== 'platform' && (
                  <Link href={`/kb/${guide.id}`} className="font-medium text-secondary underline-offset-2 hover:underline">Open full article</Link>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
