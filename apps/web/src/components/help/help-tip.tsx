'use client';
import { GLOSSARY, type GlossaryTerm, visibleAudiences } from '@cs/core';
import { Popover, PopoverContent, PopoverTrigger } from '@cs/ui';
import { useEffect, useRef, useState } from 'react';
import { OPEN_PAGE_GUIDE_EVENT, renderCopy, resolveTip, type TipKey } from '@/help/copy';
import { useHelp } from './help-context';

type Props = ({ term: string } | { tip: TipKey }) & {
  label?: string;
  /** Test seam: the glossary to look terms up in (defaults to the real one). */
  terms?: readonly GlossaryTerm[];
};

interface Resolved { title: string; body: string; long?: string; guideAnchor?: string; label: string; visible: boolean }

function useResolved(props: Props): Resolved | null {
  const { audience, names } = useHelp();
  const ok = visibleAudiences(audience);
  if ('tip' in props) {
    const tip = resolveTip(props.tip);
    if (!tip) return null;
    const title = renderCopy(tip.title, names);
    return { title, body: renderCopy(tip.body, names), guideAnchor: tip.guideAnchor, label: props.label ?? title, visible: ok.includes(tip.audience ?? 'all') };
  }
  const list = props.terms ?? GLOSSARY;
  const t = list.find((x) => x.id === props.term) ?? list.find((x) => x.term === props.term);
  if (!t) return null;
  return { title: t.term, body: renderCopy(t.short, names), long: t.long ? renderCopy(t.long, names) : undefined, label: props.label ?? `What is ${t.term}?`, visible: ok.includes(t.audience) };
}

/** Hover opens only with a fine pointer; touch and keyboard use click/Enter/Space (Radix handles those). */
function finePointer(e: React.PointerEvent): boolean {
  return e.pointerType === 'mouse' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches;
}

const HOVER_CLOSE_DELAY_MS = 150;

export function HelpTip(props: Props) {
  const r = useResolved(props);
  const [open, setOpen] = useState(false);
  // `hovered`: opened by pointer hover (no focus move, closes on leave). `pinned`: a click turned a hover-open into a normal open.
  const hovered = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancelClose, []);
  if (!r || !r.visible) return null;
  const enter = (e: React.PointerEvent) => {
    if (!finePointer(e)) return;
    cancelClose();
    if (!open) {
      hovered.current = true;
      setOpen(true);
    }
  };
  const leave = (e: React.PointerEvent) => {
    if (!finePointer(e) || !hovered.current) return;
    cancelClose();
    timer.current = setTimeout(() => {
      hovered.current = false;
      setOpen(false);
    }, HOVER_CLOSE_DELAY_MS);
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        cancelClose();
        hovered.current = false;
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={r.label}
          onPointerEnter={enter}
          onPointerLeave={leave}
          onClick={(e) => {
            // A click during a hover-open pins it open instead of toggling it closed.
            if (open && hovered.current) {
              e.preventDefault();
              cancelClose();
              hovered.current = false;
            }
          }}
          className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-border text-[10px] font-bold leading-none text-muted-ink hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          ?
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="text-sm"
        onPointerEnter={enter}
        onPointerLeave={leave}
        onOpenAutoFocus={(e) => {
          if (hovered.current) e.preventDefault();
        }}
      >
        <p className="font-semibold">{r.title}</p>
        <p className="mt-1 text-muted-ink">{r.body}</p>
        {r.long && <p className="mt-2 text-muted-ink">{r.long}</p>}
        {r.guideAnchor !== undefined && (
          <button
            type="button"
            className="mt-2 text-sm font-medium text-secondary underline-offset-2 hover:underline"
            onClick={() => {
              window.dispatchEvent(new CustomEvent(OPEN_PAGE_GUIDE_EVENT, { detail: { anchor: r.guideAnchor || undefined } }));
              setOpen(false);
            }}
          >
            More in the guide →
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
