import type { Metadata } from 'next';
import './globals.css';

const title = 'Солдатики Инженер Басевич — официальный каталог';
const description = 'Петербургская пластическая миниатюра «Инженер Басевич»: исторические наборы масштаба 1:32 и оформление заказа через ВКонтакте.';
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
    images: [{ url: `${siteOrigin}/og.png`, width: 1200, height: 630, alt: 'Солдатики Инженер Басевич' }],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: [`${siteOrigin}/og.png`],
  },
  icons: { icon: '/logo-basevich.png' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
