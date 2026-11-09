/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { capTopic, type ChangeLine, formatDayRange, GRADE_LABEL, REPORT_CAPS, type ReportTopic, TOPIC_LABEL } from '@cs/core';
import type { CSSProperties, ReactNode } from 'react';
import type { Branding } from '../../branding';
import type { BriefReportDocumentProps } from '../../types';
import { h2, muted, pageSection, small } from './format';

type Item = BriefReportDocumentProps['items'][number];

// Neutral tint as the app's `StatusChip tone="neutral"` (@cs/ui status-chip.tsx); the grade word carries the meaning.
const NEUTRAL: CSSProperties = { backgroundColor: '#EEF2F6', color: '#334155' };
const CHIP: Record<ChangeLine['grade'], CSSProperties> = {
  major: NEUTRAL,
  notable: NEUTRAL,
  minor: { backgroundColor: '#F6F9FC', color: '#5B6B7F' },
};

/** Major items in full (headline + What changed + Why it matters + What to do), never a link. */
export function MajorItems({ branding, items }: { branding: Branding; items: Item[] }) {
  return (
    <>
      {items.map((it, i) => (
        <div key={i} className="card" style={{ backgroundColor: branding.panel, borderRadius: 8, padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 16, lineHeight: '24px', fontWeight: 700, marginBottom: 6 }}>{it.headline}</div>
          <p style={{ margin: '0 0 6px', fontSize: 15, lineHeight: '22px' }}><strong>What changed:</strong> {it.whatChanged}</p>
          {it.whyItMatters ? <p style={{ margin: '0 0 6px', fontSize: 15, lineHeight: '22px' }}><strong>Why it matters:</strong> {it.whyItMatters}</p> : null}
          {it.recommendedAction ? <p style={{ margin: 0, fontSize: 15, lineHeight: '22px' }}><strong>What to do:</strong> {it.recommendedAction}</p> : null}
        </div>
      ))}
    </>
  );
}

const More = ({ n }: { n: number }) => (n > 0 ? <div style={{ ...small, padding: '4px 0 8px' }}>{`+${n} more in your dashboard`}</div> : null);

function LineRow({ line, timezone }: { line: ChangeLine; timezone: string }) {
  return (
    <div style={{ display: 'block', padding: '5px 0', borderBottom: '1px solid #EDF1F5', fontSize: 14, lineHeight: '20px', breakInside: 'avoid' }}>
      <span style={{ ...CHIP[line.grade], borderRadius: 4, padding: '1px 6px', fontSize: 12, fontWeight: 600, marginRight: 8 }}>{GRADE_LABEL[line.grade]}</span>
      <span>{line.text}</span>
      <span style={{ color: muted }}>{` · ${formatDayRange(line.firstAt, line.lastAt, timezone)}`}</span>
    </div>
  );
}

/** One topic's graded lines, capped for print (`REPORT_CAPS.pdf`: 12 Major/Notable + 12 Minor), overflow as plain text. */
export function ChangeLines({ lines, topic, timezone }: { lines: ChangeLine[]; topic: ReportTopic; timezone: string }) {
  const c = capTopic(lines, topic, REPORT_CAPS.pdf);
  return (
    <div style={{ marginTop: 8 }}>
      {c.lines.map((l, i) => <LineRow key={`l${i}`} line={l} timezone={timezone} />)}
      <More n={c.moreLines} />
      {c.minor.map((l, i) => <LineRow key={`m${i}`} line={l} timezone={timezone} />)}
      <More n={c.moreMinor} />
    </div>
  );
}

/**
 * A topic section: data block (chart, tables), the topic's Major items, then its lines. Omitted by the caller when it has
 * neither data nor changes; "No changes this week." when it has data but no change (`noChangeNote: false` turns it off, e.g. Moves).
 */
export function TopicSection(p: { topic: ReportTopic; doc: BriefReportDocumentProps; lines: ChangeLine[]; data: ReactNode | null; title?: string; style?: CSSProperties; noChangeNote?: boolean }) {
  const items = p.doc.items.filter((i) => i.topic === p.topic);
  const hasLines = p.lines.some((l) => l.topic === p.topic);
  return (
    <div data-section={p.topic} style={p.style ?? pageSection}>
      <h2 style={h2}>{p.title ?? TOPIC_LABEL[p.topic]}</h2>
      {p.data}
      <MajorItems branding={p.doc.branding} items={items} />
      {hasLines ? <ChangeLines lines={p.lines} topic={p.topic} timezone={p.doc.timezone} /> : null}
      {items.length === 0 && !hasLines && p.noChangeNote !== false ? <p style={{ ...small, margin: '8px 0' }}>No changes this week.</p> : null}
    </div>
  );
}

/** True when the topic has anything to print besides data: an item or a line. */
export const topicHasChanges = (topic: ReportTopic, doc: BriefReportDocumentProps, lines: ChangeLine[]): boolean =>
  doc.items.some((i) => i.topic === topic) || lines.some((l) => l.topic === topic);
