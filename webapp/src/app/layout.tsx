import type { Metadata, Viewport } from 'next';
import { Providers } from './providers';
import { GlobalMediaPlayers } from '@/components/GlobalMediaPlayers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Academy MiniApp 2.0',
  description: 'Курсы, медитации и личностный рост',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Academy',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#f0ece8',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <head>
        <meta httpEquiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
        {/* Предзагрузка изображений фона для моментального отображения */}
        <link rel="preload" href="/assets/newspaper-texture.jpg" as="image" />
        <link rel="preload" href="/assets/bg-coins.jpg" as="image" />
        <link rel="preload" href="/assets/bg-blur.jpg" as="image" />
        <script src="https://telegram.org/js/telegram-web-app.js" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Force reload if coming from cache
              if (performance.navigation.type === 2) {
                window.location.reload();
              }

              // Register service worker to clear all caches
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js', { scope: '/' })
                    .then(function(registration) {
                      console.log('[SW] Registered with scope:', registration.scope);
                      
                      // Force update immediately
                      registration.update();
                      
                      // If there's a waiting worker, skip waiting and reload
                      if (registration.waiting) {
                        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                        window.location.reload();
                      }
                      
                      // Listen for new service worker
                      registration.addEventListener('updatefound', function() {
                        const newWorker = registration.installing;
                        if (newWorker) {
                          newWorker.addEventListener('statechange', function() {
                            if (newWorker.state === 'activated') {
                              console.log('[SW] New service worker activated, reloading...');
                              window.location.reload();
                            }
                          });
                        }
                      });
                    })
                    .catch(function(error) {
                      console.log('[SW] Registration failed:', error);
                    });
                });
              }
            `,
          }}
        />
      </head>
      <body className="antialiased">
        <Providers>
          {/* Global Media Players - рендерятся на уровне layout чтобы быть на всех страницах */}
          <GlobalMediaPlayers />
          {children}
        </Providers>
      </body>
    </html>
  );
}
