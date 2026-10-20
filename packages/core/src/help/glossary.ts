import { visibleAudiences, type HelpAudience, type ViewerAudience } from './audience';

export interface GlossaryTerm {
  id: string;
  term: string;
  audience: HelpAudience;
  short: string;
  long?: string;
  seeAlso?: string[];
}

/** Filled by the glossary content task. */
export const GLOSSARY: readonly GlossaryTerm[] = [];

/** Filter + sort an explicit list (testable); `glossaryFor` applies it to `GLOSSARY`. */
export function filterGlossary(terms: readonly GlossaryTerm[], v: ViewerAudience): GlossaryTerm[] {
  const ok = visibleAudiences(v);
  return terms.filter((t) => ok.includes(t.audience)).sort((a, b) => a.term.localeCompare(b.term));
}

export function glossaryFor(v: ViewerAudience): GlossaryTerm[] {
  return filterGlossary(GLOSSARY, v);
}
