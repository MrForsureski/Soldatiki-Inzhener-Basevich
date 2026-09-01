import { z } from 'zod';

export const orderRequestSchema = z.object({
  requestId: z.string().uuid(),
  items: z.array(z.object({
    productId: z.string().regex(/^[a-z0-9-]{2,80}$/),
    quantity: z.number().int().min(1).max(20),
  })).min(1).max(20),
  customer: z.object({
    name: z.string().trim().min(5).max(160),
    phone: z.string().trim().min(10).max(32),
    postcode: z.string().regex(/^\d{6}$/),
    address: z.string().trim().min(10).max(500),
    comment: z.string().trim().max(500).default(''),
  }),
  consentAccepted: z.literal(true),
  consentVersion: z.string().min(1).max(64),
}).strict();

export type OrderRequest = z.infer<typeof orderRequestSchema>;

export const orderStatusRequestSchema = z.object({
  checkoutToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
}).strict();

export type ProductRecord = {
  id: string;
  title: string;
  price_kopecks: number;
};

export function mergeRequestedItems(items: OrderRequest['items']) {
  const quantities = new Map<string, number>();
  for (const item of items) {
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
  }
  if ([...quantities.values()].some((quantity) => quantity > 20)) {
    throw new Error('TOO_MANY_ITEMS');
  }
  return quantities;
}

export function calculateOrder(
  products: ProductRecord[],
  quantities: Map<string, number>,
) {
  if (products.length !== quantities.size) throw new Error('UNKNOWN_PRODUCT');

  const items = products.map((product) => {
    const quantity = quantities.get(product.id);
    if (!quantity) throw new Error('UNKNOWN_PRODUCT');
    return { ...product, quantity, lineTotalKopecks: product.price_kopecks * quantity };
  });
  const totalKopecks = items.reduce((total, item) => total + item.lineTotalKopecks, 0);
  if (!Number.isSafeInteger(totalKopecks) || totalKopecks > 100_000_000) {
    throw new Error('ORDER_TOTAL_INVALID');
  }
  return { items, totalKopecks };
}

export function formatRubles(kopecks: number) {
  return `${new Intl.NumberFormat('ru-RU').format(kopecks / 100)} ₽`;
}
