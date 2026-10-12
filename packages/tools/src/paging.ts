import { type CallMeta, ToolError } from '@cs/core';

/** P12: an opaque cursor is base64url `{"o":offset}`; paging is offset-based over a stable ORDER BY (ties broken by id). */
export const MCP_DEFAULT_LIMIT = 20;
export const MCP_MAX_LIMIT = 50;

export function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset })).toString('base64url');
}

function decodeCursor(cursor: string): number {
  try {
    const v = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { o?: unknown };
    if (typeof v?.o === 'number' && Number.isInteger(v.o) && v.o >= 0 && v.o <= 1_000_000) return v.o;
  } catch {
    // fall through
  }
  throw new ToolError('invalid_input', 'Invalid cursor');
}

/** Off-web: limit defaults to 20, max 50. Web keeps the tool's legacy default (`webDefault`) and its own explicit limit. */
export function pageOf(input: { cursor?: string; limit?: number }, meta: CallMeta, webDefault: number): { offset: number; limit: number } {
  const offset = input.cursor ? decodeCursor(input.cursor) : 0;
  if (meta.channel === 'web') return { offset, limit: input.limit ?? webDefault };
  return { offset, limit: Math.min(input.limit ?? MCP_DEFAULT_LIMIT, MCP_MAX_LIMIT) };
}

export function detailOf(input: { detail?: 'summary' | 'full' }, meta: CallMeta): 'summary' | 'full' {
  return input.detail ?? (meta.channel === 'web' ? 'full' : 'summary');
}

/** Trims the `limit + 1` look-ahead row off `rows` (fetched at `offset`). */
export function pageResult<T>(rows: T[], limit: number, offset: number): { rows: T[]; nextCursor: string | null; hasMore: boolean } {
  const hasMore = rows.length > limit;
  return { rows: hasMore ? rows.slice(0, limit) : rows, nextCursor: hasMore ? encodeCursor(offset + limit) : null, hasMore };
}
