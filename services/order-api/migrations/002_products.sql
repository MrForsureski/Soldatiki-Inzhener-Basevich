INSERT INTO products (id, title, price_kopecks, active)
VALUES
  ('grenadiers-1812', 'Гренадеры Русской гвардии', 490000, true),
  ('roman-legion', 'Римские легионеры', 360000, true),
  ('vikings', 'Викинги в походе', 420000, true),
  ('red-army-1943', 'Пехота Красной армии', 390000, true),
  ('teutonic-knights', 'Рыцари Тевтонского ордена', 570000, true),
  ('french-hussars', 'Французские гусары', 640000, true)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  price_kopecks = EXCLUDED.price_kopecks,
  updated_at = now();
