import { GUIDES, GUIDES_LINK, guideReadMinutes, type Guide } from '../../../content/guides';
import { SECTIONS } from '../../../content/home';
import { HomeSectionShell, SectionHeading } from '../home/section-heading';
import { ScanFrame } from '../media/scan-frame';

/** Neighbouring pictures get different blip spots. */
type Blip = 1 | 2 | 3;
const blipFor = (i: number) => ((i % 3) + 1) as Blip;

function GuideImage({ guide, blip }: { guide: Guide; blip: Blip }) {
  const { src, alt, width, height, tag, screenshot } = guide.image;
  return <ScanFrame src={src} alt={alt} width={width} height={height} tag={tag} screenshot={screenshot} blip={blip} />;
}

const meta = (g: Guide) => `${guideReadMinutes(g)} min read`;

/** One guide as a large article: picture, headline, its opening lines. */
export function GuideFeature({ guide, blip = 1 }: { guide: Guide; blip?: Blip }) {
  return (
    <article>
      <a href={`/guides/${guide.slug}`} className="group block">
        <GuideImage guide={guide} blip={blip} />
        {guide.image.caption ? <p className="mt-2 text-13 text-muted-ink">{guide.image.caption}</p> : null}
        <h3 className="mt-5 text-2xl font-semibold tracking-tight text-ink group-hover:underline">{guide.h1}</h3>
        <p className="mt-2 text-base leading-relaxed text-ink-secondary">{guide.lead}</p>
        <p className="mt-3 text-13 text-muted-ink">{meta(guide)}</p>
      </a>
    </article>
  );
}

/** One guide as a smaller article beside a feature, or in a grid when `stacked`. */
export function GuideTeaser({ guide, stacked = false, index = 0 }: { guide: Guide; stacked?: boolean; index?: number }) {
  return (
    <article>
      <a href={`/guides/${guide.slug}`} className={`group ${stacked ? 'block' : 'grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-start gap-4 sm:gap-6'}`}>
        <GuideImage guide={guide} blip={blipFor(index)} />
        <div className={stacked ? 'mt-4' : undefined}>
          <h3 className="text-lg font-semibold tracking-tight text-ink group-hover:underline">{guide.h1}</h3>
          <p className="mt-1 hidden text-sm leading-relaxed text-ink-secondary sm:block">{guide.seo.description}</p>
          <p className="mt-2 text-13 text-muted-ink">{meta(guide)}</p>
        </div>
      </a>
    </article>
  );
}

/** Three guides in an article layout, the first as the feature. On the home page and /how-it-works, each with its own picks. */
export function GuideArticles({ slugs }: { slugs: readonly [Guide['slug'], Guide['slug'], Guide['slug']] }) {
  const [feature, ...rest] = slugs.map((slug) => GUIDES.find((g) => g.slug === slug)!);
  return (
    <HomeSectionShell id="guides" labelledBy="guides-heading" className="border-t border-line py-20 lg:py-28">
      <SectionHeading section={SECTIONS.guides} />
      <div className="mt-10 grid items-start gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-12">
        <GuideFeature guide={feature!} />
        <div className="flex flex-col gap-8 border-line lg:border-l lg:pl-12">
          {rest.map((g, i) => (
            <GuideTeaser key={g.slug} guide={g} index={i + 1} />
          ))}
          <a href={GUIDES_LINK.href} className="text-sm font-medium text-link hover:underline">{GUIDES_LINK.label}</a>
        </div>
      </div>
    </HomeSectionShell>
  );
}
