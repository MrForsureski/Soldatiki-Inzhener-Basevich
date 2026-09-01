import { createHmac, randomBytes } from 'node:crypto';

export const checkoutTokenPattern = /^[A-Za-z0-9_-]{43}$/;

export function createCheckoutToken() {
  return randomBytes(32).toString('base64url');
}

export function hashCheckoutToken(token: string, pepper: string) {
  return createHmac('sha256', pepper).update(token, 'utf8').digest('hex');
}
