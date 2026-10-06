import { describe, expect, it } from 'vitest';
import { moveInOrder } from './order';

describe('moveInOrder', () => {
  it('swaps with the neighbour', () => {
    expect(moveInOrder(['a', 'b', 'c'], 'b', 'up')).toEqual(['b', 'a', 'c']);
    expect(moveInOrder(['a', 'b', 'c'], 'b', 'down')).toEqual(['a', 'c', 'b']);
  });
  it('returns null at the edges or for an unknown id', () => {
    expect(moveInOrder(['a', 'b'], 'a', 'up')).toBeNull();
    expect(moveInOrder(['a', 'b'], 'b', 'down')).toBeNull();
    expect(moveInOrder(['a'], 'x', 'up')).toBeNull();
  });
});
