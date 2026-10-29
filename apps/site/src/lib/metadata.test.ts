// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { SITE_URL } from '../../content/site';
import { pageMetadata } from './metadata';

describe('pageMetadata', () => {
  it('canonical is SITE_URL + path', () => {
    const m = pageMetadata('/');
    expect(m.alternates?.canonical).toBe(SITE_URL + '/');
    expect(m.openGraph).toMatchObject({ url: SITE_URL + '/', siteName: 'Rival Monday', type: 'website' });
  });

  it('title within 60', () => {
    const m = pageMetadata('/');
    const title = String(m.title);
    expect(title.length).toBeLessThanOrEqual(60);
    expect(String(m.description).length).toBeLessThanOrEqual(155);
  });
});
