import 'server-only';
import type { AccessContext } from '@cs/core';
import type { EvidenceRef } from '@cs/tools';
import { z } from 'zod';
import { formatDate } from '@/lib/format';
import { tryCallTool } from '@/server/tools';

/** `servable` (17a sample page only): false = the caller's evidence route cannot serve it (html/vendor_json), so the chip is not a link. */
export type EvidenceRefDisplay = { source: string; channel: string; date: string; servable?: boolean };
/** Keyed by evidence id; a plain object so it crosses to client components. */
export type EvidenceRefs = Record<string, EvidenceRefDisplay>;

const CHUNK = 60;
const uuid = z.string().uuid();

/** Display refs (competitor, channel, capture date in the viewer's tz) for evidence ids. Never throws; unreachable ids are absent. */
export async function evidenceRefsFor(ctx: AccessContext, clientId: string, ids: readonly string[], timezone: string): Promise<EvidenceRefs> {
  const unique = [...new Set(ids.filter((i) => uuid.safeParse(i).success))];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += CHUNK) chunks.push(unique.slice(i, i + CHUNK));
  // Launch gate: all chunks in one stage (Promise.all), never one sequential stage per 60 ids.
  const results = await Promise.all(chunks.map(async (evidenceIds) => {
    try {
      return await tryCallTool<{ items: EvidenceRef[] }>(ctx, 'get_evidence_refs', { clientId, evidenceIds });
    } catch {
      return null;
    }
  }));
  const out: EvidenceRefs = {};
  for (const res of results) {
    for (const r of res?.items ?? []) out[r.evidenceId] = { source: r.competitorName, channel: r.channelLabel, date: formatDate(r.capturedAt, { tz: timezone }) };
  }
  return out;
}
