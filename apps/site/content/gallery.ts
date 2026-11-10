export type GallerySlideId = 'dashboard' | 'brief' | 'map' | 'ads' | 'friday';
export interface GallerySlide { id: GallerySlideId; label: string; alt: string; src: string; srcSmall: string; width: 1440; height: 900 }

const file = (id: GallerySlideId, small: boolean) => `/sample/gallery-${id}${small ? '-' + 720 : ''}.webp`;
const slide = (id: GallerySlideId, label: string, alt: string): GallerySlide => ({ id, label, alt, src: file(id, false), srcSmall: file(id, true), width: 1440, height: 900 });

export const GALLERY: { slides: readonly GallerySlide[]; dwellMs: 6000; caption: string; tablist: string; pause: string; play: string } = {
  slides: [
    slide('dashboard', 'Dashboard', 'The client dashboard for a sample heating and air business: the week in four numbers and a short summary of what its rivals did'),
    slide('brief', 'Monday brief', 'The Monday brief email for a sample heating and air business: the rival moves of the week, numbered, each with a recommended next step'),
    slide('map', 'Map rankings', 'Map rankings for "ac repair marlowemere": a grid of ranks over the service area, strongest around the business'),
    slide('ads', 'Ads', 'The ads page for a sample heating and air business: which rivals are advertising, and the ads they are running'),
    slide('friday', 'Friday', 'Friday, the assistant, answering who is winning the map, with numbered sources for each figure'),
  ],
  dwellMs: 6000,
  caption: 'Sample data from a fictional business.',
  tablist: 'Product screenshots',
  pause: 'Pause',
  play: 'Play',
};
