import { capTopic, type ChangeLine, formatDayRange, GRADE_LABEL, type GradedChangesView, REPORT_CAPS, REPORT_TOPICS, TOPIC_LABEL } from '@cs/core';
import { Section, StatusChip } from '@cs/ui';
import Link from 'next/link';
import { EvidenceChips } from '@/components/evidence-chips';
import { HelpTip } from '@/components/help/help-tip';
import type { EvidenceRefs } from '@/server/evidence-refs';

function Row({ line, clientId, timezone, refs, evidenceHref }: { line: ChangeLine; clientId: string; timezone: string; refs?: EvidenceRefs; evidenceHref?: (id: string) => string }) {
  return (
    <li className="flex flex-col gap-1.5 border-t border-line py-3 first:border-t-0">
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {line.grade !== 'minor' && <StatusChip tone="neutral">{GRADE_LABEL[line.grade]}</StatusChip>}
        <span>{line.text}</span>
        <span className="text-sm text-muted-ink">{formatDayRange(line.firstAt, line.lastAt, timezone)}</span>
      </p>
      <EvidenceChips clientId={clientId} ids={line.evidenceIds} refs={refs} {...(evidenceHref ? { evidenceHref } : {})} />
    </li>
  );
}

/**
 * The weekly brief's graded "Other changes this week" (brief-report): every change the brief did not write up, per topic,
 * Major and Notable first, Minor folded. Read-only. `changesHref` is the "See all changes this week" target, or `null` when the
 * viewer cannot open the Changes page (no `dashboard` feature: the link would 404). The overflow count shows either way.
 * No score or threshold: the view carries none.
 */
export function GradedChanges({
  clientId,
  changes,
  timezone,
  changesHref,
  refs,
  evidenceHref,
}: {
  clientId: string;
  changes: GradedChangesView | null;
  timezone: string;
  changesHref: string | null;
  refs?: EvidenceRefs;
  evidenceHref?: (id: string) => string;
}) {
  if (!changes || changes.lines.length === 0) return null;
  const { totals } = changes;
  const topics = REPORT_TOPICS.map((topic) => ({ topic, ...capTopic(changes.lines, topic, REPORT_CAPS.app) })).filter((t) => t.lines.length > 0 || t.minor.length > 0 || t.moreLines > 0 || t.moreMinor > 0);
  const row = (l: ChangeLine) => <Row key={l.eventIds[0]! + l.grade + l.text} line={l} clientId={clientId} timezone={timezone} refs={refs} evidenceHref={evidenceHref} />;
  const overflow = topics.some((t) => t.moreLines > 0 || t.moreMinor > 0);
  return (
    <Section title="Other changes this week" titleAside={<HelpTip tip="client.briefs.detail.grades" />} description={`${totals.major} Major · ${totals.notable} Notable · ${totals.minor} Minor`}>
      {topics.map((t) => (
        <div key={t.topic} data-slot="graded-topic" className="flex flex-col">
          <h3 className="text-sm font-semibold text-ink">{TOPIC_LABEL[t.topic]}</h3>
          {t.lines.length > 0 && <ul>{t.lines.map(row)}</ul>}
          {t.moreLines > 0 && <p className="text-sm text-muted-ink">+{t.moreLines} more</p>}
          {t.minor.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer text-sm font-semibold text-primary-soft-text">Minor ({t.minor.length + t.moreMinor})</summary>
              <ul>{t.minor.map(row)}</ul>
              {t.moreMinor > 0 && <p className="text-sm text-muted-ink">+{t.moreMinor} more</p>}
            </details>
          )}
        </div>
      ))}
      {overflow && changesHref && (
        <Link href={changesHref} className="text-sm font-semibold text-primary-soft-text">
          See all changes this week
        </Link>
      )}
    </Section>
  );
}
