'use client';

import { Minus, Plus, RotateCcw } from 'lucide-react';
import { type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useRef, useState } from 'react';

/** Scale `k` and offset (`tx`, `ty`, CSS px) of the zoomed layer; screen = content × k + t. */
export interface MapView { k: number; tx: number; ty: number }

/** The stored map is a @2x image, so it stays sharp up to 2×. */
export const MAP_ZOOM_MAX = 2;
const STEP = 1.5;
const IDENTITY: MapView = { k: 1, tx: 0, ty: 0 };

/** Holds zoom to 1–2× and the offset so the layer always covers its `w` × `h` box (panning stops at the edges). */
export function clampView(v: MapView, w: number, h: number): MapView {
  const k = Math.min(MAP_ZOOM_MAX, Math.max(1, v.k));
  const clamp = (t: number, size: number) => Math.min(0, Math.max((1 - k) * size, t));
  return { k, tx: clamp(v.tx, w), ty: clamp(v.ty, h) };
}

/** Zooms by `factor` about box point (`cx`, `cy`), keeping the content under it in place. */
export function zoomView(v: MapView, factor: number, cx: number, cy: number, w: number, h: number): MapView {
  const k = Math.min(MAP_ZOOM_MAX, Math.max(1, v.k * factor));
  const r = k / v.k;
  return clampView({ k, tx: cx - (cx - v.tx) * r, ty: cy - (cy - v.ty) * r }, w, h);
}

const btn = 'flex size-7 items-center justify-center rounded-md border border-border bg-white text-ink shadow-sm hover:bg-muted disabled:cursor-default disabled:opacity-40';

/**
 * Phase 13b polish: zoom and pan for a map-backed grid. +/− and reset buttons, drag to pan once zoomed, pinch on touch,
 * and the mouse wheel only with Ctrl held (trackpad pinch sends Ctrl+wheel), so page scrolling never gets stuck here.
 */
export function MapZoom({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<MapView>(IDENTITY);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ view: MapView; x: number; y: number; dist: number } | null>(null);

  const size = () => {
    const r = box.current?.getBoundingClientRect();
    return { w: r?.width ?? 0, h: r?.height ?? 0, left: r?.left ?? 0, top: r?.top ?? 0 };
  };

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const { w, h, left, top } = size();
      const factor = Math.exp(-Math.max(-50, Math.min(50, e.deltaY)) * 0.01);
      setView((v) => zoomView(v, factor, e.clientX - left, e.clientY - top, w, h));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  /** Starts a pan (one pointer) or pinch (two) from the current pointers and view. */
  const begin = (v: MapView) => {
    const pts = [...pointers.current.values()];
    if (pts.length === 0) { gesture.current = null; return; }
    const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const dist = pts.length > 1 ? Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y) : 0;
    gesture.current = { view: v, x, y, dist };
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const { left, top } = size();
    pointers.current.set(e.pointerId, { x: e.clientX - left, y: e.clientY - top });
    if (pointers.current.size > 1 || view.k > 1) e.currentTarget.setPointerCapture?.(e.pointerId);
    begin(view);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    const { w, h, left, top } = size();
    pointers.current.set(e.pointerId, { x: e.clientX - left, y: e.clientY - top });
    const pts = [...pointers.current.values()];
    const g = gesture.current;
    const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    if (pts.length > 1 && g.dist > 0) {
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      const zoomed = zoomView(g.view, dist / g.dist, g.x, g.y, w, h);
      setView(clampView({ ...zoomed, tx: zoomed.tx + x - g.x, ty: zoomed.ty + y - g.y }, w, h));
    } else if (g.view.k > 1) {
      setView(clampView({ ...g.view, tx: g.view.tx + x - g.x, ty: g.view.ty + y - g.y }, w, h));
    }
  };
  const onPointerEnd = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId);
    begin(view);
  };

  const step = (factor: number) => {
    const { w, h } = size();
    setView((v) => zoomView(v, factor, w / 2, h / 2, w, h));
  };

  const zoomed = view.k > 1;
  return (
    <div
      ref={box}
      data-map-zoom
      className={`relative overflow-hidden rounded-md ${zoomed ? 'cursor-grab active:cursor-grabbing' : ''}`}
      style={{ touchAction: zoomed ? 'none' : 'pan-y' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <div data-map-zoom-layer style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.k})`, transformOrigin: '0 0' }}>
        {children}
      </div>
      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <button type="button" className={btn} aria-label="Zoom in" title="Zoom in" disabled={view.k >= MAP_ZOOM_MAX} onClick={() => step(STEP)}>
          <Plus className="size-4" aria-hidden />
        </button>
        <button type="button" className={btn} aria-label="Zoom out" title="Zoom out" disabled={!zoomed} onClick={() => step(1 / STEP)}>
          <Minus className="size-4" aria-hidden />
        </button>
        <button type="button" className={btn} aria-label="Reset zoom" title="Reset zoom" disabled={!zoomed} onClick={() => setView(IDENTITY)}>
          <RotateCcw className="size-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
