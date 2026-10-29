import { FACT_SOURCES } from '../../../content/compare';

/** Hostname label for a fact source id; empty when the id is unknown. */
export function sourceHost(id: string): string {
  const s = FACT_SOURCES.find((x) => x.id === id);
  return s ? new URL(s.url).hostname.replace(/^www\./, '') : '';
}

/**
 * Link to a fact's public source (optionally superscript). It is a third-party page, so it is nofollow.
 * It opens in a new tab, which screen readers announce from the sr-only suffix (no aria-label, so the text is the name).
 */
export function SourceLink({ id, sup = false }: { id: string; sup?: boolean }) {
  const s = FACT_SOURCES.find((x) => x.id === id);
  if (!s) return null;
  const host = sourceHost(id);
  const link = (
    <a href={s.url} rel="noopener nofollow" target="_blank" className="text-secondary hover:underline">
      {sup ? (
        <>
          <span className="sr-only">Source: </span>
          <span aria-hidden="true">[</span>
          {host}
          <span aria-hidden="true">]</span>
        </>
      ) : (
        `Source: ${host}`
      )}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
  return sup ? <sup className="ml-1 text-xs">{link}</sup> : link;
}

/** A bulleted list of facts, each with its source link. */
export function FactList({ items }: { items: readonly { text: string; source: string }[] }) {
  return (
    <ul className="mt-3 list-disc space-y-2 pl-5 text-base leading-relaxed text-ink-secondary">
      {items.map((f) => (
        <li key={f.text}>
          {f.text}{' '}
          <span className="text-13">
            (<SourceLink id={f.source} />)
          </span>
        </li>
      ))}
    </ul>
  );
}
