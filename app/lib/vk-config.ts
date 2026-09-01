export const VK_PUBLIC_COMMUNITY_URL = 'https://vk.ru/engineer_basevich';

export const VK_ORDER_COMMUNITY_SLUG =
  process.env.NEXT_PUBLIC_VK_ORDER_COMMUNITY_SLUG || 'basevich_orders';

function readPositiveId(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const VK_ORDER_COMMUNITY_ID = readPositiveId(
  process.env.NEXT_PUBLIC_VK_ORDER_COMMUNITY_ID,
  241198856,
);

export const VK_APP_ID = readPositiveId(
  process.env.NEXT_PUBLIC_VK_APP_ID,
  54747236,
);

export const VK_MINI_APP_URL = `https://vk.ru/app${VK_APP_ID}`;

export const VK_ORDER_DIALOG_URL =
  `https://vk.me/${VK_ORDER_COMMUNITY_SLUG}?ref=site_order&ref_source=catalog`;

export const ORDER_API_URL =
  (process.env.NEXT_PUBLIC_ORDER_API_URL || '').trim().replace(/\/$/, '');

export const ORDER_CONSENT_VERSION =
  process.env.NEXT_PUBLIC_ORDER_CONSENT_VERSION || 'orders-v1';
