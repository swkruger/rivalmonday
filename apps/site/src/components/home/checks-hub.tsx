import { CHECKS_DETAIL, CHECKS_LINK, SECTIONS } from '../../../content/home';
import { HOW_IT_WORKS } from '../../../content/how-it-works';
import { SOURCES, type Source } from '../../../content/sources';
import { ChecksDiagram, type CheckNode, type CheckNodeDetail } from './checks-diagram';
import { HomeSectionShell, SectionHeading } from './section-heading';

/** One source's sheet: the same wording as its `/sources` page, so there is one place to sign. */
function sourceDetail(slug: Source['slug']): CheckNodeDetail {
  const s = SOURCES.find((x) => x.slug === slug)!;
  return {
    eyebrow: CHECKS_DETAIL.sourceEyebrow,
    title: s.name,
    lead: s.oneLine,
    sections: [
      { heading: CHECKS_DETAIL.collect, lines: s.whatWeCollect },
      { heading: CHECKS_DETAIL.often, lines: [s.howOften] },
      { heading: CHECKS_DETAIL.leaveAlone, lines: s.whatWeDont },
      { heading: CHECKS_DETAIL.example, lines: [s.inTheBrief] },
    ],
    link: { label: CHECKS_DETAIL.sourceLink, href: `/sources/${s.slug}` },
  };
}

const [captured, written, verified, clickThrough, dontDo] = HOW_IT_WORKS.sections;

const NODES: Record<CheckNode, CheckNodeDetail> = {
  websites: sourceDetail('competitor-websites'),
  reviews: sourceDetail('google-reviews'),
  profile: sourceDetail('google-business-profile'),
  ads: sourceDetail('ads'),
  rankings: sourceDetail('local-map-rankings'),
  brief: {
    eyebrow: CHECKS_DETAIL.stepEyebrow,
    title: CHECKS_DETAIL.briefTitle,
    lead: SECTIONS.checks.body,
    steps: [captured, written, verified].map((s) => ({ title: s.heading.replace(/^\d+\.\s*/, ''), detail: s.body })),
    link: CHECKS_DETAIL.briefLink,
  },
  result: {
    eyebrow: CHECKS_DETAIL.stepEyebrow,
    title: SECTIONS.checks.heading.replace(/\.$/, ''),
    lead: verified.body,
    sections: [
      { heading: clickThrough.heading.replace(/^\d+\.\s*/, ''), lines: [clickThrough.body] },
      { heading: dontDo.heading, lines: [dontDo.body] },
    ],
    link: CHECKS_LINK,
  },
};

/** Hub diagram: five sources → the Monday brief (verifying) → "No evidence, no claim"; every box opens its explanation. */
export function ChecksHub({ hideLink = false }: { hideLink?: boolean } = {}) {
  const nodes = hideLink ? { ...NODES, result: { ...NODES.result, link: CHECKS_DETAIL.briefLink } } : NODES;
  return (
    <HomeSectionShell id="checks" labelledBy="checks-heading">
      <SectionHeading section={SECTIONS.checks} />
      <ChecksDiagram nodes={nodes} hint={CHECKS_DETAIL.hint} />
      {!hideLink && (
        <a href={CHECKS_LINK.href} className="mt-6 inline-flex text-sm font-medium text-link hover:underline">
          {CHECKS_LINK.label}
        </a>
      )}
    </HomeSectionShell>
  );
}
