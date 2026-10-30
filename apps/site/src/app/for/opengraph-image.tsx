import { PAGES } from '../../../content/pages';
import { effectiveTitle } from '../../lib/metadata';
import { OG_SIZE, renderOg } from '../../lib/og';

const page = PAGES.find((p) => p.path === '/for')!;

export const alt = 'Rival Monday — Industries';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
  return renderOg({ eyebrow: 'Industries', title: effectiveTitle(page) });
}
