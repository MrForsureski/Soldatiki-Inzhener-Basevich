ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS client_request_id uuid,
  ADD COLUMN IF NOT EXISTS request_fingerprint char(64);

CREATE UNIQUE INDEX IF NOT EXISTS orders_client_request_id_idx
  ON orders (client_request_id)
  WHERE client_request_id IS NOT NULL;
