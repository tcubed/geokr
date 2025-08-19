import { GEO_ENABLED } from './globals.js';

let map, marker;
let watchId = null;

export function haversine(lat1, lon1, lat2, lon2) {
  function toRad(x) { return x * Math.PI / 180; }
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function initGeo(callback = getCluesFromPosition) {
  if (!GEO_ENABLED) {
    console.info("Geolocation is disabled, using non-geo validation.");
    callback(getFallbackPosition()); 
    return;
  }

  window.latestPosition = null;

  getCurrentLocation()
    .then(pos => {
      window.latestPosition = {
        coords: {
          latitude: pos.lat,
          longitude: pos.lon
        }
      };
      //showMap(pos.lat, pos.lon);
      startTracking(callback);
    })
    .catch(err => {
      console.warn("Initial location fetch failed:", err);
      callback(getFallbackPosition());
    });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopTracking();
    } else {
      startTracking(callback);
    }
  });
}

function getFallbackPosition() {
  if (GAME_DATA?.locations?.[0]) {
    const loc = GAME_DATA.locations[0];
    return { coords: { latitude: loc.lat, longitude: loc.lon } };
  }
  return null;
}

export function startTracking(cb) {
  if (!GEO_ENABLED) return;

  if (defaultPosMode) return;
  if (watchPosition && watchId === null && navigator.geolocation) {
    watchId = navigator.geolocation.watchPosition(
      pos => {
        window.latestPosition = pos;
        cb?.(pos); // invoke callback if defined
      },
      err => {
        if (err.code === err.PERMISSION_DENIED) {
          console.warn("User denied geolocation, switching to fallback.");
          cb(getFallbackPosition());
        } else {
          alert("Geolocation error: " + err.message);
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );
  }
}

export function stopTracking() {
  if (watchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}

// in utils.js or map.js
async function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (window.defaultPosMode) {
      const fallback = window.GAME_DATA?.locations?.[0];
      if (fallback && fallback.lat && fallback.lon) {
        resolve({ lat: fallback.lat, lon: fallback.lon, source: 'default' });
      } else {
        reject('No fallback location available');
      }
    } else if (window.watchPosition && window.latestPosition) {
      resolve({
        lat: window.latestPosition.coords.latitude,
        lon: window.latestPosition.coords.longitude,
        source: 'watch'
      });
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            source: 'one-shot'
          });
        },
        (err) => reject(err),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
      );
    } else {
      reject('Geolocation not supported');
    }
  });
}

function showMap(lat, lon) {
  if (!map) {
    map = L.map('map').setView([lat, lon], currentZoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(map);

    marker = L.marker([lat, lon], { zIndexOffset: 0 }).addTo(map).bindPopup('You are here').openPopup();

    map.on('zoomend', () => {
      currentZoom = map.getZoom();
      localStorage.setItem('mapZoom', currentZoom);
    });
  } else {
    map.setView([lat, lon], currentZoom);
    if (marker) {
      marker.setLatLng([lat, lon]);
    } else {
      marker = L.marker([lat, lon], { zIndexOffset: 0 }).addTo(map).bindPopup('You are here').openPopup();
    }
  }
}

document.addEventListener("DOMContentLoaded", function () {
  const maps = document.querySelectorAll('.map-container');
  maps.forEach(function(el) {
    const lat = parseFloat(el.dataset.lat);
    const lon = parseFloat(el.dataset.lon);
    const mapId = el.dataset.id;

    const map = L.map('map-' + mapId).setView([lat, lon], 19);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    L.marker([lat, lon]).addTo(map);
  });
});

// PUT THIS IN THE MAIN SCRIPT BLOCK
// document.addEventListener("visibilitychange", () => {
//   if (document.hidden) stopTracking();
//   else startTracking(getCluesFromPosition);
// });

// if (watchPosition && !defaultPosMode && !document.hidden) {
//   startTracking(getCluesFromPosition);
// }


//===========================================================

// let gameId = null;
// let teamId = null;

// let map, marker;
// let latestPosition = null;
// let clueMarkers = [];
// let currentZoom = parseInt(localStorage.getItem('mapZoom')) || 19;
// let lastDebugAlertTime = 0;

// const distanceThreshold = 5; // meters

// const redIcon = L.icon({
//   iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
//   iconSize: [25, 41],
//   iconAnchor: [12, 41],
//   popupAnchor: [1, -34],
//   shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
//   shadowSize: [41, 41]
// });

// function getCookie(name) {
//   const value = `; ${document.cookie}`;
//   const parts = value.split(`; ${name}=`);
//   if (parts.length === 2) return parts.pop().split(';').shift();
// }
// const debugMode = getCookie('debug_mode') === '1';
// const watchPosition = getCookie('watch_position') === '1';
// //const defaultPosMode = getCookie('default_pos_mode') === '1';

// let watchId = null;

// function startTracking() {
//   if (defaultPosMode) return;
//   if (watchPosition && watchId === null && navigator.geolocation) {
//     watchId = navigator.geolocation.watchPosition(
//       getCluesFromPosition,
//       err => alert("Geolocation error: " + err.message),
//       { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
//     );
//   }
// }

// function stopTracking() {
//   if (watchId !== null && navigator.geolocation) {
//     navigator.geolocation.clearWatch(watchId);
//     watchId = null;
//   }
// }

// async function getCluesFromPosition(position) {
//   const lat = position.coords.latitude;
//   const lon = position.coords.longitude;
//   const accuracy = position.coords.accuracy;
//   latestPosition = position;

//   const posTime = new Date(position.timestamp);
//   const now = new Date();
//   const diff = Math.round((now - posTime) / 1000);
//   const nowMs = Date.now();

//   if (debugMode && (nowMs - lastDebugAlertTime > 30000)) {
//     alert(`Position timestamp: ${posTime}\nAge: ${diff}s old\nPos: (${lat.toFixed(3)}, ${lon.toFixed(3)})\nAccuracy: ${accuracy.toFixed(1)}m`);
//     lastDebugAlertTime = nowMs;
//   }

//   showMap(lat, lon);

//   const response = await fetch('/api/locations', {
//     method: 'POST',
//     headers: {'Content-Type': 'application/json'},
//     body: JSON.stringify({ latitude: lat, longitude: lon, game_id: gameId })
//   });

//   const clues = await response.json();

//   clueMarkers.forEach(m => map.removeLayer(m));
//   clueMarkers = [];

//   clues.forEach(clue => {
//     if (clue.latitude && clue.longitude) {
//       const distance = haversine(lat, lon, clue.latitude, clue.longitude);
//       const clueMarker = L.marker([clue.latitude, clue.longitude], { icon: redIcon, zIndexOffset: 1000 }).addTo(map);

//       if (distance <= distanceThreshold) {
//         let visited = JSON.parse(localStorage.getItem('visited_locations') || '[]');
//         if (!visited.includes(clue.id)) {
//           visited.push(clue.id);
//           localStorage.setItem('visited_locations', JSON.stringify(visited));
//           window.location = `/location/${clue.id}`;
//         } else {
//           clueMarker.bindPopup(`${clue.name}: ${clue.clue}`);
//           clueMarker.on('click', () => window.location = `/location/${clue.id}`);
//         }
//       } else {
//         clueMarker.bindPopup(`${clue.name}: Get closer to unlock this clue!`);
//         clueMarker.on('click', function() { this.openPopup(); });
//       }

//       clueMarkers.push(clueMarker);
//     }
//   });
// }

// async function getClues() {
//   if (!gameId) {
//     alert('No game selected.');
//     return;
//   }

//   if (defaultPosMode) {
//     const response = await fetch('/api/locations', {
//       method: 'POST',
//       headers: {'Content-Type': 'application/json'},
//       body: JSON.stringify({ game_id: gameId })
//     });

//     const clues = await response.json();
//     if (clues.length > 0) {
//       const { latitude: lat, longitude: lon } = clues[0];
//       showMap(lat, lon);
//       clueMarkers.forEach(m => map.removeLayer(m));
//       clueMarkers = [];

//       clues.forEach(clue => {
//         if (clue.latitude && clue.longitude) {
//           const clueMarker = L.marker([clue.latitude, clue.longitude], { icon: redIcon, zIndexOffset: 1000 }).addTo(map);
//           clueMarker.bindPopup(`${clue.name}: ${clue.clue}`);
//           clueMarker.on('click', () => window.location = `/location/${clue.id}`);
//           clueMarkers.push(clueMarker);
//         }
//       });
//     }
//     return;
//   }

//   if (!navigator.geolocation) {
//     alert("Geolocation not supported.");
//     return;
//   }

//   if (watchPosition) {
//     if (watchId !== null) navigator.geolocation.clearWatch(watchId);
//     watchId = navigator.geolocation.watchPosition(
//       getCluesFromPosition,
//       err => alert("Geolocation error: " + err.message),
//       { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
//     );
//   } else {
//     navigator.geolocation.getCurrentPosition(
//       getCluesFromPosition,
//       err => alert("Geolocation error: " + err.message),
//       { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
//     );
//   }
// }


// function showMap(lat, lon) {
//   if (!map) {
//     map = L.map('map').setView([lat, lon], currentZoom);
//     L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
//       maxZoom: 19,
//       attribution: '© OpenStreetMap'
//     }).addTo(map);

//     marker = L.marker([lat, lon], { zIndexOffset: 0 }).addTo(map).bindPopup('You are here').openPopup();

//     map.on('zoomend', () => {
//       currentZoom = map.getZoom();
//       localStorage.setItem('mapZoom', currentZoom);
//     });
//   } else {
//     map.setView([lat, lon], currentZoom);
//     if (marker) {
//       marker.setLatLng([lat, lon]);
//     } else {
//       marker = L.marker([lat, lon], { zIndexOffset: 0 }).addTo(map).bindPopup('You are here').openPopup();
//     }
//   }
// }

// function sendToNewPin() {
//   if (latestPosition) {
//     const { latitude: lat, longitude: lon } = latestPosition.coords;
//     window.location = `/new_pin?lat=${lat}&lon=${lon}`;
//   } else if (navigator.geolocation) {
//     navigator.geolocation.getCurrentPosition(pos => {
//       const { latitude: lat, longitude: lon } = pos.coords;
//       window.location = `/new_pin?lat=${lat}&lon=${lon}`;
//     }, err => alert("Geolocation error: " + err.message), {
//       enableHighAccuracy: true,
//       maximumAge: 0,
//       timeout: 20000
//     });
//   } else {
//     alert("Geolocation not supported.");
//   }
// }

// function updateProgress() {
//   if (!teamId) return;
//   fetch(`/api/team/progress/${teamId}`)
//     .then(res => res.json())
//     .then(data => {
//       document.getElementById('progress').textContent = `Clues found: ${data.clues_found.length}`;
//     });
// }

// async function prefetchTiles() {
//   const res = await fetch('/api/tile-list');
//   const tiles = await res.json();

//   const cache = await caches.open('tile-cache-v1');

//   for (const tileUrl of tiles) {
//     try {
//       const response = await fetch(tileUrl, { mode: 'no-cors' });
//       await cache.put(tileUrl, response);
//       console.log('Cached:', tileUrl);
//     } catch (err) {
//       console.warn('Failed to cache tile:', tileUrl);
//     }
//   }

//   console.log('Tile prefetch complete');
// }

// async function prefetchTiles(bounds, zoomLevels = [14, 15, 16]) {
//   // const min_lat = 43.074;  // Replace with your game area
//   // const min_lng = -89.39;
//   // const max_lat = 43.078;
//   // const max_lng = -89.385;
//   // const zooms = "14,15,16";
//   //if ([min_lat, min_lng, max_lat, max_lng].some(v => v === null)) {
//   if (!Array.isArray(bounds) || bounds.length !== 4 || bounds.some(v => v === null)) {
//     console.warn('Prefetch skipped: Game bounding box not set or invalid.');
//     return;
//   }

//   const [minLat, minLng, maxLat, maxLng] = bounds;

//   // Build API query dynamically
//   const response = await fetch(`/api/tile-list?min_lat=${minLat}&min_lng=${minLng}&max_lat=${maxLat}&max_lng=${maxLng}&zooms=${zoomLevels.join(',')}`);
//   const tileUrls = await response.json();

//   const cache = await caches.open('tile-cache');

//   for (const url of tileUrls) {
//     try {
//       const cached = await cache.match(url);
//       if (!cached) {
//         const res = await fetch(url, { mode: 'no-cors' });
//         if (res.ok || res.type === 'opaque') {
//           await cache.put(url, res);
//         } else {
//           console.warn('Tile fetch skipped (not ok):', url);
//         }
//       }
//     } catch (err) {
//       console.error('Tile fetch failed:', url, err);
//     }
//   }

//   console.log(`Prefetched ${tileUrls.length} tiles`);
// }



