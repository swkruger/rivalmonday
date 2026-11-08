import type { StructuredOffer } from '@cs/collectors';
import { describe, expect, it } from 'vitest';
import { offerPrices } from './json-ld';
import { MAX_PRICE } from './observe';

const offer = (o: Partial<StructuredOffer>): StructuredOffer => ({ type: 'Offer', name: 'AC tune-up', description: null, price: null, lowPrice: null, currency: 'USD', hasPriceSpecification: false, ...o });
const one = (o: Partial<StructuredOffer>) => offerPrices([offer(o)]);

describe('offerPrices', () => {
  it('Offer price 129 USD => exact 129', () => {
    const [b] = one({ price: 129 });
    expect(b!.obs).toMatchObject([{ amount: 129, unit: 'USD', qualifier: 'exact', raw: '$129', context: 'AC tune-up — $129' }]);
    expect(b!.sha).toMatch(/^[0-9a-f]{64}$/);
  });
  it('AggregateOffer lowPrice 79 => from 79; highPrice alone is ignored', () => {
    expect(one({ type: 'AggregateOffer', lowPrice: '79' })[0]!.obs[0]).toMatchObject({ amount: 79, qualifier: 'from', raw: 'from $79' });
    expect(one({ type: 'AggregateOffer', price: 500 })).toEqual([]);
  });
  it('name "$20 off tune-up" => none (also discount words in description)', () => {
    expect(one({ name: '$20 off tune-up', price: 20 })).toEqual([]);
    expect(one({ description: 'Rebate offer', price: 90 })).toEqual([]);
  });
  it('priceSpecification only => none', () => {
    expect(one({ hasPriceSpecification: true, price: 99 })).toEqual([]);
    expect(one({ price: null, hasPriceSpecification: true })).toEqual([]);
  });
  it('EUR => none', () => expect(one({ price: 99, currency: 'EUR' })).toEqual([]));
  it('no currency => exact (treated as USD)', () => expect(one({ price: 99, currency: null })[0]!.obs[0]).toMatchObject({ amount: 99, qualifier: 'exact' }));
  it('"1,299.00" => 1299', () => expect(one({ price: '1,299.00' })[0]!.obs[0]).toMatchObject({ amount: 1299, raw: '$1,299' }));
  it('0 or > MAX_PRICE or junk => none', () => {
    for (const price of [0, '0', MAX_PRICE + 1, 'free', '$99', '-5', '1,29']) expect(one({ price })).toEqual([]);
  });
  it('flags promo from name and dedupes identical offers', () => {
    expect(one({ name: 'Spring special tune-up', price: 89 })[0]!.obs[0]!.promo).toBe(true);
    expect(offerPrices([offer({ price: 89 }), offer({ price: 89 })])).toHaveLength(1);
  });
});
