import { ToolError } from '@cs/core';
import { describe, expect, it } from 'vitest';
import { isHiddenToolError } from './tools';

describe('isHiddenToolError', () => {
  it('hides not_found, permission_denied and invalid_input behind a 404', () => {
    expect(isHiddenToolError(new ToolError('not_found', 'x'))).toBe(true);
    expect(isHiddenToolError(new ToolError('permission_denied', 'x'))).toBe(true);
    expect(isHiddenToolError(new ToolError('invalid_input', 'x'))).toBe(true);
    expect(isHiddenToolError(new ToolError('internal', 'x'))).toBe(false);
    expect(isHiddenToolError(new Error('x'))).toBe(false);
  });
});
