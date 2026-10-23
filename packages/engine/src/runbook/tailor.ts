import type { Ai, JsonSchemaFormat } from '@cs/ai';
import { redactForModel } from '@cs/collectors';
import { agencyServiceable, client, clientWorkAllowed, type Db, runbook, runbookItem } from '@cs/db';
import type { PackLoader, VerticalPack } from '@cs/verticals';
import { and, eq, sql } from 'drizzle-orm';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { type RunbookItem, playContentSchema } from './items';
import { legacyClientItems } from './legacy';
import { copyItems, packUsesGenericPlays, withColumnThresholds } from './state';
import { createClientRunbookIfAbsent, ensureAgencyRunbook, readRunbookItems } from './store';

const SYSTEM_USER = 'system';
const WHOLE_ANSWER = '*';

export const tailorOutputSchema = z.strictObject({
  items: z.array(z.strictObject({ key: z.string(), title: z.string(), template: z.string(), businessAreaIds: z.array(z.string()).nullable() })).max(40),
});

const tailorJsonSchema: JsonSchemaFormat = {
  name: 'runbook_tailor',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['key', 'title', 'template', 'businessAreaIds'],
          properties: {
            key: { type: 'string' },
            title: { type: 'string' },
            template: { type: 'string' },
            businessAreaIds: { type: ['array', 'null'], items: { type: 'string' } },
          },
        },
      },
    },
  },
};

/** The distinct `{{name}}` placeholder names in a text. */
const placeholdersOf = (text: string): string[] => [...new Set([...text.matchAll(/\{\{\s*([^{}]*?)\s*\}\}/g)].map((m) => m[1]!))];

type PlayContent = { trigger: string; title: string; template: string; effort?: 'L' | 'M' | 'H'; impact?: 'L' | 'M' | 'H' };

/**
 * The deterministic gate on the model's rewrite (R8): only a play's title/template (and optionally its service ids) can change.
 * A rejected item keeps its base; `rejected` lists its key (`'*'` = the whole answer was not the expected shape).
 */
export function applyTailoring(base: RunbookItem[], raw: unknown, ctx: { areaIds: string[] }): { items: RunbookItem[]; rejected: string[] } {
  const parsed = tailorOutputSchema.safeParse(raw);
  if (!parsed.success) return { items: base, rejected: [WHOLE_ANSWER] };
  const byKey = new Map(base.map((i) => [i.key, i]));
  const accepted = new Map<string, RunbookItem>();
  const rejected: string[] = [];
  for (const o of parsed.data.items) {
    const item = byKey.get(o.key);
    if (!item || item.kind !== 'play' || accepted.has(o.key) || rejected.includes(o.key)) {
      rejected.push(o.key);
      continue;
    }
    const baseContent = item.content as PlayContent;
    const next = playContentSchema.safeParse({ ...baseContent, title: o.title, template: o.template });
    const allowed = new Set(placeholdersOf(baseContent.template));
    const areasOk = o.businessAreaIds === null || o.businessAreaIds.every((a) => ctx.areaIds.includes(a));
    if (!next.success || !placeholdersOf(o.template).every((p) => allowed.has(p)) || !areasOk) {
      rejected.push(o.key);
      continue;
    }
    accepted.set(o.key, {
      ...item,
      content: next.data,
      businessAreaIds: o.businessAreaIds && o.businessAreaIds.length > 0 ? [...new Set(o.businessAreaIds)] : item.businessAreaIds,
      customised: false,
    });
  }
  return { items: base.map((i) => accepted.get(i.key) ?? i), rejected };
}

interface TailorContext {
  agencyId: string;
  clientId: string;
  verticalId: string;
  name: string;
  pack: VerticalPack;
  areas: { id: string; name: string }[];
}

const INSTRUCTION = (vertical: string, audience: string) =>
  `Rewrite each play's title and template so it fits a ${vertical} serving ${audience}. Keep every {{placeholder}} exactly as written, add no new placeholders, ` +
  'keep titles under 200 characters with no placeholders, keep the advice practical and specific to the listed services. ' +
  'Optionally limit a play to the service ids it is about (businessAreaIds, or null for no limit). Return JSON.';

/** Calls the model for the given plays; the reply is parsed JSON (throws on an AI error or unparseable text). */
async function askModel(ai: Ai, c: TailorContext, plays: RunbookItem[], task: 'runbook_tailor' | 'runbook_retailor' = 'runbook_tailor'): Promise<unknown> {
  const red = (s: string) => redactForModel(s, { businessNames: [c.name] });
  const input = {
    vertical: red(c.pack.name),
    audience: red(c.pack.audience_noun),
    areas: c.areas.map((a) => ({ id: a.id, name: red(a.name) })),
    plays: plays.map((p) => {
      const k = p.content as PlayContent;
      return { key: p.key, title: red(k.title), template: red(k.template) };
    }),
  };
  const res = await ai.chat(
    task,
    { messages: [{ role: 'system', content: INSTRUCTION(c.pack.name, c.pack.audience_noun) }, { role: 'user', content: JSON.stringify(input) }], jsonSchema: tailorJsonSchema },
    { agencyId: c.agencyId, clientId: c.clientId, verticalId: c.verticalId },
  );
  return JSON.parse(res.text);
}

async function loadContext(db: Db, packs: PackLoader, row: { id: string; agencyId: string; verticalId: string; name: string; services: string[] }): Promise<TailorContext> {
  const pack = await packs(row.verticalId);
  return {
    agencyId: row.agencyId, clientId: row.id, verticalId: row.verticalId, name: row.name, pack,
    areas: pack.services.filter((s) => row.services.includes(s.id)).map((s) => ({ id: s.id, name: s.name })),
  };
}

const clientCols = { id: client.id, agencyId: client.agencyId, verticalId: client.verticalId, name: client.name, services: client.services };

/** A runbook still waiting to be tailored that never will be (paused / suspended / demo): mark it `skipped` so the editor unlocks. */
export async function skipPendingRunbook(db: Db, clientId: string): Promise<void> {
  await db.update(runbook).set({ tailorStatus: 'skipped' }).where(and(eq(runbook.level, 'client'), eq(runbook.clientId, clientId), eq(runbook.tailorStatus, 'pending')));
}

export async function tailorClientRunbook(
  d: { db: Db; ai: Ai; packs: PackLoader; generic: () => Promise<VerticalPack> },
  clientId: string,
): Promise<{ status: 'done' | 'failed' | 'skipped'; rejected: string[] }> {
  const [row] = await d.db.select(clientCols).from(client).where(and(eq(client.id, clientId), clientWorkAllowed(client), agencyServiceable(client.agencyId)));
  if (!row) {
    await skipPendingRunbook(d.db, clientId);
    return { status: 'skipped', rejected: [] };
  }
  const [existing] = await d.db.select({ id: runbook.id, tailorStatus: runbook.tailorStatus }).from(runbook).where(and(eq(runbook.level, 'client'), eq(runbook.clientId, clientId)));
  if (existing && existing.tailorStatus !== 'pending') return { status: 'skipped', rejected: [] };

  const c = await loadContext(d.db, d.packs, row);
  let base: RunbookItem[];
  if (existing) base = await readRunbookItems(d.db, existing.id);
  else {
    const agency = await readRunbookItems(d.db, await ensureAgencyRunbook(d.db, row.agencyId, await d.generic()));
    const [col] = await d.db.select({ t: client.scoreThresholds }).from(client).where(eq(client.id, clientId));
    base = packUsesGenericPlays(c.pack, await d.generic()) ? withColumnThresholds(copyItems(agency), col?.t, agency) : await legacyClientItems({ db: d.db, packs: d.packs }, clientId, agency);
  }

  let result: { items: RunbookItem[]; rejected: string[] } | null = null;
  try {
    const plays = base.filter((i) => i.kind === 'play');
    if (plays.length > 0) {
      const r = applyTailoring(base, await askModel(d.ai, c, plays), { areaIds: row.services });
      if (!r.rejected.includes(WHOLE_ANSWER)) result = r;
    } else result = { items: base, rejected: [] };
  } catch (err) {
    console.warn(`[runbook-tailor] ${clientId} failed: ${err instanceof Error ? `${err.name}: ${err.message}` : 'unknown error'}`);
  }

  const plays = base.filter((i) => i.kind === 'play');
  const accepted = result ? result.items.filter((i, n) => i !== base[n]).length : 0;
  // Every play rejected individually is as good as a failure (nothing was tailored).
  const status = result && (plays.length === 0 || accepted > 0) ? 'done' : 'failed';
  const items = result?.items ?? base;
  const stamp = (id: string, onlyPending: boolean) =>
    d.db.update(runbook).set({ tailorStatus: status, tailoredAt: new Date() })
      .where(and(eq(runbook.id, id), ...(onlyPending ? [eq(runbook.tailorStatus, 'pending')] : [])));

  let target = existing?.id;
  if (!target) {
    const made = await createClientRunbookIfAbsent(d.db, clientId, items, SYSTEM_USER);
    if (made.created) {
      await stamp(made.id, false);
      return { status, rejected: result?.rejected ?? [] };
    }
    // Another path created the runbook while the model ran: leave it alone unless it is waiting to be tailored.
    const [other] = await d.db.select({ tailorStatus: runbook.tailorStatus }).from(runbook).where(eq(runbook.id, made.id));
    if (other?.tailorStatus !== 'pending') return { status: 'skipped', rejected: [] };
    target = made.id;
  }
  if (result) {
    // A pending runbook: replace the play contents, never a customised item (and never add or remove items).
    const fresh = new Map((await readRunbookItems(d.db, target)).map((i) => [i.key, i]));
    for (const i of items) {
      const was = fresh.get(i.key);
      if (i.kind !== 'play' || !was || was.customised || (isDeepStrictEqual(was.content, i.content) && isDeepStrictEqual(was.businessAreaIds, i.businessAreaIds))) continue;
      await d.db.update(runbookItem).set({ content: i.content, businessAreaIds: i.businessAreaIds, version: sql`${runbookItem.version} + 1`, updatedBy: SYSTEM_USER, updatedAt: new Date() })
        .where(and(eq(runbookItem.runbookId, target), eq(runbookItem.itemKey, i.key), eq(runbookItem.customised, false)));
    }
  }
  await stamp(target, true);
  return { status, rejected: result?.rejected ?? [] };
}

/** One play, same prompt and rules, the parent's new content as the base. Never writes; null on any rejection or AI failure. */
export async function proposeTailoring(
  d: { db: Db; ai: Ai; packs: PackLoader },
  clientId: string,
  key: string,
  parentContent: unknown,
): Promise<{ title: string; template: string; businessAreaIds: string[] | null } | null> {
  try {
    const [row] = await d.db.select(clientCols).from(client).where(eq(client.id, clientId));
    const parsed = playContentSchema.safeParse(parentContent);
    if (!row || !parsed.success) return null;
    const c = await loadContext(d.db, d.packs, row);
    const item: RunbookItem = {
      key, kind: 'play', content: parsed.data, enabled: true, businessAreaIds: null, version: 1, upstreamVersion: null,
      upstreamSnapshot: null, dismissedUpstreamVersion: null, customised: false, removedUpstream: false,
    };
    const r = applyTailoring([item], await askModel(d.ai, c, [item], 'runbook_retailor'), { areaIds: row.services });
    if (r.rejected.length > 0) return null;
    const out = r.items[0]!;
    const content = out.content as PlayContent;
    return { title: content.title, template: content.template, businessAreaIds: out.businessAreaIds };
  } catch (err) {
    console.warn(`[runbook-tailor] propose ${key} for ${clientId} failed: ${err instanceof Error ? err.name : 'unknown'}`);
    return null;
  }
}
