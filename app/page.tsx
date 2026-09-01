'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Search, ShoppingBag, X } from 'lucide-react';
import {
  ORDER_API_URL,
  ORDER_CONSENT_VERSION,
  VK_MINI_APP_URL,
  VK_ORDER_DIALOG_URL,
  VK_PUBLIC_COMMUNITY_URL,
} from './lib/vk-config';

type Product = {
  id: string;
  title: string;
  era: string;
  scale: string;
  pieces: number;
  price: number;
  badge: string;
  description: string;
  tone: string;
};

type ApiProduct = {
  id: string;
  title: string;
  priceKopecks: number;
};

function isApiProduct(value: unknown): value is ApiProduct {
  if (!value || typeof value !== 'object') return false;
  const product = value as Partial<ApiProduct>;
  return typeof product.id === 'string'
    && typeof product.title === 'string'
    && Number.isSafeInteger(product.priceKopecks)
    && Number(product.priceKopecks) >= 0;
}

const PRODUCTS: Product[] = [
  {
    id: 'grenadiers-1812',
    title: 'Гренадеры Русской гвардии',
    era: '1812 год',
    scale: '1:32',
    pieces: 8,
    price: 4900,
    badge: 'Хит',
    description: 'Парадный строй с офицером и знаменосцем. Ручная роспись.',
    tone: 'brass',
  },
  {
    id: 'roman-legion',
    title: 'Римские легионеры',
    era: 'Античность',
    scale: '1:32',
    pieces: 6,
    price: 3600,
    badge: 'Новинка',
    description: 'Легионеры I века со щитами, копьями и съёмным вооружением.',
    tone: 'terracotta',
  },
  {
    id: 'vikings',
    title: 'Викинги в походе',
    era: 'Средневековье',
    scale: '1:32',
    pieces: 7,
    price: 4200,
    badge: 'Ручная роспись',
    description: 'Динамичные позы и историчные детали экипировки IX века.',
    tone: 'forest',
  },
  {
    id: 'red-army-1943',
    title: 'Пехота Красной армии',
    era: 'XX век',
    scale: '1:35',
    pieces: 10,
    price: 3900,
    badge: 'В наличии',
    description: 'Бойцы 1943 года с командиром, пулемётчиком и знаменосцем.',
    tone: 'khaki',
  },
  {
    id: 'teutonic-knights',
    title: 'Рыцари Тевтонского ордена',
    era: 'Средневековье',
    scale: '1:32',
    pieces: 5,
    price: 5700,
    badge: 'Лимитированная серия',
    description: 'Пять фигур в доспехах со щитами и орденским знаменем.',
    tone: 'steel',
  },
  {
    id: 'french-hussars',
    title: 'Французские гусары',
    era: '1812 год',
    scale: '1:32',
    pieces: 6,
    price: 6400,
    badge: 'Редкий набор',
    description: 'Шесть всадников в яркой исторической форме эпохи Империи.',
    tone: 'blue',
  },
];

const FILTERS = ['Все', '1812 год', 'Античность', 'Средневековье', 'XX век'];

const INTERVIEW_URL = 'https://warhorseminiatures.com/2019/02/10/interview-with-igor-basevich-of-engineer-basevich/';

const money = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;

function SoldierScene({ tone, scale, badge }: { tone: string; scale: string; badge: string }) {
  return (
    <div className={`soldier-scene soldier-scene--${tone}`} aria-hidden="true">
      <span className="product-badge">{badge}</span>
      <span className="scale-mark">{scale}</span>
      <span className="scene-line scene-line--one" />
      <span className="scene-line scene-line--two" />
      <div className="soldier soldier--back"><i /><b /><em /></div>
      <div className="soldier soldier--front"><i /><b /><em /></div>
      <span className="plinth" />
    </div>
  );
}

export default function Home() {
  const [filter, setFilter] = useState('Все');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [orderCopied, setOrderCopied] = useState(false);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [fallbackMessage, setFallbackMessage] = useState('');
  const [apiProducts, setApiProducts] = useState<ApiProduct[] | null>(null);
  const submissionLock = useRef(false);
  const orderRequestId = useRef<string | null>(null);

  useEffect(() => {
    document.body.style.overflow = cartOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [cartOpen]);

  useEffect(() => {
    if (!ORDER_API_URL) return;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 8_000);
    void fetch(`${ORDER_API_URL}/v1/products`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('CATALOG_API_FAILED');
        return response.json() as Promise<{ products?: ApiProduct[] }>;
      })
      .then((result) => {
        if (Array.isArray(result.products) && result.products.every(isApiProduct)) {
          setApiProducts(result.products);
        }
      })
      .catch(() => undefined)
      .finally(() => window.clearTimeout(timeoutId));
    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, []);

  const availableProducts = useMemo(() => {
    if (!apiProducts) return PRODUCTS;
    const serverCatalog = new Map(apiProducts.map((product) => [product.id, product]));
    return PRODUCTS.flatMap((product) => {
      const serverProduct = serverCatalog.get(product.id);
      if (!serverProduct || !Number.isSafeInteger(serverProduct.priceKopecks)) return [];
      return [{
        ...product,
        title: serverProduct.title,
        price: serverProduct.priceKopecks / 100,
      }];
    });
  }, [apiProducts]);

  const filteredProducts = availableProducts.filter((product) => {
    const matchesFilter = filter === 'Все' || product.era === filter;
    const haystack = [product.title, product.era, product.scale, product.badge, product.description]
      .join(' ')
      .toLocaleLowerCase('ru-RU');
    return matchesFilter && haystack.includes(search.trim().toLocaleLowerCase('ru-RU'));
  });

  const cartItems = useMemo(() => availableProducts
    .filter((product) => cart[product.id])
    .map((product) => ({ ...product, quantity: cart[product.id] })), [availableProducts, cart]);

  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const addToCart = (id: string) => {
    setCart((current) => ({ ...current, [id]: (current[id] || 0) + 1 }));
    setOrderCopied(false);
    setOrderError('');
    setFallbackMessage('');
    orderRequestId.current = null;
    setCartOpen(true);
  };

  const changeQuantity = (id: string, delta: number) => {
    setCart((current) => {
      const nextQuantity = (current[id] || 0) + delta;
      if (nextQuantity <= 0) {
        const next = { ...current };
        delete next[id];
        return next;
      }
      return { ...current, [id]: nextQuantity };
    });
    setOrderCopied(false);
    setOrderError('');
    setFallbackMessage('');
    orderRequestId.current = null;
  };

  const submitOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!cartItems.length || submissionLock.current) return;
    submissionLock.current = true;
    setOrderSubmitting(true);
    setOrderCopied(false);
    setOrderError('');
    setFallbackMessage('');

    const form = new FormData(event.currentTarget);
    const lines = cartItems.map((item, index) =>
      `${index + 1}. ${item.title} — ${item.quantity} шт. × ${money(item.price)} = ${money(item.price * item.quantity)}`,
    );
    const message = [
      'Здравствуйте! Хочу оформить заказ:',
      '',
      ...lines,
      '',
      `Итого за товары: ${money(cartTotal)}`,
      '',
      'Данные для отправки Почтой России:',
      `Получатель: ${form.get('name')}`,
      `Телефон: ${form.get('phone')}`,
      `Индекс: ${form.get('postcode')}`,
      `Адрес: ${form.get('address')}`,
      `Комментарий: ${form.get('comment') || '—'}`,
      '',
      'Подтвердите, пожалуйста, наличие и стоимость доставки.',
    ].join('\n');

    const openFallback = async (targetWindow: Window | null) => {
      let copied = false;
      try {
        await navigator.clipboard.writeText(message);
        copied = true;
        setOrderCopied(true);
      } catch {
        setOrderCopied(false);
        setFallbackMessage(message);
      }
      if (targetWindow && !targetWindow.closed) {
        targetWindow.location.replace(VK_ORDER_DIALOG_URL);
      } else {
        window.open(VK_ORDER_DIALOG_URL, '_blank', 'noopener,noreferrer');
      }
      return copied;
    };

    if (!ORDER_API_URL) {
      const copied = await openFallback(null);
      if (!copied) {
        setOrderError('Браузер не разрешил копирование. Скопируйте текст из поля ниже и откройте диалог сообщества.');
      }
      submissionLock.current = false;
      setOrderSubmitting(false);
      return;
    }

    orderRequestId.current ||= crypto.randomUUID();
    const targetWindow = window.open('about:blank', '_blank');
    if (targetWindow) {
      targetWindow.opener = null;
      targetWindow.document.title = 'Открываем заказ…';
      targetWindow.document.body.textContent = 'Сохраняем заказ и открываем ВКонтакте…';
    }
    const orderController = new AbortController();
    const orderTimeoutId = window.setTimeout(() => orderController.abort(), 12_000);

    try {
      const response = await fetch(`${ORDER_API_URL}/v1/orders`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: orderController.signal,
        body: JSON.stringify({
          requestId: orderRequestId.current,
          items: cartItems.map((item) => ({ productId: item.id, quantity: item.quantity })),
          customer: {
            name: String(form.get('name') || ''),
            phone: String(form.get('phone') || ''),
            postcode: String(form.get('postcode') || ''),
            address: String(form.get('address') || ''),
            comment: String(form.get('comment') || ''),
          },
          consentAccepted: true,
          consentVersion: ORDER_CONSENT_VERSION,
        }),
      });
      if (response.status === 409) {
        const problem = await response.json().catch(() => null) as { code?: string; message?: string } | null;
        targetWindow?.close();
        if (problem?.code !== 'ORDER_ALREADY_SUBMITTED') orderRequestId.current = null;
        setOrderError(problem?.message || 'Каталог или условия заказа изменились. Обновите страницу.');
        return;
      }
      if (!response.ok) throw new Error('ORDER_API_FAILED');
      const result = await response.json() as { launchUrl?: string };
      if (!result.launchUrl) throw new Error('ORDER_URL_MISSING');

      const launchUrl = new URL(result.launchUrl);
      const expectedAppUrl = new URL(VK_MINI_APP_URL);
      if (launchUrl.origin !== expectedAppUrl.origin || launchUrl.pathname !== expectedAppUrl.pathname) {
        throw new Error('ORDER_URL_INVALID');
      }

      if (targetWindow && !targetWindow.closed) {
        targetWindow.location.replace(launchUrl.toString());
      } else {
        window.location.assign(launchUrl.toString());
      }
      setCartOpen(false);
    } catch {
      const copied = await openFallback(targetWindow);
      setOrderError(copied
        ? 'Автоматическая передача временно недоступна. Откройте резервный диалог и вставьте туда скопированный заказ.'
        : 'Браузер не разрешил копирование. Скопируйте текст из поля ниже и откройте резервный диалог.');
    } finally {
      window.clearTimeout(orderTimeoutId);
      submissionLock.current = false;
      setOrderSubmitting(false);
    }
  };

  const copyFallbackMessage = async () => {
    if (!fallbackMessage) return;
    try {
      await navigator.clipboard.writeText(fallbackMessage);
      setOrderCopied(true);
      setFallbackMessage('');
      setOrderError('Текст заказа скопирован — вставьте его в открытый диалог сообщества.');
    } catch {
      setOrderError('Автоматическое копирование заблокировано. Выделите текст в поле и скопируйте вручную.');
    }
  };

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Солдатики Инженер Басевич — на главную">
          <img src="/logo-basevich.png" alt="" />
          <span>
            <small>Солдатики</small>
            <strong>Инженеръ Басевичъ</strong>
          </span>
        </a>
        <nav aria-label="Основная навигация">
          <a href="#catalog">Каталог</a>
          <a href="#delivery">Доставка</a>
          <a href={VK_PUBLIC_COMMUNITY_URL} target="_blank" rel="noreferrer">Сообщество</a>
        </nav>
        <button className="cart-button" type="button" onClick={() => setCartOpen(true)} aria-label={`Открыть заказ, товаров: ${cartCount}`}>
          <ShoppingBag aria-hidden="true" size={20} strokeWidth={1.7} />
          <span>Заказ</span>
          {cartCount > 0 && <small>({cartCount})</small>}
        </button>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">Авторские исторические солдатики</p>
          <h1>История<br /><em>в миниатюре</em></h1>
          <p className="hero-text">
            Игорь Басевич — петербургский коллекционер и инженер-технолог.
            Вместе с командой мастеров он выпускает ограниченные серии пластиковых
            фигур в масштабе 1:32 — от Древнего мира до истории России XX века.
          </p>
          <div className="hero-actions">
            <a className="primary-button" href="#catalog">Смотреть наборы</a>
            <a className="hero-community" href={VK_PUBLIC_COMMUNITY_URL} target="_blank" rel="noreferrer">
              Сообщество ВКонтакте
              <ArrowUpRight aria-hidden="true" size={18} strokeWidth={1.6} />
            </a>
          </div>
        </div>
        <figure className="hero-media">
          <img src="/basevich-miniatures.jpg" alt="Фигуры из авторской серии исторических солдатиков" />
          <figcaption>
            <span>Фигуры из авторской серии</span>
            <a href={INTERVIEW_URL} target="_blank" rel="noreferrer">Фото: Warhorse Miniatures ↗</a>
          </figcaption>
        </figure>
      </section>

      <section className="catalog-section" id="catalog">
        <div className="section-heading">
          <h2>Поиск по каталогу</h2>
        </div>

        <div className="catalog-search" role="search">
          <Search aria-hidden="true" size={23} strokeWidth={1.6} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Поиск по эпохе, армии или названию набора"
            aria-label="Поиск по каталогу"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} aria-label="Очистить поиск">
              <X aria-hidden="true" size={19} strokeWidth={1.7} />
            </button>
          )}
        </div>

        <div className="filters" role="group" aria-label="Фильтр по эпохе">
          {FILTERS.map((item) => (
            <button
              className={filter === item ? 'active' : ''}
              key={item}
              onClick={() => setFilter(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>

        <div className="product-grid" aria-live="polite">
          {filteredProducts.map((product) => (
            <article className="product-card" key={product.id}>
              <SoldierScene tone={product.tone} scale={product.scale} badge={product.badge} />
              <p className="product-meta">{product.era} · {product.scale} · {product.pieces} фигур</p>
              <h3>{product.title}</h3>
              <p className="product-description">{product.description}</p>
              <div className="product-footer">
                <strong>{money(product.price)}</strong>
                <button type="button" onClick={() => addToCart(product.id)}>
                  Купить <span>＋</span>
                </button>
              </div>
            </article>
          ))}
        </div>
        {!filteredProducts.length && (
          <div className="search-empty" role="status">
            <h3>Ничего не найдено</h3>
            <p>Попробуйте другое название или сбросьте выбранную эпоху.</p>
            <button type="button" onClick={() => { setSearch(''); setFilter('Все'); }}>Показать все наборы</button>
          </div>
        )}
      </section>

      <section className="delivery-section" id="delivery">
        <div className="delivery-intro">
          <p className="eyebrow">Как оформить заказ</p>
          <h2>Три простых шага</h2>
          <p>Оплаты на сайте нет. Сначала вы согласуете заказ и стоимость доставки с продавцом в ВКонтакте.</p>
        </div>
        <ol className="steps">
          <li><span>01</span><h3>Выберите наборы</h3><p>Добавьте один или несколько наборов в заказ.</p></li>
          <li><span>02</span><h3>Заполните адрес</h3><p>Укажите получателя и данные для Почты России.</p></li>
          <li><span>03</span><h3>Перейдите в ВК</h3><p>Продолжите оформление в отдельном сообществе заказов.</p></li>
        </ol>
      </section>

      <section className="cta-section">
        <a className="community-link" href={VK_PUBLIC_COMMUNITY_URL} target="_blank" rel="noreferrer">
          <span className="community-link__mark" aria-hidden="true">VK</span>
          <span className="community-link__copy">
            <small>Сообщество ВКонтакте</small>
            <strong>СОЛДАТИКИ ИНЖЕНЕРА БАСЕВИЧА</strong>
            <span>vk.ru/engineer_basevich</span>
          </span>
          <ArrowUpRight aria-hidden="true" size={28} strokeWidth={1.5} />
        </a>
      </section>

      <footer className="site-footer">
        <div className="footer-brand">
          <a className="footer-brand__logo" href="#top" aria-label="Наверх">
            <img src="/logo-basevich.png" alt="" />
          </a>
          <a className="footer-brand__title" href="#top">
            <small>Солдатики</small>
            <strong>Инженеръ Басевичъ</strong>
          </a>
        </div>
        <div className="footer-order">
          <small>Заказ и доставка</small>
          <p>Заказы подтверждаем в ВКонтакте.<br />Отправляем Почтой России.</p>
        </div>
        <div className="footer-meta">
          <a href={VK_PUBLIC_COMMUNITY_URL} target="_blank" rel="noreferrer">
            Сообщество ВКонтакте
            <ArrowUpRight aria-hidden="true" size={16} strokeWidth={1.6} />
          </a>
          <p>© 2026 «Инженер Басевич»</p>
        </div>
      </footer>

      {cartOpen && (
        <div className="cart-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setCartOpen(false);
        }}>
          <aside className="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title">
            <div className="cart-header">
              <div><p className="eyebrow">Ваш выбор</p><h2 id="cart-title">Оформление заказа</h2></div>
              <button className="close-button" onClick={() => setCartOpen(false)} type="button" aria-label="Закрыть заказ">×</button>
            </div>

            {!cartItems.length ? (
              <div className="empty-cart">
                <span>0</span>
                <h3>Пока ни одного набора</h3>
                <p>Выберите солдатиков в каталоге — сюда можно добавить несколько наборов.</p>
                <button className="primary-button" type="button" onClick={() => setCartOpen(false)}>Вернуться в каталог</button>
              </div>
            ) : (
              <form onSubmit={submitOrder}>
                <div className="cart-items">
                  {cartItems.map((item) => (
                    <div className="cart-item" key={item.id}>
                      <span className={`cart-thumbnail cart-thumbnail--${item.tone}`} aria-hidden="true">{item.scale}</span>
                      <div>
                        <h3>{item.title}</h3>
                        <p>{money(item.price)} за набор</p>
                        <div className="quantity" aria-label={`Количество: ${item.title}`}>
                          <button type="button" onClick={() => changeQuantity(item.id, -1)} aria-label="Уменьшить количество">−</button>
                          <span>{item.quantity}</span>
                          <button type="button" onClick={() => changeQuantity(item.id, 1)} aria-label="Увеличить количество">+</button>
                        </div>
                      </div>
                      <strong>{money(item.price * item.quantity)}</strong>
                    </div>
                  ))}
                </div>

                <div className="cart-total"><span>Итого без доставки</span><strong>{money(cartTotal)}</strong></div>

                <fieldset>
                  <legend>Данные для отправки</legend>
                  <label className="field field--full">Фамилия, имя, отчество<input name="name" autoComplete="name" required minLength={5} maxLength={160} placeholder="Иванов Иван Иванович" /></label>
                  <label className="field">Телефон<input name="phone" type="tel" autoComplete="tel" required minLength={10} maxLength={32} placeholder="+7 900 000-00-00" /></label>
                  <label className="field">Почтовый индекс<input name="postcode" inputMode="numeric" autoComplete="postal-code" required pattern="[0-9]{6}" placeholder="123456" /></label>
                  <label className="field field--full">Полный адрес<input name="address" autoComplete="street-address" required minLength={10} maxLength={500} placeholder="Область, город, улица, дом, квартира" /></label>
                  <label className="field field--full">Комментарий<textarea name="comment" rows={3} maxLength={500} placeholder="Например: не звонить до 12:00" /></label>
                </fieldset>

                <label className="consent" data-consent-version={ORDER_CONSENT_VERSION}><input type="checkbox" required /><span>Согласен на обработку указанных данных для оформления заказа, связи со мной во ВКонтакте и отправки посылки.</span></label>

                <button className="vk-button" type="submit" disabled={orderSubmitting}>
                  <span className="vk-logo">VK</span>
                  {orderSubmitting ? 'Сохраняем заказ…' : 'Подтвердить через ВКонтакте'}
                </button>
                <p className="form-note">
                  {orderError || (orderCopied
                    ? 'Текст заказа скопирован — вставьте его в диалог отдельного сообщества заказов.'
                    : ORDER_API_URL
                      ? 'Откроется Mini App ВКонтакте. После разрешения сообщество само пришлёт заказ в диалог.'
                      : 'Пока работает резервный сценарий: текст заказа копируется, а затем открывается диалог сообщества.')}
                </p>
                {(orderCopied || fallbackMessage || orderError) && (
                  <a className="fallback-dialog-link" href={VK_ORDER_DIALOG_URL} target="_blank" rel="noreferrer">
                    Открыть диалог сообщества
                  </a>
                )}
                {fallbackMessage && (
                  <div className="fallback-order" role="status">
                    <label htmlFor="fallback-order-text">Текст заказа для ручной отправки</label>
                    <textarea id="fallback-order-text" readOnly rows={10} value={fallbackMessage} />
                    <button type="button" onClick={copyFallbackMessage}>Скопировать текст заказа</button>
                  </div>
                )}
              </form>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}
