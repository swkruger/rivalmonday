import { describe, expect, it } from 'vitest';
import { collectPreviewItems } from '../src/collect.js';

describe('collectPreviewItems', () => {
  it('email items carry html and Subject line', async () => {
    const items = await collectPreviewItems();
    const emails = items.filter((i) => i.surface === 'emails');
    expect(emails.length).toBeGreaterThan(5);
    const e = emails[0]!;
    expect(e).toMatchObject({ kind: 'email', line: 1 });
    expect(e.file).toBe(`packages/email/previews/${e.anchor.replace(/^email:/, '')}`);
    expect(e.text.startsWith('Subject: ')).toBe(true);
    expect(e.text).toContain('\n\n');
    expect(e.html).toContain('<');
    const docs = items.filter((i) => i.surface === 'documents');
    expect(docs.length).toBeGreaterThan(0);
    expect(docs[0]).toMatchObject({ kind: 'document' });
    expect(docs[0]!.anchor).toMatch(/^document:/);
    expect(docs[0]!.text).not.toMatch(/<[a-z]/i);
    expect(docs[0]!.text.length).toBeGreaterThan(20);
    expect(new Set(items.map((i) => i.file)).size).toBe(items.length);
  });
});
