import { listedIntegrations } from '../../../../content/integrations';
import { PAGES } from '../../../../content/pages';
import { effectiveTitle } from '../../../lib/metadata';
import { OG_SIZE, renderOg } from '../../../lib/og';

export const dynamicParams = false;
export const generateStaticParams = () => listedIntegrations().map((i) => ({ vendor: i.slug }));

export const alt = 'Rival Monday — Integrations';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ vendor: string }> }) {
  const { vendor } = await params;
  const page = PAGES.find((p) => p.path === `/integrations/${vendor}`)!;
  return renderOg({ eyebrow: 'Integrations', title: effectiveTitle(page) });
}
