import { type AccessContext, toolkit, ToolError } from '@cs/core';
import { playbookOverride, withTenant } from '@cs/db';
import { PLAYBOOK_TEMPLATE_MAX, PLAYBOOK_TITLE_MAX, PLAYBOOK_VARS, unknownPlaybookVars, upsertPlaybookOverride } from '@cs/engine';
import { listVerticalPacks, type VerticalPack } from '@cs/verticals';
import { z } from 'zod';
import { packsOf, type ToolDeps } from '../deps';
import { PlaybookVertical, PlaybookView } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
type Override = typeof playbookOverride.$inferSelect;

function view(p: VerticalPack['playbooks'][number], o: Override | undefined): z.input<typeof PlaybookView> {
  return {
    id: p.id, trigger: p.trigger, packTitle: p.title, packTemplate: p.template.trim(), title: o?.title ?? p.title, template: (o?.template ?? p.template).trim(),
    overridden: Boolean(o && (o.title !== null || o.template !== null)), disabled: Boolean(o?.disabledBy), updatedAt: o ? o.updatedAt.toISOString() : null,
  };
}

const overridesFor = (deps: ToolDeps, ctx: AccessContext): Promise<Override[]> => withTenant(deps.app, ctx, (tx) => tx.select().from(playbookOverride));

export const listPlaybooks = defineTool({
  name: 'list_playbooks',
  description: 'The response playbooks for each business type, with this agency’s edits.',
  input: z.object({}),
  output: z.object({ verticals: z.array(PlaybookVertical), vars: z.array(z.string()) }),
  permission: 'agency',
  async handler(ctx, _input, deps) {
    const overrides = await overridesFor(deps, ctx);
    const packs = await Promise.all((await listVerticalPacks()).map((id) => packsOf(deps)(id)));
    return {
      verticals: packs.map((pack) => ({
        id: pack.id, name: pack.name,
        playbooks: pack.playbooks.map((p) => view(p, overrides.find((o) => o.verticalId === pack.id && o.playbookId === p.id))),
      })),
      vars: [...PLAYBOOK_VARS],
    };
  },
});

export const updatePlaybook = defineTool({
  name: 'update_playbook',
  description: 'Edit, disable or reset one playbook for this agency (agency admins). Blank title/template = use the standard text.',
  input: z.object({
    verticalId: z.string().max(40), playbookId: z.string().max(80), title: z.string().max(1000).nullable(), template: z.string().max(10000).nullable(), disabled: z.boolean(),
  }),
  output: PlaybookView,
  permission: 'agency',
  async handler(ctx, input, deps) {
    if (ctx.role !== 'agency_admin') throw new ToolError('permission_denied', 'Only agency admins edit playbooks');
    if (!(await listVerticalPacks()).includes(input.verticalId)) throw new ToolError('invalid_input', `Unknown business type: ${input.verticalId}`);
    const pack = await packsOf(deps)(input.verticalId);
    const p = pack.playbooks.find((x) => x.id === input.playbookId);
    if (!p) throw new ToolError('invalid_input', `Unknown playbook: ${input.playbookId}`);
    const title = input.title?.trim() || null;
    const template = input.template?.trim() || null;
    if (title && title.length > PLAYBOOK_TITLE_MAX) throw new ToolError('invalid_input', `The title must be at most ${PLAYBOOK_TITLE_MAX} characters`);
    if (template && template.length > PLAYBOOK_TEMPLATE_MAX) throw new ToolError('invalid_input', `The template must be at most ${PLAYBOOK_TEMPLATE_MAX} characters`);
    const unknown = template ? unknownPlaybookVars(template) : [];
    if (unknown.length) {
      throw new ToolError('invalid_input', `Unknown placeholder ${unknown.map((u) => `{{${u}}}`).join(', ')} — use ${PLAYBOOK_VARS.map((v) => `{{${v}}}`).join(', ')}`);
    }
    // Text equal to the pack's is not an override: storing it would freeze today's pack text against future pack updates.
    await upsertPlaybookOverride(deps, ctx, {
      verticalId: pack.id, playbookId: p.id, title: title === p.title ? null : title, template: template === p.template.trim() ? null : template, disabled: input.disabled,
    }, pack);
    const o = (await overridesFor(deps, ctx)).find((x) => x.verticalId === pack.id && x.playbookId === p.id);
    return view(p, o);
  },
});

export const playbookTools = [listPlaybooks, updatePlaybook];
