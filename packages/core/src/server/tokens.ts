import { createHash, randomBytes } from 'node:crypto';
import { PAT_ALPHABET, PAT_BODY_LENGTH, PAT_PREFIX } from '../tokens';

export function generatePat(random: (n: number) => Uint8Array = (n) => randomBytes(n)): { token: string; hash: string; prefix: string } {
  let n = BigInt(`0x${Buffer.from(random(32)).toString('hex')}`);
  let body = '';
  while (n > 0n) { body = PAT_ALPHABET[Number(n % 62n)] + body; n /= 62n; }
  const token = PAT_PREFIX + body.padStart(PAT_BODY_LENGTH, '0');
  return { token, hash: hashPat(token), prefix: token.slice(0, 12) };
}

export const hashPat = (token: string): string => createHash('sha256').update(token, 'utf8').digest('hex');
