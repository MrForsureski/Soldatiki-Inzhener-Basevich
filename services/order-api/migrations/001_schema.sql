CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1;

CREATE TABLE IF NOT EXISTS products (
  id text PRIMARY KEY,
  title text NOT NULL,
  price_kopecks integer NOT NULL CHECK (price_kopecks >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY,
  public_number varchar(32) NOT NULL UNIQUE,
  status varchar(32) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'awaiting_admin', 'confirmed', 'cancelled')),
  total_kopecks integer NOT NULL CHECK (total_kopecks >= 0),
  currency char(3) NOT NULL DEFAULT 'RUB',
  customer_ciphertext text NOT NULL,
  customer_iv text NOT NULL,
  customer_auth_tag text NOT NULL,
  consent_version varchar(64) NOT NULL,
  consented_at timestamptz NOT NULL,
  vk_user_id bigint,
  submitted_at timestamptz,
  delete_after timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status);
CREATE INDEX IF NOT EXISTS orders_delete_after_idx ON orders (delete_after);
CREATE INDEX IF NOT EXISTS orders_vk_user_id_idx ON orders (vk_user_id);

CREATE TABLE IF NOT EXISTS order_items (
  id bigserial PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  title_snapshot text NOT NULL,
  price_kopecks integer NOT NULL CHECK (price_kopecks >= 0),
  quantity integer NOT NULL CHECK (quantity > 0 AND quantity <= 20),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items (order_id);

CREATE TABLE IF NOT EXISTS checkout_tokens (
  token_hash char(64) PRIMARY KEY,
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS checkout_tokens_expires_at_idx ON checkout_tokens (expires_at);

CREATE TABLE IF NOT EXISTS vk_events (
  event_key text PRIMARY KEY,
  event_type varchar(64) NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE TABLE IF NOT EXISTS message_outbox (
  id bigserial PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  vk_event_key text NOT NULL REFERENCES vk_events(event_key) ON DELETE CASCADE,
  peer_id bigint NOT NULL,
  random_id integer NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id),
  UNIQUE (vk_event_key)
);

CREATE INDEX IF NOT EXISTS message_outbox_pending_idx
  ON message_outbox (status, next_attempt_at)
  WHERE status IN ('pending', 'failed');
