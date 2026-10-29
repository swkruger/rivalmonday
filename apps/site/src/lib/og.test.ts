// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { OG_SIZE, renderOg } from './og';

describe('renderOg', () => {
  it('renderOg returns an image/png response with a body', async () => {
    const res = await renderOg({ eyebrow: 'How it works', title: 'How it works · Rival Monday' });
    expect(res.headers.get('content-type')).toBe('image/png');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(bytes.byteLength).toBeLessThan(500 * 1024);
    // PNG signature
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(OG_SIZE).toEqual({ width: 1200, height: 630 });
  });
});
