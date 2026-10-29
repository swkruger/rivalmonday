'use client';

import { useEffect, useRef } from 'react';
import { loadTurnstile } from '../../lib/turnstile';

/** Sent when no site key is configured (P8); the live route then fails closed with `check`. */
export const NO_WIDGET_TOKEN = 'no-widget';

/**
 * Cloudflare Turnstile, explicit rendering (P8). Tokens are single-use: the parent bumps `resetKey` after every
 * attempt, which resets the widget and clears the token. `onUnavailable` fires when the script cannot load or `render` throws.
 */
export function TurnstileWidget({ siteKey, onToken, resetKey, onUnavailable }: {
  siteKey: string | null;
  onToken: (token: string | null) => void;
  resetKey: number;
  onUnavailable?: () => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  // Latest callbacks without re-rendering the widget when the parent re-renders.
  const cb = useRef({ onToken, onUnavailable });
  useEffect(() => {
    cb.current = { onToken, onUnavailable };
  });

  useEffect(() => {
    if (!siteKey) {
      cb.current.onToken(NO_WIDGET_TOKEN);
      return;
    }
    let cancelled = false;
    loadTurnstile().then(
      () => {
        if (cancelled || !el.current || !window.turnstile) return;
        try {
          widgetId.current = window.turnstile.render(el.current, {
            sitekey: siteKey,
            action: 'waitlist',
            appearance: 'interaction-only',
            callback: (token: string) => cb.current.onToken(token),
            'expired-callback': () => cb.current.onToken(null),
            'error-callback': () => cb.current.onToken(null),
          });
        } catch {
          // A bad site key or a broken script throws here: treat it like a failed load.
          cb.current.onUnavailable?.();
        }
      },
      () => {
        if (!cancelled) cb.current.onUnavailable?.();
      },
    );
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
      cb.current.onToken(null);
    };
  }, [siteKey]);

  const lastReset = useRef(resetKey);
  useEffect(() => {
    if (lastReset.current === resetKey) return;
    lastReset.current = resetKey;
    if (!siteKey) {
      cb.current.onToken(NO_WIDGET_TOKEN);
      return;
    }
    if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
    cb.current.onToken(null);
  }, [resetKey, siteKey]);

  if (!siteKey) return null;
  return <div ref={el} />;
}
