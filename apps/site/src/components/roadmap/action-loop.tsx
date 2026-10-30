import { ROADMAP } from '../../../content/roadmap';

type StepId = (typeof ROADMAP.loop.steps)[number]['id'];

const W = 210;
const H = 84;
const COL = [0, 250, 500, 750] as const;
const ROW_TOP = 8;
const ROW_BOTTOM = 168;
/** Top row left to right, then down at the last column and back right to left. */
const PLACE: Record<StepId, { x: number; y: number }> = {
  recommendation: { x: COL[0], y: ROW_TOP },
  draft: { x: COL[1], y: ROW_TOP },
  approve: { x: COL[2], y: ROW_TOP },
  publish: { x: COL[3], y: ROW_TOP },
  verify: { x: COL[3], y: ROW_BOTTOM },
  measure: { x: COL[2], y: ROW_BOTTOM },
  brief: { x: COL[1], y: ROW_BOTTOM },
};
const MID_TOP = ROW_TOP + H / 2;
const MID_BOTTOM = ROW_BOTTOM + H / 2;
const CONNECTORS = [
  `M ${COL[0] + W} ${MID_TOP} H ${COL[1] - 4}`,
  `M ${COL[1] + W} ${MID_TOP} H ${COL[2] - 4}`,
  `M ${COL[2] + W} ${MID_TOP} H ${COL[3] - 4}`,
  `M ${COL[3] + W / 2} ${ROW_TOP + H} V ${ROW_BOTTOM - 4}`,
  `M ${COL[3]} ${MID_BOTTOM} H ${COL[2] + W + 4}`,
  `M ${COL[2]} ${MID_BOTTOM} H ${COL[1] + W + 4}`,
  `M ${COL[1]} ${MID_BOTTOM} H ${COL[0] + W / 2} V ${ROW_TOP + H + 4}`,
];

/** The planned action loop (roadmap): a diagram from md up, and the same steps as a numbered list with their detail. */
export function ActionLoop() {
  const { loop } = ROADMAP;
  return (
    <section aria-labelledby="loop-heading" className="mt-12">
      <h2 id="loop-heading" className="text-xl font-semibold text-ink">{loop.heading}</h2>
      <svg role="img" aria-label={loop.label} viewBox="-2 0 964 262" className="mt-6 hidden h-auto w-full md:block">
        <defs>
          <marker id="roadmap-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-secondary" />
          </marker>
        </defs>
        {CONNECTORS.map((d) => (
          <path key={d} d={d} fill="none" className="stroke-secondary" strokeWidth="1.5" markerEnd="url(#roadmap-arrow)" />
        ))}
        {loop.steps.map((s) => {
          const { x, y } = PLACE[s.id];
          const accent = s.id === 'verify';
          return (
            <g key={s.id}>
              <rect
                x={x}
                y={y}
                width={W}
                height={H}
                rx="12"
                className={accent ? 'fill-canvas stroke-secondary' : 'fill-surface stroke-line'}
                strokeWidth={accent ? 2 : 1}
              />
              <text x={x + W / 2} y={y + 36} textAnchor="middle" className="fill-ink text-base font-semibold">{s.name}</text>
              <text x={x + W / 2} y={y + 60} textAnchor="middle" className="fill-ink-secondary text-sm">{s.short}</text>
            </g>
          );
        })}
        <text x={COL[3] + W / 2 + 12} y="134" className="fill-ink-secondary text-xs">{loop.checked}</text>
        <text x={COL[0] + W / 2 + 12} y="134" className="fill-ink-secondary text-xs">{loop.loopBack}</text>
      </svg>
      <ol className="mt-6 flex flex-col gap-3">
        {loop.steps.map((s, i) => (
          <li key={s.id} className="flex gap-3 text-base text-ink-secondary">
            <span aria-hidden="true" className="w-6 shrink-0 font-semibold text-secondary">{i + 1}.</span>
            <span>
              <span className="font-semibold text-ink">{s.name}.</span> {s.body}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
