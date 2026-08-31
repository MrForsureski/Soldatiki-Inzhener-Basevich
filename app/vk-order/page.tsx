'use client';

import bridge from '@vkontakte/vk-bridge';
import { Check, MessageCircle, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { VK_ORDER_COMMUNITY_ID, VK_ORDER_DIALOG_URL } from '../lib/vk-config';

type SubmitState = 'initializing' | 'ready' | 'submitting' | 'success' | 'error';

function readOrderToken() {
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  return hash.get('order') || '';
}

export default function VkOrderPage() {
  const [state, setState] = useState<SubmitState>('initializing');
  const [orderToken, setOrderToken] = useState('');
  const [embedded, setEmbedded] = useState(false);

  const tokenIsValid = useMemo(
    () => /^[A-Za-z0-9_-]{20,128}$/.test(orderToken),
    [orderToken],
  );

  useEffect(() => {
    const isEmbedded = bridge.isEmbedded();
    const finishInitialization = () => {
      setOrderToken(readOrderToken());
      setEmbedded(isEmbedded);
      setState('ready');
    };

    if (!isEmbedded) {
      void Promise.resolve().then(finishInitialization);
      return;
    }

    const timeout = new Promise<void>((resolve) => {
      window.setTimeout(resolve, 3500);
    });

    void Promise.race([
      bridge.send('VKWebAppInit').then(() => undefined).catch(() => undefined),
      timeout,
    ]).then(() => {
        setOrderToken(readOrderToken());
        setEmbedded(true);
        setState('ready');
      });
  }, []);

  const confirmOrder = async () => {
    if (!tokenIsValid || state === 'submitting') return;

    setState('submitting');
    try {
      await bridge.send('VKWebAppAllowMessagesFromGroup', {
        group_id: VK_ORDER_COMMUNITY_ID,
      });
      await bridge.send('VKWebAppSendPayload', {
        group_id: VK_ORDER_COMMUNITY_ID,
        payload: {
          type: 'order_submit',
          order_token: orderToken,
        },
      });
      setState('success');
    } catch {
      setState('error');
    }
  };

  return (
    <main className="vk-order-page">
      <header className="vk-order-brand">
        <img src="/logo-basevich.png" alt="" />
        <span>
          <small>Солдатики</small>
          <strong>Инженеръ Басевичъ</strong>
        </span>
      </header>

      <section className="vk-order-card" aria-live="polite">
        {state === 'success' ? (
          <>
            <span className="vk-order-icon vk-order-icon--success"><Check aria-hidden="true" /></span>
            <p className="eyebrow">Запрос передан в VK</p>
            <h1>Почти готово</h1>
            <p className="vk-order-lead">
              Дождитесь сообщения от сообщества. Только после него заказ считается
              принятым, и администратор сможет согласовать детали лично.
            </p>
            <a className="vk-order-secondary" href={VK_ORDER_DIALOG_URL} target="_blank" rel="noreferrer">
              Открыть сообщения сообщества
            </a>
          </>
        ) : (
          <>
            <span className="vk-order-icon"><MessageCircle aria-hidden="true" /></span>
            <p className="eyebrow">Последний шаг</p>
            <h1>Подтвердите заказ</h1>
            <p className="vk-order-lead">
              Разрешите сообществу написать вам. После подтверждения администратор
              лично согласует наличие, доставку и способ оплаты.
            </p>

            <div className="vk-order-security">
              <ShieldCheck aria-hidden="true" />
              <span>В VK передаётся одноразовый номер заказа, а не адрес в ссылке.</span>
            </div>

            {!tokenIsValid && state !== 'initializing' && (
              <p className="vk-order-warning">
                Заказ не найден. Вернитесь в каталог и начните оформление ещё раз.
              </p>
            )}

            {!embedded && state !== 'initializing' && (
              <p className="vk-order-hint">Этот экран нужно открыть внутри приложения ВКонтакте.</p>
            )}

            {state === 'error' && (
              <p className="vk-order-warning">
                Не удалось получить разрешение. Попробуйте ещё раз или откройте диалог сообщества.
              </p>
            )}

            <button
              className="vk-order-primary"
              type="button"
              disabled={!tokenIsValid || state === 'initializing' || state === 'submitting'}
              onClick={confirmOrder}
            >
              {state === 'submitting' ? 'Передаём заказ…' : 'Разрешить и подтвердить'}
            </button>

            <a className="vk-order-secondary" href={VK_ORDER_DIALOG_URL} target="_blank" rel="noreferrer">
              Открыть диалог вручную
            </a>
          </>
        )}
      </section>
    </main>
  );
}
