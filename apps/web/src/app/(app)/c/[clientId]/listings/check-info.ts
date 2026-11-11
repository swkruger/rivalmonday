import { SPEND_PAUSED_COPY } from '@cs/core';
import { CITATION_MANUAL_PER_AGENCY_DAY, type CitationAuditView, searchDayLabelAt } from '@cs/tools';
import { type CheckInfo, checkDailyLimit, checkNextAvailable } from './check-copy';

/** The button's state and label from the audit's `manual` field (dates in the viewer's time zone). Null for client viewers (no `manual`). */
export function checkInfo(manual: CitationAuditView['manual'], tz: string): CheckInfo | null {
  if (!manual) return null;
  switch (manual.state) {
    case 'weekly_limit': return { state: manual.state, label: checkNextAvailable(manual.nextAvailableAt ? searchDayLabelAt(manual.nextAvailableAt, tz) : 'next week') };
    case 'agency_daily_limit': return { state: manual.state, label: checkDailyLimit(CITATION_MANUAL_PER_AGENCY_DAY) };
    case 'spend_paused': return { state: manual.state, label: SPEND_PAUSED_COPY };
    default: return { state: manual.state, label: null };
  }
}
