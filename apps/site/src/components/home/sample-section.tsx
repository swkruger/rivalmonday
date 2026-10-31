import { SECTIONS } from '../../../content/home';
import { sourceLinks } from '../../lib/source-links';
import { Reveal } from '../motion/in-view';
import { SampleBrief } from '../sample/sample-brief';
import { HomeSectionShell, SectionHeading } from './section-heading';

/** The full sample brief, where any claim opens its evidence. On the home page and /how-it-works. */
export function SampleSection() {
  return (
    <HomeSectionShell id="sample" labelledBy="sample-heading">
      <SectionHeading section={SECTIONS.sample} />
      <Reveal className="mt-8">
        <SampleBrief sourceLinks={sourceLinks()} />
      </Reveal>
      <a href="/sample-brief" className="mt-6 inline-flex text-sm font-medium text-link hover:underline">
        Open the sample brief on its own page →
      </a>
    </HomeSectionShell>
  );
}
