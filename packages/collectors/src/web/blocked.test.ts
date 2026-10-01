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
  it('does not flag an ordinary page that merely contains a reCAPTCHA widget or the words "access denied"', () => {
    expect(
      detectBlocked(
        200,
        '<form><div class="g-recaptcha" data-sitekey="x"></div><script src="https://www.google.com/recaptcha/api.js"></script></form>',
      ),
    ).toBe(false);
    expect(detectBlocked(200, '<p>Access denied? Call our office to reset your patient portal password.</p>')).toBe(false);
  });
});
