import { createHash } from 'node:crypto';
import { z } from 'zod';
import { type TokenScope, scopeCovers } from './tokens';
import { maskSupportFields } from './mask';
import { type AccessContext, type Feature, type Permission, type Role, hasPermission, isAgencyRole } from './access';

export type ToolErrorCode = 'not_found' | 'permission_denied' | 'invalid_input' | 'rate_limited' | 'quota_exceeded' | 'read_only_session' | 'conflict' | 'billing_seat_limit' | 'service_paused' | 'invalid_code' | 'billing_not_eligible' | 'connect_not_ready' | 'no_client_owner' | 'slug_taken' | 'internal';

export class ToolError extends Error {
  readonly code: ToolErrorCode;
  /**
   * 9b R19: the message is decided, user-facing copy. The web form mapping (`toFormResult`) and MCP (`mapError`) show it
   * as is, whatever the code (a `conflict` keeps it instead of the generic concurrency copy; an `internal` renders inline).
   * Never set it on a message that can carry internal detail.
   */
  readonly userFacing: boolean;
  constructor(code: ToolErrorCode, message: string, options?: { cause?: unknown; userFacing?: boolean }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ToolError';
    this.code = code;
    this.userFacing = options?.userFacing === true;
  }
}

export type ToolChannel = 'web' | 'mcp' | 'ask';
export interface CallOptions { channel: ToolChannel; tokenId?: string; tokenScope?: TokenScope }
export interface CallMeta { channel: ToolChannel; tokenId: string | null }

export interface ToolDefinition<I extends z.ZodType, O extends z.ZodType, D> {
  name: string;
  description: string;
  input: I;
  output: O;
  permission: Permission;
  /** 'write' = inserts/updates/deletes tenant or external state (incl. hidden side effects); refused in read-only support sessions. */
  access: 'read' | 'write';
  /** Dot-paths of email fields in the output, masked under a support context (see mask.ts). */
  supportMask?: readonly string[];
  /** Not offered in support sessions (the registry hides it). */
  supportHidden?: true;
  feature?: Feature;
  /** Channels this tool is exposed on; default web only. */
  channels?: readonly ToolChannel[];
  /** 'skip-web' = no audit row for web calls (other channels always audit). */
  audit?: 'always' | 'skip-web';
  /** Minimum MCP token scope; default derived from `permission` (see mcpScopeOf). */
  mcpScope?: TokenScope;
  handler: (ctx: AccessContext, input: z.output<I>, deps: D, meta: CallMeta) => Promise<z.input<O>>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- registry stores heterogeneous tool shapes
type AnyTool<D> = ToolDefinition<any, any, D>;

export function toolkit<D>() {
  return {
    defineTool<I extends z.ZodType, O extends z.ZodType>(def: ToolDefinition<I, O, D>): ToolDefinition<I, O, D> {
      return def;
    },
  };
}

export interface AuditEvent {
  agencyId: string;
  userId: string;
  /** `'platform_support'` for calls inside a read-only support session (Phase 8b). */
  role: Role | 'platform_support';
  tool: string;
  inputHash: string;
  channel: ToolChannel;
  tokenId: string | null;
  /** Phase 8b: the support session id for calls inside one, else null. */
  supportSessionId?: string | null;
  outcome: 'ok' | ToolErrorCode;
  rowCount: number | null;
  durationMs: number;
}

export interface AuditSink {
  record(event: AuditEvent): Promise<void>;
}

export interface ToolDescription {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const TOOL_NAME = /^[a-z][a-z0-9_]{1,63}$/;

export function mcpScopeOf(tool: { permission: Permission; mcpScope?: TokenScope }): TokenScope {
  if (tool.mcpScope) return tool.mcpScope;
  if (tool.permission === 'manage' || tool.permission === 'feedback') return tool.permission;
  return 'read'; // read and agency → read
}

/** Spec 8b g10 copy for a write attempted inside a read-only support session. */
export const READ_ONLY_SESSION_MESSAGE = 'Read-only support session — changes are disabled.';

const CHANNEL_FEATURE: Partial<Record<ToolChannel, Feature>> = { mcp: 'mcp', ask: 'ask' };
function isVisible<D>(ctx: AccessContext, tool: AnyTool<D>, opts: CallOptions): boolean {
  // Phase 8b: a support session is web-only and never sees `supportHidden` tools (Ask threads).
  if (ctx.support && (opts.channel !== 'web' || tool.supportHidden)) return false;
  if (!(tool.channels ?? ['web']).includes(opts.channel)) return false;
  if (!hasPermission(ctx, tool.permission)) return false;
  const agency = isAgencyRole(ctx.role);
  if (tool.feature && !agency && !ctx.features.has(tool.feature)) return false;
  const chf = CHANNEL_FEATURE[opts.channel];
  if (chf && !agency && !ctx.features.has(chf)) return false;
  if (opts.channel === 'mcp' && !opts.tokenScope) return false; // P4: fail closed
  if (opts.tokenScope && !scopeCovers(opts.tokenScope, mcpScopeOf(tool))) return false;
  return true;
}

const WEB: CallOptions = { channel: 'web' };

/** Audit input hash: sha256 of `JSON.stringify(value ?? null)` (registry `audit_log` rows and platform audit rows). */
export function hashInput(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
}

export function countRows(data: unknown): number | null {
  if (Array.isArray(data)) return data.length;
  if (data && typeof data === 'object') {
    for (const key of ['items', 'results'] as const) {
      const v = (data as Record<string, unknown>)[key];
      if (Array.isArray(v)) return v.length;
    }
  }
  return null;
}

/** Registry-level hook run for write tools only (after visibility checks, before input parsing and the handler). Throw a `ToolError` to refuse. */
export type WriteGuard = (ctx: AccessContext, tool: { name: string; access: 'read' | 'write' }) => Promise<void>;
export interface ToolRegistryOptions { writeGuard?: WriteGuard }

export class ToolRegistry<D> {
  private readonly tools = new Map<string, AnyTool<D>>();

  constructor(
    private readonly deps: D,
    private readonly audit: AuditSink,
    private readonly now: () => number = Date.now,
    private readonly options: ToolRegistryOptions = {},
  ) {}

  register(...defs: AnyTool<D>[]): this {
    for (const def of defs) {
      if (!TOOL_NAME.test(def.name)) throw new Error(`Invalid tool name: ${def.name}`);
      if (this.tools.has(def.name)) throw new Error(`Duplicate tool: ${def.name}`);
      this.tools.set(def.name, def);
    }
    return this;
  }

  list(ctx: AccessContext, opts: CallOptions = WEB): AnyTool<D>[] {
    return [...this.tools.values()].filter((t) => isVisible(ctx, t, opts));
  }

  describe(ctx: AccessContext, opts: CallOptions = WEB): ToolDescription[] {
    return this.list(ctx, opts).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: z.toJSONSchema(t.input, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>,
    }));
  }

  async invoke(ctx: AccessContext, name: string, rawInput: unknown, opts: CallOptions = WEB): Promise<unknown> {
    const started = this.now();
    let outcome: AuditEvent['outcome'] = 'internal';
    let rowCount: number | null = null;
    let inputHash = 'unhashable';
    let failure: unknown;
    const tool = this.tools.get(name);
    try {
      try {
        inputHash = hashInput(rawInput);
      } catch (err) {
        throw new ToolError('invalid_input', 'Input is not serialisable', { cause: err });
      }

      if (!tool) throw new ToolError('not_found', `Unknown tool: ${name}`);
      if (ctx.support && opts.channel !== 'web') {
        throw new ToolError('permission_denied', 'Support sessions are web-only');
      }
      if (!isVisible(ctx, tool, opts)) {
        // P3: identical error to unknown (404-not-403); the audit row keeps permission_denied.
        outcome = 'permission_denied';
        throw new ToolError('not_found', `Unknown tool: ${name}`);
      }
      // Phase 8b: refuse writes before parsing so nothing (not even input validation) runs.
      if (ctx.support && tool.access === 'write') throw new ToolError('read_only_session', READ_ONLY_SESSION_MESSAGE);
      if (tool.access === 'write' && this.options.writeGuard) await this.options.writeGuard(ctx, tool);

      const parsed = tool.input.safeParse(rawInput);
      if (!parsed.success) throw new ToolError('invalid_input', z.prettifyError(parsed.error));
      inputHash = hashInput(parsed.data);

      let raw: unknown;
      try {
        raw = await tool.handler(ctx, parsed.data, this.deps, { channel: opts.channel, tokenId: opts.tokenId ?? null });
      } catch (err) {
        if (err instanceof ToolError) throw err;
        throw new ToolError('internal', `Tool ${name} failed`, { cause: err });
      }

      const out = tool.output.safeParse(raw);
      if (!out.success) throw new ToolError('internal', `Tool ${name} returned invalid output`, { cause: out.error });

      rowCount = countRows(out.data);
      outcome = 'ok';
      return ctx.support ? maskSupportFields(out.data, tool.supportMask ?? []) : out.data;
    } catch (err) {
      failure = err;
      if (outcome !== 'permission_denied' && err instanceof ToolError) outcome = err.code;
      else if (outcome !== 'permission_denied') outcome = 'internal';
      throw err;
    } finally {
      // Phase 8b: every call inside a support session is audited, skip-web included.
      if (!(tool?.audit === 'skip-web' && opts.channel === 'web' && !ctx.support)) try {
        await this.audit.record({
          agencyId: ctx.agencyId,
          userId: ctx.support ? ctx.support.platformUserId : ctx.userId,
          role: ctx.support ? 'platform_support' : ctx.role,
          tool: name,
          inputHash,
          channel: opts.channel,
          tokenId: opts.tokenId ?? null,
          supportSessionId: ctx.support?.sessionId ?? null,
          outcome,
          rowCount,
          durationMs: this.now() - started,
        });
      } catch (err) {
        if (failure !== undefined) {
          // eslint-disable-next-line no-console -- the original tool error must not be lost behind the audit failure
          console.error('[tools] tool error before audit failure', failure);
        }
        // eslint-disable-next-line no-console -- audit failures must be visible even though we fail closed below
        console.error('[tools] audit write failed', err);
        throw new ToolError('internal', 'Audit logging failed', { cause: err });
      }
    }
  }
}
