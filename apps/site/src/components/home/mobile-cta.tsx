'use client';

import { useEffect, useState } from 'react';
import { HERO } from '../../../content/home';
import { JoinButton } from '../join/join-button';
import { usePilot } from '../shell/pilot-context';

/**
 * Phones only: once the hero's own button has scrolled away, a thumb-height bar keeps the one primary action in reach.
 * It steps aside while the closing CTA band (`#join`) is on screen, so the page never shows two at once.
 */
export function MobileCta() {
  const { pilotMode } = usePilot();
  const [show, setShow] = useState(false);
  useEffect(() => {
    const join = document.getElementById('join');
    let past = false;
    let atJoin = false;
    const update = () => setShow(past && !atJoin);
    const onScroll = () => {
      past = window.scrollY > 640;
      update();
    };
    const io = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([e]) => {
      atJoin = !!e?.isIntersecting;
      update();
    });
    if (join && io) io.observe(join);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      io?.disconnect();
    };
  }, []);
  return (
    <div
      data-slot="mobile-cta"
      aria-hidden={!show}
      inert={!show}
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur transition-transform duration-300 md:hidden ${show ? 'translate-y-0' : 'translate-y-full'}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-13 text-ink-secondary">{(pilotMode ? HERO.finePrint : HERO.finePrintTrial).split(' · ')[0]}</p>
        <JoinButton>{HERO.primaryCta}</JoinButton>
      </div>
    </div>
  );
}
