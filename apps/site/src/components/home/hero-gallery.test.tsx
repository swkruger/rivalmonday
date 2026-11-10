import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GALLERY, type GallerySlideId } from '../../../content/gallery';
import { HeroGallery } from './hero-gallery';

/** `Image` stand-in: preloads stay pending until the test settles them. */
class FakeImage {
  static instances: FakeImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = '';
  srcset = '';
  sizes = '';
  constructor() {
    FakeImage.instances.push(this);
  }
}

const alt = (id: GallerySlideId) => GALLERY.slides.find((s) => s.id === id)!.alt;
const shownAlt = () => screen.getByRole('img').getAttribute('alt');
const tabs = () => screen.getAllByRole('tab');

let mediaListeners: ((e: { matches: boolean }) => void)[] = [];
function stubMedia(reduce: boolean) {
  mediaListeners = [];
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => void mediaListeners.push(fn),
    removeEventListener: (_: string, fn: (e: { matches: boolean }) => void) => void (mediaListeners = mediaListeners.filter((l) => l !== fn)),
  }));
}

/** The opening picture finishes loading, which starts the round. */
function openingLoaded() {
  fireEvent.load(screen.getByRole('img'));
}

/** Pending (handler still attached) preloads. */
const pending = () => FakeImage.instances.filter((i) => i.onload || i.onerror);
function settle(kind: 'load' | 'error') {
  const img = pending().at(-1)!;
  act(() => (kind === 'load' ? img.onload!() : img.onerror!()));
}
const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

/** One full dwell: the preload starts 1,500 ms early, loads, then the advance fires on time. */
function step() {
  tick(GALLERY.dwellMs - 1500);
  settle('load');
  tick(1500);
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  act(() => void document.dispatchEvent(new Event('visibilitychange')));
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeImage.instances = [];
  vi.stubGlobal('Image', FakeImage);
  stubMedia(false);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'hidden');
});

describe('HeroGallery', () => {
  it('opens on start and renders one picture', () => {
    render(<HeroGallery start="brief" />);
    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(shownAlt()).toBe(alt('brief'));
    const img = screen.getByRole('img');
    expect(img.getAttribute('loading')).toBe('eager');
    expect(img.getAttribute('fetchpriority')).toBe('high');
    expect(img.getAttribute('srcset')).toContain('720w');
    expect(tabs().map((t) => t.textContent)).toEqual(GALLERY.slides.map((s) => s.label));
    expect(screen.getByRole('tablist', { name: GALLERY.tablist })).toBeTruthy();
    expect(screen.getByRole('tab', { selected: true }).textContent).toBe('Monday brief');
  });

  it('rotates the playing order so start comes first', () => {
    render(<HeroGallery start="friday" />);
    openingLoaded();
    step();
    expect(shownAlt()).toBe(alt('dashboard'));
  });

  it('plays once through the other four and rests on start', () => {
    render(<HeroGallery />);
    expect(screen.queryByRole('button', { name: GALLERY.pause })).toBeNull();
    openingLoaded();
    expect(screen.getByRole('button', { name: GALLERY.pause })).toBeTruthy();
    for (const id of ['brief', 'map', 'ads', 'friday', 'dashboard'] as const) {
      step();
      expect(shownAlt()).toBe(alt(id));
    }
    expect(screen.getByRole('button', { name: GALLERY.play })).toBeTruthy();
    tick(60_000);
    expect(shownAlt()).toBe(alt('dashboard'));
    expect(pending()).toHaveLength(0);
  });

  it('choosing a tab stops it for good', () => {
    render(<HeroGallery />);
    openingLoaded();
    tick(2000);
    fireEvent.click(screen.getByRole('tab', { name: 'Ads' }));
    expect(shownAlt()).toBe(alt('ads'));
    expect(screen.getByRole('tab', { selected: true }).textContent).toBe('Ads');
    tick(GALLERY.dwellMs * 7);
    expect(shownAlt()).toBe(alt('ads'));
    expect(screen.getByRole('button', { name: GALLERY.play })).toBeTruthy();
  });

  it('hover and focus hold the round; leaving resumes with a full dwell', () => {
    const { container } = render(<HeroGallery />);
    const root = container.firstElementChild!;
    openingLoaded();
    tick(3000);
    fireEvent.mouseEnter(root);
    tick(60_000);
    expect(shownAlt()).toBe(alt('dashboard'));
    fireEvent.mouseLeave(root);
    tick(GALLERY.dwellMs - 1500);
    settle('load');
    tick(1499);
    expect(shownAlt()).toBe(alt('dashboard'));
    tick(1);
    expect(shownAlt()).toBe(alt('brief'));

    // focus inside holds too, and release restarts the dwell
    const pause = screen.getByRole('button', { name: GALLERY.pause });
    act(() => pause.focus());
    tick(60_000);
    expect(shownAlt()).toBe(alt('brief'));
    act(() => pause.blur());
    step();
    expect(shownAlt()).toBe(alt('map'));
  });

  it('Pause stops; Play runs one more round from the current picture', () => {
    render(<HeroGallery />);
    openingLoaded();
    step();
    expect(shownAlt()).toBe(alt('brief'));
    fireEvent.click(screen.getByRole('button', { name: GALLERY.pause }));
    tick(60_000);
    expect(shownAlt()).toBe(alt('brief'));
    fireEvent.click(screen.getByRole('button', { name: GALLERY.play }));
    for (const id of ['map', 'ads', 'friday', 'dashboard', 'brief'] as const) {
      step();
      expect(shownAlt()).toBe(alt(id));
    }
    tick(60_000);
    expect(shownAlt()).toBe(alt('brief'));
    expect(screen.getByRole('button', { name: GALLERY.play })).toBeTruthy();
  });

  it('Play pressed under the pointer and with focus still starts the round', () => {
    const { container } = render(<HeroGallery />);
    const root = container.firstElementChild!;
    openingLoaded();
    fireEvent.click(screen.getByRole('button', { name: GALLERY.pause }));
    fireEvent.mouseEnter(root);
    const play = screen.getByRole('button', { name: GALLERY.play });
    act(() => play.focus());
    fireEvent.click(play);
    expect(screen.getByRole('button', { name: GALLERY.pause })).toBeTruthy();
    step();
    expect(shownAlt()).toBe(alt('brief'));
    // the pointer hold re-arms on the next enter
    fireEvent.mouseLeave(root);
    fireEvent.mouseEnter(root);
    tick(60_000);
    expect(shownAlt()).toBe(alt('brief'));
  });

  it('Play pressed while the tab is hidden waits until it is visible again', () => {
    render(<HeroGallery />);
    openingLoaded();
    fireEvent.click(screen.getByRole('button', { name: GALLERY.pause }));
    setHidden(true);
    fireEvent.click(screen.getByRole('button', { name: GALLERY.play }));
    tick(60_000);
    expect(shownAlt()).toBe(alt('dashboard'));
    setHidden(false);
    step();
    expect(shownAlt()).toBe(alt('brief'));
  });

  it('the swap fades with gallery-fade only, never on the opening picture', () => {
    render(<HeroGallery />);
    openingLoaded();
    expect(screen.getByRole('img').className).not.toMatch(/gallery-fade|reveal-quick/);
    step();
    const cls = screen.getByRole('img').className;
    expect(cls).toContain('gallery-fade');
    expect(cls).not.toContain('reveal-quick');
  });

  it('reduced motion at mount stays still when the setting later changes', () => {
    stubMedia(true);
    render(<HeroGallery />);
    openingLoaded();
    act(() => mediaListeners.forEach((l) => l({ matches: false })));
    openingLoaded();
    tick(60_000);
    expect(pending()).toHaveLength(0);
    expect(FakeImage.instances).toHaveLength(0);
    expect(shownAlt()).toBe(alt('dashboard'));
    expect(screen.queryByRole('button', { name: GALLERY.pause })).toBeNull();
  });

  it('a preload that settles after a tab choice changes nothing', () => {
    render(<HeroGallery />);
    openingLoaded();
    tick(GALLERY.dwellMs - 1500);
    const stale = pending().at(-1)!;
    fireEvent.click(screen.getByRole('tab', { name: 'Ads' }));
    act(() => stale.onload?.());
    tick(60_000);
    expect(shownAlt()).toBe(alt('ads'));
  });

  it('reduced motion: never plays, no button, tabs work', () => {
    stubMedia(true);
    render(<HeroGallery />);
    openingLoaded();
    tick(60_000);
    expect(shownAlt()).toBe(alt('dashboard'));
    expect(screen.queryByRole('button')).toBeNull();
    expect(FakeImage.instances).toHaveLength(0);
    fireEvent.click(screen.getByRole('tab', { name: 'Friday' }));
    expect(shownAlt()).toBe(alt('friday'));
  });

  it('arrow keys move between tabs and wrap; Home and End jump', () => {
    stubMedia(true);
    render(<HeroGallery />);
    const key = (k: string) => fireEvent.keyDown(document.activeElement ?? tabs()[0]!, { key: k });
    act(() => tabs()[0]!.focus());
    key('ArrowLeft');
    expect(shownAlt()).toBe(alt('friday'));
    expect(document.activeElement).toBe(tabs()[4]);
    key('ArrowRight');
    expect(shownAlt()).toBe(alt('dashboard'));
    key('End');
    expect(shownAlt()).toBe(alt('friday'));
    key('Home');
    expect(shownAlt()).toBe(alt('dashboard'));
    expect(document.activeElement).toBe(tabs()[0]);
    expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1, -1, -1, -1]);
  });

  it('labels the picture box as the tabpanel of the selected tab', () => {
    render(<HeroGallery start="map" />);
    const panel = screen.getByRole('tabpanel');
    const selected = screen.getByRole('tab', { selected: true });
    expect(panel.getAttribute('aria-labelledby')).toBe(selected.id);
    expect(selected.getAttribute('aria-controls')).toBe(panel.id);
    expect(document.querySelector('[aria-live]')).toBeNull();
    expect(screen.getByText(GALLERY.caption)).toBeTruthy();
  });

  it('a hidden tab holds the round', () => {
    render(<HeroGallery />);
    openingLoaded();
    tick(3000);
    setHidden(true);
    tick(60_000);
    expect(shownAlt()).toBe(alt('dashboard'));
    setHidden(false);
    step();
    expect(shownAlt()).toBe(alt('brief'));
  });

  it('a picture that fails to load ends the round on the current one', () => {
    render(<HeroGallery />);
    openingLoaded();
    tick(GALLERY.dwellMs - 1500);
    settle('error');
    tick(60_000);
    expect(shownAlt()).toBe(alt('dashboard'));
    expect(screen.getByRole('button', { name: GALLERY.play })).toBeTruthy();
  });

  it('waits for a slow picture, then advances as soon as it has loaded', () => {
    render(<HeroGallery />);
    openingLoaded();
    tick(GALLERY.dwellMs + 3000);
    expect(shownAlt()).toBe(alt('dashboard'));
    settle('load');
    expect(shownAlt()).toBe(alt('brief'));
  });

  it('starts when the opening picture was already loaded before hydration', () => {
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(1440);
    render(<HeroGallery />);
    expect(screen.getByRole('button', { name: GALLERY.pause })).toBeTruthy();
  });

  it('unmount clears timers', () => {
    const { unmount } = render(<HeroGallery />);
    openingLoaded();
    tick(GALLERY.dwellMs - 1500);
    expect(pending()).toHaveLength(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(pending()).toHaveLength(0);
  });
});
