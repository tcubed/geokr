/*
UPDATE APP_CACHE VERSION TO FORCE RELOAD
*/
const APP_CACHE = 'geo-app-v2';
const TILE_CACHE = 'tile-cache-v1';
const IMAGE_CACHE = 'image-cache-v1';
const ASSET_CACHE = 'asset-cache-v1';
const API_CACHE = 'api-cache-v1';
const OFFLINE_TILE_URL = '/static/images/offline-tile.png';

const APP_SHELL_FILES = [
  //'/',         // entry point (redirects handled by app)
  '/findloc',  // main play
  '/offline',  // offline fallback

  // core UI
  '/static/js/login.js',
  //'/static/js/prefetch.js',
  '/static/js/findloc.js',
  '/static/js/offline-game.js',
  '/static/js/offline-db.js',
  '/static/js/offline-sync-page.js',
  '/static/js/offline-sync-sw.js',
  '/static/js/validate.js',
  '/static/js/localStorage.js',
  '/static/js/account.js',
  // DEBUG
  '/static/js/debug_utils.js',
  //'/static/js/game_locations.js',

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
  //'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/fonts/bootstrap-icons.woff2?dd67030699838ea613ee6dbda90effa6',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/fonts/bootstrap-icons.woff2',
  
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/webfonts/fa-solid-900.woff2'
];


const TILE_URL_REGEX = /^https:\/\/tile\.openstreetmap\.org\/(\d+)\/(\d+)\/(\d+)\.png$/;

importScripts('/static/js/offline-sync-sw.js'); // must be self-contained

const offlineDB = {
  async addUpdate(update) { /* indexedDB add logic */ },
  async getAllUpdates(opts) { /* indexedDB get logic */ },
  async deleteUpdate(id) { /* indexedDB delete logic */ }
};

/*
 * Fetch with a caching strategy
 * @param {Request|string} request - The request object or URL
 * @param {'cache-first'|'network-first'} strategy - Strategy type
 * @param {string} cacheName - Name of cache to use
 * @param {string|Request|null} fallback - Optional fallback if fetch/cache fails
 * @param {boolean} ignoreQuery - Ignore query string for caching
 */
async function fetchWithStrategy(request, strategy, cacheName, fallback = null, ignoreQuery = true) {
  const cache = await caches.open(cacheName);

  let cacheKey;
  if (typeof request === 'string') {
    cacheKey = request;
    request = new Request(request);
  } else {
    cacheKey = ignoreQuery ? new URL(request.url).pathname : request.url;
  }

  const cached = await cache.match(cacheKey);
  if (strategy === 'cache-first' && cached) return cached;

  
  // detect if request is cross-origin
  const isCrossOrigin = new URL(request.url).origin !== self.location.origin;

  // If offline and same-origin, serve from cache only
  if (!self.navigator.onLine && !isCrossOrigin) {
    if (cached) return cached;
    if (fallback) return typeof fallback === 'string' ? caches.match(fallback) : fallback;
    return new Response('Offline', { status: 503 });
  }

  // const fetchOptions = {
  //   credentials: isCrossOrigin ? 'omit' : 'same-origin',
  //   redirect: isCrossOrigin ? 'follow' : 'manual'
  // };
  const fetchOptions = isCrossOrigin ? {} : { credentials: 'same-origin', redirect: 'follow' };
      

  const doFetch = async () => {
    try {
      console.log('[SW] Fetching:', request.url);
      const response = await fetch(request, fetchOptions);
      console.log('[SW] Fetch response:', response.status, request.url);

      // Only follow redirects manually for same-origin
      if (!isCrossOrigin && response.status >= 300 && response.status < 400) {
        const location = response.headers.get('Location');
        if (location) {
          console.log('[SW] Following redirect to', location);
          return fetch(location, { credentials: 'same-origin', redirect: 'follow' });
        }
      }

      // Follow redirect manually
      // if (response.status >= 300 && response.status < 400) {
      //   const location = response.headers.get('Location');
      //   if (location) return fetch(location, { credentials: 'same-origin' });
      // }

      // Cache opaque responses too
      if (response.ok || response.type === 'opaque') {
        await cache.put(cacheKey, response.clone());
        console.log('[SW] Cached:', cacheKey);
      }
      return response;
    } catch (err) {
      console.warn('[SW] Fetch failed:', request.url, err);
      if (cached) {
        console.log('[SW] Returning cached response for:', cacheKey);
        return cached;
      }
      if (fallback) {
        try {
          console.log('[SW] Using fallback for:', request.url);
          return typeof fallback === 'string' ? await caches.match(fallback) || await fetch(fallback) : fallback;
        } catch (err2) {
          console.warn('[SW] Fallback fetch failed', err2);
          return new Response('Offline', { status: 503 });
        }
      }
    }
  };

  if (strategy === 'cache-first') {
    return cached || doFetch();
  } else if (strategy === 'network-first') {
    return doFetch();
  }

  throw new Error('Invalid strategy: ' + strategy);
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
// self.addEventListener('activate', (event) => {
//   console.log('[SW] Activating...');
//   event.waitUntil(
//     caches.keys().then(keys => {
//       console.log('[SW] Current caches:', keys);
//       return Promise.all(
//         keys
//           .filter(key => ![APP_CACHE, TILE_CACHE, ASSET_CACHE, API_CACHE].includes(key))
//           .map(key =>
//             caches.delete(key).then((deleted) => {
//               console.log(`[SW] Deleted old cache: ${key} -> ${deleted}`);
//               return deleted;
//             })
//           )
//       );
//     })
//   );
//   self.clients.claim();
// });
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
      syncAllQueuedUpdates({
        offlineDB,
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
// Intercept fetches
self.addEventListener('fetch', event => {

  const url = new URL(event.request.url);
  console.log('[SW] Fetch event for:', url.pathname, 'method:', event.request.method);
  const exactBypass = ['/', '/account', '/login', '/register', '/magic-login', '/logout','/game_admin'];
  const prefixBypass = ['/admin'];

  if (event.request.method !== 'GET' && event.request.method !== 'POST') {
    return;
  }
  
  if (exactBypass.includes(url.pathname) || prefixBypass.some(p => url.pathname.startsWith(p))) {
    console.log('[SW] Bypassing path:', url.pathname);
    return;
  }

  // Only handle GET and POST requests
  if (event.request.method === 'GET') {
    
    // Tile caching
    if (TILE_URL_REGEX.test(url)) {
      event.respondWith(fetchWithStrategy(event.request, 'cache-first', TILE_CACHE, OFFLINE_TILE_URL));
      return;
    }

    // Image caching
    if (url.pathname.match(/\.(png|jpg|jpeg|gif|webp)$/)) {
      console.log('[SW] Image request:', url.href);
      event.respondWith(fetchWithStrategy(event.request, 'cache-first', IMAGE_CACHE, OFFLINE_TILE_URL));
      return;
    }

    // CSS, JS, Fonts → cache-first
    if (url.pathname.match(/\.(css|js|woff2|woff|ttf)$/)) {
      console.log('[SW] Asset request:', url.href);
      event.respondWith(fetchWithStrategy(event.request,'cache-first', ASSET_CACHE));
      return;
    }

    // Game API GET caching
    if (url.pathname.startsWith('/api/')) {
      console.log('[SW] API GET request:', url.href);
      event.respondWith(fetchWithStrategy(event.request,'network-first',APP_CACHE,
          new Response('{}', { headers: { 'Content-Type': 'application/json' } }))
      );
      return;
    }

    // named file
    // if (event.request.mode === 'navigate' && url.pathname === '/findloc') {
    //   event.respondWith(fetchWithStrategy(event.request, 'network-first', APP_CACHE, '/offline'));
    //   return;
    // }

    // App shell / other static assets & navigation handling
    if (event.request.mode === 'navigate') {
      console.time('[SW] Navigation fetch ' + event.request.url);

      // network-first for pages
      event.respondWith(fetchWithStrategy(event.request, 'network-first', APP_CACHE, '/offline'));
      return;
    } else {
      // All other GET requests (non-navigation)
      console.log('[SW] Other GET request:', url.href);
      event.respondWith(fetchWithStrategy(event.request, 'cache-first', APP_CACHE, '/offline'));
    }
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
          try {
            const clonedRequest = event.request.clone();
            const body = await clonedRequest.json();
            await offlineDB.addUpdate({
              url: event.request.url,
              method: 'POST',
              body,
              timestamp: Date.now(),
              attempts: 0
            });
          } catch (err2) {
            console.warn('[SW] Could not queue update:', err2);
          }
          
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




// async function cacheFirst(request, cacheName) {
//   const cache = await caches.open(cacheName);
//   const cached = await cache.match(request);
//   if (cached) return cached;
//   try {
//     const response = await fetch(request);
//     cache.put(request, response.clone());
//     return response;
//   } catch {
//     return caches.match('/static/images/offline-tile.png');
//   }
// }
/*
 * Try cache first; if missing, fetch from network and store in cache.
 * Optionally provide a fallback response if both fail.
 * 
 * @param {Request|string} request - Request object or URL string
 * @param {string} cacheName - Name of the cache to use
 * @param {Response|string} fallback - Optional fallback response or URL to fetch
 * @param {boolean} ignoreQuery - Ignore query strings in cache key
 * @returns {Promise<Response>}
 */
/*
async function cacheFirst(request, cacheName, fallback = null, ignoreQuery = true) {
  const cache = await caches.open(cacheName);

  let cacheKey;
  if (typeof request === 'string') {
    cacheKey = request;
    request = new Request(request);
  } else {
    cacheKey = ignoreQuery ? new URL(request.url).pathname : request.url;
  }

  
  console.log('[SW] cacheFirst:', cacheName, cacheKey);


  const cached = await cache.match(cacheKey);
  if (cached) {
    console.log('[SW] Cache hit:', cacheKey);
    return cached;
  } else {
    console.log('[SW] Cache miss:', cacheKey);
  }

  try {
    const response = await fetch(request);
    console.log('[SW] Fetched:', request.url, response.status);
    if (response.ok) {
      await cache.put(cacheKey, response.clone());
      console.log('[SW] Cached:', cacheKey);
    } else {
      console.warn('[SW] Not caching, response not OK:', response.status, request.url);
    }
    return response;
  } catch (err) {
    console.warn('[SW] Fetch failed:', request.url, err);
    if (fallback) {
      console.log('[SW] Using fallback for:', request.url);
      if (typeof fallback === 'string') return fetch(fallback);
      return fallback;
    }
    throw err;
  }
}
*/