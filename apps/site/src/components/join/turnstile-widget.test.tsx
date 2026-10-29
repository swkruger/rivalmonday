import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TURNSTILE_SRC } from '../../lib/turnstile';
import { TurnstileWidget } from './turnstile-widget';

type RenderOpts = Record<string, (t?: string) => void> & { sitekey?: string; action?: string };

function stubTurnstile() {
  const api = {
    render: vi.fn((_el: HTMLElement, _o: Record<string, unknown>) => 'w1'),
    reset: vi.fn(),
    remove: vi.fn(),
  };
  window.turnstile = api;
  return api;
}
const optsOf = (api: ReturnType<typeof stubTurnstile>) => api.render.mock.calls[0]![1] as RenderOpts;

beforeEach(() => {
  delete window.turnstile;
});
afterEach(() => {
  cleanup();
  delete window.turnstile;
  vi.useRealTimers();
  document.head.querySelectorAll('script').forEach((s) => s.remove());
});

describe('TurnstileWidget', () => {
  it('renders explicitly with the site key and action', async () => {
    const api = stubTurnstile();
    const onToken = vi.fn();
    const { container } = render(<TurnstileWidget siteKey="site-key" onToken={onToken} resetKey={0} />);
    await act(async () => {});
    expect(api.render).toHaveBeenCalledOnce();
    expect(api.render.mock.calls[0]![0]).toBe(container.firstChild);
    const o = optsOf(api);
    expect(o.sitekey).toBe('site-key');
    expect(o.action).toBe('waitlist');
    expect(o.appearance).toBe('interaction-only');
    act(() => o.callback!('tok-1'));
    expect(onToken).toHaveBeenLastCalledWith('tok-1');
  });

  it('token null on expiry', async () => {
    const api = stubTurnstile();
    const onToken = vi.fn();
    render(<TurnstileWidget siteKey="k" onToken={onToken} resetKey={0} />);
    await act(async () => {});
    act(() => optsOf(api).callback!('tok-1'));
    act(() => optsOf(api)['expired-callback']!());
    expect(onToken).toHaveBeenLastCalledWith(null);
    act(() => optsOf(api).callback!('tok-2'));
    act(() => optsOf(api)['error-callback']!());
    expect(onToken).toHaveBeenLastCalledWith(null);
  });

  it('reset on resetKey change', async () => {
    const api = stubTurnstile();
    const onToken = vi.fn();
    const { rerender } = render(<TurnstileWidget siteKey="k" onToken={onToken} resetKey={0} />);
    await act(async () => {});
    expect(api.reset).not.toHaveBeenCalled();
    act(() => optsOf(api).callback!('tok-1'));
    rerender(<TurnstileWidget siteKey="k" onToken={onToken} resetKey={1} />);
    expect(api.reset).toHaveBeenCalledWith('w1');
    expect(onToken).toHaveBeenLastCalledWith(null);
    expect(api.render).toHaveBeenCalledOnce();
  });

  it('removes on unmount', async () => {
    const api = stubTurnstile();
    const onToken = vi.fn();
    const { unmount } = render(<TurnstileWidget siteKey="k" onToken={onToken} resetKey={0} />);
    await act(async () => {});
    unmount();
    expect(api.remove).toHaveBeenCalledWith('w1');
    expect(onToken).toHaveBeenLastCalledWith(null);
  });

  it('script load failure → onUnavailable, no token', async () => {
    const onToken = vi.fn();
    const onUnavailable = vi.fn();
    render(<TurnstileWidget siteKey="k" onToken={onToken} resetKey={0} onUnavailable={onUnavailable} />);
    const s = document.head.querySelector(`script[src="${TURNSTILE_SRC}"]`) as HTMLScriptElement;
    await act(async () => s.onerror!(new Event('error')));
    expect(onUnavailable).toHaveBeenCalledOnce();
    expect(onToken).not.toHaveBeenCalledWith(expect.any(String));
  });

  it('a throwing turnstile.render → onUnavailable, no token', async () => {
    const api = stubTurnstile();
    api.render.mockImplementation(() => { throw new Error('bad sitekey'); });
    const onToken = vi.fn();
    const onUnavailable = vi.fn();
    render(<TurnstileWidget siteKey="k" onToken={onToken} resetKey={0} onUnavailable={onUnavailable} />);
    await act(async () => {});
    expect(onUnavailable).toHaveBeenCalledOnce();
    expect(onToken).not.toHaveBeenCalledWith(expect.any(String));
  });

  it('no key → renders nothing', async () => {
    const api = stubTurnstile();
    const onToken = vi.fn();
    const { container, rerender } = render(<TurnstileWidget siteKey={null} onToken={onToken} resetKey={0} />);
    await act(async () => {});
    expect(container.innerHTML).toBe('');
    expect(api.render).not.toHaveBeenCalled();
    expect(onToken).toHaveBeenLastCalledWith('no-widget');
    rerender(<TurnstileWidget siteKey={null} onToken={onToken} resetKey={1} />);
    expect(onToken).toHaveBeenLastCalledWith('no-widget');
    expect(document.head.querySelector(`script[src="${TURNSTILE_SRC}"]`)).toBeNull();
  });
});

describe('loadTurnstile', () => {
  async function freshLoader() {
    vi.resetModules();
    return (await import('../../lib/turnstile')).loadTurnstile;
  }
  const scripts = () => document.head.querySelectorAll(`script[src="${TURNSTILE_SRC}"]`);

  it('loadTurnstile appends the script once for concurrent calls', async () => {
    const loadTurnstile = await freshLoader();
    const a = loadTurnstile();
    const b = loadTurnstile();
    expect(a).toBe(b);
    expect(scripts()).toHaveLength(1);
    const s = scripts()[0] as HTMLScriptElement;
    expect(s.async).toBe(true);
    s.onload!(new Event('load'));
    await expect(a).resolves.toBeUndefined();
  });

  it('loadTurnstile retries after a load error or timeout', async () => {
    vi.useFakeTimers();
    const loadTurnstile = await freshLoader();
    const first = loadTurnstile();
    (scripts()[0] as HTMLScriptElement).onerror!(new Event('error'));
    await expect(first).rejects.toThrow('load');
    expect(scripts()).toHaveLength(0);

    const second = loadTurnstile();
    expect(second).not.toBe(first);
    expect(scripts()).toHaveLength(1);
    const rejected = expect(second).rejects.toThrow('timeout');
    vi.advanceTimersByTime(10_000);
    await rejected;

    // A timed-out script tag is removed too, so a retry never stacks a second one.
    expect(scripts()).toHaveLength(0);
    const third = loadTurnstile();
    expect(third).not.toBe(second);
    expect(scripts()).toHaveLength(1);
  });
});
