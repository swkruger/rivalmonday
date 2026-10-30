import { GUIDES } from '../../../../content/guides';
import { OG_SIZE, renderOg } from '../../../lib/og';

export const dynamicParams = false;
export const generateStaticParams = () => GUIDES.map((g) => ({ guide: g.slug }));

export const alt = 'Rival Monday — Guides';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ guide: string }> }) {
  const { guide } = await params;
  const g = GUIDES.find((x) => x.slug === guide)!;
  return renderOg({ eyebrow: 'Guide', title: g.h1 });
}
