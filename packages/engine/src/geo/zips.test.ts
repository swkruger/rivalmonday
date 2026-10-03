import { describe, expect, it } from 'vitest';
import { extractZips } from './zips';

describe('extractZips (Phase 3d decision 17)', () => {
  it.each([
    ['Serving Dallas, TX 75201.', ['75201']],
    ['Plano, Texas 75024 and nearby', ['75024']],
    ['Our office: 1234 Elm St, Frisco TX 75034-1234', ['75034']],
    ['ZIP codes: 75001, 75002 and 75003', ['75001', '75002', '75003']],
    ['Now serving 75034 and 75035! Call 972-555-0100. Systems from $12000.', ['75034', '75035']],
    ['Areas we serve: 75201/75204', ['75201', '75204']],
    ['zip 75093', ['75093']],
    ["We've serviced over 500 Plano, TX 75024 homes since 2010.", ['75024']],
    ['Katy, TX 77494 customers', ['77494']],
    ['Frisco, TX 75034 reviews', ['75034']],
  ])('reads %s', (text, zips) => {
    expect(extractZips(text)).toEqual(zips);
  });

  it.each([
    'Our 36000 BTU units cool any home',
    'Call 12345 today',
    'Systems from $12000 or $15000',
    'Over 10000 happy customers',
    '24000 and 36000 BTU models in stock',
    '12345 Main Street',
    'Rated 4.9 by 25000 reviews',
    'Coverage of 50000 sq ft',
    'call in 75001', // "in" is a word, not Indiana (abbreviations are upper case)
  ])('ignores %s', (text) => {
    expect(extractZips(text)).toEqual([]);
  });
});
