import { z } from 'zod';

const booleanFromString = (defaultValue: boolean) => z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .optional()
  .transform((value) => value === undefined ? defaultValue : value === true || value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(3).default(1),
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: booleanFromString(false),
  VK_APP_ID: z.coerce.number().int().positive(),
  VK_GROUP_ID: z.coerce.number().int().positive(),
  VK_GROUP_TOKEN: z.string().min(20),
  VK_CALLBACK_SECRET: z.string().min(8),
  VK_CALLBACK_CONFIRMATION_CODE: z.string().min(1).max(128),
  VK_API_VERSION: z.string().regex(/^\d+\.\d+$/).default('5.199'),
  PII_ENCRYPTION_KEY_B64: z.string().min(1),
  CHECKOUT_TOKEN_PEPPER: z.string().min(32),
  ALLOWED_ORIGINS: z.string().min(1),
  CHECKOUT_TOKEN_TTL_MINUTES: z.coerce.number().int().min(5).max(60).default(20),
  DRAFT_RETENTION_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  PII_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(90),
  CONSENT_VERSION: z.string().min(1).max(64).default('orders-v2-2026-09-01'),
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env) {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Некорректные или отсутствующие переменные окружения: ${fields}`);
  }

  const encryptionKey = Buffer.from(result.data.PII_ENCRYPTION_KEY_B64, 'base64');
  if (encryptionKey.length !== 32) {
    throw new Error('PII_ENCRYPTION_KEY_B64 должен содержать ровно 32 байта в base64');
  }

  const allowedOrigins = result.data.ALLOWED_ORIGINS
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);

  if (!allowedOrigins.length || allowedOrigins.some((origin) => !origin.startsWith('https://'))) {
    throw new Error('ALLOWED_ORIGINS должен содержать HTTPS-адреса через запятую');
  }

  return {
    ...result.data,
    encryptionKey,
    allowedOrigins,
    vkMiniAppUrl: `https://vk.ru/app${result.data.VK_APP_ID}`,
  };
}
