import { createHash } from 'node:crypto';
import { z } from 'zod';
import { type AccessContext, type Feature, type Permission, type Role, hasPermission, isAgencyRole } from './access';

export type ToolErrorCode = 'not_found' | 'permission_denied' | 'invalid_input' | 'rate_limited' | 'quota_exceeded' | 'internal';

export class ToolError extends Error {
  readonly code: ToolErrorCode;
  constructor(code: ToolErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ToolError';
    this.code = code;
  }
}

export interface ToolDefinition<I extends z.ZodType, O extends z.ZodType, D> {
  name: string;
  description: string;
  input: I;
  output: O;
  permission: Permission;
  feature?: Feature;
  handler: (ctx: AccessContext, input: z.output<I>, deps: D) => Promise<z.input<O>>;
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
  role: Role;
  tool: string;
  inputHash: string;
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

function isAllowed<D>(ctx: AccessContext, tool: AnyTool<D>): boolean {
  if (!hasPermission(ctx, tool.permission)) return false;
  if (tool.feature && !isAgencyRole(ctx.role) && !ctx.features.has(tool.feature)) return false;
  return true;
}

function hashInput(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
}

function countRows(data: unknown): number | null {
  if (data && typeof data === 'object' && 'items' in data && Array.isArray((data as { items: unknown }).items)) {
    return (data as { items: unknown[] }).items.length;
  }
  return null;
}

export class ToolRegistry<D> {
  private readonly tools = new Map<string, AnyTool<D>>();

  constructor(
    private readonly deps: D,
    private readonly audit: AuditSink,
    private readonly now: () => number = Date.now,
  ) {}

  register(...defs: AnyTool<D>[]): this {
    for (const def of defs) {
      if (!TOOL_NAME.test(def.name)) throw new Error(`Invalid tool name: ${def.name}`);
      if (this.tools.has(def.name)) throw new Error(`Duplicate tool: ${def.name}`);
      this.tools.set(def.name, def);
    }
    return this;
  }

  list(ctx: AccessContext): AnyTool<D>[] {
    return [...this.tools.values()].filter((t) => isAllowed(ctx, t));
  }

  describe(ctx: AccessContext): ToolDescription[] {
    return this.list(ctx).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: z.toJSONSchema(t.input) as Record<string, unknown>,
    }));
  }

  async invoke(ctx: AccessContext, name: string, rawInput: unknown): Promise<unknown> {
    const started = this.now();
    let outcome: AuditEvent['outcome'] = 'internal';
    let rowCount: number | null = null;
    let inputHash = hashInput(rawInput);
    try {
      const tool = this.tools.get(name);
      if (!tool) throw new ToolError('not_found', `Unknown tool: ${name}`);
      if (!isAllowed(ctx, tool)) throw new ToolError('permission_denied', `Not permitted: ${name}`);

      const parsed = tool.input.safeParse(rawInput);
      if (!parsed.success) throw new ToolError('invalid_input', z.prettifyError(parsed.error));
      inputHash = hashInput(parsed.data);

      let raw: unknown;
      try {
        raw = await tool.handler(ctx, parsed.data, this.deps);
      } catch (err) {
        if (err instanceof ToolError) throw err;
        throw new ToolError('internal', `Tool ${name} failed`, { cause: err });
      }

      const out = tool.output.safeParse(raw);
      if (!out.success) throw new ToolError('internal', `Tool ${name} returned invalid output`, { cause: out.error });

      rowCount = countRows(out.data);
      outcome = 'ok';
      return out.data;
    } catch (err) {
      if (err instanceof ToolError) outcome = err.code;
      throw err;
    } finally {
      await this.audit.record({
        agencyId: ctx.agencyId,
        userId: ctx.userId,
        role: ctx.role,
        tool: name,
        inputHash,
        outcome,
        rowCount,
        durationMs: this.now() - started,
      });
    }
  }
}
