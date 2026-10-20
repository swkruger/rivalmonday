import { expect, it } from 'vitest';
import { hashInput } from './hash';

it('hashInput output unchanged for a fixture', () => {
  expect(hashInput({ a: 1, b: ['x'] })).toBe('fd5e92badbe24726f55b88132dd5fa1ceec0efd960b3bcd44f527b4bcc84af34');
  expect(hashInput(undefined)).toBe('74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b');
});
