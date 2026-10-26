import { describe, expect, it } from 'vitest';
import { parseEvalArgs, resolveMaxUsd } from './args';

describe('parseEvalArgs', () => {
  it('parses run with defaults', () => {
    expect(parseEvalArgs(['run', '--suite', 'all'])).toEqual({ cmd: 'run', suite: 'all', mode: 'replay', reportDir: 'eval-report', updateBaseline: false });
  });
  it('parses run flags', () => {
    expect(parseEvalArgs(['run', '--suite', 'briefs', '--mode', 'live', '--max-usd', '2.5', '--report-dir', 'out'])).toEqual({
      cmd: 'run', suite: 'briefs', mode: 'live', maxUsd: 2.5, reportDir: 'out', updateBaseline: false,
    });
    expect(parseEvalArgs(['run', '--suite', 'ask', '--update-baseline'])).toMatchObject({ updateBaseline: true, mode: 'replay' });
  });
  it('rejects --update-baseline in live mode', () => {
    expect(parseEvalArgs(['run', '--suite', 'ask', '--mode', 'live', '--update-baseline'])).toHaveProperty('error');
  });
  it('parses record and build', () => {
    expect(parseEvalArgs(['record', '--suite', 'ask', '--max-usd', '5'])).toEqual({ cmd: 'record', suite: 'ask', reportDir: 'eval-report', maxUsd: 5 });
    expect(parseEvalArgs(['build', '--suite', 'changes'])).toEqual({ cmd: 'build', suite: 'changes' });
  });
  it('parses record --fill and refuses --fill elsewhere', () => {
    expect(parseEvalArgs(['record', '--suite', 'ask', '--fill', '--max-usd', '2'])).toEqual({ cmd: 'record', suite: 'ask', reportDir: 'eval-report', maxUsd: 2, fill: true });
    expect(parseEvalArgs(['run', '--suite', 'ask', '--fill'])).toHaveProperty('error');
  });
  it('parses the three label modes and requires exactly one', () => {
    expect(parseEvalArgs(['label', '--suite', 'reviews', '--export', 'f.csv'])).toMatchObject({ cmd: 'label', export: 'f.csv', prelabel: false });
    expect(parseEvalArgs(['label', '--suite', 'reviews', '--import', 'f.csv', '--by', 'Sam'])).toMatchObject({ import: 'f.csv', by: 'Sam' });
    expect(parseEvalArgs(['label', '--suite', 'reviews', '--prelabel'])).toMatchObject({ prelabel: true });
    expect(parseEvalArgs(['label', '--suite', 'reviews'])).toHaveProperty('error');
    expect(parseEvalArgs(['label', '--suite', 'reviews', '--prelabel', '--export', 'f'])).toHaveProperty('error');
    expect(parseEvalArgs(['label', '--suite', 'reviews', '--import', 'f.csv'])).toHaveProperty('error');
    expect(parseEvalArgs(['label', '--suite', 'changes', '--prelabel', '--max-usd', '5'])).toMatchObject({ prelabel: true, maxUsd: 5 });
    expect(parseEvalArgs(['label', '--suite', 'changes', '--export', 'f.csv', '--max-usd', '5'])).toHaveProperty('error');
    expect(parseEvalArgs(['label', '--suite', 'briefs', '--prelabel'])).toHaveProperty('error');
    expect(parseEvalArgs(['build', '--suite', 'ask'])).toHaveProperty('error');
    expect(parseEvalArgs(['build', '--suite', 'all'])).toHaveProperty('error');
  });
  it('rejects an unknown suite, missing suite, unknown command, bad numbers and unknown flags', () => {
    expect(parseEvalArgs(['run', '--suite', 'nope'])).toHaveProperty('error', expect.stringContaining('unknown suite "nope"'));
    expect(parseEvalArgs(['run'])).toHaveProperty('error');
    expect(parseEvalArgs(['frobnicate', '--suite', 'ask'])).toHaveProperty('error', expect.stringContaining('unknown command'));
    expect(parseEvalArgs([])).toHaveProperty('error');
    expect(parseEvalArgs(['run', '--suite', 'ask', '--max-usd', '0'])).toHaveProperty('error');
    expect(parseEvalArgs(['run', '--suite', 'ask', '--mode', 'fast'])).toHaveProperty('error');
    expect(parseEvalArgs(['run', '--suite', 'ask', '--bogus'])).toHaveProperty('error');
  });
});

describe('resolveMaxUsd', () => {
  it('prefers the flag, then EVAL_MAX_USD, then 5', () => {
    expect(resolveMaxUsd(3, { EVAL_MAX_USD: '9' }, true)).toBe(3);
    expect(resolveMaxUsd(undefined, { EVAL_MAX_USD: '9' }, true)).toBe(9);
    expect(resolveMaxUsd(undefined, {}, true)).toBe(5);
  });
  it('refuses live runs in CI without a cap, but not replay', () => {
    expect(resolveMaxUsd(undefined, { CI: 'true' }, true)).toHaveProperty('error');
    expect(resolveMaxUsd(undefined, { CI: 'true' }, false)).toBe(5);
    expect(resolveMaxUsd(undefined, { CI: 'true', EVAL_MAX_USD: '5' }, true)).toBe(5);
  });
  it('rejects a bad EVAL_MAX_USD', () => {
    expect(resolveMaxUsd(undefined, { EVAL_MAX_USD: 'abc' }, false)).toHaveProperty('error');
  });
});
