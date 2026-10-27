'use client';
import { Button, cn, FridayBadge, Sheet, SheetClose, SheetContent, SheetTitle } from '@cs/ui';
import { X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AskChat, type AskChatProps, type AskChatState, useAskChatState } from './ask-chat';
import { ASK_PATH, DOCK_WIDE_QUERY, FridayDockContext, type FridayDockValue, useMediaQuery } from './friday-dock-context';
import type { SaveRecommendationAction } from './save-recommendation-dialog';

export { useFridayDock } from './friday-dock-context';

/** Everything the panel's chat needs, read once by the client layout (never refusing: any refusal → no dock). */
export type FridayDockConfig = {
  clientId: string;
  assistantName: string;
  productName: string | null;
  reviewAllowed: boolean;
  starters: readonly string[];
  scopeLabel: string;
  saveAction: SaveRecommendationAction;
  refsAction: AskChatProps['refsAction'];
};

/** Panel mode never confirms: a proposed write links to the full thread (P8), so this is never called. */
const noConfirm: AskChatProps['confirmAction'] = async () => ({ ok: false, error: 'Not found' });

/**
 * D-14 / P6: Friday docked beside a client page. Mounted by the client layout, which does not re-render on client-side
 * navigation, so the open state and the conversation survive moving between pages. At ≥ 1280 px the panel is a third
 * column (400 px, border, no shadow) that pushes the page; below it, a right `Sheet`. On `/c/<id>/ask*` it closes and
 * stays closed (the page is the conversation there). `config=null` → the children only, no context.
 */
export function FridayDock({ config, children }: { config: FridayDockConfig | null; children: React.ReactNode }) {
  if (!config) return <>{children}</>;
  return <Dock config={config}>{children}</Dock>;
}

function Dock({ config, children }: { config: FridayDockConfig; children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const onAsk = ASK_PATH.test(pathname);
  const wide = useMediaQuery(DOCK_WIDE_QUERY);
  const [openState, setOpenState] = useState(false);
  const open = openState && !onAsk;
  const panelId = useId();
  const chat = useAskChatState(null);
  const returnFocus = useRef(false);

  // Reaching an Ask page closes the panel for good (not just hidden until the user leaves).
  useEffect(() => {
    if (onAsk) setOpenState(false);
  }, [onAsk]);

  const setOpen = useCallback((v: boolean) => setOpenState(v), []);
  const value = useMemo<FridayDockValue>(
    () => ({ available: !onAsk, open, setOpen, assistantName: config.assistantName, wide, panelId }),
    [onAsk, open, setOpen, config.assistantName, wide, panelId],
  );
  const column = open && wide;

  // The column has no focus trap: closing it hands focus back to the trigger, which re-renders once the column is gone.
  useEffect(() => {
    if (column || !returnFocus.current) return;
    returnFocus.current = false;
    document.querySelector<HTMLElement>('[data-slot="friday-trigger"]')?.focus();
  }, [column]);
  const closeColumn = () => {
    returnFocus.current = true;
    setOpenState(false);
  };

  return (
    <FridayDockContext.Provider value={value}>
      {/* `contents` while closed keeps the sheet's own flex gaps; the same elements stay mounted either way (no page remount). */}
      <div data-slot="friday-dock" className={column ? 'xl:grid xl:grid-cols-[minmax(0,1fr)_400px] xl:items-start xl:gap-6' : 'contents'}>
        <div className={column ? 'flex min-w-0 flex-col gap-10' : 'contents'}>{children}</div>
        {column && (
          <aside
            id={panelId}
            aria-label={`Ask ${config.assistantName}`}
            data-slot="friday-panel"
            onKeyDown={(e) => {
              // Keys from a portalled layer (the save dialog) bubble here through React; that layer handles its own Esc.
              if (e.key === 'Escape' && !e.defaultPrevented && e.currentTarget.contains(e.target as Node)) closeColumn();
            }}
            className="sticky top-4 flex h-[calc(100dvh-2rem)] flex-col gap-3 self-start border-l border-line pl-6"
          >
            <PanelBody config={config} chat={chat} title={<h2 className={TITLE_CLASS}>Ask <FridayBadge name={config.assistantName} size="label" /></h2>}
              close={<CloseButton name={config.assistantName} onClick={closeColumn} />} autoFocus />
          </aside>
        )}
      </div>
      {!wide && (
        <Sheet open={open} onOpenChange={(o) => { if (!o) setOpenState(false); }}>
          <SheetContent side="right" id={panelId} aria-describedby={undefined} className="w-[400px] gap-3 overflow-hidden px-4 py-4">
            <PanelBody config={config} chat={chat} title={<SheetTitle className={TITLE_CLASS}>Ask <FridayBadge name={config.assistantName} size="label" /></SheetTitle>}
              close={<SheetClose asChild><CloseButton name={config.assistantName} /></SheetClose>} />
          </SheetContent>
        </Sheet>
      )}
    </FridayDockContext.Provider>
  );
}

const TITLE_CLASS = 'flex items-center gap-1.5 text-base font-semibold text-ink';

function CloseButton({ name, ...props }: { name: string } & React.ComponentProps<'button'>) {
  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Close ${name}`} {...props}>
      <X aria-hidden />
    </Button>
  );
}

function PanelBody({ config, chat, title, close, autoFocus = false }: { config: FridayDockConfig; chat: AskChatState; title: React.ReactNode; close: React.ReactNode; autoFocus?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  // The column opens without a focus trap: put the caret in the composer (the sheet's dialog focuses itself).
  useEffect(() => {
    if (autoFocus) ref.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
  }, [autoFocus]);
  return (
    <div ref={ref} className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-2 border-b border-line pb-3">
        {title}
        <div className="flex-1" />
        {chat.threadId && (
          <Link
            href={`/c/${config.clientId}/ask/${chat.threadId}`}
            className={cn('text-13 font-medium text-link underline-offset-4 hover:underline', 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring')}
          >
            Open full conversation
          </Link>
        )}
        {close}
      </div>
      <AskChat
        mode="panel"
        state={chat}
        clientId={config.clientId}
        threadId={null}
        assistantName={config.assistantName}
        productName={config.productName}
        reviewAllowed={config.reviewAllowed}
        messages={[]}
        starters={config.starters}
        confirmAction={noConfirm}
        saveAction={config.saveAction}
        refs={{}}
        scopeLabel={config.scopeLabel}
        refsAction={config.refsAction}
      />
    </div>
  );
}
