declare global { interface Window { turnstile?: { render(el: HTMLElement, o: Record<string, unknown>): string; reset(id: string): void; remove(id: string): void } } }
export const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<void> | null = null;
/** Loads the script once (explicit rendering, P8). Rejects after 10 s so the form can say "unavailable". */
export function loadTurnstile(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('ssr'));
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = TURNSTILE_SRC; s.async = true; s.defer = true;
    const t = setTimeout(() => { loading = null; reject(new Error('timeout')); }, 10_000);
    s.onload = () => { clearTimeout(t); resolve(); };
    s.onerror = () => { clearTimeout(t); loading = null; s.remove(); reject(new Error('load')); };
    document.head.appendChild(s);
  });
  return loading;
}
