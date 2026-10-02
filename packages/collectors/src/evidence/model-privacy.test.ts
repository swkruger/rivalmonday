import { describe, expect, it } from 'vitest';
import { personNames, redactForModel, redactHealthDetails, redactPersonNames } from './model-privacy';

describe('redactPersonNames (compromise NER)', () => {
  it('removes first names, full names and titled names, keeping punctuation outside the placeholder', () => {
    expect(redactPersonNames('Mike came out the same day and fixed our AC. Thanks Mike!')).toBe('[name] came out the same day and fixed our AC. Thanks [name]!');
    expect(redactPersonNames('Dr. Patel and her hygienist Jessica were so gentle with my daughter Emma.')).toBe(
      '[name] and her hygienist [name] were so gentle with my daughter [name].',
    );
    expect(redactPersonNames('Tech named Carlos Ramirez was great.')).toBe('Tech named [name] was great.');
  });

  it('never redacts words of the business own name', () => {
    expect(redactPersonNames('Called Smith HVAC about a $89 tune-up. Will fix it next week.', ['Smith HVAC'])).toBe(
      'Called Smith HVAC about a $89 tune-up. Will fix it next week.',
    );
    expect(redactPersonNames('Grace was lovely. Hope and Faith Dental is in Austin.', ['Hope and Faith Dental'])).toBe(
      '[name] was lovely. Hope and Faith Dental is in Austin.',
    );
  });

  it('leaves text with no detected names alone, and lists names longest first', () => {
    expect(redactPersonNames('no names here, just a $69 tune-up')).toBe('no names here, just a $69 tune-up');
    expect(personNames('Carlos Ramirez and Carlos came by')[0]).toBe('Carlos Ramirez');
  });

  it('redacts lowercase names too (compromise detects them; there is no capital-letter fast path)', () => {
    expect(redactForModel('great service, ask for mike')).toBe('great service, ask for [name]');
    expect(redactPersonNames('my hygienist jessica was so gentle with my daughter')).toBe('my hygienist [name] was so gentle with my daughter');
  });

  it('protects business-name phrase occurrences only, still redacting a real person who shares a word with the business', () => {
    expect(redactPersonNames("Mike's AC Repair sent Mike, who was great. Thanks Mike!", ["Mike's AC Repair"])).toBe(
      "Mike's AC Repair sent [name], who was great. Thanks [name]!",
    );
    const out = redactPersonNames('Mr. Smith was rude. Smith HVAC never called back.', ['Smith HVAC']);
    expect(out).toContain('Smith HVAC');
    expect(out).not.toMatch(/\bSmith\b(?!\sHVAC)/);
  });
});

describe('redactHealthDetails', () => {
  it('replaces serious conditions but keeps dental and HVAC service words', () => {
    expect(redactHealthDetails('My husband had a heart attack and I am pregnant; he is diabetic.')).toBe('My husband had a [health] and I am [health]; he is [health].');
    expect(redactHealthDetails('She has HIV. Hearing aids are fine.')).toBe('She has [health]. Hearing aids are fine.');
    expect(redactHealthDetails('Root canal with sedation, no pain at all. AC repair was quick.')).toBe('Root canal with sedation, no pain at all. AC repair was quick.');
  });
});

describe('redactForModel', () => {
  it('removes contact details, names and health conditions together', () => {
    const out = redactForModel('Thanks John! Call me at 972-555-0100 or john@example.com. I had a stroke last year. Smith HVAC rocks.', { businessNames: ['Smith HVAC'] });
    expect(out).toBe('Thanks [name]! Call me at [phone] or [email]. I had a [health] last year. Smith HVAC rocks.');
  });
});
