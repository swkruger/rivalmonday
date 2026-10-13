import { describe, expect, it } from 'vitest';
import { maskEmail, maskEmailsIn, maskSupportFields } from './mask';

describe('maskEmail', () => {
  it('keeps the first character of the local part and the domain', () => {
    expect(maskEmail('john@acme.com')).toBe('j•••@acme.com');
  });
  it('handles a single-character local part', () => {
    expect(maskEmail('j@acme.com')).toBe('j•••@acme.com');
  });
  it('masks everything when there is no @', () => {
    expect(maskEmail('not-an-email')).toBe('•••');
    expect(maskEmail('')).toBe('•••');
  });
  it('splits on the last @', () => {
    expect(maskEmail('a@b@acme.com')).toBe('a•••@acme.com');
  });
});

describe('maskEmailsIn', () => {
  it('masks a bare address, an address inside text, and leaves text without one unchanged', () => {
    expect(maskEmailsIn('john@acme.com')).toBe('j•••@acme.com');
    expect(maskEmailsIn('Ann <ann@x.io>')).toBe('Ann <a•••@x.io>');
    expect(maskEmailsIn('Ann')).toBe('Ann');
    expect(maskEmailsIn('')).toBe('');
  });
  it('masks several addresses and keeps surrounding punctuation', () => {
    expect(maskEmailsIn('a@b.co, (cee@d.org).')).toBe('a•••@b.co, (c•••@d.org).');
  });
});

describe('maskSupportFields', () => {
  const out = {
    owner: { email: 'jane@acme.com', name: 'Jane' },
    rows: [{ id: 1, email: 'a@x.io' }, { id: 2, email: null }, { id: 3 }],
    nested: [{ members: [{ email: 'm@y.io' }, { email: 'n@y.io' }] }],
    count: 3,
  };

  it('masks dot paths, arrays via [] and leaves non-strings and absent keys alone', () => {
    const masked = maskSupportFields(out, ['owner.email', 'rows[].email', 'nested[].members[].email', 'missing.path', 'count']);
    expect(masked.owner).toEqual({ email: 'j•••@acme.com', name: 'Jane' });
    expect(masked.rows).toEqual([{ id: 1, email: 'a•••@x.io' }, { id: 2, email: null }, { id: 3 }]);
    expect(masked.nested[0]!.members.map((m) => m.email)).toEqual(['m•••@y.io', 'n•••@y.io']);
    expect(masked.count).toBe(3);
  });

  it('does not mutate the original and returns it unchanged for no paths', () => {
    const copy = structuredClone(out);
    maskSupportFields(out, ['owner.email', 'rows[].email']);
    expect(out).toEqual(copy);
    expect(maskSupportFields(out, [])).toEqual(out);
  });

  it('masks emails inside a name field and leaves plain names alone', () => {
    const rows = [{ name: 'Ann <ann@x.io>' }, { name: 'zed@c.io' }, { name: 'Ann' }, { name: null }];
    expect(maskSupportFields(rows, ['[].name'])).toEqual([{ name: 'Ann <a•••@x.io>' }, { name: 'z•••@c.io' }, { name: 'Ann' }, { name: null }]);
  });

  it('masks a top-level array output', () => {
    expect(maskSupportFields([{ email: 'a@b.co' }], ['[].email'])).toEqual([{ email: 'a•••@b.co' }]);
  });

  it('masks a dedicated email field fail-closed: free text or a non-address becomes •••', () => {
    expect(maskSupportFields({ email: 'not an address' }, ['email'])).toEqual({ email: '•••' });
    expect(maskSupportFields({ ownerEmail: 'ann@x.io' }, ['ownerEmail'])).toEqual({ ownerEmail: 'a•••@x.io' });
    expect(maskSupportFields({ ownerName: 'Ann <ann@x.io>' }, ['ownerName'])).toEqual({ ownerName: 'Ann <a•••@x.io>' });
  });
});

describe('maskEmailsIn performance', () => {
  it('finishes fast on a 100k-character string without @ and on one long run before an @', () => {
    const t = Date.now();
    expect(maskEmailsIn('a'.repeat(100_000))).toBe('a'.repeat(100_000));
    maskEmailsIn(`${'a'.repeat(100_000)}@x.io`);
    expect(Date.now() - t).toBeLessThan(500);
  });
});
