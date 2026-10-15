import { normaliseDomain, normaliseName } from './names';

const tokens = (s: string) => new Set(s.split(' ').filter(Boolean));

export function matchAdAccount(
  c: { name: string; city: string | null; domain: string | null; chain: boolean },
  a: { name: string; domain: string | null },
): 'strong' | 'weak' | 'none' {
  const cd = normaliseDomain(c.domain);
  if (cd != null && cd === normaliseDomain(a.domain)) return 'strong';
  const cn = normaliseName(c.name, c.city);
  const an = normaliseName(a.name, c.city);
  if (cn && cn === an) {
    const city = c.city?.trim().toLowerCase();
    const accountHasCity = !!city && a.name.toLowerCase().includes(city);
    if (!c.chain || accountHasCity) return 'strong';
  }
  const ct = tokens(cn);
  const at = tokens(an);
  const inter = [...ct].filter((t) => at.has(t)).length;
  const union = new Set([...ct, ...at]).size;
  return union > 0 && inter / union >= 0.6 ? 'weak' : 'none';
}
