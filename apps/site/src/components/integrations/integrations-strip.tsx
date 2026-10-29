import { SECTIONS } from '../../../content/home';
import { listedIntegrations } from '../../../content/integrations';
import { HomeSectionShell, SectionHeading } from '../home/section-heading';
import { VendorMark } from './vendor-mark';

/** Home strip: the services we run on, as marks (or plain names) with a link to the full list. */
export function IntegrationsStrip() {
  return (
    <HomeSectionShell id="integrations" labelledBy="integrations-heading" className="border-t border-line bg-canvas py-16 lg:py-20">
      <SectionHeading section={SECTIONS.integrations} />
      <ul className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-2">
        {listedIntegrations().map((i) => (
          <li key={i.slug}>
            <a href={`/integrations/${i.slug}`} className="inline-flex min-h-11 items-center hover:underline">
              <VendorMark integration={i} size="strip" />
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-6">
        <a href="/integrations" className="text-sm font-medium text-secondary hover:underline">
          See all integrations →
        </a>
      </p>
    </HomeSectionShell>
  );
}
