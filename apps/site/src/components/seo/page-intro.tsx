import type { SitePage } from '../../../content/pages';
import { breadcrumbTrail } from '../../lib/breadcrumbs';
import { breadcrumbLd } from '../../lib/json-ld';
import { JsonLd } from './json-ld';

export interface PageIntroProps {
  path: SitePage['path'];
  eyebrow: string;
  h1: string;
  lead?: string;
}

/** `BreadcrumbList` JSON-LD only, for pages with their own intro (17b pages: how-it-works, sample brief, legal). */
export function BreadcrumbJsonLd({ path }: { path: SitePage['path'] }) {
  return <JsonLd data={breadcrumbLd(breadcrumbTrail(path))} />;
}

/** Visible breadcrumb + `BreadcrumbList` JSON-LD + eyebrow, h1 and lead. Every content page opens with it. */
export function PageIntro({ path, eyebrow, h1, lead }: PageIntroProps) {
  const trail = breadcrumbTrail(path);
  return (
    <>
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1.5 text-13 text-ink-secondary">
          {trail.map((c, i) => {
            const last = i === trail.length - 1;
            return (
              <li key={c.path} className="flex items-center gap-1.5">
                {i > 0 ? <span aria-hidden="true">/</span> : null}
                <a href={c.path} aria-current={last ? 'page' : undefined} className={last ? 'text-ink' : 'hover:text-ink hover:underline'}>
                  {c.name}
                </a>
              </li>
            );
          })}
        </ol>
      </nav>
      <JsonLd data={breadcrumbLd(trail)} />
      <p className="mt-6 text-13 font-medium text-secondary">{eyebrow}</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight text-ink">{h1}</h1>
      {lead ? <p className="mt-4 text-lg leading-relaxed text-ink-secondary">{lead}</p> : null}
    </>
  );
}
