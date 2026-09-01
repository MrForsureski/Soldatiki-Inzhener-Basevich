import { describe, expect, it } from 'vitest';
import { safeEqual, stableRandomId } from '../src/lib/security.js';
import { checkoutTokenPattern, createCheckoutToken, hashCheckoutToken } from '../src/lib/tokens.js';

describe('checkout tokens', () => {
  it('creates a 256-bit URL-safe token and stores only a stable HMAC', () => {
    const token = createCheckoutToken();
    expect(token).toMatch(checkoutTokenPattern);
    expect(hashCheckoutToken(token, 'x'.repeat(32))).toHaveLength(64);
    expect(hashCheckoutToken(token, 'x'.repeat(32))).not.toContain(token);
  });
});

describe('callback helpers', () => {
  it('compares callback secrets and creates a valid stable random id', () => {
    expect(safeEqual('same-secret', 'same-secret')).toBe(true);
    expect(safeEqual('same-secret', 'other-secret')).toBe(false);
    const randomId = stableRandomId('a0c63f46-7a80-43d2-91f9-ea143f1bfaa1');
    expect(randomId).toBeGreaterThan(0);
    expect(randomId).toBe(stableRandomId('a0c63f46-7a80-43d2-91f9-ea143f1bfaa1'));
  });
});
