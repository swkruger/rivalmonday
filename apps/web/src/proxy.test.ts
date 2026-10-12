import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxy } from './proxy';

const run = (p: string, init?: ConstructorParameters<typeof NextRequest>[1]) => proxy(new NextRequest(`https://app.example${p}`, init));

describe('proxy', () => {
  it('lets /api/ask/* through without cookies (the route answers 404 itself)', () => {
    const res = run('/api/ask/turn', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('still redirects other cookie-less paths to sign-in', () => {
    for (const p of ['/api/askx', '/c/x/ask', '/api/other']) expect(run(p).headers.get('location'), p).toContain('/sign-in');
  });
});
