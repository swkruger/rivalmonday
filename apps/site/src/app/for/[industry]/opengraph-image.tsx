import { INDUSTRIES } from '../../../../content/industries';
import { PAGES } from '../../../../content/pages';
import { effectiveTitle } from '../../../lib/metadata';
import { OG_SIZE, renderOg } from '../../../lib/og';

export const dynamicParams = false;
export const generateStaticParams = () => INDUSTRIES.map((i) => ({ industry: i.slug }));

export const alt = 'Rival Monday — Industries';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ industry: string }> }) {
  const { industry } = await params;
  const page = PAGES.find((p) => p.path === `/for/${industry}`)!;
  return renderOg({ eyebrow: 'Industries', title: effectiveTitle(page) });
}
