import { ToolError } from '@cs/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RESOURCE_ERROR_CODE, toResourceError, toToolResult } from './errors';

afterEach(() => vi.restoreAllMocks());

describe('internal error logging', () => {
  it('a resource failure logs the resource name, error name, ToolError code and postgres code only', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const pg = Object.assign(new Error('value "user-secret" violates check'), { code: '23514', detail: 'Failing row contains (user-secret).' });
    const drizzle = new Error('Failed query: select $1 params: user-secret', { cause: pg });
    const e = toResourceError(new ToolError('internal', 'Failed: user-secret', { cause: drizzle }), 'brief');
    expect(e).toMatchObject({ code: RESOURCE_ERROR_CODE, message: 'Something went wrong. Try again later.' });
    expect(log).toHaveBeenCalledWith('[mcp] resource brief failed', { error: 'Error', code: 'internal', pgCode: '23514' });
    expect(JSON.stringify(log.mock.calls)).not.toContain('user-secret');
  });

  it('a plain error without a postgres code logs just its name', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    toToolResult(new TypeError('cannot read user-secret'), 'get_brief');
    expect(log).toHaveBeenCalledWith('[mcp] tool get_brief failed', { error: 'TypeError' });
  });

  it('refusals are not logged', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    toToolResult(new ToolError('not_found', 'Brief not found'), 'get_brief');
    expect(log).not.toHaveBeenCalled();
  });
});
