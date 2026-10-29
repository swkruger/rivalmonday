import { serializeJsonLd } from '../../lib/json-ld';

type Ld = Record<string, unknown>;

/** Structured data. `serializeJsonLd` escapes `<`, `>`, `&` and U+2028/9, so no value can close the tag. The site's only `dangerouslySetInnerHTML`. */
export function JsonLd({ data }: { data: Ld | Ld[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
