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
  const city = c.city ? normaliseName(c.city) : '';
  const plain = normaliseName(a.name);
  const nameHasCity = !!city && ` ${plain} `.includes(` ${city} `);
  // Strong: account name contains the candidate's name plus its city (chains included).
  if (cn && nameHasCity && ` ${plain} `.includes(` ${cn} `)) return 'strong';
  if (cn && cn === an) {
    const domainHasCity = !!city && (normaliseDomain(a.domain) ?? '').replace(/[^a-z0-9]/g, '').includes(city.replace(/ /g, ''));
    if (!c.chain || nameHasCity || domainHasCity) return 'strong';
  }
  const ct = tokens(cn);
  const at = tokens(an);
  const inter = [...ct].filter((t) => at.has(t)).length;
  const union = new Set([...ct, ...at]).size;
  return union > 0 && inter / union >= 0.6 ? 'weak' : 'none';
}
