import { type AccessContext, isAgencyRole, ToolError } from '@cs/core';
import { type Db, playbookOverride } from '@cs/db';
import type { VerticalPack } from '@cs/verticals';
import { and, eq } from 'drizzle-orm';
import type { BriefCandidate } from './gather';

export const PLAYBOOK_TEMPLATE_MAX = 2000;

/** Placeholders a playbook template may use (5b-2 decision 5); `renderPlaybook` fills them from the evidence. */
export const PLAYBOOK_VARS = ['competitor', 'service', 'new_price', 'areas', 'topic'] as const;
export type PlaybookVar = (typeof PLAYBOOK_VARS)[number];
export const PLAYBOOK_TITLE_MAX = 200;

export interface Playbook {
  id: string;
  trigger: string;
  title: string;
  template: string;
  source: 'pack' | 'agency';
}

const FALLBACK: Record<string, string> = {
  competitor: 'the competitor', service: 'this service', new_price: 'a lower price', areas: 'new areas', topic: 'this topic',
} satisfies Record<PlaybookVar, string>;

export function renderPlaybook(template: string, vars: Record<string, string | undefined>): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, k: string) => vars[k]?.trim() || FALLBACK[k] || 'this');
}

/** Every `{{…}}` in the template that isn't a known placeholder, in order, de-duplicated (case-sensitive: renderPlaybook only fills lower-case names). */
export function unknownPlaybookVars(template: string): string[] {
  const names = [...template.matchAll(/\{\{\s*([^{}]*?)\s*\}\}/g)].map((m) => m[1]!);
  return [...new Set(names.filter((n) => !(PLAYBOOK_VARS as readonly string[]).includes(n)))];
}

export const candidateTrigger = (c: BriefCandidate) => (c.kind === 'move' ? c.moveType : c.changeType);

export function playbookVars(c: BriefCandidate): Record<string, string | undefined> {
  const events = c.kind === 'event' ? [c] : c.events;
  const price = events.flatMap((e) => e.facts).find((f) => f.kind === 'price' && f.after);
  const zips = [...new Set(events.flatMap((e) => e.zips))];
  return {
    competitor: c.competitorName,
    service: events.find((e) => e.serviceName)?.serviceName ?? undefined,
    new_price: price?.after?.raw,
    areas: zips.length > 0 ? zips.slice(0, 5).join(', ') : undefined,
    topic: events.map((e) => e.details.topicName ?? e.details.topic).find(Boolean),
  };
}

export async function resolveLegacyPlaybooks(db: Db, agencyId: string, pack: VerticalPack): Promise<Playbook[]> {
  const overrides = await db.select().from(playbookOverride).where(and(eq(playbookOverride.agencyId, agencyId), eq(playbookOverride.verticalId, pack.id)));
  return pack.playbooks.flatMap((p): Playbook[] => {
    const o = overrides.find((x) => x.playbookId === p.id);
    if (o?.disabledBy) return [];
    if (!o || (o.title === null && o.template === null)) return [{ ...p, source: 'pack' }];
    return [{ ...p, title: o.title ?? p.title, template: o.template ?? p.template, source: 'agency' }];
  });
}

/** The stored provenance of a play: its id and (runbook) version; a legacy play (version 0) has no version. */
export function playbookRef(playbooks: (Playbook & { version: number })[], c: BriefCandidate): { playbookId: string | null; playbookVersion: number | null } {
  const pb = playbookFor(playbooks, candidateTrigger(c));
  return { playbookId: pb?.id ?? null, playbookVersion: pb && pb.version > 0 ? pb.version : null };
}

export const playbookFor = <P extends Playbook>(playbooks: P[], trigger: string): P | undefined => playbooks.find((p) => p.trigger === trigger);

/** Spec §5.1/§8.5: agency roles edit the vertical playbooks for their agency (Phase 5 screen). */
export async function upsertPlaybookOverride(
  deps: { service: Db; app: Db },
  ctx: AccessContext,
  input: { verticalId: string; playbookId: string; title?: string | null; template?: string | null; disabled?: boolean },
  pack: VerticalPack,
): Promise<void> {
  if (!isAgencyRole(ctx.role)) throw new ToolError('permission_denied', 'Only agency roles may edit playbooks');
  if (pack.id !== input.verticalId) throw new Error(`pack ${pack.id} does not match vertical ${input.verticalId}`);
  if (!pack.playbooks.some((p) => p.id === input.playbookId)) throw new Error(`Unknown playbook ${input.playbookId}`);
  const template = input.template?.trim() || null;
  const title = input.title?.trim() || null;
  if (template && template.length > PLAYBOOK_TEMPLATE_MAX) throw new Error(`template must be at most ${PLAYBOOK_TEMPLATE_MAX} characters`);
  if (title && title.length > PLAYBOOK_TITLE_MAX) throw new Error(`title must be at most ${PLAYBOOK_TITLE_MAX} characters`);
  const values = { agencyId: ctx.agencyId, verticalId: input.verticalId, playbookId: input.playbookId, title, template, disabledBy: input.disabled ? ctx.userId : null, updatedBy: ctx.userId, updatedAt: new Date() };
  await deps.service
    .insert(playbookOverride)
    .values(values)
    .onConflictDoUpdate({ target: [playbookOverride.agencyId, playbookOverride.verticalId, playbookOverride.playbookId], set: { title, template, disabledBy: values.disabledBy, updatedBy: ctx.userId, updatedAt: values.updatedAt } });
}
