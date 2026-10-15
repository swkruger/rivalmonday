import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { matchAdAccount } from './match';

const fx = JSON.parse(readFileSync(fileURLToPath(new URL('../../test/fixtures/vendors/dfs-ads-advertisers-live.json', import.meta.url)), 'utf8'));
const accounts: { title: string }[] = fx.tasks[0].result[0].items.filter((i: { type: string }) => i.type === 'ads_advertiser');
const acct = (t: string) => ({ name: accounts.find((a) => a.title === t)!.title, domain: null });
const franchisee = { name: 'Aire Serv of Granbury', city: 'Granbury', domain: null, chain: true };

describe('matchAdAccount', () => {
  it('Aire Serv brand account is weak for Granbury franchisee', () => {
    expect(matchAdAccount(franchisee, acct('Aire Serv SVP LLC'))).toBe('weak');
    expect(matchAdAccount(franchisee, { name: 'Aire Serv', domain: null })).toBe('weak');
  });
  it('"Aire Serv of Granbury" account is strong', () => {
    expect(matchAdAccount(franchisee, { name: 'Aire Serv of Granbury', domain: null })).toBe('strong');
    expect(matchAdAccount(franchisee, acct('Aire Serv Granbury'))).toBe('strong');
  });
  it('other cities are not strong', () => {
    expect(matchAdAccount(franchisee, acct('Aire Serv Omaha'))).not.toBe('strong');
  });
  it('domain equality is strong', () => {
    const c = { ...franchisee, domain: 'https://www.AireServ.com/granbury' };
    expect(matchAdAccount(c, { name: 'Something Else', domain: 'aireserv.com' })).toBe('strong');
  });
  it('non-chain with equal names is strong; unrelated is none', () => {
    const c = { name: 'Granbury Dental Center', city: 'Granbury', domain: null, chain: false };
    expect(matchAdAccount(c, { name: 'Granbury Dental Center, PC', domain: null })).toBe('strong');
    expect(matchAdAccount(c, { name: 'Harris Aire Serv', domain: null })).toBe('none');
  });
});
