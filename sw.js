// =============================================
// Iron Man AR - Service Worker v85
// Auto-Update System
// =============================================

const CACHE_NAME = 'iron-ar-v87';
const VERSION_URL = './version.json';
const CHECK_INTERVAL = 60000; // Check every 60 seconds

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
  './icons/icon.svg',
  './version.json'
];

// ========== INSTALL ==========
self.addEventListener('install', event => {
  console.log('[SW] Installing new version:', CACHE_NAME);
  self.skipWaiting(); // Force activation
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => console.log('[SW] Cache complete'))
  );
});

// ========== ACTIVATE ==========
self.addEventListener('activate', event => {
  console.log('[SW] Activating:', CACHE_NAME);
  
  event.waitUntil(
    // Delete old caches
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW] Deleting old cache:', k);
          return caches.delete(k);
        })
      ))
      .then(() => self.clients.claim())
      .then(() => {
        // Notify all clients about the update
        self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.postMessage({
              type: 'SW_UPDATED',
              version: CACHE_NAME
            });
          });
        });
      })
  );
});

// ========== FETCH - Network First ==========
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip external requests
  if (!event.request.url.startsWith(self.location.origin)) return;
  
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Valid response - cache it
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        // Network failed - try cache
        return caches.match(event.request);
      })
  );
});

// ========== MESSAGE HANDLER ==========
self.addEventListener('message', event => {
  if (event.data === 'CHECK_UPDATE') {
    checkForUpdates();
  }
  
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ========== AUTO UPDATE CHECK ==========
async function checkForUpdates() {
  try {
    const response = await fetch(VERSION_URL + '?t=' + Date.now(), {
      cache: 'no-store'
    });
    
    if (response.ok) {
      const data = await response.json();
      const currentVersion = CACHE_NAME.split('-').pop();
      
      if (data.version !== currentVersion) {
        console.log('[SW] New version available:', data.version);
        
        // Notify clients
        self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.postMessage({
              type: 'UPDATE_AVAILABLE',
              currentVersion: currentVersion,
              newVersion: data.version,
              changelog: data.changelog || 'עדכון חדש זמין'
            });
          });
        });
      }
    }
  } catch (e) {
    console.log('[SW] Update check failed:', e.message);
  }
}

// Check for updates periodically
setInterval(checkForUpdates, CHECK_INTERVAL);
