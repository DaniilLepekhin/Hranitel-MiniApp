// Service Worker для принудительной очистки кеша
const CACHE_VERSION = 'v2.0.4-FORCE-RELOAD';

self.addEventListener('install', (event) => {
  console.log('[SW] Installing NEW service worker', CACHE_VERSION);
  // Принудительно активировать новый SW
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating NEW service worker', CACHE_VERSION);
  
  event.waitUntil(
    // Удалить ВСЕ старые кеши
    caches.keys().then((cacheNames) => {
      console.log('[SW] Deleting ALL caches:', cacheNames);
      return Promise.all(
        cacheNames.map((cacheName) => {
          console.log('[SW] Deleting cache:', cacheName);
          return caches.delete(cacheName);
        })
      );
    }).then(() => {
      console.log('[SW] All caches cleared, claiming clients');
      // Взять контроль над всеми клиентами
      return self.clients.claim();
    }).then(() => {
      // ПРИНУДИТЕЛЬНО ПЕРЕЗАГРУЗИТЬ ВСЕ СТРАНИЦЫ
      return self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
    }).then((clients) => {
      console.log('[SW] Force reloading', clients.length, 'clients');
      clients.forEach((client) => {
        console.log('[SW] Reloading:', client.url);
        client.navigate(client.url);
      });
    })
  );
});

// Не кешировать НИЧЕГО - всегда брать из сети
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => {
      // Если сеть недоступна, вернуть ошибку
      return new Response('Network error', { status: 503 });
    })
  );
});

console.log('[SW] Service worker loaded', CACHE_VERSION);
