import { HERO } from '../../content/home';
import { PAGES } from '../../content/pages';
import { effectiveTitle } from '../lib/metadata';
import { OG_SIZE, renderOg } from '../lib/og';

// Root image. /privacy and /terms re-use it through their own thin image files: a page's `openGraph`
// metadata replaces the inherited one, so a parent image would not reach them.
const page = PAGES.find((p) => p.path === '/')!;

export const alt = 'Rival Monday';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
  return renderOg({ eyebrow: HERO.eyebrow, title: effectiveTitle(page) });
}
