import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/config.js';
import { migrate } from '../src/db/migrate.js';
import { createPool } from '../src/db/pool.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integration = testDatabaseUrl ? describe : describe.skip;

const requestId = '00000000-0000-4000-8000-000000000001';
const allowedOrigin = 'https://soldatiki-inzhener-basevich.onrender.com';

const orderBody = {
  requestId,
  items: [{ productId: 'grenadiers-1812', quantity: 2 }],
  customer: {
    name: 'Иванов Иван Иванович',
    phone: '+7 900 000-00-00',
    postcode: '123456',
    address: 'Москва, Тестовая улица, дом 1, квартира 2',
    comment: 'Тестовый заказ',
  },
  consentAccepted: true,
  consentVersion: 'orders-v2-2026-09-01',
};

async function waitFor(check: () => Promise<boolean>, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('WAIT_TIMEOUT');
}

integration('Order API with PostgreSQL and VK Callback', () => {
  let app: FastifyInstance;
  let pool: Pool;
  let config: AppConfig;
  let checkoutToken = '';
  let orderNumber = '';
  const vkFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const authorization = new Headers(init?.headers).get('authorization');
    expect(authorization).toBe('Bearer test-community-token-for-integration');
    expect(String(init?.body)).not.toContain('test-community-token-for-integration');
    return new Response(JSON.stringify({ response: 1 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });

  beforeAll(async () => {
    if (!testDatabaseUrl) return;
    const database = new URL(testDatabaseUrl);
    if (!['127.0.0.1', 'localhost', '::1'].includes(database.hostname)) {
      throw new Error('Integration tests require a local disposable PostgreSQL database');
    }

    Object.assign(process.env, {
      NODE_ENV: 'test',
      PORT: '18081',
      TRUST_PROXY_HOPS: '0',
      DATABASE_URL: testDatabaseUrl,
      DATABASE_SSL: 'false',
      VK_APP_ID: '54747236',
      VK_GROUP_ID: '241198856',
      VK_GROUP_TOKEN: 'test-community-token-for-integration',
      VK_CALLBACK_SECRET: 'test-callback-secret',
      VK_CALLBACK_CONFIRMATION_CODE: 'test-confirmation-code',
      VK_API_VERSION: '5.199',
      PII_ENCRYPTION_KEY_B64: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
      CHECKOUT_TOKEN_PEPPER: 'test-pepper-that-is-at-least-thirty-two-characters',
      ALLOWED_ORIGINS: allowedOrigin,
      CHECKOUT_TOKEN_TTL_MINUTES: '20',
      DRAFT_RETENTION_HOURS: '24',
      PII_RETENTION_DAYS: '90',
      CONSENT_VERSION: 'orders-v2-2026-09-01',
    });

    await migrate();
    config = loadConfig();
    pool = createPool(config);
    await pool.query(
      'TRUNCATE message_outbox, vk_events, checkout_tokens, order_items, orders RESTART IDENTITY CASCADE',
    );
    await pool.query("ALTER SEQUENCE order_number_seq RESTART WITH 1");
    app = await buildApp(config, pool);
    vi.stubGlobal('fetch', vkFetch);
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    if (app) await app.close();
    if (pool) await pool.end();
  });

  it('returns a camelCase server catalog and rejects a foreign Origin', async () => {
    const catalog = await app.inject({ method: 'GET', url: '/v1/products' });
    expect(catalog.statusCode).toBe(200);
    expect(catalog.json().products[0]).toEqual(expect.objectContaining({
      id: expect.any(String),
      priceKopecks: expect.any(Number),
    }));
    expect(catalog.json().products[0]).not.toHaveProperty('price_kopecks');

    const blocked = await app.inject({
      method: 'POST',
      url: '/v1/orders/status',
      headers: { origin: 'https://attacker.example' },
      payload: { checkoutToken: 'a'.repeat(43) },
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json()).toEqual({ code: 'ORIGIN_NOT_ALLOWED' });
  });

  it('creates one draft, safely replays it, and rejects changed data', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: { origin: allowedOrigin },
      payload: orderBody,
    });
    expect(first.statusCode).toBe(201);
    const firstBody = first.json();
    checkoutToken = firstBody.checkoutToken;
    orderNumber = firstBody.orderNumber;

    const replay = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: { origin: allowedOrigin },
      payload: orderBody,
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().orderNumber).toBe(orderNumber);
    expect(replay.json().checkoutToken).not.toBe(checkoutToken);
    checkoutToken = replay.json().checkoutToken;

    const changed = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: { origin: allowedOrigin },
      payload: {
        ...orderBody,
        customer: { ...orderBody.customer, address: 'Москва, Другая улица, дом 5, квартира 8' },
      },
    });
    expect(changed.statusCode).toBe(409);
    expect(changed.json().code).toBe('IDEMPOTENCY_CONFLICT');

    const result = await pool.query<{ count: string; hours: number }>(
      `SELECT count(*)::text AS count,
              EXTRACT(EPOCH FROM (max(delete_after) - now())) / 3600 AS hours
         FROM orders`,
    );
    expect(result.rows[0]?.count).toBe('1');
    expect(Number(result.rows[0]?.hours)).toBeGreaterThan(23);
    expect(Number(result.rows[0]?.hours)).toBeLessThanOrEqual(24);
  });

  it('validates Callback, consumes the token once, and sends one VK message', async () => {
    const denied = await app.inject({
      method: 'POST',
      url: '/vk/callback',
      payload: { type: 'confirmation', group_id: 241198856, secret: 'wrong-secret' },
    });
    expect(denied.statusCode).toBe(403);

    const confirmation = await app.inject({
      method: 'POST',
      url: '/vk/callback',
      payload: {
        type: 'confirmation',
        group_id: 241198856,
        secret: 'test-callback-secret',
      },
    });
    expect(confirmation.statusCode).toBe(200);
    expect(confirmation.body).toBe('test-confirmation-code');

    const callback = {
      type: 'app_payload',
      event_id: 'integration-event-1',
      group_id: 241198856,
      secret: 'test-callback-secret',
      object: {
        user_id: 123456789,
        app_id: 54747236,
        payload: JSON.stringify({ type: 'order_submit', order_token: checkoutToken }),
      },
    };
    const accepted = await app.inject({ method: 'POST', url: '/vk/callback', payload: callback });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.body).toBe('ok');

    await waitFor(async () => {
      const result = await pool.query<{ status: string }>(
        'SELECT status FROM orders WHERE public_number = $1',
        [orderNumber],
      );
      return result.rows[0]?.status === 'awaiting_admin';
    });
    expect(vkFetch).toHaveBeenCalledTimes(1);

    const duplicate = await app.inject({ method: 'POST', url: '/vk/callback', payload: callback });
    expect(duplicate.statusCode).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(vkFetch).toHaveBeenCalledTimes(1);

    const result = await pool.query<{
      outbox_count: string;
      consumed_at: Date | null;
      days: number;
    }>(
      `SELECT (SELECT count(*)::text FROM message_outbox) AS outbox_count,
              t.consumed_at,
              EXTRACT(EPOCH FROM (o.delete_after - now())) / 86400 AS days
         FROM orders o
         JOIN checkout_tokens t ON t.order_id = o.id
        WHERE o.public_number = $1`,
      [orderNumber],
    );
    expect(result.rows[0]?.outbox_count).toBe('1');
    expect(result.rows[0]?.consumed_at).toBeInstanceOf(Date);
    expect(Number(result.rows[0]?.days)).toBeGreaterThan(89);
    expect(Number(result.rows[0]?.days)).toBeLessThanOrEqual(90);
  });
});
