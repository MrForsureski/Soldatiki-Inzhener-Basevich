import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export type EncryptedValue = {
  ciphertext: string;
  iv: string;
  authTag: string;
};

const algorithm = 'aes-256-gcm';

export function encryptJson(value: unknown, key: Buffer, context: string): EncryptedValue {
  if (key.length !== 32) throw new Error('Encryption key must be 32 bytes');

  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, key, iv);
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptJson<T>(value: EncryptedValue, key: Buffer, context: string): T {
  if (key.length !== 32) throw new Error('Encryption key must be 32 bytes');

  const decipher = createDecipheriv(algorithm, key, Buffer.from(value.iv, 'base64'));
  decipher.setAAD(Buffer.from(context, 'utf8'));
  decipher.setAuthTag(Buffer.from(value.authTag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, 'base64')),
    decipher.final(),
  ]);

  return JSON.parse(plaintext.toString('utf8')) as T;
}
