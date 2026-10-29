import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ComponentPropsWithoutRef } from 'react';
import Markdown from 'react-markdown';

const UPDATED = /^Last updated: (\d{4}-\d{2}-\d{2})$/m;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Pulls the "Last updated" line out of the body; returns it as `29 Oct 2026` (null when absent). */
export function parseLegal(source: string): { body: string; updated: string | null } {
  const m = UPDATED.exec(source);
  if (!m) return { body: source, updated: null };
  const [y, mo, d] = m[1].split('-').map(Number);
  return { body: source.replace(UPDATED, ''), updated: `${d} ${MONTHS[mo - 1]} ${y}` };
}

type H = ComponentPropsWithoutRef<'h2'> & { node?: unknown };
// The page owns the single h1, so Markdown headings drop one level.
const components = {
  h1: ({ node: _n, ...p }: H) => <h2 className="mt-10 text-2xl font-semibold text-ink" {...p} />,
  h2: ({ node: _n, ...p }: H) => <h3 className="mt-8 text-xl font-semibold text-ink" {...p} />,
  h3: ({ node: _n, ...p }: H) => <h4 className="mt-6 text-lg font-semibold text-ink" {...p} />,
  h4: ({ node: _n, ...p }: H) => <h5 className="mt-4 font-semibold text-ink" {...p} />,
  h5: ({ node: _n, ...p }: H) => <h6 className="mt-4 font-semibold text-ink" {...p} />,
  h6: ({ node: _n, ...p }: H) => <p className="mt-4 font-semibold text-ink" {...p} />,
};

/** Pure renderer: Markdown only, raw HTML dropped. */
export function LegalDocument({ title, markdown }: { title: string; markdown: string }) {
  const { body, updated } = parseLegal(markdown);
  return (
    <main className="site-container py-16 lg:py-20">
      <article className="mx-auto max-w-[720px]">
        <h1 className="text-4xl font-semibold tracking-tight text-ink">{title}</h1>
        {updated && <p className="mt-2 text-sm text-ink-secondary">Last updated {updated}</p>}
        <div className="mt-6 flex flex-col gap-3 leading-relaxed text-ink [overflow-wrap:anywhere] [&_a]:text-link [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
          <Markdown skipHtml components={components}>
            {body}
          </Markdown>
        </div>
      </article>
    </main>
  );
}

/** Reads `content/legal/<name>.md` at build time (cwd-relative, not `import.meta.url`: Turbopack). */
export async function LegalPage({ name, title }: { name: 'privacy' | 'terms'; title: string }) {
  const markdown = await readFile(path.join(process.cwd(), 'content/legal', `${name}.md`), 'utf8');
  return <LegalDocument title={title} markdown={markdown} />;
}
