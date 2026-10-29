import { HairlineCell, HairlineGrid } from '@cs/ui';
import { INTEGRATIONS_PAGE, listedIntegrations } from '../../../content/integrations';
import { CtaBand } from '../../components/home/cta-band';
import { VendorMark } from '../../components/integrations/vendor-mark';
import { PageIntro } from '../../components/seo/page-intro';
import { pageMetadata } from '../../lib/metadata';

export const metadata = pageMetadata('/integrations');

export default function IntegrationsPage() {
  return (
    <main>
      <section className="site-container py-16 lg:py-20">
        <div className="max-w-[720px]">
          <PageIntro path="/integrations" eyebrow={INTEGRATIONS_PAGE.eyebrow} h1={INTEGRATIONS_PAGE.h1} lead={INTEGRATIONS_PAGE.lead} />
        </div>
        <HairlineGrid cols={3} className="mt-10">
          {listedIntegrations().map((i) => (
            <HairlineCell key={i.slug}>
              <a href={`/integrations/${i.slug}`} className="block hover:underline">
                <VendorMark integration={i} size="page" />
                <span className="mt-1 block text-13 text-muted-ink">{i.role}</span>
                <span className="mt-2 block text-sm text-ink-secondary">{i.oneLine}</span>
              </a>
            </HairlineCell>
          ))}
        </HairlineGrid>
        <p className="mt-6 max-w-[720px] text-13 text-muted-ink">{INTEGRATIONS_PAGE.disclaimer}</p>
      </section>
      <CtaBand />
    </main>
  );
}
