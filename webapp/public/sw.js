// Service Worker for cache busting
const CACHE_VERSION = 'v1.0.8';
const CACHE_NAME = `hranitel-${CACHE_VERSION}`;

// Install event - clear all old caches
self.addEventListener('install', (event) => {
  console.log('[SW] Installing new service worker:', CACHE_VERSION);
  self.skipWaiting();

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('hranitel-') && name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
});

// Activate event - take control immediately
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating new service worker:', CACHE_VERSION);
  event.waitUntil(
    clients.claim().then(() => {
      console.log('[SW] Service worker activated and claimed clients');
    })
  );
});

// Fetch event - always fetch fresh content, no caching
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
      },
    }).catch(() => {
      // If fetch fails, try cache as fallback
      return caches.match(event.request);
    })
  );
});

// Message event - force update
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Received SKIP_WAITING message');
    self.skipWaiting();
  }
});
