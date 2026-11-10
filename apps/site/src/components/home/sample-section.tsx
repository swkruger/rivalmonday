import { SECTIONS } from '../../../content/home';
import { sourceLinks } from '../../lib/source-links';
import { SampleBrief } from '../sample/sample-brief';
import { HomeSectionShell, SectionHeading } from './section-heading';

/**
 * The full sample brief, where any claim opens its evidence. On the home page and /how-it-works.
 * `autoplayMap={false}` (home): the §2 replay is the page's one showpiece, so this map plays only when asked.
 */
export function SampleSection({ autoplayMap = true }: { autoplayMap?: boolean } = {}) {
  return (
    <HomeSectionShell id="sample" labelledBy="sample-heading">
      <SectionHeading section={SECTIONS.sample} />
      <div className="mt-8">
        <SampleBrief sourceLinks={sourceLinks()} autoplayMap={autoplayMap} />
      </div>
      <a href="/sample-brief" className="mt-6 inline-flex text-sm font-medium text-link hover:underline">
        Open the sample brief on its own page →
      </a>
    </HomeSectionShell>
  );
}
