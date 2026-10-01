import type { Browser } from 'playwright';
import { describe, expect, it } from 'vitest';
import { createBrowserCache } from './renderer';

/**
 * createBrowserCache holds the one chromium instance the single worker reuses across
 * renders. A dead browser cached forever would stall/poison every subsequent capture, so
 * this is tested at the unit level against a fake launcher/Browser rather than by actually
 * crashing a real chromium process (hard to do cleanly and deterministically).
 */
function fakeBrowser(connected: { value: boolean }): { browser: Browser; disconnect: () => void } {
  let disconnectListener: (() => void) | undefined;
  const browser = {
    isConnected: () => connected.value,
    on: (event: string, listener: () => void) => {
      if (event === 'disconnected') disconnectListener = listener;
      return browser;
    },
    close: async () => {
      connected.value = false;
    },
  } as unknown as Browser;
  return { browser, disconnect: () => { connected.value = false; disconnectListener?.(); } };
}

describe('createBrowserCache', () => {
  it('reuses a connected browser across gets', async () => {
    let launches = 0;
    const { browser } = fakeBrowser({ value: true });
    const cache = createBrowserCache(async () => { launches++; return browser; });

    const a = await cache.get();
    const b = await cache.get();
    expect(a).toBe(browser);
    expect(b).toBe(browser);
    expect(launches).toBe(1);
  });

  it('relaunches when the cached browser has disconnected (crash) without close() being called', async () => {
    let launches = 0;
    const state = { value: true };
    const { browser: first, disconnect } = fakeBrowser(state);
    const second = fakeBrowser({ value: true }).browser;
    const cache = createBrowserCache(async () => {
      launches++;
      return launches === 1 ? first : second;
    });

    const a = await cache.get();
    expect(a).toBe(first);

    disconnect(); // simulates the browser process dying underneath us

    const b = await cache.get();
    expect(b).toBe(second);
    expect(launches).toBe(2);
  });

  it('relaunches when get() finds a stale cached browser via isConnected(), even without a disconnected event', async () => {
    let launches = 0;
    const state = { value: true };
    const { browser: first } = fakeBrowser(state);
    const second = fakeBrowser({ value: true }).browser;
    const cache = createBrowserCache(async () => {
      launches++;
      return launches === 1 ? first : second;
    });

    await cache.get();
    state.value = false; // died without ever firing 'disconnected'

    const b = await cache.get();
    expect(b).toBe(second);
    expect(launches).toBe(2);
  });

  it('close() tears down the cached browser and clears the cache', async () => {
    const state = { value: true };
    const { browser } = fakeBrowser(state);
    let closed = false;
    const closing = { ...browser, close: async () => { closed = true; state.value = false; } } as unknown as Browser;
    const cache = createBrowserCache(async () => closing);

    await cache.get();
    await cache.close();
    expect(closed).toBe(true);
  });
});
