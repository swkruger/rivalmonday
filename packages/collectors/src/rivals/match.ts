import { hasOfCity, normaliseDomain, normaliseName, normaliseWithoutCity, plainName } from './names';

const tokens = (s: string) => new Set(s.split(' ').filter(Boolean));

export function matchAdAccount(
  c: { name: string; city: string | null; domain: string | null; chain: boolean },
  a: { name: string; domain: string | null },
): 'strong' | 'weak' | 'none' {
  const cd = normaliseDomain(c.domain);
  if (cd != null && cd === normaliseDomain(a.domain)) return 'strong';
  const cn = normaliseName(c.name, c.city);
  const an = normaliseName(a.name, c.city);
  const city = c.city ? plainName(c.city) : '';
  const plain = plainName(a.name);
  const nameHasCity = !!city && ` ${plain} `.includes(` ${city} `);
  // A "<brand> of <city>" name is a franchisee even when the run saw only one location of the brand.
  const franchise = c.chain || hasOfCity(c.name, c.city);
  // Strong: the account is exactly the candidate's (multi-word) name plus its city, e.g. "Aire Serv Granbury".
  if (cn && nameHasCity && cn.includes(' ') && normaliseWithoutCity(a.name, c.city) === cn) return 'strong';
  if (cn && cn === an) {
    const domainHasCity = !!city && (normaliseDomain(a.domain) ?? '').replace(/[^a-z0-9]/g, '').includes(city.replace(/ /g, ''));
    if (!franchise || nameHasCity || domainHasCity) return 'strong';
  }
  const ct = tokens(cn);
  const at = tokens(an);
  const inter = [...ct].filter((t) => at.has(t)).length;
  const union = new Set([...ct, ...at]).size;
  return union > 0 && inter / union >= 0.6 ? 'weak' : 'none';
}
