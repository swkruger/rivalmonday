import type { KbKind, KbLevel } from '@cs/core';

export interface KbListItem {
  id: string;
  title: string;
  level: KbLevel;
  kind: KbKind;
  status: 'draft' | 'published';
  source: 'manual' | 'url' | 'seed';
  agencyName: string | null;
  clientName: string | null;
  autoSync: boolean;
  lastSyncedAt: Date | null;
  syncError: string | null;
  lastSyncChanged: boolean;
  updatedAt: Date;
}

const date = (d: Date) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** URL rows only: the sync error in red, "Auto-sync off" once sync is off, else "Synced {date}" plus " · changed" when the last sync changed the body. */
export function SyncBadge({ a }: { a: KbListItem }) {
  if (a.source !== 'url') return null;
  if (a.syncError) return <span className="text-xs text-red-700">{a.syncError}</span>;
  if (!a.autoSync) return <span className="text-xs text-muted-foreground">Auto-sync off</span>;
  if (!a.lastSyncedAt) return null;
  return <span className="text-xs text-muted-foreground">Synced {date(a.lastSyncedAt)}{a.lastSyncChanged ? ' · changed' : ''}</span>;
}
