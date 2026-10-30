import { BadgeCheck, Globe, Map, Megaphone, Star, Store } from 'lucide-react';
import { CHECKS_LINK, SECTIONS } from '../../../content/home';
import { Reveal } from '../motion/in-view';
import { HomeSectionShell, SectionHeading } from './section-heading';

const SOURCES = [
  { label: 'Competitor websites', Icon: Globe },
  { label: 'Google reviews', Icon: Star },
  { label: 'Google Business Profile', Icon: Store },
  { label: 'Meta Ad Library and Google Ads Transparency Center', Icon: Megaphone, lines: ['Meta Ad Library', 'Google Ads Transparency Center'] },
  { label: 'Local map rankings', Icon: Map },
] as const;

const NAME = `How a claim is checked: ${SOURCES.map((s) => s.label).join(', ')} feed the Monday brief, each claim is verified against its evidence, and the result is "No evidence, no claim".`;

const TILE_H = 56;
const GAP = 16;
// Tiles are wide enough for the longest two-line label ("Google Ads Transparency Center").
const TILE_W = 300;
const HUB = { x: 410, y: 142, w: 200, h: 96 };
const OUT = { x: 706, w: 254 };
const MID_Y = HUB.y + HUB.h / 2;

/** Hub diagram: five sources → the Monday brief (verifying) → "No evidence, no claim". Phones get the same story as a list. */
export function ChecksHub({ hideLink = false }: { hideLink?: boolean } = {}) {
  return (
    <HomeSectionShell id="checks" labelledBy="checks-heading">
      <SectionHeading section={SECTIONS.checks} />
      <Reveal>
        <svg role="img" aria-label={NAME} viewBox="0 0 960 380" className="mx-auto mt-10 hidden h-auto w-full max-w-5xl md:block">
          {SOURCES.map((s, i) => {
            const y = 8 + i * (TILE_H + GAP);
            return (
              <g key={s.label}>
                <path d={`M ${TILE_W} ${y + TILE_H / 2} C ${TILE_W + 50} ${y + TILE_H / 2}, ${TILE_W + 60} ${MID_Y}, ${HUB.x} ${MID_Y}`} fill="none" className="stroke-chart-grid" strokeWidth="2" />
                {/* Evidence flowing into the brief (static under reduced motion). */}
                <path d={`M ${TILE_W} ${y + TILE_H / 2} C ${TILE_W + 50} ${y + TILE_H / 2}, ${TILE_W + 60} ${MID_Y}, ${HUB.x} ${MID_Y}`} fill="none" className="flow-dash stroke-secondary" strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round" />
                <rect x="0" y={y} width={TILE_W} height={TILE_H} rx="8" className="fill-surface stroke-line" />
                <s.Icon x="16" y={y + 16} width="24" height="24" className="stroke-secondary" aria-hidden="true" />
                {'lines' in s ? (
                  <text x="52" y={y + 26} className="fill-ink text-sm font-medium">
                    <tspan x="52">{s.lines[0]}</tspan>
                    <tspan x="52" dy="16">{s.lines[1]}</tspan>
                  </text>
                ) : (
                  <text x="52" y={y + 33} className="fill-ink text-sm font-medium">{s.label}</text>
                )}
              </g>
            );
          })}
          <rect x={HUB.x} y={HUB.y} width={HUB.w} height={HUB.h} rx="12" className="fill-canvas stroke-secondary" strokeWidth="2" />
          <text x={HUB.x + HUB.w / 2} y={HUB.y + 38} textAnchor="middle" className="fill-ink text-lg font-semibold">Monday brief</text>
          <rect x={HUB.x + 40} y={HUB.y + 54} width="120" height="26" rx="13" className="fill-surface stroke-line" />
          <circle cx={HUB.x + 56} cy={HUB.y + 67} r="4" className="animate-pulse fill-secondary" />
          <text x={HUB.x + 66} y={HUB.y + 72} className="fill-ink-secondary text-xs">Verifying…</text>
          <path d={`M ${HUB.x + HUB.w} ${MID_Y} L ${OUT.x - 16} ${MID_Y}`} fill="none" className="stroke-secondary" strokeWidth="2" />
          <path d={`M ${OUT.x - 24} ${MID_Y - 7} L ${OUT.x - 12} ${MID_Y} L ${OUT.x - 24} ${MID_Y + 7}`} fill="none" className="stroke-secondary" strokeWidth="2" />
          <rect x={OUT.x} y={HUB.y} width={OUT.w} height={HUB.h} rx="12" className="fill-surface stroke-line" />
          <BadgeCheck x={OUT.x + 18} y={MID_Y - 14} width="28" height="28" className="stroke-secondary" aria-hidden="true" />
          <text x={OUT.x + 56} y={MID_Y + 6} className="fill-ink text-base font-semibold">No evidence, no claim</text>
        </svg>
      </Reveal>
      <ol className="mt-8 flex flex-col gap-2 md:hidden">
        {SOURCES.map((s) => (
          <li key={s.label} className="flex items-center gap-3 rounded-md border border-line px-3 py-2.5 text-sm font-medium text-ink">
            <s.Icon aria-hidden="true" className="size-5 shrink-0 text-secondary" />
            {'lines' in s ? s.lines.join(' and ') : s.label}
          </li>
        ))}
        <li className="rounded-md border border-secondary bg-canvas px-3 py-3 text-sm font-semibold text-ink">
          Monday brief <span className="ml-1 rounded-full border border-line bg-surface px-2 py-0.5 text-xs font-normal text-ink-secondary">Verifying…</span>
        </li>
        <li className="flex items-center gap-2 rounded-md border border-line px-3 py-3 text-sm font-semibold text-ink">
          <BadgeCheck aria-hidden="true" className="size-5 shrink-0 text-secondary" />
          No evidence, no claim
        </li>
      </ol>
      {!hideLink && (
        <a href={CHECKS_LINK.href} className="mt-6 inline-flex text-sm font-medium text-link hover:underline">
          {CHECKS_LINK.label}
        </a>
      )}
    </HomeSectionShell>
  );
}
