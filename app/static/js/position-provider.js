// position-provider.js
const GEO_ENABLED = true;  // toggle this to false for dev or forced fallback
let watchId = null;
let callbackFn = null;

function getFallbackPosition() {
  if (window.GAME_DATA?.locations?.[0]) {
    const loc = window.GAME_DATA.locations[0];
    return { coords: { latitude: loc.lat, longitude: loc.lon } };
  }
  return null;
}

export function initPositionTracking(callback) {
  callbackFn = callback;

  if (!GEO_ENABLED) {
    console.info("Geo disabled, sending fallback position");
    callbackFn(getFallbackPosition());
    return;
  }

  if (!navigator.geolocation) {
    console.warn("Geolocation not supported, using fallback");
    callbackFn(getFallbackPosition());
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      callbackFn(pos);
      startWatch();
    },
    (err) => {
      if (err.code === err.PERMISSION_DENIED) {
        console.warn("Geo permission denied, using fallback");
        callbackFn(getFallbackPosition());
      } else {
        console.warn("Geo error:", err.message);
      }
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
  );
}

function startWatch() {
  if (watchId !== null) return; // already watching

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      callbackFn(pos);
    },
    (err) => {
      if (err.code === err.PERMISSION_DENIED) {
        console.warn("Geo watch permission denied, stopping watch");
        stopPositionTracking();
        callbackFn(getFallbackPosition());
      } else {
        console.warn("Geo watch error:", err.message);
      }
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
  );
}

export function stopPositionTracking() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}
