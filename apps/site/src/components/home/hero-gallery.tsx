'use client';

import { useMediaQuery } from '@cs/ui';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { GALLERY, type GallerySlide, type GallerySlideId } from '../../../content/gallery';

const SIZES = '(min-width: 1024px) 50vw, 100vw';
const PRELOAD_LEAD_MS = 1500;
const SHOT = 'rounded-frame shadow-frame ring-1 ring-surface/15';
const CONTROL = 'inline-flex min-h-11 items-center rounded-md px-3 text-13 font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-9';
const srcSet = (s: GallerySlide) => `${s.srcSmall} 720w, ${s.src} 1440w`;

/**
 * The agency hero's product gallery: five pictures, one at a time. It plays one round (every picture once, ending
 * where it began), then rests for good; a tab choice, Pause, a hold or a load error stops it. Never plays under
 * reduced motion. The opening picture is in the server markup (it is the page's LCP picture).
 */
export function HeroGallery({ start = 'dashboard' }: { start?: GallerySlideId }) {
  const slides = GALLERY.slides;
  const startAt = Math.max(0, slides.findIndex((s) => s.id === start));
  const order = [...slides.slice(startAt), ...slides.slice(0, startAt)];
  const nextOf = (id: GallerySlideId) => order[(order.findIndex((s) => s.id === id) + 1) % order.length]!;

  const uid = useId();
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [current, setCurrent] = useState<GallerySlideId>(order[0]!.id);
  const [mode, setMode] = useState<'playing' | 'stopped'>('stopped');
  const [left, setLeft] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [touched, setTouched] = useState(false);
  const [hold, setHold] = useState({ hover: false, focus: false, hidden: false });
  const held = hold.hover || hold.focus || hold.hidden;
  const imgRef = useRef<HTMLImageElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const began = useRef(false);

  const slide = slides.find((s) => s.id === current)!;
  const show = (id: GallerySlideId) => {
    setTouched(true);
    setCurrent(id);
  };

  // The opening picture may have finished before hydration, so `onLoad` never fires.
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) setLoaded(true);
  }, []);

  // The one automatic round, once per mount, after the opening picture is in.
  useEffect(() => {
    if (reduced === true) {
      setMode('stopped');
      return;
    }
    if (reduced === false && loaded && !began.current) {
      began.current = true;
      setLeft(slides.length);
      setMode('playing');
    }
  }, [reduced, loaded, slides.length]);

  useEffect(() => {
    const onChange = () => setHold((h) => ({ ...h, hidden: document.hidden }));
    onChange();
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  // One dwell: preload the next picture shortly before it is due, advance once it is in.
  useEffect(() => {
    if (mode !== 'playing' || held) return;
    const next = nextOf(current);
    let ready = false;
    let due = false;
    let img: HTMLImageElement | null = null;
    const advance = () => {
      show(next.id);
      setLeft(left - 1);
      if (left <= 1) setMode('stopped');
    };
    const preload = setTimeout(() => {
      img = new Image();
      img.onload = () => {
        ready = true;
        if (due) advance();
      };
      img.onerror = () => setMode('stopped');
      img.sizes = SIZES;
      img.srcset = srcSet(next);
      img.src = next.src;
    }, GALLERY.dwellMs - PRELOAD_LEAD_MS);
    const dwell = setTimeout(() => {
      due = true;
      if (ready) advance();
    }, GALLERY.dwellMs);
    return () => {
      clearTimeout(preload);
      clearTimeout(dwell);
      if (img) {
        img.onload = null;
        img.onerror = null;
      }
    };
    // `nextOf` and `show` only read `order`/`current`, which are covered by `start` and `current`.
  }, [mode, held, current, left, start]);

  const choose = (id: GallerySlideId) => {
    show(id);
    setMode('stopped');
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const at = slides.findIndex((s) => s.id === current);
    const to = e.key === 'ArrowRight' ? (at + 1) % slides.length : e.key === 'ArrowLeft' ? (at - 1 + slides.length) % slides.length : e.key === 'Home' ? 0 : e.key === 'End' ? slides.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    tabRefs.current[to]?.focus();
    choose(slides[to]!.id);
  };

  return (
    <div
      ref={rootRef}
      data-slot="hero-gallery"
      className="mx-auto max-w-2xl"
      onMouseEnter={() => setHold((h) => ({ ...h, hover: true }))}
      onMouseLeave={() => setHold((h) => ({ ...h, hover: false }))}
      onFocus={() => setHold((h) => ({ ...h, focus: true }))}
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget)) setHold((h) => ({ ...h, focus: false }));
      }}
    >
      <div role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-tab-${current}`} className="aspect-[16/10]">
        <img
          key={slide.id}
          ref={imgRef}
          src={slide.src}
          srcSet={srcSet(slide)}
          sizes={SIZES}
          alt={slide.alt}
          width={slide.width}
          height={slide.height}
          loading="eager"
          fetchPriority={slide.id === start ? 'high' : undefined}
          decoding="async"
          onLoad={() => setLoaded(true)}
          className={`${SHOT} ${touched ? 'reveal-quick ' : ''}size-full`}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div role="tablist" aria-label={GALLERY.tablist} onKeyDown={onKeyDown} className="flex flex-wrap gap-1">
          {slides.map((s, i) => (
            <button
              key={s.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${uid}-tab-${s.id}`}
              aria-selected={s.id === current}
              aria-controls={`${uid}-panel`}
              tabIndex={s.id === current ? 0 : -1}
              onClick={() => choose(s.id)}
              className={`${CONTROL} ${s.id === current ? 'bg-surface/15 text-surface' : 'text-muted-surface hover:text-surface'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        {reduced === false && loaded ? (
          <button
            type="button"
            onClick={() => {
              if (mode === 'playing') {
                setMode('stopped');
              } else {
                setLeft(slides.length);
                setMode('playing');
              }
            }}
            className={`${CONTROL} border border-surface/30 text-surface hover:bg-surface/10`}
          >
            {mode === 'playing' ? GALLERY.pause : GALLERY.play}
          </button>
        ) : null}
      </div>
      <p className="mt-3 text-13 text-muted-surface">{GALLERY.caption}</p>
    </div>
  );
}
