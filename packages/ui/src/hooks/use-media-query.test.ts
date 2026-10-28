// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useMediaQuery } from './use-media-query';

type Listener = (e: { matches: boolean }) => void;
function stub(initial: boolean) {
  const listeners = new Set<Listener>();
  window.matchMedia = ((q: string) => ({
    matches: initial, media: q,
    addEventListener: (_: string, l: Listener) => listeners.add(l),
    removeEventListener: (_: string, l: Listener) => listeners.delete(l),
  })) as unknown as typeof window.matchMedia;
  return (matches: boolean) => act(() => listeners.forEach((l) => l({ matches })));
}

afterEach(() => { // @ts-expect-error reset the stub
  delete window.matchMedia;
});

describe('useMediaQuery', () => {
  it('returns null on the first render, then the match', () => {
    stub(true);
    const seen: Array<boolean | null> = [];
    renderHook(() => { const v = useMediaQuery('(min-width: 768px)'); seen.push(v); return v; });
    expect(seen[0]).toBeNull();
    expect(seen.at(-1)).toBe(true);
  });
  it('updates on change events', () => {
    const fire = stub(false);
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(false);
    fire(true);
    expect(result.current).toBe(true);
  });
  it('stays null without matchMedia', () => {
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBeNull();
  });
});
