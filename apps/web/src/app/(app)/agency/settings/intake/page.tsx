import { notFound } from 'next/navigation';
import { IntakeLinkCard, type IntakeLinkState } from '@/components/agency/intake-link-card';
import { HelpText } from '@/components/help/help-context';
import { TipRow } from '@/components/help/tip-row';
import { PageHeader } from '@/components/page-header';
import { PAGE_COPY } from '@/help/copy';
import { requireContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { themeForViewer } from '@/server/theme';
import { callTool } from '@/server/tools';
import { saveIntakeSlugAction, setIntakeEnabledAction } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Intake link' };

const HELP_KEY = 'page:agency.settings.intake';
const COPY = PAGE_COPY['agency.settings.intake'];

/** Phase 11c §5 (ruling G): agency admins only; any other role, and a support session, gets a 404. */
export default async function IntakeSettingsPage() {
  const { viewer, ctx } = await requireContext();
  if (viewer.kind !== 'user' || ctx.role !== 'agency_admin') notFound();
  const [link, theme, guides] = await Promise.all([callTool<IntakeLinkState>(ctx, 'get_intake_link', {}), themeForViewer(viewer), helpGuides(ctx, 'agency')]);
  return (
    <>
      <PageHeader
        title="Intake link"
        breadcrumb={[{ label: 'Agency settings', href: '/agency/settings' }, { label: 'Intake link' }]}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      <TipRow
        items={[
          { label: 'Your link', tip: 'agency.settings.intake.link' },
          { label: 'Link name', tip: 'agency.settings.intake.name' },
          { label: 'Switch', tip: 'agency.settings.intake.switch' },
          { label: 'Counts', tip: 'agency.settings.intake.counts' },
        ]}
      />
      <IntakeLinkCard link={link} primary={theme.branding.primary} save={saveIntakeSlugAction} toggle={setIntakeEnabledAction} />
    </>
  );
}
