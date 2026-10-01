import { describe, expect, it } from 'vitest';
import { detectBlocked } from './blocked';

describe('detectBlocked', () => {
  it.each([401, 403, 429])('treats HTTP %i as blocked', (s) => expect(detectBlocked(s, '<html></html>')).toBe(true));
  it('treats challenge pages as blocked even with 200/503', () => {
    expect(detectBlocked(503, '<title>Just a moment...</title>')).toBe(true);
    expect(detectBlocked(200, '<div id="challenge-platform"></div>')).toBe(true);
    expect(detectBlocked(200, '<div class="g-recaptcha">verify you are human</div>')).toBe(true);
  });
  it('does not flag normal pages', () => {
    expect(detectBlocked(200, '<h1>AC tune-up $99</h1>')).toBe(false);
    expect(detectBlocked(null, '')).toBe(false);
  });
});
