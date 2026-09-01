import type { AppConfig } from '../config.js';
import type { DatabasePool } from '../db/pool.js';
import { formatRubles } from '../domain/orders.js';
import { sendVkMessage } from '../integrations/vk.js';
import { decryptJson } from '../lib/crypto.js';

type Customer = {
  name: string;
  phone: string;
  postcode: string;
  address: string;
  comment: string;
};

type LockedMessage = {
  id: string;
  order_id: string;
  peer_id: string;
  random_id: number;
  public_number: string;
  total_kopecks: number;
  customer_ciphertext: string;
  customer_iv: string;
  customer_auth_tag: string;
};

type OrderItem = {
  title_snapshot: string;
  price_kopecks: number;
  quantity: number;
};

function buildOrderMessage(order: LockedMessage, customer: Customer, items: OrderItem[]) {
  const itemLines = items.map((item, index) => (
    `${index + 1}. ${item.title_snapshot} — ${item.quantity} шт. × ${formatRubles(item.price_kopecks)}`
  ));
  const comment = customer.comment ? `\nКомментарий: ${customer.comment}` : '';

  return [
    `Здравствуйте! Заказ № ${order.public_number} принят.`,
    '',
    'Состав заказа:',
    ...itemLines,
    '',
    `Итого без доставки: ${formatRubles(order.total_kopecks)}`,
    '',
    'Данные для отправки:',
    `Получатель: ${customer.name}`,
    `Телефон: ${customer.phone}`,
    `Индекс: ${customer.postcode}`,
    `Адрес: ${customer.address}${comment}`,
    '',
    'Администратор лично подтвердит наличие, стоимость доставки и способ оплаты в этом диалоге.',
  ].join('\n').slice(0, 4_000);
}

export async function processOutboxMessage(
  pool: DatabasePool,
  config: AppConfig,
  outboxId: string,
) {
  const client = await pool.connect();
  let message: LockedMessage | undefined;

  try {
    await client.query('BEGIN');
    const result = await client.query<LockedMessage>(
      `SELECT m.id::text, m.order_id::text, m.peer_id::text, m.random_id,
              o.public_number, o.total_kopecks,
              o.customer_ciphertext, o.customer_iv, o.customer_auth_tag
         FROM message_outbox m
         JOIN orders o ON o.id = m.order_id
        WHERE m.id = $1
          AND (
            m.status IN ('pending', 'failed')
            OR (m.status = 'sending' AND m.updated_at < now() - interval '2 minutes')
          )
          AND m.next_attempt_at <= now()
          AND m.attempts < 10
        FOR UPDATE OF m SKIP LOCKED`,
      [outboxId],
    );
    message = result.rows[0];
    if (!message) {
      await client.query('ROLLBACK');
      return false;
    }
    await client.query(
      `UPDATE message_outbox
          SET status = 'sending', attempts = attempts + 1, updated_at = now()
        WHERE id = $1`,
      [outboxId],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  try {
    const itemsResult = await pool.query<OrderItem>(
      `SELECT title_snapshot, price_kopecks, quantity
         FROM order_items
        WHERE order_id = $1
        ORDER BY id`,
      [message.order_id],
    );
    const customer = decryptJson<Customer>({
      ciphertext: message.customer_ciphertext,
      iv: message.customer_iv,
      authTag: message.customer_auth_tag,
    }, config.encryptionKey, `order-customer-v1:${message.order_id}`);
    const text = buildOrderMessage(message, customer, itemsResult.rows);

    await sendVkMessage(config, Number(message.peer_id), message.random_id, text);
    await pool.query(
      `WITH sent AS (
         UPDATE message_outbox
            SET status = 'sent', sent_at = now(), last_error = NULL, updated_at = now()
          WHERE id = $1
          RETURNING order_id
       )
       UPDATE orders
          SET status = 'awaiting_admin', updated_at = now()
        WHERE id = (SELECT order_id FROM sent)`,
      [outboxId],
    );
    return true;
  } catch (error) {
    const safeMessage = error instanceof Error ? error.message.slice(0, 500) : 'MESSAGE_SEND_FAILED';
    await pool.query(
      `UPDATE message_outbox
          SET status = 'failed', last_error = $2,
              next_attempt_at = now() + interval '30 seconds', updated_at = now()
        WHERE id = $1`,
      [outboxId, safeMessage],
    );
    throw error;
  }
}

export async function processPendingOutbox(pool: DatabasePool, config: AppConfig) {
  const result = await pool.query<{ id: string }>(
    `SELECT id::text
       FROM message_outbox
      WHERE (
          status IN ('pending', 'failed')
          OR (status = 'sending' AND updated_at < now() - interval '2 minutes')
        )
        AND next_attempt_at <= now()
        AND attempts < 10
      ORDER BY id
      LIMIT 10`,
  );

  for (const row of result.rows) {
    await processOutboxMessage(pool, config, row.id).catch(() => undefined);
  }
}

export async function deleteExpiredOrders(pool: DatabasePool) {
  await pool.query('DELETE FROM orders WHERE delete_after <= now()');
}
