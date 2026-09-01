import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppConfig } from '../config.js';
import type { DatabasePool } from '../db/pool.js';
import { checkoutTokenPattern, hashCheckoutToken } from '../lib/tokens.js';
import { safeEqual, stableEventKey, stableRandomId } from '../lib/security.js';
import { processOutboxMessage } from '../workers/outbox.js';

const payloadSchema = z.object({
  type: z.literal('order_submit'),
  order_token: z.string().regex(checkoutTokenPattern),
}).strict();

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parsePayload(value: unknown) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export async function registerVkCallbackRoute(
  app: FastifyInstance,
  pool: DatabasePool,
  config: AppConfig,
) {
  app.post('/vk/callback', {
    config: { rateLimit: { max: 180, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    if (!isObject(request.body)) return reply.code(400).send('bad request');
    const body = request.body;

    if (
      Number(body.group_id) !== config.VK_GROUP_ID
      || typeof body.secret !== 'string'
      || !safeEqual(body.secret, config.VK_CALLBACK_SECRET)
    ) {
      return reply.code(403).send('forbidden');
    }

    if (body.type === 'confirmation') {
      return reply.type('text/plain; charset=utf-8').send(config.VK_CALLBACK_CONFIRMATION_CODE);
    }

    if (body.type !== 'app_payload' || !isObject(body.object)) {
      return reply.type('text/plain; charset=utf-8').send('ok');
    }

    const eventObject = isObject(body.object.app_payload) ? body.object.app_payload : body.object;
    const userId = Number(eventObject.user_id);
    const appId = Number(eventObject.app_id);
    const payload = payloadSchema.safeParse(parsePayload(eventObject.payload));
    if (!Number.isSafeInteger(userId) || userId <= 0 || appId !== config.VK_APP_ID || !payload.success) {
      return reply.type('text/plain; charset=utf-8').send('ok');
    }

    const eventKey = typeof body.event_id === 'string' && body.event_id
      ? body.event_id
      : stableEventKey(body);
    const client = await pool.connect();
    let outboxId: string | undefined;

    try {
      await client.query('BEGIN');
      const insertedEvent = await client.query<{ event_key: string }>(
        `INSERT INTO vk_events (event_key, event_type)
         VALUES ($1, 'app_payload')
         ON CONFLICT (event_key) DO NOTHING
         RETURNING event_key`,
        [eventKey],
      );

      if (!insertedEvent.rowCount) {
        const existing = await client.query<{ id: string }>(
          'SELECT id::text FROM message_outbox WHERE vk_event_key = $1',
          [eventKey],
        );
        outboxId = existing.rows[0]?.id;
        await client.query('COMMIT');
      } else {
        const tokenHash = hashCheckoutToken(
          payload.data.order_token,
          config.CHECKOUT_TOKEN_PEPPER,
        );
        const tokenResult = await client.query<{
          order_id: string;
          expires_at: Date;
          consumed_at: Date | null;
          vk_user_id: string | null;
        }>(
          `SELECT t.order_id::text, t.expires_at, t.consumed_at, o.vk_user_id::text
             FROM checkout_tokens t
             JOIN orders o ON o.id = t.order_id
            WHERE t.token_hash = $1
            FOR UPDATE OF t, o`,
          [tokenHash],
        );
        const token = tokenResult.rows[0];

        if (
          !token
          || token.expires_at.getTime() <= Date.now()
          || (token.consumed_at && Number(token.vk_user_id) !== userId)
        ) {
          await client.query(
            'UPDATE vk_events SET processed_at = now() WHERE event_key = $1',
            [eventKey],
          );
          await client.query('COMMIT');
          return reply.type('text/plain; charset=utf-8').send('ok');
        }

        const existingOutbox = await client.query<{ id: string }>(
          'SELECT id::text FROM message_outbox WHERE order_id = $1',
          [token.order_id],
        );
        if (existingOutbox.rows[0]) {
          outboxId = existingOutbox.rows[0].id;
        } else {
          await client.query(
            `UPDATE checkout_tokens
                SET consumed_at = COALESCE(consumed_at, now())
              WHERE token_hash = $1`,
            [tokenHash],
          );
          await client.query(
            `UPDATE orders
                SET status = 'submitted', vk_user_id = $2,
                    submitted_at = COALESCE(submitted_at, now()),
                    delete_after = now() + make_interval(days => $3),
                    updated_at = now()
              WHERE id = $1`,
            [token.order_id, userId, config.PII_RETENTION_DAYS],
          );
          const outbox = await client.query<{ id: string }>(
            `INSERT INTO message_outbox (
               order_id, vk_event_key, peer_id, random_id
             ) VALUES ($1, $2, $3, $4)
             RETURNING id::text`,
            [token.order_id, eventKey, userId, stableRandomId(token.order_id)],
          );
          outboxId = outbox.rows[0]?.id;
        }
        await client.query(
          'UPDATE vk_events SET processed_at = now() WHERE event_key = $1',
          [eventKey],
        );
        await client.query('COMMIT');
      }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      request.log.error({ err: error }, 'vk_callback_processing_failed');
      return reply.code(503).send('retry');
    } finally {
      client.release();
    }

    if (outboxId) {
      setImmediate(() => {
        void processOutboxMessage(pool, config, outboxId).catch((error: unknown) => {
          request.log.error({ err: error }, 'vk_message_delivery_failed');
        });
      });
    }

    return reply.type('text/plain; charset=utf-8').send('ok');
  });
}
