import type { Metadata } from 'next';
import './globals.css';

const title = 'Шеренга — коллекционные игрушечные солдатики';
const description = 'Каталог коллекционных солдатиков и исторических миниатюр. Выберите наборы, укажите адрес доставки и оформите заказ через ВКонтакте.';
const siteOrigin = 'https://sherenga-soldiers.kukarekun505.chatgpt.site';

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title,
  description,
  openGraph: {
    title,
    description,
    locale: 'ru_RU',
    type: 'website',
    url: siteOrigin,
    images: [{ url: `${siteOrigin}/og.png`, width: 1200, height: 630, alt: 'Шеренга — коллекционные солдатики' }],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: [`${siteOrigin}/og.png`],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
