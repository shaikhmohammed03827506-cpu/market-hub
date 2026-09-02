const CACHE_NAME = 'mh-v45-cart-gift-lines-1';
const CORE = [
  '/',
  '/index.html',
  '/shop.html',
  '/product.html',
  '/wishlist.html',
  '/account.html',
  '/order-details.html',
  '/login.html',
  '/register.html',
  '/track-order.html',
  '/offline.html',
  '/manifest.webmanifest',
  '/storefront-v40.js?v=45-cart-gift-lines-1',
  '/storefront-v40.css?v=45-cart-gift-lines-1',
  '/product.js?v=45-cart-gift-lines-1',
  '/mobile-navigation-v41-1.js?v=41.1',
  '/mobile-navigation-v41-1.css?v=41.1',
  '/auth-v41-1.js',
  '/auth-v41-1.css'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith((async () => {
    try {
      const networkResponse = await fetch(request);
      const cacheCopy = networkResponse.clone();
      if (networkResponse.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, cacheCopy);
      }
      return networkResponse;
    } catch {
      return (await caches.match(request)) || (await caches.match('/offline.html'));
    }
  })());
});
