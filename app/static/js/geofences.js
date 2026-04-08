import { showToast } from './common-ui.js';
import { haversine } from './map.js';
import { saveState } from './localStorage.js';

const root = typeof self !== 'undefined' ? self : window;
const DEFAULT_SETTINGS = {
  enabled: false,
  poll_interval_s: 20,
  default_cooldown_s: 300,
  default_repeat_every_s: 180,
};

let geofenceIntervalId = null;
let persistTimeoutId = null;
let activeCallbacks = null;
let immediateCheckInFlight = false;

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseIsoMs(value) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoNow(nowMs = Date.now()) {
  return new Date(nowMs).toISOString();
}

function getNormalizedSettings() {
  const raw = isObject(root.GAME_DATA?.geofence_settings) ? root.GAME_DATA.geofence_settings : {};
  return {
    enabled: Boolean(raw.enabled),
    poll_interval_s: toPositiveInt(raw.poll_interval_s, DEFAULT_SETTINGS.poll_interval_s),
    default_cooldown_s: toPositiveInt(raw.default_cooldown_s, DEFAULT_SETTINGS.default_cooldown_s),
    default_repeat_every_s: toPositiveInt(raw.default_repeat_every_s, DEFAULT_SETTINGS.default_repeat_every_s),
  };
}

function getNormalizedGeofenceMap() {
  const raw = isObject(root.GAME_DATA?.geofences) ? root.GAME_DATA.geofences : {};
  const normalized = {};

  Object.entries(raw).forEach(([locationId, fences]) => {
    if (!Array.isArray(fences)) return;
    const validFences = fences
      .filter(isObject)
      .map((fence, index) => {
        const center = isObject(fence.center) ? fence.center : {};
        const centerLat = Number(center.lat);
        const centerLon = Number(center.lon);
        const radiusMeters = Number(fence.radius_m);
        const trigger = String(fence.trigger || '').trim().toLowerCase();
        const repeatWhile = fence.repeat_while ? String(fence.repeat_while).trim().toLowerCase() : null;
        const message = String(fence.message || '').trim();
        const shape = String(fence.shape || '').trim().toLowerCase();

        if (shape !== 'circle') return null;
        if (!Number.isFinite(centerLat) || !Number.isFinite(centerLon)) return null;
        if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) return null;
        if (!['enter', 'exit'].includes(trigger)) return null;
        if (!message) return null;

        return {
          id: String(fence.id || `location-${locationId}-fence-${index + 1}`),
          enabled: fence.enabled !== false,
          location_id: Number(locationId),
          shape,
          center: { lat: centerLat, lon: centerLon },
          radius_m: radiusMeters,
          trigger,
          message,
          cooldown_s: toPositiveInt(fence.cooldown_s, DEFAULT_SETTINGS.default_cooldown_s),
          once_per_team: Boolean(fence.once_per_team),
          priority: Number.isFinite(Number(fence.priority)) ? Number(fence.priority) : 0,
          repeat_while: ['inside', 'outside'].includes(repeatWhile) ? repeatWhile : null,
          repeat_every_s: ['inside', 'outside'].includes(repeatWhile)
            ? toPositiveInt(fence.repeat_every_s, DEFAULT_SETTINGS.default_repeat_every_s)
            : null,
          metadata: isObject(fence.metadata) ? fence.metadata : {},
        };
      })
      .filter(Boolean)
      .sort((left, right) => (right.priority || 0) - (left.priority || 0));

    if (validFences.length) {
      normalized[String(locationId)] = validFences;
    }
  });

  return normalized;
}

function ensureGeofenceState(gameState) {
  if (!isObject(gameState.geofence_state)) {
    gameState.geofence_state = isObject(root.GAME_DATA?.team_geofence_state)
      ? JSON.parse(JSON.stringify(root.GAME_DATA.team_geofence_state))
      : {};
  }

  if (!isObject(gameState.geofence_runtime)) {
    gameState.geofence_runtime = isObject(root.GAME_DATA?.team_geofence_runtime)
      ? JSON.parse(JSON.stringify(root.GAME_DATA.team_geofence_runtime))
      : {};
  }

  if (!isObject(gameState.geofence_by_location)) {
    gameState.geofence_by_location = {};
  }

  if (Array.isArray(gameState.locations)) {
    gameState.locations.forEach((location) => {
      if (location && !Object.prototype.hasOwnProperty.call(location, 'geofenceStatus')) {
        location.geofenceStatus = null;
      }
    });
  }

  root.geofenceState = {
    state: gameState.geofence_state,
    runtime: gameState.geofence_runtime,
    byLocation: gameState.geofence_by_location,
  };
}

function getActiveLocationIds(gameState) {
  const currentLocation = gameState?.locations?.[gameState.currentIndex];
  if (!currentLocation) return [];
  return [String(currentLocation.id)];
}

function getLocationName(gameState, locationId) {
  const location = gameState?.locations?.find((item) => String(item.id) === String(locationId));
  return location?.name || `Location ${locationId}`;
}

function getLatestNotificationMs(runtimeEntry, historyEntry) {
  return [
    parseIsoMs(runtimeEntry?.last_notification_at),
    parseIsoMs(runtimeEntry?.last_reminder_at),
    parseIsoMs(historyEntry?.last_triggered_at),
    parseIsoMs(historyEntry?.last_reminder_at),
  ].filter(Boolean).sort((a, b) => b - a)[0] || null;
}

function isInsideCircle(latitude, longitude, fence) {
  return haversine(latitude, longitude, fence.center.lat, fence.center.lon) <= fence.radius_m;
}

function rebuildLocationStatus(gameState, geofenceMap) {
  const nextByLocation = {};

  Object.keys(geofenceMap).forEach((locationId) => {
    const relevantRuntime = Object.values(gameState.geofence_runtime || {}).filter((entry) => String(entry.location_id) === String(locationId));
    if (!relevantRuntime.length) {
      nextByLocation[String(locationId)] = {
        has_fences: true,
        inside_any: false,
        active_fence_ids: [],
        current_state: null,
        last_message: null,
        last_message_at: null,
        last_transition: null,
        summary: null,
      };
      return;
    }

    const insideEntries = relevantRuntime.filter((entry) => entry.current_state === 'inside');
    const latestEntry = relevantRuntime
      .slice()
      .sort((left, right) => (parseIsoMs(right.last_message_at) || parseIsoMs(right.last_transition_at) || 0) - (parseIsoMs(left.last_message_at) || parseIsoMs(left.last_transition_at) || 0))[0];

    const insideAny = insideEntries.length > 0;
    nextByLocation[String(locationId)] = {
      has_fences: true,
      inside_any: insideAny,
      active_fence_ids: insideEntries.map((entry) => entry.fence_id),
      current_state: insideAny ? 'inside' : 'outside',
      last_message: latestEntry?.last_message || null,
      last_message_at: latestEntry?.last_message_at || null,
      last_transition: latestEntry?.last_transition || null,
      summary: insideAny ? 'Inside monitored area' : 'Outside monitored area',
    };
  });

  gameState.geofence_by_location = nextByLocation;
  if (Array.isArray(gameState.locations)) {
    gameState.locations.forEach((location) => {
      location.geofenceStatus = nextByLocation[String(location.id)] || null;
    });
  }

  root.geofenceState = {
    state: gameState.geofence_state,
    runtime: gameState.geofence_runtime,
    byLocation: gameState.geofence_by_location,
  };
}

async function resolvePosition() {
  if (root.latestPosition?.coords?.latitude != null && root.latestPosition?.coords?.longitude != null) {
    return {
      latitude: Number(root.latestPosition.coords.latitude),
      longitude: Number(root.latestPosition.coords.longitude),
      source: 'latestPosition',
    };
  }

  if (!navigator.geolocation) {
    return null;
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        root.latestPosition = position;
        resolve({
          latitude: Number(position.coords.latitude),
          longitude: Number(position.coords.longitude),
          source: 'getCurrentPosition',
        });
      },
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );
  });
}

function shouldNotifyTransition({ fence, historyEntry, lastNotificationMs, nowMs }) {
  if (fence.once_per_team && Number(historyEntry?.times_triggered || 0) > 0) {
    return false;
  }
  if (!lastNotificationMs) {
    return true;
  }
  return (nowMs - lastNotificationMs) >= (fence.cooldown_s * 1000);
}

function shouldNotifyReminder({ fence, currentState, historyEntry, runtimeEntry, nowMs }) {
  if (!fence.repeat_while || fence.repeat_while !== currentState || !fence.repeat_every_s) {
    return false;
  }
  if (fence.once_per_team && Number(historyEntry?.times_triggered || 0) > 0) {
    return false;
  }

  const lastReminderMs = parseIsoMs(runtimeEntry?.last_reminder_at) || getLatestNotificationMs(runtimeEntry, historyEntry);
  if (!lastReminderMs) {
    return true;
  }

  const repeatIntervalMs = fence.repeat_every_s * 1000;
  return (nowMs - lastReminderMs) >= repeatIntervalMs;
}

async function persistGeofenceState(gameState) {
  const teamId = root.GAME_DATA?.teamId;
  if (!teamId || !navigator.onLine) {
    return;
  }

  try {
    await fetch(`/api/team/${teamId}/geofence_state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        geofence_state: gameState.geofence_state || {},
        geofence_runtime: gameState.geofence_runtime || {},
      }),
    });
  } catch (err) {
    console.warn('[geofences] Failed to persist team geofence state:', err);
  }
}

function schedulePersist(gameState) {
  if (persistTimeoutId) {
    clearTimeout(persistTimeoutId);
  }
  persistTimeoutId = setTimeout(() => {
    persistGeofenceState(gameState).catch((err) => {
      console.warn('[geofences] Persist failed:', err);
    });
  }, 1200);
}

async function evaluateGeofences() {
  if (!activeCallbacks?.getGameState) {
    return;
  }

  if (document.hidden) {
    return;
  }

  const settings = getNormalizedSettings();
  const geofenceMap = getNormalizedGeofenceMap();
  if (!settings.enabled || !Object.keys(geofenceMap).length) {
    return;
  }

  const gameState = activeCallbacks.getGameState();
  if (!gameState || !Array.isArray(gameState.locations)) {
    return;
  }

  ensureGeofenceState(gameState);

  const activeLocationIds = getActiveLocationIds(gameState);
  if (!activeLocationIds.length) {
    return;
  }

  const position = await resolvePosition();
  if (!position) {
    return;
  }

  const nowMs = Date.now();
  const nowIso = isoNow(nowMs);
  let stateChanged = false;
  let notificationSent = false;

  activeLocationIds.forEach((locationId) => {
    const fences = geofenceMap[String(locationId)] || [];
    fences.forEach((fence) => {
      if (!fence.enabled) {
        return;
      }

      const currentState = isInsideCircle(position.latitude, position.longitude, fence) ? 'inside' : 'outside';
      const runtimeEntry = isObject(gameState.geofence_runtime[fence.id])
        ? { ...gameState.geofence_runtime[fence.id] }
        : { fence_id: fence.id, location_id: fence.location_id };
      const historyEntry = isObject(gameState.geofence_state[fence.id])
        ? { ...gameState.geofence_state[fence.id] }
        : { fence_id: fence.id, location_id: fence.location_id, times_triggered: 0 };

      const previousState = runtimeEntry.current_state || null;
      const transition = previousState == null
        ? (currentState === 'inside' ? 'enter' : 'exit')
        : (previousState !== currentState ? (currentState === 'inside' ? 'enter' : 'exit') : null);

      const lastNotificationMs = getLatestNotificationMs(runtimeEntry, historyEntry);
      let notifyReason = null;
      if (transition && fence.trigger === transition && shouldNotifyTransition({ fence, historyEntry, lastNotificationMs, nowMs })) {
        notifyReason = 'transition';
      } else if (!transition && shouldNotifyReminder({ fence, currentState, historyEntry, runtimeEntry, nowMs })) {
        notifyReason = 'reminder';
      }

      runtimeEntry.fence_id = fence.id;
      runtimeEntry.location_id = fence.location_id;
      runtimeEntry.inside = currentState === 'inside';
      runtimeEntry.current_state = currentState;
      runtimeEntry.last_evaluated_at = nowIso;
      if (transition) {
        runtimeEntry.last_transition = transition;
        runtimeEntry.last_transition_at = nowIso;
      }

      if (previousState !== currentState || !gameState.geofence_runtime[fence.id]) {
        stateChanged = true;
      }

      if (notifyReason) {
        runtimeEntry.last_notification_at = nowIso;
        runtimeEntry.last_message = fence.message;
        runtimeEntry.last_message_at = nowIso;
        if (notifyReason === 'reminder') {
          runtimeEntry.last_reminder_at = nowIso;
        }

        historyEntry.location_id = fence.location_id;
        historyEntry.times_triggered = Number(historyEntry.times_triggered || 0) + 1;
        historyEntry.last_triggered_at = nowIso;
        historyEntry.last_transition = transition || currentState;
        if (notifyReason === 'reminder') {
          historyEntry.last_reminder_at = nowIso;
        }

        const locationName = getLocationName(gameState, locationId);
        showToast(`${locationName}: ${fence.message}`, {
          type: currentState === 'outside' ? 'warning' : 'info',
          duration: 6500,
        });
        notificationSent = true;
      }

      gameState.geofence_runtime[fence.id] = runtimeEntry;
      gameState.geofence_state[fence.id] = historyEntry;
    });
  });

  rebuildLocationStatus(gameState, geofenceMap);

  if (stateChanged || notificationSent) {
    saveState();
    schedulePersist(gameState);
    activeCallbacks.onStateChange?.();
  }
}

async function runImmediateCheck() {
  if (immediateCheckInFlight) {
    return;
  }
  immediateCheckInFlight = true;
  try {
    await evaluateGeofences();
  } finally {
    immediateCheckInFlight = false;
  }
}

export function initializeGeofences(callbacks = {}) {
  activeCallbacks = callbacks;

  const settings = getNormalizedSettings();
  const geofenceMap = getNormalizedGeofenceMap();
  if (!settings.enabled || !Object.keys(geofenceMap).length || !callbacks.getGameState) {
    return;
  }

  const gameState = callbacks.getGameState();
  if (!gameState) {
    return;
  }

  ensureGeofenceState(gameState);
  rebuildLocationStatus(gameState, geofenceMap);
  saveState();

  if (geofenceIntervalId) {
    clearInterval(geofenceIntervalId);
  }

  geofenceIntervalId = setInterval(() => {
    evaluateGeofences().catch((err) => {
      console.warn('[geofences] Poll failed:', err);
    });
  }, settings.poll_interval_s * 1000);

  document.addEventListener('geokr:game-state-updated', () => {
    runImmediateCheck().catch((err) => {
      console.warn('[geofences] Immediate check failed:', err);
    });
  });

  runImmediateCheck().catch((err) => {
    console.warn('[geofences] Initial check failed:', err);
  });
}

export function stopGeofences() {
  if (geofenceIntervalId) {
    clearInterval(geofenceIntervalId);
    geofenceIntervalId = null;
  }
  if (persistTimeoutId) {
    clearTimeout(persistTimeoutId);
    persistTimeoutId = null;
  }
}

root.geofenceEngine = {
  initializeGeofences,
  stopGeofences,
  getState: () => ({
    state: root.gameState?.geofence_state || {},
    runtime: root.gameState?.geofence_runtime || {},
    byLocation: root.gameState?.geofence_by_location || {},
  }),
};
