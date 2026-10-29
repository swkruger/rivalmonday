import { BadgeCheck, Globe, Map, Megaphone, Star, Store } from 'lucide-react';
import { CHECKS_LINK, SECTIONS } from '../../../content/home';
import { HomeSectionShell, SectionHeading } from './section-heading';

const SOURCES = [
  { label: 'Competitor websites', Icon: Globe },
  { label: 'Google reviews', Icon: Star },
  { label: 'Google Business Profile', Icon: Store },
  { label: 'Meta Ad Library', Icon: Megaphone },
  { label: 'Local map rankings', Icon: Map },
] as const;

const NAME = `How a claim is checked: ${SOURCES.map((s) => s.label).join(', ')} feed the Monday brief, each claim is verified against its evidence, and the result is "No evidence, no claim".`;

const TILE_H = 56;
const GAP = 16;
const HUB = { x: 380, y: 142, w: 220, h: 96 };
const MID_Y = HUB.y + HUB.h / 2;

/** Hub diagram: five sources → the Monday brief (verifying) → "No evidence, no claim". Phones get the same story as a list. */
export function ChecksHub() {
  return (
    <HomeSectionShell id="checks" labelledBy="checks-heading">
      <SectionHeading section={SECTIONS.checks} />
      <svg role="img" aria-label={NAME} viewBox="0 0 960 380" className="mt-10 hidden h-auto w-full md:block">
        {SOURCES.map((s, i) => {
          const y = 8 + i * (TILE_H + GAP);
          return (
            <g key={s.label}>
              <path d={`M 270 ${y + TILE_H / 2} C 320 ${y + TILE_H / 2}, 330 ${MID_Y}, ${HUB.x} ${MID_Y}`} fill="none" className="stroke-chart-grid" strokeWidth="2" />
              <rect x="0" y={y} width="270" height={TILE_H} rx="8" className="fill-surface stroke-line" />
              <s.Icon x="16" y={y + 16} width="24" height="24" className="stroke-secondary" aria-hidden="true" />
              <text x="52" y={y + 33} className="fill-ink text-sm font-medium">{s.label}</text>
            </g>
          );
        })}
        <rect x={HUB.x} y={HUB.y} width={HUB.w} height={HUB.h} rx="12" className="fill-canvas stroke-secondary" strokeWidth="2" />
        <text x={HUB.x + HUB.w / 2} y={HUB.y + 38} textAnchor="middle" className="fill-ink text-lg font-semibold">Monday brief</text>
        <rect x={HUB.x + 50} y={HUB.y + 54} width="120" height="26" rx="13" className="fill-surface stroke-line" />
        <circle cx={HUB.x + 66} cy={HUB.y + 67} r="4" className="animate-pulse fill-secondary" />
        <text x={HUB.x + 76} y={HUB.y + 72} className="fill-ink-secondary text-xs">Verifying…</text>
        <path d={`M ${HUB.x + HUB.w} ${MID_Y} L 700 ${MID_Y}`} fill="none" className="stroke-secondary" strokeWidth="2" />
        <path d={`M 692 ${MID_Y - 7} L 704 ${MID_Y} L 692 ${MID_Y + 7}`} fill="none" className="stroke-secondary" strokeWidth="2" />
        <rect x="716" y={HUB.y} width="244" height={HUB.h} rx="12" className="fill-surface stroke-line" />
        <BadgeCheck x="736" y={MID_Y - 14} width="28" height="28" className="stroke-secondary" aria-hidden="true" />
        <text x="776" y={MID_Y + 6} className="fill-ink text-base font-semibold">No evidence, no claim</text>
      </svg>
      <ol className="mt-8 flex flex-col gap-2 md:hidden">
        {SOURCES.map((s) => (
          <li key={s.label} className="flex items-center gap-3 rounded-md border border-line px-3 py-2.5 text-sm font-medium text-ink">
            <s.Icon aria-hidden="true" className="size-5 shrink-0 text-secondary" />
            {s.label}
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
      <a href={CHECKS_LINK.href} className="mt-6 inline-flex text-sm font-medium text-link hover:underline">
        {CHECKS_LINK.label}
      </a>
    </HomeSectionShell>
  );
}
