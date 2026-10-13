import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { allTools } from './all';

/** Reviewed list of tools that mutate tenant/external state (support sessions refuse these). Additions must be reviewed. */
const WRITE_TOOLS = [
  'accept_competitor_suggestion', 'add_client_recipient', 'add_competitor', 'add_recommendation', 'add_tracked_page', 'add_webhook',
  'approve_alert', 'approve_brief', 'convert_prospect', 'create_api_token', 'create_client', 'deactivate_recipient',
  'decide_theme_proposal', 'delete_kb_article', 'delete_my_ask_thread', 'dismiss_alert', 'dismiss_competitor_suggestion',
  'drop_brief_item', 'edit_brief_item', 'import_kb_url', 'invite_member', 'rate_brief_item', 'remove_competitor',
  'reorder_brief_items', 'request_competitor_suggestions', 'resolve_decision_review', 'revoke_api_token', 'revoke_invitation',
  'revoke_membership', 'revoke_oauth_grant', 'run_prospect_snapshot', 'send_brief_now', 'set_alert_rules', 'set_brief_auto_send',
  'set_client_limits', 'set_kb_auto_sync', 'set_my_notification_pref', 'set_page_pin', 'set_webhook_active', 'submit_feedback',
  'update_agency_branding', 'update_client_delivery', 'update_client_profile', 'update_my_contact', 'update_playbook',
  'update_recommendation_status', 'upsert_kb_article',
].sort();

const ASK_THREAD_TOOLS = ['delete_my_ask_thread', 'get_ask_starters', 'get_my_ask_thread', 'list_my_ask_threads'];

/** Every key matching /email/i in a zod schema, as a support-mask path (`[]` for arrays). `stack` holds ancestors only, so a reused sub-schema is walked at each use. */
function emailPaths(schema: z.ZodType, prefix = '', stack: readonly unknown[] = []): string[] {
  if (stack.includes(schema)) return []; // recursive schema: stop at the cycle
  const next = [...stack, schema];
  const def = (schema as unknown as { def: Record<string, unknown> & { type: string } }).def;
  const walk = (s: unknown, p = prefix) => emailPaths(s as z.ZodType, p, next);
  switch (def.type) {
    case 'object': {
      const shape = (schema as z.ZodObject).shape as Record<string, z.ZodType>;
      return Object.entries(shape).flatMap(([k, v]) => [...(/email/i.test(k) ? [`${prefix}${k}`] : []), ...walk(v, `${prefix}${k}.`)]);
    }
    case 'array': return walk(def.element, `${prefix.replace(/\.$/, '')}[].`);
    case 'tuple': return (def.items as z.ZodType[]).flatMap((i) => walk(i, `${prefix.replace(/\.$/, '')}[].`));
    case 'record': return walk(def.valueType, `${prefix}*.`);
    case 'optional': case 'nullable': case 'default': case 'prefault': case 'readonly': case 'nonoptional': case 'catch':
      return walk(def.innerType);
    case 'union': return (def.options as z.ZodType[]).flatMap((o) => walk(o));
    case 'intersection': return [...walk(def.left), ...walk(def.right)];
    case 'lazy': return walk((def.getter as () => z.ZodType)());
    case 'pipe': return walk(def.in);
    case 'string': case 'number': case 'boolean': case 'enum': case 'literal': case 'null': case 'undefined': case 'date': case 'bigint':
    case 'any': case 'unknown': case 'never': case 'void': case 'nan': case 'symbol': case 'template_literal': case 'int':
      return [];
    default:
      throw new Error(`emailPaths: unhandled zod type '${def.type}' - teach the walker before it hides an email field`);
  }
}

describe('emailPaths walker', () => {
  it('finds nested, array and optional email keys', () => {
    const s = z.object({ a: z.string(), owner: z.object({ email: z.string() }), rows: z.array(z.object({ contactEmail: z.string().nullable() })), o: z.object({ recipientEmail: z.string() }).optional() });
    expect(emailPaths(s).sort()).toEqual(['o.recipientEmail', 'owner.email', 'rows[].contactEmail']);
  });

  it('reports every use of a reused sub-schema', () => {
    const Person = z.object({ email: z.string() });
    expect(emailPaths(z.object({ owner: Person, approver: Person })).sort()).toEqual(['approver.email', 'owner.email']);
  });

  it('walks records, tuples, intersections, lazy, catch and wrappers', () => {
    const P = z.object({ email: z.string() });
    expect(emailPaths(z.record(z.string(), P))).toEqual(['*.email']);
    expect(emailPaths(z.object({ t: z.tuple([P]), i: z.intersection(P, z.object({ x: z.string() })), l: z.lazy(() => P), c: P.catch({ email: '' }), n: P.nonoptional() })).sort())
      .toEqual(['c.email', 'i.email', 'l.email', 'n.email', 't[].email']);
  });

  it('fails loudly on an unknown container type', () => {
    expect(() => emailPaths(z.promise(z.string()))).toThrow(/unhandled zod type/);
  });
});

describe('tool access marks', () => {
  it('every tool declares access read|write', () => {
    for (const t of allTools) expect(['read', 'write'], t.name).toContain(t.access);
  });

  it('the write list is exactly the reviewed snapshot', () => {
    expect(allTools.filter((t) => t.access === 'write').map((t) => t.name).sort()).toEqual(WRITE_TOOLS);
  });

  it('the Ask-thread tools (and only those) are supportHidden', () => {
    expect(allTools.filter((t) => t.supportHidden).map((t) => t.name).sort()).toEqual(ASK_THREAD_TOOLS);
  });

  it('every output email field is declared in supportMask', () => {
    for (const t of allTools) {
      const paths = emailPaths(t.output);
      for (const p of paths) expect(t.supportMask ?? [], `${t.name} output ${p}`).toContain(p);
    }
  });
});
