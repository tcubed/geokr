import { GEO_ENABLED } from './globals.js';

// Read the new cookie
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
}

// Determine location mode
const locationMode = getCookie('location_mode') || 'none'; // default 'none'

let map, marker;
let watchId = null;
window.latestPosition = null;

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
  if (!GEO_ENABLED & locationMode === 'none') {
    console.info("Geolocation is disabled, using non-geo validation.");
    callback(getFallbackPosition()); 
    return;
  }

  getCurrentLocation()
    .then(pos => {
      window.latestPosition = {
        coords: {
          latitude: pos.lat,
          longitude: pos.lon
        }
      };
      //showMap(pos.lat, pos.lon);
      if (locationMode === 'watch') startTracking(callback);
      else callback(window.latestPosition); // 'current' mode: one-shot
    })
    .catch(err => {
      console.warn("Initial location fetch failed:", err);
      callback(getFallbackPosition());
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopTracking();
      else if (locationMode === 'watch') startTracking(callback);
    });
}

function getFallbackPosition() {
  const loc = window.GAME_DATA?.locations?.[0];
  if (loc && loc.lat && loc.lon) {
    return { coords: { latitude: loc.lat, longitude: loc.lon } };
  }
  return null;
}


export function startTracking(callback) {
  if (!GEO_ENABLED) {
    console.info("Geolocation disabled.");
    callback?.(getFallbackPosition());
    return;
  }

  if (watchId !== null) return; // already tracking

  switch (locationMode) {
    case 'none':
      // Always use fallback
      callback?.(getFallbackPosition());
      break;

    case 'current':
      // One-shot fetch
      getCurrentLocation()
        .then(pos => {
          window.latestPosition = { coords: { latitude: pos.lat, longitude: pos.lon } };
          callback?.(pos);
        })
        .catch(err => {
          console.warn("Current position fetch failed:", err);
          callback?.(getFallbackPosition());
        });
      break;

    case 'watch':
      if (navigator.geolocation) {
        // Start continuous watch
        watchId = navigator.geolocation.watchPosition(
          pos => {
            window.latestPosition = pos;
            callback?.(pos);
          },
          err => {
            if (err.code === err.PERMISSION_DENIED) {
              console.warn("User denied geolocation, switching to fallback.");
              callback?.(getFallbackPosition());
            } else {
              console.error("Geolocation watch error:", err);
              alert("Geolocation error: " + err.message);
            }
          },
          { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
        );
      } else {
        console.warn("Geolocation not supported, using fallback.");
        callback?.(getFallbackPosition());
      }
      break;

    default:
      console.error("Invalid locationMode:", locationMode);
      callback?.(getFallbackPosition());
      break;
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
    const fallback = window.GAME_DATA?.locations?.[0];

    switch (locationMode) {
      case 'none':
        if (fallback && fallback.lat && fallback.lon) {
          resolve({ lat: fallback.lat, lon: fallback.lon, source: 'fallback' });
        } else {
          reject('Geolocation disabled and no fallback location available');
        }
        break;

      case 'current':
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, source: 'one-shot' }),
            err => {
              if (fallback && fallback.lat && fallback.lon) resolve({ lat: fallback.lat, lon: fallback.lon, source: 'fallback' });
              else reject(err);
            },
            { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
          );
        } else if (fallback && fallback.lat && fallback.lon) {
          resolve({ lat: fallback.lat, lon: fallback.lon, source: 'fallback' });
        } else {
          reject('Geolocation not supported and no fallback location available');
        }
        break;

      case 'watch':
        if (window.latestPosition) {
          resolve({
            lat: window.latestPosition.coords.latitude,
            lon: window.latestPosition.coords.longitude,
            source: 'watch'
          });
        } else if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, source: 'one-shot' }),
            err => {
              if (fallback && fallback.lat && fallback.lon) resolve({ lat: fallback.lat, lon: fallback.lon, source: 'fallback' });
              else reject(err);
            },
            { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
          );
        } else if (fallback && fallback.lat && fallback.lon) {
          resolve({ lat: fallback.lat, lon: fallback.lon, source: 'fallback' });
        } else {
          reject('Geolocation not supported and no fallback location available');
        }
        break;

      default:
        reject('Invalid location mode');
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
