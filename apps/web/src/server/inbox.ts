import type { InboxOwner } from '@cs/tools';
import type { Viewer } from './viewer';

export const inboxOwnerFor = (v: Exclude<Viewer, { kind: 'member-less' }>): InboxOwner => (v.kind === 'guest' ? { contactId: v.contactId } : { userId: v.userId });

export function internalLink(link: string | null, appUrl: string): string {
  if (!link) return '/inbox';
  try {
    const u = new URL(link);
    return u.origin === new URL(appUrl).origin ? `${u.pathname}${u.search}${u.hash}` : '/inbox';
  } catch {
    return '/inbox';
  }
}

/** Shared by the inbox and settings/notifications pages — human labels for every NotificationKind (client + agency). */
export const NOTIFICATION_KIND_LABELS: Record<string, string> = {
  alert: 'Instant alerts',
  alert_digest: 'Alert digest',
  brief: 'Weekly brief',
  trend_report: 'Quarterly report',
  am_alert: 'Client alerts (agency)',
  brief_ready: 'Brief ready for review',
  brief_failed: 'Brief failed',
  brief_overdue: 'Brief overdue',
};
