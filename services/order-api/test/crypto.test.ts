import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptJson, encryptJson } from '../src/lib/crypto.js';

describe('customer data encryption', () => {
  it('round-trips JSON only with the same order context', () => {
    const key = randomBytes(32);
    const customer = { name: 'Иван Иванов', phone: '+7 900 000-00-00' };
    const encrypted = encryptJson(customer, key, 'order-customer-v1:one');

    expect(encrypted.ciphertext).not.toContain(customer.name);
    expect(decryptJson(encrypted, key, 'order-customer-v1:one')).toEqual(customer);
    expect(() => decryptJson(encrypted, key, 'order-customer-v1:two')).toThrow();
  });
});
