import './global.css';
import type { Metadata } from 'next';
import { Providers } from './providers';
import { Arimo, Azeret_Mono } from 'next/font/google';
import localFont from 'next/font/local';

const arimo = Arimo({
  variable: '--font-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const azeretMono = Azeret_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const apkFutural = localFont({
  src: [
    {
      path: '../public/fonts/apk-futural/APK-Futural-Regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../public/fonts/apk-futural/APK-Futural-Regular.woff',
      weight: '400',
      style: 'normal',
    },
  ],
  variable: '--font-heading',
  display: 'swap',
  preload: true,
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: {
    template: '%s | ZITADEL Docs',
    default: 'ZITADEL Documentation',
  },
  icons: {
    other: [
      {
        rel: 'stylesheet',
        url: '/docs/img/icons/line-awesome/css/line-awesome.min.css',
      },
    ],
  },
};

export default function Layout({ children }: any) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${arimo.variable} ${azeretMono.variable} ${apkFutural.variable} flex flex-col min-h-screen font-sans bg-fd-background text-fd-foreground antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
