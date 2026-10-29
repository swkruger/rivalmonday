import { enabledRivals } from '../../../../content/compare';
import { PAGES } from '../../../../content/pages';
import { effectiveTitle } from '../../../lib/metadata';
import { OG_SIZE, renderOg } from '../../../lib/og';

export const dynamicParams = false;
export const generateStaticParams = () => enabledRivals().map((r) => ({ rival: r.slug }));

export const alt = 'Rival Monday — Compare';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ rival: string }> }) {
  const { rival } = await params;
  const page = PAGES.find((p) => p.path === `/compare/${rival}`)!;
  return renderOg({ eyebrow: 'Compare', title: effectiveTitle(page) });
}
