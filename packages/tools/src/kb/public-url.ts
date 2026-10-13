import { isIP } from 'node:net';

function v4Public(a: number, b: number, c: number): boolean {
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false; // unspecified, private, loopback, multicast/reserved/broadcast
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a === 169 && b === 254) return false; // link-local (cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && c === 0) return false; // IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  return true;
}

/** Parses an IPv6 literal (no brackets) into 8 hextets, or null. */
function parseV6(raw: string): number[] | null {
  let s = raw.split('%')[0]!;
  const tail = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(s);
  if (tail) {
    const [a, b, c, d] = tail.slice(1).map(Number) as [number, number, number, number];
    s = `${s.slice(0, tail.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const parts = [...head, ...Array<string>(fill).fill('0'), ...rest].map((h) => Number.parseInt(h, 16));
  return parts.length === 8 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffff) ? parts : null;
}

/** True only for a globally routable IPv4/IPv6 address literal; anything unparseable is not public. */
export function isPublicAddress(addr: string): boolean {
  const ip = addr.replace(/^\[|\]$/g, '');
  const kind = isIP(ip.split('%')[0]!);
  if (kind === 4) {
    const [a, b, c] = ip.split('.').map(Number) as [number, number, number];
    return v4Public(a, b, c);
  }
  if (kind !== 6) return false;
  const h = parseV6(ip);
  if (!h) return false;
  const v4of = (hi: number, lo: number) => v4Public(hi >> 8, hi & 255, lo >> 8);
  if (h.every((x) => x === 0) || (h.slice(0, 7).every((x) => x === 0) && h[7] === 1)) return false; // :: and ::1
  if ((h[0]! & 0xfe00) === 0xfc00 || (h[0]! & 0xffc0) === 0xfe80 || (h[0]! & 0xff00) === 0xff00) return false; // ULA, link-local, multicast
  if (h.slice(0, 5).every((x) => x === 0) && h[5] === 0xffff) return v4of(h[6]!, h[7]!); // IPv4-mapped
  if (h.slice(0, 6).every((x) => x === 0)) return false; // IPv4-compatible / reserved ::/96
  if (h[0] === 0x64 && h[1] === 0xff9b && h.slice(2, 6).every((x) => x === 0)) return v4of(h[6]!, h[7]!); // NAT64
  if (h[0] === 0x2002) return v4of(h[1]!, h[2]!); // 6to4
  return true;
}

/** http(s) only, no credentials, and no host that is obviously internal (names or address literals). DNS is checked separately by the worker. */
export function isPublicHttpUrl(value: string): boolean {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  if (u.username || u.password) return false;
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!host) return false;
  if (host.startsWith('[') || isIP(host)) return isPublicAddress(host);
  if (!host.includes('.')) return false; // localhost, single-label intranet names
  if (['.localhost', '.internal', '.local'].some((s) => host.endsWith(s))) return false;
  return true;
}
