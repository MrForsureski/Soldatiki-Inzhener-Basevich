import { describe, expect, it } from 'vitest';
import { calculateOrder, mergeRequestedItems } from '../src/domain/orders.js';

describe('server-side order calculation', () => {
  it('merges duplicate cart lines and trusts database prices', () => {
    const quantities = mergeRequestedItems([
      { productId: 'vikings', quantity: 1 },
      { productId: 'vikings', quantity: 2 },
    ]);
    const result = calculateOrder([
      { id: 'vikings', title: 'Викинги', price_kopecks: 420000 },
    ], quantities);

    expect(result.items[0]?.quantity).toBe(3);
    expect(result.totalKopecks).toBe(1_260_000);
  });

  it('rejects an unknown product', () => {
    const quantities = new Map([['missing', 1]]);
    expect(() => calculateOrder([], quantities)).toThrow('UNKNOWN_PRODUCT');
  });
});
