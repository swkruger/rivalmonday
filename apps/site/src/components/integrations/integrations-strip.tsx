import { Activity, CreditCard, Database, Mail, Server, ShieldCheck, Sparkles, type LucideIcon } from 'lucide-react';
import { SECTIONS } from '../../../content/home';
import { INTEGRATIONS_PAGE, listedIntegrations, type Integration } from '../../../content/integrations';
import { HomeSectionShell, SectionHeading } from '../home/section-heading';
import { hasLogo, VendorMark } from './vendor-mark';

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

/** Home strip: the services we run on, as logos where allowed and icon + name otherwise, with a link to the full list. */
export function IntegrationsStrip() {
  return (
    <HomeSectionShell id="integrations" labelledBy="integrations-heading" className="border-t border-line bg-canvas py-20 lg:py-28">
      <SectionHeading section={SECTIONS.integrations} />
      <ul className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-3">
        {listedIntegrations().map((i) => {
          const Icon = ROLE_ICON[i.role];
          return (
            <li key={i.slug}>
              {/* The padding is the logos' clear space: at least the height of the mark on every side. */}
              <a href={`/integrations/${i.slug}`} className="flex h-full min-h-24 flex-col justify-center gap-2 rounded-md border border-line bg-surface p-6 hover:border-secondary">
                <span className="flex items-center gap-2">
                  {!hasLogo(i) && <Icon aria-hidden="true" className="size-5 shrink-0 text-secondary" />}
                  <VendorMark integration={i} size="strip" />
                </span>
                <span className="text-xs text-muted-ink">{i.role}</span>
              </a>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-xs text-muted-ink">{INTEGRATIONS_PAGE.disclaimer}</p>
      <p className="mt-6">
        <a href="/integrations" className="text-sm font-medium text-secondary hover:underline">
          See all integrations →
        </a>
      </p>
    </HomeSectionShell>
  );
}
