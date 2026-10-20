import { describe, expect, it } from 'vitest';
import { requestIdFrom } from './request-id';

describe('requestIdFrom', () => {
  it('prefers x-vercel-id', () => {
    expect(requestIdFrom(new Headers({ 'x-vercel-id': 'iad1::abc-123' }))).toBe('iad1::abc-123');
  });
  it('falls back to a uuid', () => {
    expect(requestIdFrom(new Headers())).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
