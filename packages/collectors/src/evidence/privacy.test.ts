import { describe, expect, it } from 'vitest';
import { pseudonymizeReviewer, redactContactInfo, requireSalt, scrubReviewerIdentity } from './privacy';

const salt = 's'.repeat(32);

describe('pseudonymizeReviewer', () => {
  it('is stable, case/whitespace-insensitive and not reversible to the name', () => {
    const a = pseudonymizeReviewer('Jane Doe', salt);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(pseudonymizeReviewer('  jane doe ', salt)).toBe(a);
    expect(pseudonymizeReviewer('Jane Doe', 't'.repeat(32))).not.toBe(a);
    expect(a).not.toContain('jane');
  });
  it('returns null for missing names', () => {
    expect(pseudonymizeReviewer('', salt)).toBeNull();
    expect(pseudonymizeReviewer(undefined, salt)).toBeNull();
  });
});

describe('redactContactInfo', () => {
  it('redacts e-mails and phone numbers but keeps prices and years', () => {
    const out = redactContactInfo('Call me at (404) 555-0199 or +1 404.555.0199, mail jane@x.com. Paid $79 in 2026.');
    expect(out).toBe('Call me at [phone] or [phone], mail [email]. Paid $79 in 2026.');
  });

  it('redacts non-NANP international phone numbers as exactly one token each', () => {
    expect(redactContactInfo('Call +44 20 7946 0958 for support')).toBe('Call [phone] for support');
    expect(redactContactInfo('Ring +49 (30) 123456 instead')).toBe('Ring [phone] instead');
    expect(redactContactInfo('Or +33 1 23 45 67 89 anytime')).toBe('Or [phone] anytime');
  });

  it('leaves dates, zip codes and prices with no phone shape unchanged', () => {
    expect(redactContactInfo('Paid $1,299 on 2026-09-20, zip 30338')).toBe('Paid $1,299 on 2026-09-20, zip 30338');
  });
});

describe('requireSalt', () => {
  it('requires a long salt', () => {
    expect(() => requireSalt({})).toThrow(/REVIEWER_HASH_SALT/);
    expect(() => requireSalt({ REVIEWER_HASH_SALT: 'short' })).toThrow(/REVIEWER_HASH_SALT/);
    expect(requireSalt({ REVIEWER_HASH_SALT: salt })).toBe(salt);
  });
});

describe('scrubReviewerIdentity', () => {
  const payload = [
    {
      items: [
        {
          review_id: 'r1',
          profile_name: 'Jane Doe',
          profile_url: 'https://maps/contrib/1',
          profile_image_url: 'https://x/img.jpg',
          review_text: 'Call 404-555-0199',
          owner_answer: 'mail a@b.com',
          original_review_text: 'Escríbeme a ana@x.com o al +34 612 345 678',
          images: [{ type: 'image', alt: 'x', url: 'https://x/photo.jpg', image_url: 'https://x/photo2.jpg' }],
          review_images: ['https://x/photo3.jpg'],
          photos: [{ src: 'https://x/photo4.jpg' }],
          Photo_Url: 'https://x/photo5.jpg',
          photos_count: 3,
          local_guide: true,
          author_name: 'Jane Doe',
          reviewer_id: '1234567890',
          profile_id: '987',
          user_url: 'https://x/u/1',
          review_url: 'https://www.google.com/maps/contrib/112233/reviews',
          rating: { value: 5 },
        },
      ],
    },
  ];

  it('pseudonymises reviewer names, strips reviewer URLs/ids/photos and review photos, redacts contact info, keeps the rest', () => {
    const original = JSON.stringify(payload);
    const result = scrubReviewerIdentity(payload, salt);
    const json = JSON.stringify(result);

    expect(json).not.toContain('Jane');
    expect(json).not.toContain('contrib');
    expect(json).not.toContain('img.jpg');
    expect(json).not.toContain('ana@x.com');
    expect(json).not.toContain('612');

    const [group] = result as Array<{ items: Array<Record<string, unknown>> }>;
    const [item] = group.items;
    expect(item.reviewer_hash).toBe(pseudonymizeReviewer('Jane Doe', salt));
    expect(item.profile_name).toBeUndefined();
    expect(item.profile_url).toBeUndefined();
    expect(item.profile_image_url).toBeUndefined();
    expect(item.review_text).toBe('Call [phone]');
    expect(item.owner_answer).toBe('mail [email]');
    expect(item.original_review_text).toBe('Escríbeme a [email] o al [phone]');
    expect(item.review_id).toBe('r1');
    // Reviewer-uploaded review photos are stripped too (user decision 2026-10-01).
    expect(json).not.toMatch(/photo\d?\.jpg/);
    expect(item.images).toBeUndefined();
    expect(item.review_images).toBeUndefined();
    expect(item.photos).toBeUndefined();
    expect(item.Photo_Url).toBeUndefined();
    expect(item.author_name).toBeUndefined();
    expect(item.reviewer_id).toBeUndefined();
    expect(item.profile_id).toBeUndefined();
    expect(item.user_url).toBeUndefined();
    expect(item.review_url).toBeUndefined();
    // Non-identifying review data survives.
    expect(item.photos_count).toBe(3);
    expect(item.local_guide).toBe(true);
    expect(item.rating).toEqual({ value: 5 });

    // input unchanged
    expect(JSON.stringify(payload)).toBe(original);
  });

  it('keeps a non-contributor review permalink and is idempotent', () => {
    const once = scrubReviewerIdentity([{ review_id: 'r2', profile_name: 'Ann', review_url: 'https://www.google.com/maps/reviews/data=!4m5' }], salt);
    expect(once).toEqual([{ review_id: 'r2', reviewer_hash: pseudonymizeReviewer('Ann', salt), review_url: 'https://www.google.com/maps/reviews/data=!4m5' }]);
    expect(scrubReviewerIdentity(once, salt)).toEqual(once);
  });
});
