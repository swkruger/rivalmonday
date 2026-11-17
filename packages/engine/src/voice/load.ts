import { DEFAULT_VOICE, type VoiceSettings } from '@cs/core';
import { client, type Db, runbook, runbookItem } from '@cs/db';
import { and, eq, or } from 'drizzle-orm';
import { parseItemContent, type RunbookItem } from '../runbook/items';

export const VOICE_KEY = 'knob:voice';

/** The enabled, valid voice of one runbook's items; an invalid stored value is skipped with a warning, never fatal. */
function voiceOf(items: RunbookItem[] | null, where: string): VoiceSettings | null {
  const item = items?.find((i) => i.key === VOICE_KEY && i.kind === 'knob' && i.enabled);
  if (!item) return null;
  const r = parseItemContent(item.kind, item.key, item.content);
  if (!r.ok) {
    console.warn(`[voice] skipping invalid ${VOICE_KEY} in ${where}: ${r.error}`);
    return null;
  }
  return r.value as VoiceSettings;
}

/** V1: an enabled valid client knob wins (a non-customised copy equals the agency's, so it follows it), else the agency's, else the default. */
export function voiceOfItems(clientItems: RunbookItem[] | null, agencyItems: RunbookItem[] | null): VoiceSettings {
  const own = clientItems?.find((i) => i.key === VOICE_KEY && i.kind === 'knob' && i.enabled);
  if (own?.customised) {
    const v = voiceOf(clientItems, 'client runbook');
    if (v) return v;
  }
  return voiceOf(agencyItems, 'agency runbook') ?? (own ? voiceOf(clientItems, 'client runbook') : null) ?? DEFAULT_VOICE;
}

/** One query: the client's and its agency's `knob:voice` rows. Does not depend on the runbook source (legacy clients included). */
export async function loadVoice(db: Db, clientId: string): Promise<VoiceSettings> {
  const rows = await db
    .select({
      level: runbook.level, itemKey: runbookItem.itemKey, kind: runbookItem.kind, content: runbookItem.content, enabled: runbookItem.enabled,
      customised: runbookItem.customised, version: runbookItem.version,
    })
    .from(client)
    .leftJoin(runbook, or(
      and(eq(runbook.level, 'client'), eq(runbook.clientId, client.id)),
      and(eq(runbook.level, 'agency'), eq(runbook.agencyId, client.agencyId)),
    ))
    .leftJoin(runbookItem, and(eq(runbookItem.runbookId, runbook.id), eq(runbookItem.itemKey, VOICE_KEY)))
    .where(eq(client.id, clientId));
  if (rows.length === 0) throw new Error(`Unknown client ${clientId}`);
  const items = (level: 'client' | 'agency'): RunbookItem[] | null => {
    const mine = rows.filter((r) => r.level === level && r.itemKey !== null);
    if (mine.length === 0) return null;
    return mine.map((r) => ({
      key: r.itemKey!, kind: r.kind!, content: r.content, enabled: r.enabled!, businessAreaIds: null, version: r.version!,
      upstreamVersion: null, upstreamSnapshot: null, dismissedUpstreamVersion: null, customised: r.customised!, removedUpstream: false,
    }));
  };
  return voiceOfItems(items('client'), items('agency'));
}
