import { PAGES } from '../../../../content/pages';
import { SOURCES } from '../../../../content/sources';
import { effectiveTitle } from '../../../lib/metadata';
import { OG_SIZE, renderOg } from '../../../lib/og';

export const dynamicParams = false;
export const generateStaticParams = () => SOURCES.map((s) => ({ source: s.slug }));

export const alt = 'Rival Monday — Sources';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ source: string }> }) {
  const { source } = await params;
  const page = PAGES.find((p) => p.path === `/sources/${source}`)!;
  return renderOg({ eyebrow: 'Sources', title: effectiveTitle(page) });
}
