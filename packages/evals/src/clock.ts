/**
 * Process-wide clock pin (R14 revised): replaces `globalThis.Date` so `new Date()` / `Date.now()` start at `iso` and
 * advance with real elapsed time (deadlines keep working); dates built from arguments are untouched, timers and
 * promises are not faked. Returns the uninstall function; always call it (in a `finally`) so the pin does not leak into
 * the next suite of the same run. The real clock is whatever `Date` is at install time.
 */
export function pinClock(iso: string): () => void {
  const target = Date.parse(iso);
  if (Number.isNaN(target)) throw new Error(`pinClock: invalid instant ${iso}`);
  const Real = globalThis.Date;
  const offset = target - Real.now();
  const now = () => Real.now() + offset;
  const Pinned: DateConstructor = new Proxy(Real, {
    construct(t, args, newTarget): object {
      return Reflect.construct(t, args.length === 0 ? [now()] : args, newTarget === Pinned ? t : newTarget);
    },
    apply() {
      return new Real(now()).toString();
    },
    get(t, p, r) {
      if (p === 'now') return now;
      return Reflect.get(t, p, r);
    },
  });
  globalThis.Date = Pinned;
  return () => {
    globalThis.Date = Real;
  };
}
