import { HairlineCell, HairlineGrid } from '@cs/ui';
import { Activity, CreditCard, Database, Mail, Server, ShieldCheck, Sparkles, type LucideIcon } from 'lucide-react';
import { INTEGRATIONS_PAGE, listedIntegrations, type Integration } from '../../../content/integrations';
import { CtaBand } from '../../components/home/cta-band';
import { hasLogo, VendorMark } from '../../components/integrations/vendor-mark';
import { PageIntro } from '../../components/seo/page-intro';
import { pageMetadata } from '../../lib/metadata';

export const metadata = pageMetadata('/integrations');

/** Our own icon for what a service does; used only where its owner's guidelines don't let us show its logo. */
const ROLE_ICON: Record<Integration['role'], LucideIcon> = {
  AI: Sparkles,
  Database,
  Hosting: Server,
  'Storage & security': ShieldCheck,
  Email: Mail,
  Billing: CreditCard,
  Monitoring: Activity,
};

export default function IntegrationsPage() {
  return (
    <main>
      <section className="site-container py-16 lg:py-20">
        <div className="max-w-[720px]">
          <PageIntro path="/integrations" eyebrow={INTEGRATIONS_PAGE.eyebrow} h1={INTEGRATIONS_PAGE.h1} lead={INTEGRATIONS_PAGE.lead} />
        </div>
        <HairlineGrid cols={3} className="mt-10">
          {listedIntegrations().map((i) => {
            const Icon = ROLE_ICON[i.role];
            return (
              <HairlineCell key={i.slug}>
                <a href={`/integrations/${i.slug}`} className="block hover:underline">
                  <span className="flex items-center gap-2">
                    {!hasLogo(i) && <Icon aria-hidden="true" className="size-5 shrink-0 text-secondary" />}
                    <VendorMark integration={i} />
                  </span>
                  <span className="mt-1 block text-13 text-muted-ink">{i.role}</span>
                  <span className="mt-2 block text-sm text-ink-secondary">{i.oneLine}</span>
                </a>
              </HairlineCell>
            );
          })}
        </HairlineGrid>
        <p className="mt-6 max-w-[720px] text-13 text-muted-ink">{INTEGRATIONS_PAGE.disclaimer}</p>
      </section>
      <CtaBand />
    </main>
  );
}
