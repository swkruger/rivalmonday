import { CHANGE_TYPES } from '@cs/core';
import { describe, expect, it } from 'vitest';
import { CHANGE_LABELS, changeTypeLabel } from './labels';

describe('CHANGE_LABELS', () => {
  it('has a hand-written label for every change type', () => {
    for (const t of CHANGE_TYPES) expect(CHANGE_LABELS[t], t).toBeTruthy();
  });
  it('labels the 18a-1 types', () => {
    expect(changeTypeLabel('status_change')).toBe('Opening status change');
    expect(changeTypeLabel('profile_change')).toBe('Profile change');
    expect(changeTypeLabel('audience_growth')).toBe('Audience growth');
  });
});
