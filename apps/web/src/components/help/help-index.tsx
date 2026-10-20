import Link from 'next/link';
import type { HelpGroup } from './help-groups';

export interface HelpSearchResult { kbId: string; title: string; excerpt: string }
export interface HelpTerm { id: string; term: string; short: string; long?: string }

export interface HelpIndexProps {
  /** Where an article opens: `/kb` for agency and client viewers, `/platform/knowledge` for operators (operator guides are not readable on `/kb`). */
  articleBase: string;
  groups: HelpGroup[];
  glossary: HelpTerm[];
  /** The submitted `?q=`; empty = no search. `results` null = no search ran. */
  query: string;
  results: HelpSearchResult[] | null;
  ask: { href: string; label: string } | null;
  contactEmail: string | null;
}

const linkClass = 'font-medium text-secondary underline-offset-2 hover:underline';

/** The body of the three Help pages (`PageHeader` is the page's). Plain props, no reads. */
export function HelpIndex({ articleBase, groups, glossary, query, results, ask, contactEmail }: HelpIndexProps) {
  return (
    <div className="flex flex-col gap-8">
      <form method="get" role="search" className="flex flex-wrap items-center gap-2">
        <label htmlFor="help-search" className="sr-only">Search help</label>
        <input
          id="help-search" name="q" type="search" defaultValue={query} maxLength={300} placeholder="Search help"
          className="h-9 w-full max-w-md rounded-md border border-border bg-surface px-3 text-sm text-ink"
        />
        <button type="submit" className="inline-flex h-9 items-center rounded-md border border-border bg-surface px-3 text-sm font-medium text-ink hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Search</button>
      </form>

      {results && (
        <section aria-labelledby="help-results" className="flex flex-col gap-3">
          <h2 id="help-results" className="text-lg font-bold">Search results</h2>
          {results.length === 0 ? (
            <p className="text-sm text-muted-ink">No results for “{query}”.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {results.map((r) => (
                <li key={r.kbId} className="flex flex-col gap-0.5">
                  <Link href={`${articleBase}/${r.kbId}`} className={linkClass}>{r.title}</Link>
                  {r.excerpt && <p className="text-sm text-muted-ink">{r.excerpt}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section aria-labelledby="help-guides" className="flex flex-col gap-4">
        <h2 id="help-guides" className="text-lg font-bold">Guides</h2>
        {groups.length === 0 ? (
          <p className="text-sm text-muted-ink">No guides are available here yet.</p>
        ) : (
          groups.map((g) => (
            <div key={g.heading} className="flex flex-col gap-1.5">
              <h3 className="text-sm font-semibold text-muted-ink">{g.heading}</h3>
              <ul className="flex flex-col gap-1">
                {g.guides.map((guide) => (
                  <li key={guide.helpKey}><Link href={`${articleBase}/${guide.articleId}`} className={linkClass}>{guide.title}</Link></li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      {glossary.length > 0 && (
        <section aria-labelledby="help-glossary" className="flex flex-col gap-3">
          <h2 id="help-glossary" className="text-lg font-bold">Glossary</h2>
          <dl className="flex flex-col gap-3">
            {glossary.map((t) => (
              <div key={t.id} className="flex flex-col gap-0.5">
                <dt className="font-semibold text-ink">{t.term}</dt>
                <dd className="text-sm text-muted-ink">{t.short}{t.long ? ` ${t.long}` : ''}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {(ask || contactEmail) && (
        <div className="flex flex-col gap-2 border-t border-border pt-4 text-sm">
          {ask && <Link href={ask.href} className={linkClass}>{ask.label}</Link>}
          {contactEmail && <a href={`mailto:${contactEmail}`} className={linkClass}>Contact your agency</a>}
        </div>
      )}
    </div>
  );
}
