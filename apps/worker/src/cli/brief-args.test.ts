import { describe, expect, it } from 'vitest';
import { parseBriefArgs } from './brief-args';

const A1 = '00000000-0000-4000-8000-0000000000a1';
describe('parseBriefArgs', () => {
  it('requires a client uuid', () => {
    expect(parseBriefArgs([])).toEqual({ error: expect.stringMatching(/--client is required/) });
    expect(parseBriefArgs(['--client', 'x'])).toEqual({ error: expect.stringMatching(/uuid/) });
  });
  it('parses --now and --force', () => {
    expect(parseBriefArgs(['--client', A1, '--now', '2026-10-02T03:30:00Z', '--force'])).toEqual({ client: A1, now: new Date('2026-10-02T03:30:00Z'), force: true, startingPoint: false });
    expect(parseBriefArgs(['--client', A1, '--now', 'soon'])).toEqual({ error: expect.stringMatching(/--now/) });
  });
  it('parses --starting-point and refuses it with --force', () => {
    expect(parseBriefArgs(['--client', A1, '--starting-point'])).toEqual({ client: A1, force: false, startingPoint: true });
    expect(parseBriefArgs(['--client', A1, '--starting-point', '--force'])).toEqual({ error: expect.stringMatching(/cannot be combined/) });
  });
});
