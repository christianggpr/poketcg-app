import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { APP_NAME, APP_TAGLINE } from '@/lib/config';
import { ToastProvider } from '@/components/Toast';
import { RegistrarSW } from '@/components/RegistrarSW';
import { SCRIPT_TEMA } from '@/components/Tema';

// Tipografía del layout v2: Fredoka (títulos) y Nunito (texto), las mismas de Google Fonts pero servidas desde la app
// (archivos en src/fonts, licencia OFL): así la compilación no depende de internet y no hay parpadeo al cargar.
const fredoka = localFont({ src: '../fonts/fredoka-latin-wght-normal.woff2', weight: '300 700', display: 'swap', variable: '--font-fredoka', preload: true });
const nunito = localFont({ src: '../fonts/nunito-latin-wght-normal.woff2', weight: '200 1000', display: 'swap', variable: '--font-nunito', preload: true });

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: APP_TAGLINE,
  applicationName: APP_NAME,
  manifest: '/manifest.webmanifest',
  icons: { icon: [{ url: '/icons/icon.svg', type: 'image/svg+xml' }, { url: '/icons/icon-192.png', sizes: '192x192' }], apple: '/icons/icon-192.png' },
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: 'default' }
};

export const viewport: Viewport = {
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#FFF6E5' }, { media: '(prefers-color-scheme: dark)', color: '#141A2E' }],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning className={`${fredoka.variable} ${nunito.variable}`}>
      <head><script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} /></head>
      <body>
        <ToastProvider>{children}</ToastProvider>
        <RegistrarSW />
      </body>
    </html>
  );
}
