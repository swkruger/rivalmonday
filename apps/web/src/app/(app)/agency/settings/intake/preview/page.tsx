import { notFound } from 'next/navigation';
import { agencyBrand } from '@/app/start/brand';
import { IntakeLanding } from '@/app/start/landing';
import type { IntakeLinkState } from '@/components/agency/intake-link-card';
import { HelpText } from '@/components/help/help-context';
import { PageHeader } from '@/components/page-header';
import { PAGE_COPY } from '@/help/copy';
import { requireContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { themeForViewer } from '@/server/theme';
import { callTool } from '@/server/tools';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Intake preview' };

const HELP_KEY = 'page:agency.settings.intake.preview';
const COPY = PAGE_COPY['agency.settings.intake.preview'];

/** 15c-2a §6: what visitors see on the agency's intake page, with every control disabled. Agency admins only (as the intake page); works whether or not the link is on. */
export default async function IntakePreviewPage() {
  const { viewer, ctx } = await requireContext();
  if (viewer.kind !== 'user' || ctx.role !== 'agency_admin') notFound();
  const [link, theme, guides] = await Promise.all([callTool<IntakeLinkState>(ctx, 'get_intake_link', {}), themeForViewer(viewer), helpGuides(ctx, 'agency')]);
  return (
    <>
      <PageHeader
        title="Intake preview"
        breadcrumb={[
          { label: 'Agency settings', href: '/agency/settings' },
          { label: 'Intake link', href: '/agency/settings/intake' },
          { label: 'Preview' },
        ]}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      <div className="overflow-hidden rounded-md border border-dashed border-primary">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-dashed border-primary bg-primary-soft px-4 py-2 text-sm text-primary-soft-text">
          <span className="font-medium">Preview — this is what visitors see</span>
          {!link.enabled && <span>Link is off · visitors can&apos;t open it yet</span>}
        </div>
        <IntakeLanding brand={agencyBrand(theme.branding)} slug={link.slug} refCode={null} siteKey={null} preview />
      </div>
    </>
  );
}
