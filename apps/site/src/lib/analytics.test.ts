// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { analyticsBeforeSend } from './analytics';

describe('analyticsBeforeSend', () => {
  it('strips the query and hash from the URL (Sentry policy)', () => {
    expect(analyticsBeforeSend({ type: 'pageview', url: 'https://rivalmonday.com/?join=business&email=a@b.co#join' })).toEqual({ type: 'pageview', url: 'https://rivalmonday.com/' });
    expect(analyticsBeforeSend({ type: 'event', url: 'https://rivalmonday.com/pricing#faq' }).url).toBe('https://rivalmonday.com/pricing');
    expect(analyticsBeforeSend({ type: 'pageview', url: 'https://rivalmonday.com/how-it-works' }).url).toBe('https://rivalmonday.com/how-it-works');
  });
});
