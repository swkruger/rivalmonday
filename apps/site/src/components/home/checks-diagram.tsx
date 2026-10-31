'use client';

import { Button, Sheet, SheetClose, SheetContent, SheetTitle, useMediaQuery } from '@cs/ui';
import { BadgeCheck, ChevronRight, FileText, Globe, Map, Megaphone, Star, Store, X, type LucideIcon } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';
import { Reveal } from '../motion/in-view';

export type CheckNode = 'websites' | 'reviews' | 'profile' | 'ads' | 'rankings' | 'brief' | 'result';

/** Plain data from the server wrapper: this client module must not import `content/sources`. */
export interface CheckNodeDetail {
  eyebrow: string;
  title: string;
  lead: string;
  sections?: readonly { heading: string; lines: readonly string[] }[];
  steps?: readonly { title: string; detail: string }[];
  link: { label: string; href: string };
}

const SOURCES: readonly { id: CheckNode; label: string; Icon: LucideIcon; lines?: readonly [string, string] }[] = [
  { id: 'websites', label: 'Competitor websites', Icon: Globe },
  { id: 'reviews', label: 'Google reviews', Icon: Star },
  { id: 'profile', label: 'Google Business Profile', Icon: Store },
  { id: 'ads', label: 'Meta Ad Library and Google Ads Transparency Center', Icon: Megaphone, lines: ['Meta Ad Library', 'Google Ads Transparency Center'] },
  { id: 'rankings', label: 'Local map rankings', Icon: Map },
];

const ICONS: Record<CheckNode, LucideIcon> = { websites: Globe, reviews: Star, profile: Store, ads: Megaphone, rankings: Map, brief: FileText, result: BadgeCheck };

const NAME = `How a claim is checked: ${SOURCES.map((s) => s.label).join(', ')} feed the Monday brief, each claim is verified against its evidence, and the result is "No evidence, no claim".`;

const TILE_H = 56;
const GAP = 16;
// Tiles are wide enough for the longest two-line label ("Google Ads Transparency Center") and the arrow after it.
const TILE_W = 320;
const HUB = { x: 410, y: 142, w: 200, h: 96 };
const OUT = { x: 706, w: 254 };
const MID_Y = HUB.y + HUB.h / 2;
/** Hover and keyboard focus on one diagram box; the `<g>` it sits in carries `group`. */
const BOX = 'transition-colors group-hover:fill-canvas group-hover:stroke-secondary group-focus-visible:stroke-secondary';

/** The sheet the brief's evidence uses: right on desktop, bottom on phones, focus back on the box that opened it. */
function CheckSheet({ detail, onClose, returnFocus, Icon }: { detail: CheckNodeDetail | null; onClose: () => void; returnFocus: () => Element | null; Icon: LucideIcon }) {
  const phone = useMediaQuery('(max-width: 639px)');
  const side = phone ? 'bottom' : 'right';
  return (
    <Sheet open={detail !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      {detail && (
        <SheetContent
          side={side}
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => { e.preventDefault(); (returnFocus() as HTMLElement | SVGElement | null)?.focus(); }}
          className={side === 'right' ? 'sheet-in-right w-[480px] max-w-[94vw] gap-0 overflow-y-auto p-0' : 'sheet-in-bottom max-h-[88vh] gap-0 overflow-y-auto p-0'}
        >
          <div className="flex items-start justify-between gap-3 border-b border-line bg-canvas px-5 py-4">
            <div className="flex min-w-0 gap-3">
              <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-secondary">
                <Icon className="size-5" />
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-ink">{detail.eyebrow}</p>
                <SheetTitle className="text-base break-words">{detail.title}</SheetTitle>
              </div>
            </div>
            <SheetClose asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close explanation">
                <X aria-hidden="true" />
              </Button>
            </SheetClose>
          </div>
          <div className="flex flex-col gap-6 px-5 py-5">
            <p className="text-sm text-ink">{detail.lead}</p>
            {detail.steps && (
              <ol className="flex flex-col">
                {detail.steps.map((s, i, all) => (
                  <li key={s.title} className="relative flex gap-3 pb-4 last:pb-0">
                    {i < all.length - 1 && <span aria-hidden="true" className="absolute left-[0.6875rem] top-6 bottom-0 w-px bg-line" />}
                    <span aria-hidden="true" className="relative z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-secondary bg-surface text-xs font-semibold text-secondary">
                      {i + 1}
                    </span>
                    <div className="min-w-0 text-sm">
                      <p className="font-medium text-ink">{s.title}</p>
                      <p className="text-ink-secondary">{s.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {detail.sections?.map((s) => (
              <section key={s.heading} aria-label={s.heading} className="flex flex-col gap-2">
                <h3 className="text-13 font-semibold text-ink">{s.heading}</h3>
                {s.lines.map((line) => (
                  <p key={line} className="text-sm text-ink-secondary">{line}</p>
                ))}
              </section>
            ))}
            <a href={detail.link.href} className="text-sm font-medium text-link hover:underline">{detail.link.label}</a>
          </div>
        </SheetContent>
      )}
    </Sheet>
  );
}

/** The diagram (phones get the same story as a list); each box is a button that opens its explanation. */
export function ChecksDiagram({ nodes, hint }: { nodes: Record<CheckNode, CheckNodeDetail>; hint: string }) {
  const [active, setActive] = useState<CheckNode | null>(null);
  const opener = useRef<Element | null>(null);
  const open = (id: CheckNode, el: Element) => {
    opener.current = el;
    setActive(id);
  };
  /** `<g role="button">` gets no keyboard activation from the browser. */
  const box = (id: CheckNode, label: string) => ({
    role: 'button',
    tabIndex: 0,
    'aria-label': label,
    className: 'group cursor-pointer outline-none',
    onClick: (e: { currentTarget: Element }) => open(id, e.currentTarget),
    onKeyDown: (e: KeyboardEvent<SVGGElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open(id, e.currentTarget);
      }
    },
  });
  return (
    <>
      <Reveal>
        <svg role="group" aria-label={NAME} viewBox="0 0 960 380" className="mx-auto mt-10 hidden h-auto w-full max-w-5xl md:block">
          {SOURCES.map((s, i) => {
            const y = 8 + i * (TILE_H + GAP);
            const flow = `M ${TILE_W} ${y + TILE_H / 2} C ${TILE_W + 50} ${y + TILE_H / 2}, ${TILE_W + 60} ${MID_Y}, ${HUB.x} ${MID_Y}`;
            return (
              <g key={s.id}>
                <path d={flow} fill="none" className="stroke-chart-grid" strokeWidth="2" />
                {/* Evidence flowing into the brief (static under reduced motion). */}
                <path d={flow} fill="none" className="flow-dash stroke-secondary" strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round" />
                <g {...box(s.id, s.label)}>
                  <rect x="0" y={y} width={TILE_W} height={TILE_H} rx="8" className={`fill-surface stroke-line ${BOX}`} />
                  <s.Icon x="16" y={y + 16} width="24" height="24" className="stroke-secondary" aria-hidden="true" />
                  {s.lines ? (
                    <text x="52" y={y + 26} className="fill-ink text-sm font-medium">
                      <tspan x="52">{s.lines[0]}</tspan>
                      <tspan x="52" dy="16">{s.lines[1]}</tspan>
                    </text>
                  ) : (
                    <text x="52" y={y + 33} className="fill-ink text-sm font-medium">{s.label}</text>
                  )}
                  <ChevronRight x={TILE_W - 26} y={y + 20} width="16" height="16" className="stroke-muted-ink group-hover:stroke-secondary" aria-hidden="true" />
                </g>
              </g>
            );
          })}
          <g {...box('brief', nodes.brief.title)}>
            <rect x={HUB.x} y={HUB.y} width={HUB.w} height={HUB.h} rx="12" strokeWidth="2" className="fill-canvas stroke-secondary transition-colors group-hover:fill-muted-surface" />
            <text x={HUB.x + HUB.w / 2} y={HUB.y + 38} textAnchor="middle" className="fill-ink text-lg font-semibold">Monday brief</text>
            <rect x={HUB.x + 40} y={HUB.y + 54} width="120" height="26" rx="13" className="fill-surface stroke-line" />
            <circle cx={HUB.x + 56} cy={HUB.y + 67} r="4" className="animate-pulse fill-secondary" />
            <text x={HUB.x + 66} y={HUB.y + 72} className="fill-ink-secondary text-xs">Verifying…</text>
            <ChevronRight x={HUB.x + HUB.w - 26} y={MID_Y - 8} width="16" height="16" className="stroke-muted-ink group-hover:stroke-secondary" aria-hidden="true" />
          </g>
          <path d={`M ${HUB.x + HUB.w} ${MID_Y} L ${OUT.x - 16} ${MID_Y}`} fill="none" className="stroke-secondary" strokeWidth="2" />
          <path d={`M ${OUT.x - 24} ${MID_Y - 7} L ${OUT.x - 12} ${MID_Y} L ${OUT.x - 24} ${MID_Y + 7}`} fill="none" className="stroke-secondary" strokeWidth="2" />
          <g {...box('result', nodes.result.title)}>
            <rect x={OUT.x} y={HUB.y} width={OUT.w} height={HUB.h} rx="12" className={`fill-surface stroke-line ${BOX}`} />
            <BadgeCheck x={OUT.x + 14} y={MID_Y - 14} width="28" height="28" className="stroke-secondary" aria-hidden="true" />
            <text x={OUT.x + 48} y={MID_Y + 6} className="fill-ink text-base font-semibold">No evidence, no claim</text>
            <ChevronRight x={OUT.x + OUT.w - 24} y={MID_Y - 8} width="16" height="16" className="stroke-muted-ink group-hover:stroke-secondary" aria-hidden="true" />
          </g>
        </svg>
      </Reveal>
      <ol className="mt-8 flex flex-col gap-2 md:hidden">
        {SOURCES.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={(e) => open(s.id, e.currentTarget)} className="flex w-full items-center gap-3 rounded-md border border-line px-3 py-2.5 text-left text-sm font-medium text-ink hover:bg-canvas">
              <s.Icon aria-hidden="true" className="size-5 shrink-0 text-secondary" />
              <span className="min-w-0 flex-1">{s.lines ? s.lines.join(' and ') : s.label}</span>
              <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-ink" />
            </button>
          </li>
        ))}
        <li>
          <button type="button" onClick={(e) => open('brief', e.currentTarget)} className="flex w-full items-center gap-2 rounded-md border border-secondary bg-canvas px-3 py-3 text-left text-sm font-semibold text-ink">
            <span className="min-w-0 flex-1">
              Monday brief <span className="ml-1 rounded-full border border-line bg-surface px-2 py-0.5 text-xs font-normal text-ink-secondary">Verifying…</span>
            </span>
            <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-ink" />
          </button>
        </li>
        <li>
          <button type="button" onClick={(e) => open('result', e.currentTarget)} className="flex w-full items-center gap-2 rounded-md border border-line px-3 py-3 text-left text-sm font-semibold text-ink hover:bg-canvas">
            <BadgeCheck aria-hidden="true" className="size-5 shrink-0 text-secondary" />
            <span className="min-w-0 flex-1">No evidence, no claim</span>
            <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-ink" />
          </button>
        </li>
      </ol>
      <p className="mt-4 text-13 text-muted-ink md:text-center">{hint}</p>
      <CheckSheet
        detail={active ? nodes[active] : null}
        Icon={active ? ICONS[active] : Globe}
        onClose={() => setActive(null)}
        returnFocus={() => opener.current}
      />
    </>
  );
}
