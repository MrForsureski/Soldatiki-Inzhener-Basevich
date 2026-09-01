'use client';

import bridge from '@vkontakte/vk-bridge';
import { Check, MessageCircle, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  ORDER_API_URL,
  VK_ORDER_COMMUNITY_ID,
  VK_ORDER_DIALOG_URL,
} from '../lib/vk-config';

type SubmitState = 'initializing' | 'checking' | 'ready' | 'submitting' | 'success' | 'error' | 'invalid';

type OrderPreview = {
  orderNumber: string;
  status: string;
  totalKopecks: number;
  itemCount: number;
};

function readOrderToken() {
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  return hash.get('order') || '';
}

const money = (kopecks: number) => (
  `${new Intl.NumberFormat('ru-RU').format(kopecks / 100)} ₽`
);

export default function VkOrderPage() {
  const [state, setState] = useState<SubmitState>('initializing');
  const [orderToken, setOrderToken] = useState('');
  const [preview, setPreview] = useState<OrderPreview | null>(null);
  const [embedded, setEmbedded] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const tokenIsValid = useMemo(
    () => /^[A-Za-z0-9_-]{43}$/.test(orderToken),
    [orderToken],
  );

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const initialize = async () => {
      const isEmbedded = bridge.isEmbedded();
      setEmbedded(isEmbedded);

      if (isEmbedded) {
        const timeout = new Promise<void>((resolve) => {
          window.setTimeout(resolve, 3500);
        });
        await Promise.race([
          bridge.send('VKWebAppInit').then(() => undefined).catch(() => undefined),
          timeout,
        ]);
      }

      if (!active) return;
      const token = readOrderToken();
      setOrderToken(token);

      if (!token) {
        setState('ready');
        return;
      }
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
        setState('invalid');
        return;
      }
      if (!ORDER_API_URL) {
        setErrorMessage('Сервер заказов ещё не подключён. Вернитесь в каталог и используйте резервный диалог.');
        setState('error');
        return;
      }

      setState('checking');
      const timeoutId = window.setTimeout(() => controller.abort(), 12_000);
      try {
        const response = await fetch(`${ORDER_API_URL}/v1/orders/status`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({ checkoutToken: token }),
        });
        if (response.status === 404) {
          setState('invalid');
          return;
        }
        if (!response.ok) throw new Error('ORDER_CHECK_FAILED');
        const result = await response.json() as OrderPreview;
        if (!active) return;
        setPreview(result);
        setState('ready');
      } catch {
        if (!active) return;
        setErrorMessage('Не удалось проверить заказ. Обновите экран через минуту.');
        setState('error');
      } finally {
        window.clearTimeout(timeoutId);
      }
    };

    void initialize();
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const confirmOrder = async () => {
    if (!embedded || !tokenIsValid || !preview || state === 'submitting') return;

    setState('submitting');
    setErrorMessage('');
    try {
      await bridge.send('VKWebAppAllowMessagesFromGroup', {
        group_id: VK_ORDER_COMMUNITY_ID,
      });
    } catch {
      setErrorMessage('Вы не разрешили сообществу написать вам. Без этого бот не сможет прислать заказ.');
      setState('error');
      return;
    }

    try {
      await bridge.send('VKWebAppSendPayload', {
        group_id: VK_ORDER_COMMUNITY_ID,
        payload: {
          type: 'order_submit',
          order_token: orderToken,
        },
      });
      setState('success');
    } catch {
      setErrorMessage('VK не передал заказ сообществу. Попробуйте ещё раз или откройте диалог вручную.');
      setState('error');
    }
  };

  const isLoading = state === 'initializing' || state === 'checking';

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
        {isLoading ? (
          <>
            <span className="vk-order-icon"><MessageCircle aria-hidden="true" /></span>
            <p className="eyebrow">Проверяем заказ</p>
            <h1>Одну минуту</h1>
            <p className="vk-order-lead">Загружаем одноразовый номер заказа.</p>
          </>
        ) : !orderToken ? (
          <>
            <span className="vk-order-icon vk-order-icon--success"><Check aria-hidden="true" /></span>
            <p className="eyebrow">Настройка завершена</p>
            <h1>Приложение подключено</h1>
            <p className="vk-order-lead">
              Для оформления выберите наборы на сайте. Сюда вы вернётесь автоматически на последнем шаге.
            </p>
            <a className="vk-order-primary" href="/#catalog" target="_blank" rel="noreferrer">
              Открыть каталог
            </a>
          </>
        ) : state === 'invalid' ? (
          <>
            <span className="vk-order-icon"><MessageCircle aria-hidden="true" /></span>
            <p className="eyebrow">Ссылка недействительна</p>
            <h1>Заказ не найден</h1>
            <p className="vk-order-lead">
              Одноразовый номер истёк или уже не подходит. Вернитесь в каталог и начните оформление ещё раз.
            </p>
            <a className="vk-order-primary" href="/#catalog" target="_blank" rel="noreferrer">
              Вернуться в каталог
            </a>
          </>
        ) : state === 'success' ? (
          <>
            <span className="vk-order-icon vk-order-icon--success"><Check aria-hidden="true" /></span>
            <p className="eyebrow">Запрос передан в VK</p>
            <h1>Почти готово</h1>
            <p className="vk-order-lead">
              {preview ? `Заказ № ${preview.orderNumber}. ` : ''}
              Дождитесь сообщения от сообщества. После него администратор сможет согласовать детали лично.
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
              Разрешите сообществу написать вам. Администратор лично согласует наличие, доставку и способ оплаты.
            </p>

            {preview && (
              <div className="vk-order-security">
                <ShieldCheck aria-hidden="true" />
                <span>
                  Заказ № {preview.orderNumber}: {preview.itemCount} шт., {money(preview.totalKopecks)} без доставки.
                  В VK передаётся только одноразовый номер.
                </span>
              </div>
            )}

            {!embedded && (
              <p className="vk-order-hint">Этот экран нужно открыть внутри приложения ВКонтакте.</p>
            )}
            {errorMessage && <p className="vk-order-warning">{errorMessage}</p>}

            <button
              className="vk-order-primary"
              type="button"
              disabled={!embedded || !preview || state === 'submitting'}
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
