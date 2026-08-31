'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

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

const VK_PROFILE_URL = 'https://vk.ru/bibader';
const VK_DIALOG_URL = 'https://vk.me/bibader';

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

  useEffect(() => {
    document.body.style.overflow = cartOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [cartOpen]);

  const filteredProducts = PRODUCTS.filter((product) => {
    const matchesFilter = filter === 'Все' || product.era === filter;
    const haystack = [product.title, product.era, product.scale, product.badge, product.description]
      .join(' ')
      .toLocaleLowerCase('ru-RU');
    return matchesFilter && haystack.includes(search.trim().toLocaleLowerCase('ru-RU'));
  });

  const cartItems = useMemo(() => PRODUCTS
    .filter((product) => cart[product.id])
    .map((product) => ({ ...product, quantity: cart[product.id] })), [cart]);

  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const addToCart = (id: string) => {
    setCart((current) => ({ ...current, [id]: (current[id] || 0) + 1 }));
    setOrderCopied(false);
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
  };

  const submitOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!cartItems.length) return;

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

    try {
      await navigator.clipboard.writeText(message);
      setOrderCopied(true);
    } catch {
      setOrderCopied(false);
    }

    const vkUrl = VK_DIALOG_URL
      ? `${VK_DIALOG_URL}${VK_DIALOG_URL.includes('?') ? '&' : '?'}text=${encodeURIComponent(message)}`
      : 'https://vk.com/im';
    window.open(vkUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Солдатики Инженер Басевич — на главную">
          <img src="/logo-basevich.png" alt="" />
          <span>Солдатики<small>Инженер Басевич</small></span>
        </a>
        <nav aria-label="Основная навигация">
          <a href="#catalog">Каталог</a>
          <a href="#delivery">Доставка</a>
          <a href={VK_PROFILE_URL} target="_blank" rel="noreferrer">ВКонтакте</a>
        </nav>
        <button className="cart-button" type="button" onClick={() => setCartOpen(true)} aria-label={`Открыть заказ, товаров: ${cartCount}`}>
          Заказ <span>{cartCount}</span>
        </button>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">Авторские коллекционные солдатики</p>
          <h1>Солдатики<br /><em>Инженер Басевич</em></h1>
          <p className="hero-text">
            Каталог исторических наборов для коллекционеров. Выберите фигурки,
            оформите заказ и согласуйте детали напрямую с автором во ВКонтакте.
          </p>
          <div className="hero-actions">
            <a className="primary-button" href="#catalog">Смотреть каталог</a>
            <span>Без онлайн-оплаты<br />заказ подтверждаем в ВК</span>
          </div>
        </div>
      </section>

      <section className="catalog-section" id="catalog">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Каталог коллекции</p>
            <h2>Выберите свою эпоху</h2>
          </div>
          <label className="catalog-search">
            <span>Поиск по каталогу</span>
            <span className="search-box">
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Название, эпоха, масштаб…"
                aria-label="Поиск по каталогу"
              />
            </span>
          </label>
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
          <li><span>03</span><h3>Перейдите в ВК</h3><p>В диалоге появится готовый текст заказа для проверки.</p></li>
        </ol>
      </section>

      <section className="cta-section">
        <p className="eyebrow">Начните коллекцию</p>
        <h2>Найдите свой<br /><em>первый строй</em></h2>
        <a className="primary-button primary-button--light" href="#catalog">Перейти в каталог</a>
      </section>

      <footer>
        <a className="brand brand--footer" href="#top"><img src="/logo-basevich.png" alt="" /><span>Солдатики<small>Инженер Басевич</small></span></a>
        <p>Заказы подтверждаем в ВКонтакте.<br />Доставка Почтой России.</p>
        <a href={VK_PROFILE_URL} target="_blank" rel="noreferrer">vk.ru/bibader</a>
        <p>© 2026 «Инженер Басевич»</p>
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
                  <label className="field field--full">Фамилия, имя, отчество<input name="name" autoComplete="name" required placeholder="Иванов Иван Иванович" /></label>
                  <label className="field">Телефон<input name="phone" type="tel" autoComplete="tel" required placeholder="+7 900 000-00-00" /></label>
                  <label className="field">Почтовый индекс<input name="postcode" inputMode="numeric" autoComplete="postal-code" required pattern="[0-9]{6}" placeholder="123456" /></label>
                  <label className="field field--full">Полный адрес<input name="address" autoComplete="street-address" required placeholder="Область, город, улица, дом, квартира" /></label>
                  <label className="field field--full">Комментарий<textarea name="comment" rows={3} placeholder="Например: не звонить до 12:00" /></label>
                </fieldset>

                <label className="consent"><input type="checkbox" required /><span>Согласен передать эти данные продавцу в сообщении ВКонтакте для оформления и отправки заказа.</span></label>

                <button className="vk-button" type="submit">
                  <span className="vk-logo">VK</span>
                  Перейти к заказу в ВК
                </button>
                <p className="form-note">{orderCopied ? 'Текст заказа скопирован — вставьте его в открывшийся диалог ВК.' : 'Сообщение не отправится само: вы сможете проверить его перед отправкой.'}</p>
              </form>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}
