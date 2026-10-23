import { ToolError, type ToolErrorCode } from '@cs/core';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** `checkRateLimit` refused: carries the seconds until the window resets. */
export class RateLimitedError extends ToolError {
  constructor(readonly retryAfterS: number) {
    super('rate_limited', `Too many requests. Try again in ${retryAfterS} seconds.`);
    this.name = 'RateLimitedError';
  }
}

/** The JSON-RPC error code of every refused `resources/read` (MCP "resource not found"). */
export const RESOURCE_ERROR_CODE = -32002;
const INTERNAL = 'Something went wrong. Try again later.';

interface Mapped { code: ToolErrorCode; message: string; retry_after_s?: number }

/**
 * Client-safe view of an error. 404-not-403: `permission_denied` reads as `not_found`. Anything unexpected is hidden
 * behind one message and logged as name/codes only (never the message, params or input).
 */
function mapError(e: unknown, what: string): Mapped {
  if (e instanceof ToolError) {
    // 9b R19: decided, user-facing copy passes through whatever the code.
    if (e.userFacing && e.code !== 'permission_denied') return { code: e.code, message: e.message };
    switch (e.code) {
      case 'not_found':
      case 'invalid_input':
      case 'quota_exceeded':
      case 'billing_seat_limit':
      case 'service_paused':
      case 'invalid_code':
      case 'billing_not_eligible':
      case 'connect_not_ready':
      case 'no_client_owner':
      case 'slug_taken':
      case 'spend_paused':
      case 'system_busy':
        return { code: e.code, message: e.message };
      case 'permission_denied':
        return { code: 'not_found', message: 'Not found' };
      case 'rate_limited': {
        const n = e instanceof RateLimitedError ? e.retryAfterS : 60;
        return { code: 'rate_limited', message: `Too many requests. Try again in ${n} seconds.`, retry_after_s: n };
      }
      case 'internal':
        break;
    }
  }
  // eslint-disable-next-line no-console -- operators need to see the failure; the client only sees INTERNAL
  console.error(`[mcp] ${what} failed`, logFields(e));
  return { code: 'internal', message: INTERNAL };
}

const PG_CODE = /^[0-9A-Z]{5}$/;

/**
 * What an internal failure logs: the original error's name, the ToolError code and the Postgres SQLSTATE found along the
 * cause chain. Never a message, `detail`, params or the cause object: Drizzle puts query params (user input) in them.
 */
function logFields(e: unknown): { error: string; code?: ToolErrorCode; pgCode?: string } {
  const tool = e instanceof ToolError ? e : null;
  const original = tool?.cause ?? e;
  const out: { error: string; code?: ToolErrorCode; pgCode?: string } = {
    error: original instanceof Error ? original.name : typeof original,
  };
  if (tool) out.code = tool.code;
  let cur: unknown = original;
  for (let depth = 0; depth < 5 && cur && typeof cur === 'object'; depth++) {
    const code = (cur as { code?: unknown }).code;
    if (!(cur instanceof ToolError) && typeof code === 'string' && PG_CODE.test(code)) {
      out.pgCode = code;
      break;
    }
    cur = (cur as { cause?: unknown }).cause;
  }
  return out;
}

export function toToolResult(e: unknown, toolName: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: JSON.stringify(mapError(e, `tool ${toolName}`)) }] };
}

/**
 * The error a resource read callback throws: the SDK sends `code`, `message` and `data` verbatim as the JSON-RPC error
 * (an `McpError` would prefix its message with "MCP error -32002: ").
 */
export class ResourceError extends Error {
  readonly code = RESOURCE_ERROR_CODE;
  constructor(message: string, readonly data?: { retry_after_s: number }) {
    super(message);
    this.name = 'ResourceError';
  }
}

export function toResourceError(e: unknown, resource: string): ResourceError {
  const m = mapError(e, `resource ${resource}`);
  return new ResourceError(m.message, m.retry_after_s !== undefined ? { retry_after_s: m.retry_after_s } : undefined);
}
