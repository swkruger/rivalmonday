import { describe, expect, it } from 'vitest';
import { parseRehearsalArgs } from './args';

describe('parseRehearsalArgs', () => {
  it('parses each command', () => {
    expect(parseRehearsalArgs(['seed', '--agencies', '40', '--clients', '3', '--starting-points', '12', '--live-clients', '10', '--confirm-db', 'h/db']))
      .toEqual({ cmd: 'seed', agencies: 40, clients: 3, startingPoints: 12, liveClients: 10, confirmDb: 'h/db', manifest: undefined });
    expect(parseRehearsalArgs(['fault', '--clients', '3'])).toEqual({ cmd: 'fault', clients: 3, manifest: undefined });
    expect(parseRehearsalArgs(['approve', '--manifest', 'm.json'])).toEqual({ cmd: 'approve', manifest: 'm.json' });
    expect(parseRehearsalArgs(['report', '--memory-mb', '2048', '--fixture-log-url', 'https://x/__rehearsal/log', '--fixture-log-token-env', 'FIXTURE_LOG_TOKEN']))
      .toEqual({ cmd: 'report', manifest: undefined, memoryMb: 2048, fixtureLogUrl: 'https://x/__rehearsal/log', fixtureLogTokenEnv: 'FIXTURE_LOG_TOKEN' });
    expect(parseRehearsalArgs(['teardown', '--confirm-db', 'h/db'])).toEqual({ cmd: 'teardown', confirmDb: 'h/db', out: undefined });
    expect(parseRehearsalArgs(['latency', '--out', 'packages/engine/src/rehearsal-latency.json'])).toEqual({ cmd: 'latency', out: 'packages/engine/src/rehearsal-latency.json', days: undefined });
  });

  it('refuses missing confirmations, stray options and bad numbers', () => {
    expect(parseRehearsalArgs(['seed', '--agencies', '40', '--clients', '3', '--starting-points', '12', '--live-clients', '10'])).toMatchObject({ error: expect.stringMatching(/--confirm-db/) });
    expect(parseRehearsalArgs(['teardown'])).toMatchObject({ error: expect.stringMatching(/--confirm-db/) });
    expect(parseRehearsalArgs(['approve', '--confirm-db', 'h/db'])).toMatchObject({ error: expect.stringMatching(/does not take --confirm-db/) });
    expect(parseRehearsalArgs(['fault', '--clients', 'three'])).toMatchObject({ error: expect.stringMatching(/whole number/) });
    expect(parseRehearsalArgs(['report', '--fixture-log-url', 'u'])).toMatchObject({ error: expect.stringMatching(/go together/) });
    expect(parseRehearsalArgs(['wipe'])).toMatchObject({ error: expect.stringMatching(/unknown command/) });
    expect(parseRehearsalArgs([])).toMatchObject({ error: expect.stringMatching(/missing command/) });
  });
});
