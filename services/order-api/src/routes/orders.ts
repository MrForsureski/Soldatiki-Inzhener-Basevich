import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config.js';
import type { DatabasePool } from '../db/pool.js';
import {
  calculateOrder,
  mergeRequestedItems,
  orderRequestSchema,
  orderStatusRequestSchema,
  type ProductRecord,
} from '../domain/orders.js';
import { encryptJson } from '../lib/crypto.js';
import { createCheckoutToken, hashCheckoutToken } from '../lib/tokens.js';

function createPublicNumber(sequence: number, now = new Date()) {
  const date = now.toISOString().slice(0, 10).replaceAll('-', '');
  return `IB-${date}-${String(sequence).padStart(6, '0')}`;
}

function createRequestFingerprint(
  quantities: Map<string, number>,
  customer: Record<string, string>,
  consentVersion: string,
) {
  const canonical = JSON.stringify({
    items: [...quantities.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([productId, quantity]) => ({ productId, quantity })),
    customer,
    consentVersion,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export async function registerOrderRoutes(
  app: FastifyInstance,
  pool: DatabasePool,
  config: AppConfig,
) {
  app.get('/v1/products', async () => {
    const result = await pool.query<ProductRecord>(
      'SELECT id, title, price_kopecks FROM products WHERE active = true ORDER BY id',
    );
    return {
      products: result.rows.map((product) => ({
        id: product.id,
        title: product.title,
        priceKopecks: product.price_kopecks,
      })),
    };
  });

  app.post('/v1/orders', {
    config: { rateLimit: { max: 8, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const parsed = orderRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: 'INVALID_ORDER', message: 'Проверьте данные заказа.' });
    }

    let quantities: Map<string, number>;
    try {
      quantities = mergeRequestedItems(parsed.data.items);
    } catch {
      return reply.code(400).send({ code: 'INVALID_QUANTITY', message: 'Слишком много одинаковых наборов.' });
    }
    const requestFingerprint = createRequestFingerprint(
      quantities,
      parsed.data.customer,
      parsed.data.consentVersion,
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [parsed.data.requestId]);

      if (parsed.data.consentVersion !== config.CONSENT_VERSION) {
        await client.query('ROLLBACK');
        return reply.code(409).send({
          code: 'CONSENT_CHANGED',
          message: 'Условия обработки данных обновились. Обновите страницу.',
        });
      }

      const existingOrder = await client.query<{
        id: string;
        public_number: string;
        status: string;
        request_fingerprint: string | null;
      }>(
        `SELECT id::text, public_number, status, request_fingerprint
           FROM orders
          WHERE client_request_id = $1`,
        [parsed.data.requestId],
      );
      if (existingOrder.rows[0]) {
        const existing = existingOrder.rows[0];
        if (existing.request_fingerprint !== requestFingerprint) {
          await client.query('ROLLBACK');
          return reply.code(409).send({
            code: 'IDEMPOTENCY_CONFLICT',
            message: 'Данные заказа изменились. Начните оформление ещё раз.',
          });
        }
        if (existing.status !== 'draft') {
          await client.query('ROLLBACK');
          return reply.code(409).send({
            code: 'ORDER_ALREADY_SUBMITTED',
            message: 'Этот заказ уже передан сообществу. Проверьте сообщения ВКонтакте.',
          });
        }
        const checkoutToken = createCheckoutToken();
        const tokenHash = hashCheckoutToken(checkoutToken, config.CHECKOUT_TOKEN_PEPPER);
        const expiresAt = new Date(Date.now() + config.CHECKOUT_TOKEN_TTL_MINUTES * 60_000);
        await client.query(
          `INSERT INTO checkout_tokens (token_hash, order_id, expires_at)
           VALUES ($2, $1, $3)
           ON CONFLICT (order_id) DO UPDATE SET
             token_hash = EXCLUDED.token_hash,
             expires_at = EXCLUDED.expires_at,
             consumed_at = NULL,
             created_at = now()`,
          [existing.id, tokenHash, expiresAt],
        );
        await client.query('COMMIT');
        return reply.send({
          orderNumber: existing.public_number,
          checkoutToken,
          expiresAt: expiresAt.toISOString(),
          launchUrl: `${config.vkMiniAppUrl}#order=${encodeURIComponent(checkoutToken)}`,
        });
      }

      const productsResult = await client.query<ProductRecord>(
        `SELECT id, title, price_kopecks
           FROM products
          WHERE active = true AND id = ANY($1::text[])
          FOR SHARE`,
        [[...quantities.keys()]],
      );

      let calculated: ReturnType<typeof calculateOrder>;
      try {
        calculated = calculateOrder(productsResult.rows, quantities);
      } catch {
        await client.query('ROLLBACK');
        return reply.code(409).send({
          code: 'CATALOG_CHANGED',
          message: 'Один из наборов больше недоступен. Обновите каталог.',
        });
      }

      const orderId = randomUUID();
      const sequenceResult = await client.query<{ sequence: string }>(
        `SELECT nextval('order_number_seq')::text AS sequence`,
      );
      const sequence = Number(sequenceResult.rows[0]?.sequence);
      if (!Number.isSafeInteger(sequence)) throw new Error('ORDER_SEQUENCE_INVALID');

      const publicNumber = createPublicNumber(sequence);
      const encryptedCustomer = encryptJson(
        parsed.data.customer,
        config.encryptionKey,
        `order-customer-v1:${orderId}`,
      );
      const deleteAfter = new Date(Date.now() + config.DRAFT_RETENTION_HOURS * 3_600_000);

      await client.query(
        `INSERT INTO orders (
           id, public_number, total_kopecks,
           customer_ciphertext, customer_iv, customer_auth_tag,
           consent_version, consented_at, delete_after,
           client_request_id, request_fingerprint
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8, $9, $10)`,
        [
          orderId,
          publicNumber,
          calculated.totalKopecks,
          encryptedCustomer.ciphertext,
          encryptedCustomer.iv,
          encryptedCustomer.authTag,
          config.CONSENT_VERSION,
          deleteAfter,
          parsed.data.requestId,
          requestFingerprint,
        ],
      );

      for (const item of calculated.items) {
        await client.query(
          `INSERT INTO order_items (
             order_id, product_id, title_snapshot, price_kopecks, quantity
           ) VALUES ($1, $2, $3, $4, $5)`,
          [orderId, item.id, item.title, item.price_kopecks, item.quantity],
        );
      }

      const checkoutToken = createCheckoutToken();
      const tokenHash = hashCheckoutToken(checkoutToken, config.CHECKOUT_TOKEN_PEPPER);
      const expiresAt = new Date(Date.now() + config.CHECKOUT_TOKEN_TTL_MINUTES * 60_000);
      await client.query(
        `INSERT INTO checkout_tokens (token_hash, order_id, expires_at)
         VALUES ($1, $2, $3)`,
        [tokenHash, orderId, expiresAt],
      );
      await client.query('COMMIT');

      return reply.code(201).send({
        orderNumber: publicNumber,
        checkoutToken,
        expiresAt: expiresAt.toISOString(),
        launchUrl: `${config.vkMiniAppUrl}#order=${encodeURIComponent(checkoutToken)}`,
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      request.log.error({ err: error }, 'order_create_failed');
      return reply.code(503).send({
        code: 'ORDER_SERVICE_UNAVAILABLE',
        message: 'Сервис заказов временно недоступен. Попробуйте ещё раз.',
      });
    } finally {
      client.release();
    }
  });

  app.post('/v1/orders/status', {
    config: { rateLimit: { max: 30, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const parsed = orderStatusRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: 'INVALID_TOKEN' });
    }

    const tokenHash = hashCheckoutToken(parsed.data.checkoutToken, config.CHECKOUT_TOKEN_PEPPER);
    const result = await pool.query<{
      public_number: string;
      status: string;
      total_kopecks: number;
      expires_at: Date;
      item_count: string;
    }>(
      `SELECT o.public_number, o.status, o.total_kopecks,
              t.expires_at, SUM(i.quantity)::text AS item_count
         FROM checkout_tokens t
         JOIN orders o ON o.id = t.order_id
         JOIN order_items i ON i.order_id = o.id
        WHERE t.token_hash = $1
        GROUP BY o.id, t.expires_at`,
      [tokenHash],
    );

    const order = result.rows[0];
    if (!order || order.expires_at.getTime() <= Date.now()) {
      return reply.code(404).send({ code: 'ORDER_NOT_FOUND' });
    }

    return {
      orderNumber: order.public_number,
      status: order.status,
      totalKopecks: order.total_kopecks,
      itemCount: Number(order.item_count),
    };
  });
}
