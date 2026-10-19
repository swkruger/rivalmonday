// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { clampView, MAP_ZOOM_MAX, MapZoom, zoomView } from './map-zoom';

const W = 500;
const H = 400;

describe('map zoom maths', () => {
  it('zoom is held between 1× and 2×', () => {
    expect(MAP_ZOOM_MAX).toBe(2);
    expect(zoomView({ k: 1, tx: 0, ty: 0 }, 10, W / 2, H / 2, W, H).k).toBe(2);
    expect(zoomView({ k: 1.5, tx: 0, ty: 0 }, 0.1, W / 2, H / 2, W, H)).toEqual({ k: 1, tx: 0, ty: 0 });
  });

  it('panning stops at the map edges', () => {
    expect(clampView({ k: 2, tx: 100, ty: 50 }, W, H)).toEqual({ k: 2, tx: 0, ty: 0 });
    expect(clampView({ k: 2, tx: -9999, ty: -9999 }, W, H)).toEqual({ k: 2, tx: -W, ty: -H });
    expect(clampView({ k: 1, tx: -10, ty: -10 }, W, H)).toEqual({ k: 1, tx: 0, ty: 0 });
  });

  it('zooming keeps the point under the cursor fixed', () => {
    const v = zoomView({ k: 1, tx: 0, ty: 0 }, 1.5, 200, 100, W, H);
    // Content point (200, 100) still lands on screen point (200, 100).
    expect(200 * v.k + v.tx).toBeCloseTo(200, 6);
    expect(100 * v.k + v.ty).toBeCloseTo(100, 6);
  });
});

describe('MapZoom', () => {
  const layer = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-map-zoom-layer]')!;

  it('zoom in steps to 1.5× then 2×, then zoom in is disabled; reset returns to 1×', () => {
    const { container } = render(<MapZoom><svg role="img" aria-label="grid" /></MapZoom>);
    const zin = screen.getByRole('button', { name: 'Zoom in' });
    const zout = screen.getByRole('button', { name: 'Zoom out' });
    const reset = screen.getByRole('button', { name: 'Reset zoom' });
    expect((zout as HTMLButtonElement).disabled).toBe(true);
    expect((reset as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(zin);
    expect(layer(container).style.transform).toContain('scale(1.5)');
    fireEvent.click(zin);
    expect(layer(container).style.transform).toContain('scale(2)');
    expect((zin as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(reset);
    expect(layer(container).style.transform).toContain('scale(1)');
  });

  it('the mouse wheel zooms only with Ctrl held', () => {
    const { container } = render(<MapZoom><svg role="img" aria-label="grid" /></MapZoom>);
    const box = container.querySelector<HTMLElement>('[data-map-zoom]')!;
    fireEvent.wheel(box, { deltaY: -100 });
    expect(layer(container).style.transform).toContain('scale(1)');
    fireEvent.wheel(box, { deltaY: -100, ctrlKey: true });
    expect(layer(container).style.transform).not.toContain('scale(1)');
  });

  it('renders its children', () => {
    render(<MapZoom><svg role="img" aria-label="grid" /></MapZoom>);
    expect(screen.getByRole('img', { name: 'grid' })).toBeTruthy();
  });
});
