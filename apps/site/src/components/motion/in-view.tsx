'use client';

import { useMediaQuery } from '@cs/ui';
import { useEffect, useRef, useState } from 'react';

/** True once the element has scrolled into view (never false again). Without IntersectionObserver it is true at once. */
export function useInView<T extends Element>(threshold = 0.25) {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setSeen(true);
        io.disconnect();
      }
    }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [seen, threshold]);
  return [ref, seen] as const;
}

/** Fades and lifts its children in on first view (`.reveal` in site.css; no motion under reduced motion or without JS). */
export function Reveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const [ref, seen] = useInView<HTMLDivElement>(0.12);
  return (
    <div ref={ref} data-shown={seen ? '' : undefined} className={`reveal ${className ?? ''}`} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </div>
  );
}

/** Counts from 0 to `target` over `ms` once `active`; reduced motion (or a server render) shows the target. */
export function useCountUp(target: number, active: boolean, ms = 900) {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)') === true;
  const [value, setValue] = useState(target);
  useEffect(() => {
    if (!active || reduced) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setValue(target * (1 - (1 - t) ** 3));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    setValue(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, reduced, target, ms]);
  return value;
}
