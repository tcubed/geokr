// prefetch.js
const TILE_CACHE = 'tile-cache-v1';
const ASSET_CACHE = 'asset-cache-v1';
const API_CACHE = 'api-cache-v1';

/**
 * Prefetch map tiles for a bounding box and zoom levels.
 */
//console.log('define prefetchTiles')
async function prefetchTiles(bounds, zoomLevels) {
  const [minLat, minLng, maxLat, maxLng] = bounds;
  const tileUrls = [];

  for (let z of zoomLevels) {
    const minX = lon2tile(minLng, z);
    const maxX = lon2tile(maxLng, z);
    const minY = lat2tile(maxLat, z);
    const maxY = lat2tile(minLat, z);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        tileUrls.push(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`);
      }
    }
  }

  const cache = await caches.open(TILE_CACHE);
  for (const url of tileUrls) {
    try {
      const response = await fetch(url, { mode: 'no-cors' });
      await cache.put(url, response.clone());
    } catch (err) {
      console.warn('Tile fetch failed:', url);
    }
  }
  console.log(`Prefetched ${tileUrls.length} tiles`);
}

/**
 * Prefetch static assets (icons, images, etc.).
 */
//console.log('define prefetchAssets')
async function prefetchAssets(assetUrls) {
  const cache = await caches.open(ASSET_CACHE);
  for (const url of assetUrls) {
    try {
      const response = await fetch(url);
      await cache.put(url, response.clone());
    } catch (err) {
      console.warn('Asset fetch failed:', url);
    }
  }
  console.log(`Prefetched ${assetUrls.length} assets`);
}

/**
 * Prefetch API responses (game data, clues, etc.).
 */
//console.log('define prefetchAPIs')
async function prefetchAPIs(apiUrls) {
  const cache = await caches.open(API_CACHE);
  for (const url of apiUrls) {
    try {
      const response = await fetch(url, { credentials: 'include' }); // includes session cookie if needed
      await cache.put(url, response.clone());
    } catch (err) {
      console.warn('API fetch failed:', url);
    }
  }
  console.log(`Prefetched ${apiUrls.length} API endpoints`);
}

// Helper functions for tile math
// Converts longitude (deg) to tile X index at given zoom.
function lon2tile(lon, zoom) {
  return Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
}
// Converts latitude (deg) to tile Y index at given zoom using Web Mercator projection.
function lat2tile(lat, zoom) {
  return Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
}



// prefetch.js
/*
const btn = document.getElementById('prefetch-btn');
const offlineText = document.getElementById('offline-text');

function updateOnlineStatus() {
  if (navigator.onLine) {
    btn.style.display = 'inline-block';
    offlineText.style.display = 'none';
  } else {
    btn.style.display = 'none';
    offlineText.style.display = 'inline';
  }
}

btn.addEventListener('click', async () => {
  alert('Starting prefetch...');
  // implement prefetchTiles, prefetchAssets, prefetchAPIs as needed
  await prefetchTiles(window.bounds, [14, 15, 16]);
  await prefetchAssets(window.locationImageUrls);
  await prefetchAPIs([`/api/game-data/${window.GAME_DATA.gameId}`]);
  console.log('All game assets downloaded for offline use!');
});

updateOnlineStatus();
setInterval(updateOnlineStatus, 2000);
*/

//console.log('assign to window')
// Expose functions globally
window.prefetchTiles = prefetchTiles;
window.prefetchAssets = prefetchAssets;
window.prefetchAPIs = prefetchAPIs;
