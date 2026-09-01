import type { AppConfig } from '../config.js';

type VkApiResponse = {
  response?: number;
  error?: { error_code?: number; error_msg?: string };
};

export async function sendVkMessage(
  config: AppConfig,
  peerId: number,
  randomId: number,
  message: string,
) {
  const parameters = new URLSearchParams({
    v: config.VK_API_VERSION,
    peer_id: String(peerId),
    random_id: String(randomId),
    message,
  });

  const response = await fetch('https://api.vk.ru/method/messages.send', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.VK_GROUP_TOKEN}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: parameters,
    signal: AbortSignal.timeout(8_000),
  });
  const body = await response.json() as VkApiResponse;

  if (!response.ok || body.error || typeof body.response !== 'number') {
    const code = body.error?.error_code ?? response.status;
    const message = body.error?.error_msg?.slice(0, 160) ?? 'VK API request failed';
    throw new Error(`VK_API_${code}: ${message}`);
  }

  return body.response;
}
