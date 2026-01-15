const CACHE_NAME = 'iron-ar-v84-pwa-full';
const PRECACHE_URLS = [
  './',
  './index.html',
  './menu.css',
  './sensors.html',
  './functions.html',
  './game.html',
  './style_v9.css',
  './game_logic_v10.js',
  './manifest.json',
  './icons/icon.svg'
];

// Install - cache all static assets
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching app shell');
        return cache.addAll(PRECACHE_URLS);
      })
  );
});

self.addEventListener('activate', event => {
  // Claim clients immediately so the page is controlled by the new SW
  event.waitUntil(self.clients.claim());
  
  // Clear old caches
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// Network First Strategy
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // If successful response, clone and cache it
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME)
          .then(cache => {
            cache.put(event.request, responseToCache);
          });
        return response;
      })
      .catch(() => {
        // If network fails, try cache
        return caches.match(event.request);
      })
  );
});
