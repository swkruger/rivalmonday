import { notFound } from 'next/navigation';
import { INTEGRATIONS_PAGE, listedIntegrations } from '../../../../content/integrations';
import { CtaBand } from '../../../components/home/cta-band';
import { VendorMark } from '../../../components/integrations/vendor-mark';
import { PageIntro } from '../../../components/seo/page-intro';
import { pageMetadata } from '../../../lib/metadata';

export const dynamicParams = false;
export const generateStaticParams = () => listedIntegrations().map((i) => ({ vendor: i.slug }));

export async function generateMetadata({ params }: { params: Promise<{ vendor: string }> }) {
  const { vendor } = await params;
  return pageMetadata(`/integrations/${vendor}`);
}

export default async function VendorPage({ params }: { params: Promise<{ vendor: string }> }) {
  const { vendor } = await params;
  const all = listedIntegrations();
  const i = all.find((x) => x.slug === vendor);
  if (!i) notFound();
  const others = all.filter((x) => x.slug !== i.slug);
  return (
    <main>
      <section className="site-container py-16 lg:py-20">
        <div className="max-w-[720px]">
          <PageIntro path={`/integrations/${i.slug}`} eyebrow={INTEGRATIONS_PAGE.eyebrow} h1={`${i.name} at Rival Monday`} lead={i.oneLine} />
          <div className="mt-6">
            <VendorMark integration={i} />
          </div>
          <div className="mt-8">
            <h2 className="text-xl font-semibold text-ink">What it is</h2>
            <p className="mt-2 text-base leading-relaxed text-ink-secondary">{i.whatItIs}</p>
            <p className="mt-2 text-base">
              <a href={i.vendorUrl} rel="noopener" className="text-secondary hover:underline">
                {i.vendorUrl.replace('https://', '')}
              </a>
            </p>
          </div>
          <div className="mt-8">
            <h2 className="text-xl font-semibold text-ink">How Rival Monday uses it</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-base leading-relaxed text-ink-secondary">
              {i.howWeUseIt.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
          <div className="mt-8">
            <h2 className="text-xl font-semibold text-ink">What it means for your agency</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-base leading-relaxed text-ink-secondary">
              {i.forYourAgency.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
          <div className="mt-10 border-t border-line pt-6">
            <h2 className="text-base font-semibold text-ink">Other integrations</h2>
            <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {others.map((o) => (
                <li key={o.slug}>
                  <a href={`/integrations/${o.slug}`} className="text-secondary hover:underline">
                    {o.name}
                  </a>
                </li>
              ))}
              <li>
                <a href="/integrations" className="text-secondary hover:underline">
                  All integrations
                </a>
              </li>
            </ul>
            <p className="mt-4 text-13 text-muted-ink">{INTEGRATIONS_PAGE.disclaimer}</p>
          </div>
        </div>
      </section>
      <CtaBand />
    </main>
  );
}
