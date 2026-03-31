const APP_CACHE = 'geo-app-v1';
const TILE_CACHE = 'tile-cache-v1';
const IMAGE_CACHE = 'image-cache-v1';
const ASSET_CACHE = 'asset-cache-v1';
const API_CACHE = 'api-cache-v1';
const OFFLINE_TILE_URL = '/static/images/offline-tile.png';

const APP_SHELL_FILES = [
  '/findloc', 
  '/offline',
  '/static/js/login.js',
  '/static/js/findloc.js',
  '/static/js/offline-game.js',
  '/static/js/offline-db.js',
  '/static/js/offline-sync.js',
  '/static/js/validate.js',
  '/static/js/localStorage.js',
  '/static/js/account.js',
  '/static/js/debug_utils.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/idb@8.0.3/build/index.js',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/fonts/bootstrap-icons.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/webfonts/fa-solid-900.woff2'
];

const TILE_URL_REGEX = /^https:\/\/tile\.openstreetmap\.org\/(\d+)\/(\d+)\/(\d+)\.png$/;

// Import the actual database and sync libraries
importScripts('/static/js/offline-db.js');
importScripts('/static/js/offline-sync.js');

// Now, offlineDB and offlineSync are available globally in the Service Worker scope


/*
 * General-purpose fetch with caching strategy and proper error handling.
 */
/*
 * General-purpose fetch with caching strategy and proper error handling.
 */
async function fetchWithStrategy(request, strategy, cacheName, fallback = null, ignoreQuery = true) {
  const cache = await caches.open(cacheName);
  const cacheKey = ignoreQuery ? new URL(request.url).pathname : request.url;

  if (strategy === 'cache-first') {
    const cached = await cache.match(cacheKey);
    if (cached) {
      console.log('[SW] Cache hit (cache-first):', cacheKey);
      return cached;
    }
    // If not in cache, proceed to network
  }

  // Network attempt for both strategies
  try {
    const response = await fetch(request);
    // If a valid network response, cache it and return
    if (response.ok || response.type === 'opaque') {
      await cache.put(cacheKey, response.clone());
      console.log('[SW] Fetched and cached:', cacheKey);
    }
    return response;
  } catch (err) {
    console.warn('[SW] Fetch failed:', request.url, err);

    // Fallback logic
    if (strategy === 'network-first') {
      const cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) {
        console.log('[SW] Returning cached response (network-first fallback):', cacheKey);
        return cachedResponse;
      }
    }

    // Use a hard-coded fallback if all else fails
    if (fallback) {
      console.log('[SW] Using final fallback:', typeof fallback === 'string' ? fallback : 'Response object');
      const fallbackResponse = typeof fallback === 'string' ? await caches.match(fallback) || await fetch(fallback) : fallback;
      if (fallbackResponse) {
        return fallbackResponse;
      }
    }

    // Default offline response
    console.log('[SW] No fallback, returning offline response');
    return new Response('Offline', { status: 503 });
  }
}

/* ================================================
                       INSTALL
   ================================================*/
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(APP_CACHE)
      .then((cache) => {
        console.log('[SW] Caching app shell files');
        return cache.addAll(APP_SHELL_FILES);
      })
      .then(() => {
        console.log('[SW] All app shell files cached');
      })
      .catch((err) => {
        console.error('[SW] Failed to cache app shell files:', err);
      })
  );
  self.skipWaiting();
});

/* ================================================
                       ACTIVATE
   ================================================*/
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(keys => {
      console.log('[SW] Current caches:', keys);
      const cachesToKeep = [APP_CACHE, TILE_CACHE, IMAGE_CACHE, ASSET_CACHE, API_CACHE];
      return Promise.all(
        keys
          .filter(key => !cachesToKeep.includes(key))
          .map(key => caches.delete(key).then(() => console.log(`[SW] Deleted old cache: ${key}`)))
      );
    })
  );
  self.clients.claim();
});

/* ================================================
                        SYNC
   ================================================*/
self.addEventListener('sync', event => {
    console.log('[SW] Sync event triggered:', event.tag);
    if (event.tag === 'sync-found-locations') {
        console.log('[SW] Syncing queued location updates...');
        event.waitUntil(
            // Use the imported offlineSync.syncAllQueuedUpdates function
            self.offlineSync.syncAllQueuedUpdates({
                offlineDB: self.offlineDB, // Pass the actual DB implementation
                onSuccess: (data, update) => console.log('[SW] Sync success:', update, data),
                onQueued: (update) => console.log('[SW] Still queued:', update),
                onFailure: (err, update) => console.warn('[SW] Sync failed:', err, update)
            }).catch(err => {
                console.error('[SW] syncAllQueuedUpdates failed with an unhandled error:', err);
            })
        );
    }
});

/* ================================================
                        FETCH
   ================================================*/
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  console.log('[SW] Fetch event for:', url.pathname, 'method:', event.request.method);

  const exactBypass = ['/', '/account', '/login', '/register', '/magic-login', '/logout', '/game_admin'];
  const prefixBypass = ['/admin'];
  
  if (event.request.method !== 'GET' && event.request.method !== 'POST') {
    return;
  }
  
  if (exactBypass.includes(url.pathname) || prefixBypass.some(p => url.pathname.startsWith(p))) {
    console.log('[SW] Bypassing path:', url.pathname);
    return;
  }

  // *****: Bypass cache for development files to ensure freshness : *****
  if (url.pathname.startsWith('/static/js/') || url.pathname.startsWith('/static/css/')) {
    event.respondWith(fetch(event.request));
    return;
  }
  // ********************************************************************

  if (event.request.method === 'GET') {
    // Tile caching
    if (TILE_URL_REGEX.test(url.href)) {
      event.respondWith(fetchWithStrategy(event.request, 'cache-first', TILE_CACHE, OFFLINE_TILE_URL));
      return;
    }

    // Image caching
    if (url.pathname.match(/\.(png|jpg|jpeg|gif|webp)$/)) {
      event.respondWith(fetchWithStrategy(event.request, 'cache-first', IMAGE_CACHE, OFFLINE_TILE_URL));
      return;
    }

    // CSS, JS, Fonts
    if (url.pathname.match(/\.(css|js|woff2|woff|ttf)$/)) {
      event.respondWith(fetchWithStrategy(event.request, 'cache-first', ASSET_CACHE));
      return;
    }

    // Game API GET caching
    if (url.pathname.startsWith('/api/')) {
        console.log('[SW] API GET request:', url.href);
        event.respondWith(fetchWithStrategy(event.request, 'network-first', API_CACHE,
            new Response('{}', { headers: { 'Content-Type': 'application/json' } })
        ));
        return;
    }

    // Navigation and other static assets
    if (event.request.mode === 'navigate') {
      console.log('[SW] Navigation request:', url.href);
      event.respondWith(fetchWithStrategy(event.request, 'network-first', APP_CACHE, '/offline'));
      return;
    } else {
      console.log('[SW] Other GET request:', url.href);
      event.respondWith(fetchWithStrategy(event.request, 'cache-first', APP_CACHE, '/offline'));
      return;
    }
  }

  // Handle POST requests
  if (event.request.method === 'POST') {
    // Login
    if (url.pathname === '/login') {
      event.respondWith(
        (async () => {
          try {
            const fetchRequest = event.request.clone();
            const response = await fetch(fetchRequest);
            if (response.ok) {
              const json = await response.clone().json();
              if (json.success) {
                // Use the actual offlineDB from the imported script
                await self.offlineDB.addUpdate({ type: 'login', email: json.email, timestamp: Date.now() });
              }
              return new Response(JSON.stringify(json), { headers: { 'Content-Type': 'application/json' } });
            }
            throw new Error(`Server responded with status: ${response.status}`);
          } catch (err) {
                console.warn('[SW] Online login failed, attempting offline:', err);
                // The original getLastLogin is a placeholder, so this would need a real implementation
                const lastLogin = await self.offlineDB.getLastLogin();
                if (lastLogin) {
                    return new Response(JSON.stringify({
                        success: true,
                        message: 'Offline login successful',
                        email: lastLogin.email
                    }), { headers: { 'Content-Type': 'application/json' } });
                }
                return new Response(JSON.stringify({
                    success: false,
                    message: 'Offline login failed, no previous login found'
                }), { headers: { 'Content-Type': 'application/json' } });
          }
        })()
      );
      return;
    }

    // Offline sync POST
    // Use sendOrQueue for all other POST requests that need offline sync
    if (url.pathname.startsWith('/api/location/found')) {
        event.respondWith(
            (async () => {
                try {
                    const clonedRequest = event.request.clone();
                    const body = await clonedRequest.json();
                    
                    const update = {
                        url: event.request.url,
                        method: 'POST',
                        body,
                        timestamp: Date.now(),
                        attempts: 0
                    };

                    // Use the imported offlineSync.sendOrQueue function
                    const sent = await self.offlineSync.sendOrQueue(update, {
                        offlineDB: self.offlineDB, // Pass the actual DB object
                        onSuccess: () => {
                            // This is where you might send a message to the client
                            // or handle a successful sync from the SW context
                        },
                        onQueued: () => {
                            // This is where you'd handle the queuing logic
                        },
                        onFailure: (err) => {
                            console.warn('[SW] Offline sync failed:', err);
                        }
                    });

                    if (sent) {
                            // This is the response from the server, if the sync was immediate
                            const response = await fetch(event.request);
                            return response;
                    } else {
                        // The request was queued for later
                        return new Response(JSON.stringify({ queued: true }), { headers: { 'Content-Type': 'application/json' } });
                    }
                } catch (err) {
                    console.error('[SW] Error handling POST request:', err);
                    return new Response(JSON.stringify({ success: false, message: 'Failed to process request' }), { status: 500 });
                }
            })()
        );
        return;
    }
  }

});