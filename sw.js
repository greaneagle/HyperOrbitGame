// ======= PERFECT ORBIT SERVICE WORKER (Pv02.2 - Step 7) =======
// Offline-first PWA with precise caching and clean updates
//
// CRITICAL: Update VERSION and BUILD before EVERY deploy
// These values must match js/version.js

const APP_VERSION = 'pv02.2';
const BUILD_NUMBER = '003';
const FULL_VERSION = `${APP_VERSION}+build.${BUILD_NUMBER}`;
const CACHE_NAME = `perfect-orbit-${FULL_VERSION}`;

// Precache: Only known assets (no wildcards, no bloat)
const PRECACHE_URLS = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './manifest.json',
  './js/version.js',
  './js/storage.js',
  './js/env.js',
  './js/ab.js',
  './js/telemetry.js',
  './js/modes.js',
  './js/missions.js',
  './js/progression.js',
  './js/pwa.js',
  './js/debug.js',
  './config/firebase-config.js',
  './data/missions.json',
  './data/achievements.json'
  // Note: icons will be cached on demand via runtime cache
  // Note: daily-seeds.json uses network-first strategy (see fetch handler)
];

// Runtime cache config
const RUNTIME_CACHE_NAME = `perfect-orbit-runtime-${APP_VERSION}`;
const ALLOWED_RUNTIME_ORIGINS = [self.location.origin];
const ALLOWED_RUNTIME_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.svg', '.webp', '.json'];
const MAX_RUNTIME_ENTRIES = 50;

// ======= INSTALL =======
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker:', CACHE_NAME);

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Precaching core assets');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => {
        console.log('[SW] Precache complete');
        // Skip waiting to activate immediately (good for dev iteration)
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Precache failed:', error);
        throw error;
      })
  );
});

// ======= ACTIVATE =======
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker:', CACHE_NAME);

  event.waitUntil(
    // Clean up old caches
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            // Delete any cache that doesn't match current version
            if (cacheName.startsWith('perfect-orbit-') && cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE_NAME) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Cache cleanup complete');
        // Take control of all pages immediately
        return self.clients.claim();
      })
  );
});

// ======= FETCH =======
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Only handle same-origin requests (no external resources)
  if (url.origin !== self.location.origin) {
    return;
  }

  // Special handling for daily-seeds.json: network-first, fallback to cache/local seed
  if (url.pathname.endsWith('daily-seeds.json')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful response
          if (response.ok) {
            const clonedResponse = response.clone();
            caches.open(RUNTIME_CACHE_NAME).then((cache) => {
              cache.put(request, clonedResponse);
            });
          }
          return response;
        })
        .catch(() => {
          // Network failed, try cache
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              console.log('[SW] Using cached daily-seeds.json');
              return cachedResponse;
            }
            // No cache, return empty JSON (modes.js will use local seed generation)
            console.log('[SW] No cached daily-seeds.json, returning empty object');
            return new Response('{}', {
              headers: { 'Content-Type': 'application/json' }
            });
          });
        })
    );
    return;
  }

  // Default strategy: Cache-first for precached assets, network-first for others
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Cache hit - return immediately
          return cachedResponse;
        }

        // Cache miss - fetch from network
        return fetch(request)
          .then((networkResponse) => {
            // Only cache successful same-origin responses
            if (!networkResponse || networkResponse.status !== 200) {
              return networkResponse;
            }

            // Check if this resource should be runtime cached
            const shouldRuntimeCache = ALLOWED_RUNTIME_EXTENSIONS.some(ext =>
              url.pathname.endsWith(ext)
            );

            if (shouldRuntimeCache) {
              const responseToCache = networkResponse.clone();

              caches.open(RUNTIME_CACHE_NAME)
                .then((cache) => {
                  cache.put(request, responseToCache);

                  // Limit runtime cache size to prevent bloat
                  cache.keys().then((keys) => {
                    if (keys.length > MAX_RUNTIME_ENTRIES) {
                      // Delete oldest entry (FIFO)
                      cache.delete(keys[0]);
                    }
                  });
                });
            }

            return networkResponse;
          })
          .catch((error) => {
            console.error('[SW] Fetch failed:', request.url, error);

            // For navigation requests, return cached index.html as fallback
            if (request.mode === 'navigate') {
              return caches.match('./index.html');
            }

            throw error;
          });
      })
  );
});

// ======= MESSAGE HANDLER =======
// Allow clients to query SW version and force update
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({
      version: APP_VERSION,
      build: BUILD_NUMBER,
      cacheName: CACHE_NAME
    });
  }

  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('[SW] Service worker loaded:', CACHE_NAME);
