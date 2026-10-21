import { describe, expect, it } from 'vitest';
import { BOT_TOKEN, BOT_USER_AGENT, siteHost } from './user-agent';

// The fetch itself (body cap, UA header, redirect checks) is tested in ../net/guard.test.ts.

describe('BOT_USER_AGENT', () => {
  it('points at the live bot page on rivalmonday.app', () => {
    expect(BOT_USER_AGENT).toContain('+https://rivalmonday.app/bot');
    expect(BOT_USER_AGENT).toContain(BOT_TOKEN);
  });
});

describe('siteHost', () => {
  it('drops a leading www. and lower-cases', () => {
    expect(siteHost('https://WWW.Site.example/a')).toBe('site.example');
  });
});
