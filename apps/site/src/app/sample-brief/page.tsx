import { SECTIONS } from '../../../content/home';
import { CtaBand } from '../../components/home/cta-band';
import { HomeSectionShell, SectionHeading } from '../../components/home/section-heading';
import { SampleBrief } from '../../components/sample/sample-brief';
import { SampleRecommendations } from '../../components/sample/sample-recommendations';
import { BreadcrumbJsonLd } from '../../components/seo/page-intro';
import { pageMetadata } from '../../lib/metadata';
import { sourceLinks } from '../../lib/source-links';

export const metadata = pageMetadata('/sample-brief');

export default function SampleBriefPage() {
  return (
    <main>
      <BreadcrumbJsonLd path="/sample-brief" />
      <section className="site-container pb-16 pt-16 lg:pt-20">
        <div className="max-w-3xl">
          <p className="text-13 font-medium text-secondary">Sample brief</p>
          <h1 className="mt-2 text-section font-semibold text-ink">A Monday brief, start to finish</h1>
          <p className="mt-3 text-base text-ink-secondary">Fictional business, real product. Click any claim to see its evidence.</p>
        </div>
        <div className="mt-8">
          <h2 className="sr-only">The sample brief</h2>
          <SampleBrief sourceLinks={sourceLinks()} />
        </div>
      </section>
      <HomeSectionShell id="recommendations" labelledBy="recommendations-heading" className="border-t border-line bg-canvas py-20 lg:py-28">
        <SectionHeading section={SECTIONS.recommendations} />
        <div className="mt-10">
          <SampleRecommendations />
        </div>
      </HomeSectionShell>
      <CtaBand />
    </main>
  );
}
