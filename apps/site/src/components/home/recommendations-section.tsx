import { RECOMMENDATIONS_ROADMAP, SECTIONS } from '../../../content/home';
import { SampleRecommendations } from '../sample/sample-recommendations';
import { HomeSectionShell, SectionHeading } from './section-heading';

/** The working recommendations board, then what is planned next. On the home page and /how-it-works. */
export function RecommendationsSection() {
  return (
    <HomeSectionShell id="recommendations" labelledBy="recommendations-heading" className="border-t border-line bg-canvas py-20 lg:py-28">
      <SectionHeading section={SECTIONS.recommendations} />
      <div className="mt-10">
        <SampleRecommendations />
      </div>
      <div className="mt-10 max-w-[720px] border-t border-line pt-8">
        <span className="inline-block rounded-full border border-secondary px-3 py-1 text-sm font-medium text-secondary">{RECOMMENDATIONS_ROADMAP.status}</span>
        <h3 className="mt-4 text-lg font-semibold text-ink">{RECOMMENDATIONS_ROADMAP.heading}</h3>
        <p className="mt-2 text-ink-secondary">{RECOMMENDATIONS_ROADMAP.body}</p>
        <p className="mt-2 text-sm text-ink-secondary">{RECOMMENDATIONS_ROADMAP.notice}</p>
        <a href={RECOMMENDATIONS_ROADMAP.link.href} className="mt-4 inline-flex text-sm font-medium text-link hover:underline">
          {RECOMMENDATIONS_ROADMAP.link.label}
        </a>
      </div>
    </HomeSectionShell>
  );
}
