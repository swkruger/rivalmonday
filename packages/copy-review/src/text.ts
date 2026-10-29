import { createHash } from 'node:crypto';

export function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function hashText(text: string): string {
  return createHash('sha256').update(normalise(text)).digest('hex').slice(0, 16);
}
