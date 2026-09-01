import { createHash, timingSafeEqual } from 'node:crypto';

export function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function stableEventKey(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function stableRandomId(value: string) {
  const id = createHash('sha256').update(value).digest().readInt32BE(0) & 0x7fffffff;
  return id || 1;
}
