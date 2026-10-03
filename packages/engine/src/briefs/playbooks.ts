import { type AccessContext, isAgencyRole, ToolError } from '@cs/core';
import { type Db, playbookOverride } from '@cs/db';
import type { VerticalPack } from '@cs/verticals';
import { and, eq } from 'drizzle-orm';
import type { BriefCandidate } from './gather';

export const PLAYBOOK_TEMPLATE_MAX = 2000;

export interface Playbook {
  id: string;
  trigger: string;
  title: string;
  template: string;
  source: 'pack' | 'agency';
}

const FALLBACK: Record<string, string> = {
  competitor: 'the competitor', service: 'this service', new_price: 'a lower price', areas: 'new areas', theme: 'this topic',
};

export function renderPlaybook(template: string, vars: Record<string, string | undefined>): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, k: string) => vars[k]?.trim() || FALLBACK[k] || 'this');
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
    theme: events.find((e) => e.details.themeName)?.details.themeName,
  };
}

export async function resolvePlaybooks(db: Db, agencyId: string, pack: VerticalPack): Promise<Playbook[]> {
  const overrides = await db.select().from(playbookOverride).where(and(eq(playbookOverride.agencyId, agencyId), eq(playbookOverride.verticalId, pack.id)));
  return pack.playbooks.flatMap((p): Playbook[] => {
    const o = overrides.find((x) => x.playbookId === p.id);
    if (o?.disabledBy) return [];
    if (!o || (o.title === null && o.template === null)) return [{ ...p, source: 'pack' }];
    return [{ id: p.id, trigger: p.trigger, title: o.title ?? p.title, template: o.template ?? p.template, source: 'agency' }];
  });
}

export const playbookFor = (playbooks: Playbook[], trigger: string) => playbooks.find((p) => p.trigger === trigger);

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
  if (title && title.length > 200) throw new Error('title must be at most 200 characters');
  const values = { agencyId: ctx.agencyId, verticalId: input.verticalId, playbookId: input.playbookId, title, template, disabledBy: input.disabled ? ctx.userId : null, updatedBy: ctx.userId, updatedAt: new Date() };
  await deps.service
    .insert(playbookOverride)
    .values(values)
    .onConflictDoUpdate({ target: [playbookOverride.agencyId, playbookOverride.verticalId, playbookOverride.playbookId], set: { title, template, disabledBy: values.disabledBy, updatedBy: ctx.userId, updatedAt: values.updatedAt } });
}
