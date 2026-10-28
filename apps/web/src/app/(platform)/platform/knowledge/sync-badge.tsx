import type { KbKind, KbLevel } from '@cs/core';
import { StatusChip } from '@cs/ui';
import { formatDate } from '@/lib/format';
import { importErrorCopy } from './import-errors';

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

/** URL rows only: the sync error (decided copy for its code) in red, "Auto-sync off" once sync is off, else "Synced {date}" plus " · changed" when the last sync changed the body. */
export function SyncBadge({ a, tz }: { a: KbListItem; tz: string }) {
  if (a.source !== 'url') return null;
  return (
    <>
      {a.syncError && <StatusChip tone="danger" className="h-auto whitespace-normal py-0.5">{importErrorCopy(a.syncError)}</StatusChip>}
      {!a.autoSync && <span className="text-13 text-muted-ink">Auto-sync off</span>}
      {a.autoSync && !a.syncError && a.lastSyncedAt && (
        <span className="text-13 text-muted-ink">Synced {formatDate(a.lastSyncedAt, { tz })}{a.lastSyncChanged ? ' · changed' : ''}</span>
      )}
    </>
  );
}
