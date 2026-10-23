import type { CallMeta } from '@cs/core';
import { describe, expect, it } from 'vitest';
import { detailOf, encodeCursor, pageOf, pageResult, prevCursorOf } from './paging';

const web: CallMeta = { channel: 'web', tokenId: null };
const mcp: CallMeta = { channel: 'mcp', tokenId: 'pat-1' };

describe('paging', () => {
  it('cursor round-trips', () => {
    const cursor = encodeCursor(40);
    expect(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))).toEqual({ o: 40 });
    expect(pageOf({ cursor, limit: 10 }, mcp, 300)).toEqual({ offset: 40, limit: 10 });
  });

  it('garbage cursor is invalid_input', () => {
    for (const cursor of ['%%%', Buffer.from('{"o":-1}').toString('base64url'), Buffer.from('{"o":"x"}').toString('base64url'), Buffer.from('nope').toString('base64url')]) {
      expect(() => pageOf({ cursor }, mcp, 20), cursor).toThrowError(expect.objectContaining({ code: 'invalid_input', message: 'Invalid cursor' }));
    }
  });

  it('mcp limit capped at 50, default 20', () => {
    expect(pageOf({}, mcp, 300)).toEqual({ offset: 0, limit: 20 });
    expect(pageOf({ limit: 100 }, mcp, 300).limit).toBe(50);
    expect(pageOf({ limit: 7 }, mcp, 300).limit).toBe(7);
  });

  it('web keeps legacy default', () => {
    expect(pageOf({}, web, 300)).toEqual({ offset: 0, limit: 300 });
    expect(pageOf({ limit: 100 }, web, 300).limit).toBe(100);
  });

  it('detail defaults by channel', () => {
    expect(detailOf({}, web)).toBe('full');
    expect(detailOf({}, mcp)).toBe('summary');
    expect(detailOf({ detail: 'full' }, mcp)).toBe('full');
    expect(detailOf({ detail: 'summary' }, web)).toBe('summary');
  });

  it('pageResult trims the look-ahead row and sets nextCursor', () => {
    const more = pageResult([1, 2, 3], 2, 10);
    expect(more).toEqual({ rows: [1, 2], nextCursor: encodeCursor(12), hasMore: true });
    expect(pageResult([1, 2], 2, 10)).toEqual({ rows: [1, 2], nextCursor: null, hasMore: false });
  });

  it('prevCursorOf(0)=null, prevCursorOf(50,50)=cursor(0), clamps at 0', () => {
    expect(prevCursorOf(0, 50)).toBeNull();
    expect(prevCursorOf(50, 50)).toBe(encodeCursor(0));
    expect(prevCursorOf(30, 50)).toBe(encodeCursor(0));
    expect(prevCursorOf(100, 50)).toBe(encodeCursor(50));
  });
});
