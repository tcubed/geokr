/*
UPDATE APP_CACHE VERSION TO FORCE RELOAD
*/
const APP_CACHE = 'geo-app-v1';
const TILE_CACHE = 'tile-cache-v1';
const IMAGE_CACHE = 'image-cache-v1';
const ASSET_CACHE = 'asset-cache-v1';
const API_CACHE = 'api-cache-v1';
const OFFLINE_TILE_URL = '/static/images/offline-tile.png';

const APP_SHELL_FILES = [
  //'/',         // entry point (redirects handled by app)
  '/findloc',  // main play
  //'/login',
  //'/register',
  '/offline',  // offline fallback

  // core UI
  '/static/js/login.js',
  '/static/js/prefetch.js',
  '/static/js/findloc.js',
  '/static/js/offline-game.js',
  '/static/js/offline-db.js',
  '/static/js/offline-sync.js',
  '/static/js/validate.js',

  //'/static/js/app.js',
  //'/static/css/style.css',
 // '/static/images/offline-tile.png',
 // maps
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  // indexedDB
  'https://unpkg.com/idb@8.0.3/build/index.js',
  // bootstrap and fonts
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
  // QR
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js',
  // fonts
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/fonts/bootstrap-icons.woff2?dd67030699838ea613ee6dbda90effa6',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/webfonts/fa-solid-900.woff2'
];


const TILE_URL_REGEX = /^https:\/\/tile\.openstreetmap\.org\/(\d+)\/(\d+)\/(\d+)\.png$/;

importScripts('/static/js/offline-sync.js'); // must be self-contained

const offlineDB = {
  async addUpdate(update) { /* indexedDB add logic */ },
  async getAllUpdates(opts) { /* indexedDB get logic */ },
  async deleteUpdate(id) { /* indexedDB delete logic */ }
};

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    cache.put(request, response.clone());
    return response;
  } catch {
    return caches.match('/static/images/offline-tile.png');
  }
}

self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => {
      console.log('[SW] Caching app shell files');
      return cache.addAll(APP_SHELL_FILES);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(keys => {
      console.log('[SW] Current caches:', keys);
      return Promise.all(
        keys.filter(key => ![APP_CACHE, TILE_CACHE, ASSET_CACHE, API_CACHE].includes(key))
            .map(key => caches.delete(key).then(() => console.log(`[SW] Deleted old cache: ${key}`)))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('sync', event => {
  //console.log('[SW] Sync event triggered:', event.tag);
  if (event.tag === 'sync-found-locations') {
    console.log('[SW] Syncing queued location updates...');
    event.waitUntil(
      syncAllQueuedUpdates({
        offlineDB,
        onSuccess: (data, update) => console.log('[SW] Sync success:', update, data),
        onQueued: (update) => console.log('[SW] Still queued:', update),
        onFailure: (err, update) => console.warn('[SW] Sync failed:', err, update)
      })
    );
  }
});

// Intercept fetches
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // ---- BYPASS admin pages & other irrelevant paths ----
  // ---- BYPASS auth & admin pages ----
  if (url.pathname.startsWith('/admin') || url.pathname === '/' || url.pathname.startsWith('/login') || 
    url.pathname.startsWith('/register') || url.pathname.startsWith('/magic-login')) {
    return; // let browser handle redirects/auth
  }

  // Only handle GET and POST requests
  if (event.request.method === 'GET') {
    // Tile caching
    if (TILE_URL_REGEX.test(url)) {
      event.respondWith(cacheFirst(event.request, TILE_CACHE, OFFLINE_TILE_URL));
      return;
    }

    // Image caching
    if (url.pathname.match(/\.(png|jpg|jpeg|gif)$/)) {
      event.respondWith(cacheFirst(event.request, IMAGE_CACHE, OFFLINE_TILE_URL));
      return;
    }

    // Game API GET caching
    if (url.pathname.startsWith('/api/')) {
      event.respondWith(
        caches.open(APP_CACHE).then(async cache => {
          const cached = await cache.match(event.request);
          if (cached) {
            console.log('[SW] Serving API GET from cache:', url.href);
            return cached;
          }
          try {
            const response = await fetch(event.request, { credentials: 'same-origin', redirect: 'follow' });
            console.log('[SW] Fetched API GET from network:', url.href, response.status);
            cache.put(event.request, response.clone());
            return response;
          } catch (err) {
            console.warn('[SW] API GET failed, returning cache or empty JSON:', url.href, err);
            return cached || new Response('{}', { headers: { 'Content-Type': 'application/json' } });
          }
        })
      );
      return;
    }

    // Only handle our login endpoint for POST
    if (event.request.method === 'POST' && url.pathname === '/login') {
      event.respondWith(
        (async () => {
          try {
            // Attempt online first
            const fetchRequest = event.request.clone();
            const response = await fetch(fetchRequest);
            const json = await response.clone().json();

            // Optionally, store login status in IndexedDB
            if (json.success) {
              await offlineDB.addUpdate({ type: 'login', email: json.email, timestamp: Date.now() });
            }

            return new Response(JSON.stringify(json), {
              headers: { 'Content-Type': 'application/json' }
            });
          } catch (err) {
            console.warn('[SW] Offline login attempt:', err);

            // Check IndexedDB for last known successful login
            const lastLogin = await offlineDB.getLastLogin();
            if (lastLogin) {
              return new Response(JSON.stringify({
                success: true,
                message: 'Offline login successful',
                email: lastLogin.email
              }), { headers: { 'Content-Type': 'application/json' } });
            }

            return new Response(JSON.stringify({
              success: false,
              message: 'Offline login failed'
            }), { headers: { 'Content-Type': 'application/json' } });
          }
        })()
      );
    }

    // App shell / other static assets
    //event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) {
          console.log('[SW] Serving from cache:', url.href);
          return cached;
        }
        return fetch(event.request,{ credentials: 'same-origin', redirect: 'follow' })
          .then(response => {
            console.log('[SW] Fetched from network:', url.href, response.status);
            // Only cache real successful responses
            if (response && response.status === 200 && response.type === "basic") {
              const responseClone = response.clone();
              caches.open(APP_CACHE).then(cache => cache.put(event.request, responseClone));
            }
            return response;
          })
          .catch(err => {
            console.warn('[SW] Fetch failed, offline fallback:', url.href, err);
            // offline fallback page
            return caches.match('/offline') || new Response('Offline', { status: 503 });
          });
      })
    );
    return;
  }

  // ---- POST requests (offline-sync) ----
  if (event.request.method === 'POST' && url.pathname.startsWith('/api/location/found')) {
    event.respondWith(
      (async () => {
        try {
          const clonedRequest = event.request.clone();
          const body = await clonedRequest.json();
          console.log('[SW] POST intercepted:', url.pathname, body);

          // Attempt network first
          const response = await fetch(event.request);
          if (response.ok) {
            console.log('[SW] POST success:', body);
            return response;
          }
          throw new Error(`Server responded ${response.status}`);
        } catch (err) {
          console.warn('[SW] POST failed, queueing for sync:', err);

          // Queue the update for later
          const clonedRequest = event.request.clone();
          const body = await clonedRequest.json();
          await offlineDB.addUpdate({
            url: event.request.url,
            method: 'POST',
            body,
            timestamp: Date.now(),
            attempts: 0
          });
          // Register sync if available
          if ('serviceWorker' in self && 'SyncManager' in self) {
            const reg = await self.registration;
            await reg.sync.register('sync-found-locations');
          }
          return new Response(JSON.stringify({ queued: true }), { headers: { 'Content-Type': 'application/json' } });
        }
      })()
    );
  }
});
/*
self.addEventListener('fetch', (event) => {
  
  const url = new URL(event.request.url);
  console.log('[SW] Fetching:', url.href, 'method:', event.request.method);
  const request = event.request;


  // ---- BYPASS admin pages & other irrelevant paths ----
  if (url.pathname.startsWith('/admin')) return; // bypass completely

  // Only cache GET requests
  if (request.method !== 'GET') {
    event.respondWith(fetch(request));
    return;
  }

  // Handle tile caching (your existing tile cache logic)
  if (TILE_URL_REGEX.test(url)) {
    event.respondWith(
      caches.open(TILE_CACHE).then(cache =>
        cache.match(request).then(cached => {
          if (cached) {
            console.log('[SW] Serving from cache:', url.href);
            return cached;
          }
          console.log('[SW] Fetching from network:', url.href);
          return fetch(request, { mode: 'no-cors' }).then(response => {
            cache.put(request, response.clone());
            return response;
          }).catch(() => caches.match(OFFLINE_TILE_URL));
        })
      )
    );
    return;
  }

  // Handle API caching (your existing API cache logic)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      caches.open(API_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) {
          console.log('[SW] Serving from cache:', url.href);
          return cached;
        }

        console.log('[SW] Fetching from network:', url.href);
        try {
          const response = await fetch(request);
          cache.put(request, response.clone());
          return response;
        } catch {
          return cached || new Response('{}', { headers: { 'Content-Type': 'application/json' } });
        }
      })
    );
    return;
  }

  // Image caching
  if (url.pathname.match(/\.(png|jpg|jpeg|gif)$/)) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  // Default: app shell / static assets
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        console.log('[SW] Serving from cache:', url.href);
        return cachedResponse;
      }

      console.log('[SW] Fetching from network:', url.href);
      return fetch(request, {
        credentials: 'same-origin',
        redirect: 'follow',
      }).then((networkResponse) => {
        if (networkResponse.type === 'opaqueredirect') {
          return networkResponse;
        }
        if (networkResponse.ok && (networkResponse.status === 200 || networkResponse.type === 'basic')) {
          const responseClone = networkResponse.clone();
          caches.open(APP_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return networkResponse;
      }).catch(() => {
        return caches.match('/offline.html') || new Response('Offline', { status: 503 });
      });
    })
  );
});
*/