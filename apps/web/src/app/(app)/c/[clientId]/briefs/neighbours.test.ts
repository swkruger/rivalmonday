import { describe, expect, it } from 'vitest';
import { neighbours } from './neighbours';

// Lists come newest first (as the list tools return them): "Previous" is the older neighbour, "Next" the newer one.
const items = [{ id: 'c' }, { id: 'b' }, { id: 'a' }];
const href = (id: string) => `/x/${id}`;

describe('neighbours (Previous / Next on detail pages)', () => {
  it('links both neighbours in the middle of the list', () => {
    expect(neighbours(items, 'b', href)).toEqual({ previous: '/x/a', next: '/x/c' });
  });

  it('the newest item has no Next, the oldest no Previous', () => {
    expect(neighbours(items, 'c', href)).toEqual({ previous: '/x/b', next: null });
    expect(neighbours(items, 'a', href)).toEqual({ previous: null, next: '/x/b' });
  });

  it('hides both when the id is not in the list (or the list failed to load)', () => {
    expect(neighbours(items, 'zz', href)).toEqual({ previous: null, next: null });
    expect(neighbours(null, 'b', href)).toEqual({ previous: null, next: null });
  });
});
