const root = typeof self !== 'undefined' ? self : window;

function computeCurrentIndex(locations) {
  if (!Array.isArray(locations) || locations.length === 0) return 0;

  const firstUnfoundIndex = locations.findIndex(location => !location.found);
  if (firstUnfoundIndex === -1) {
    return Math.max(0, locations.length - 1);
  }
  return firstUnfoundIndex;
}

function normalizeBundleLocations(bundleLocations = []) {
  return bundleLocations.map((location) => ({
    id: location.id,
    name: location.name,
    lat: location.lat,
    lon: location.lon,
    clue_text: location.clue_text,
    image_url: location.image_url,
    found: Boolean(location.found),
    show_pin: location.show_pin,
    isOffline: false,
  }));
}

async function getRelevantQueuedUpdates({ gameId, teamId }) {
  if (!root.offlineDB?.getAllUpdates || gameId == null || teamId == null) {
    return [];
  }

  const updates = await root.offlineDB.getAllUpdates({ ordered: true });
  return updates.filter((update) => {
    const updateGameId = update.body?.game_id ?? update.game_id;
    const updateTeamId = update.body?.team_id ?? update.team_id;
    const updateLocationId = update.body?.location_id ?? update.location_id;
    const isFoundUpdate = update.type === 'location_found' || /^\/api\/location\/\d+\/found$/.test(update.url || '');

    return isFoundUpdate
      && updateLocationId != null
      && String(updateGameId) === String(gameId)
      && String(updateTeamId) === String(teamId);
  });
}

export async function getOfflineBundleState({ gameId, teamId, liveFlags = {} } = {}) {
  if (!root.offlineDB?.getOfflineBundle || gameId == null) {
    return null;
  }

  const bundle = await root.offlineDB.getOfflineBundle(gameId);
  if (!bundle) return null;

  const resolvedTeamId = bundle.team?.id ?? teamId ?? null;
  const locations = normalizeBundleLocations(bundle.locations || []);
  const queuedUpdates = await getRelevantQueuedUpdates({ gameId, teamId: resolvedTeamId });

  queuedUpdates.forEach((update) => {
    const locationId = update.body?.location_id ?? update.location_id;
    const index = locations.findIndex((location) => String(location.id) === String(locationId));
    if (index === -1) return;

    locations[index].found = true;
    locations[index].isOffline = true;
  });

  return {
    source: 'offline-bundle',
    bundle,
    gameId: bundle.game?.id ?? gameId,
    teamId: resolvedTeamId,
    locations,
    currentIndex: computeCurrentIndex(locations),
    bounds: bundle.game?.bounds || null,
    pendingCount: queuedUpdates.length,
    ...liveFlags,
  };
}

export async function applyFindlocOfflineBundle({ gameId, teamId, liveFlags = {}, force = false } = {}) {
  if (!force && typeof navigator !== 'undefined' && navigator.onLine) {
    return null;
  }

  const state = await getOfflineBundleState({ gameId, teamId, liveFlags });
  if (!state) return null;

  const bounds = state.bounds
    ? [state.bounds.min_lat, state.bounds.min_lon, state.bounds.max_lat, state.bounds.max_lon]
    : liveFlags.bounds;

  root.GAME_DATA = {
    ...(root.GAME_DATA || {}),
    ...liveFlags,
    gameId: state.gameId,
    teamId: state.teamId,
    locations: state.locations,
    currentIndex: state.currentIndex,
    bounds,
    geofence_settings: state.bundle?.game?.geofence_settings || root.GAME_DATA?.geofence_settings || {},
    geofences: state.bundle?.game?.geofences || root.GAME_DATA?.geofences || {},
    team_geofence_state: state.bundle?.team?.geofence_state || root.GAME_DATA?.team_geofence_state || {},
    team_geofence_runtime: state.bundle?.team?.geofence_runtime || root.GAME_DATA?.team_geofence_runtime || {},
    offlineSource: state.source,
  };

  return root.GAME_DATA;
}

export function computeProgressSummary(locations = []) {
  const total = locations.length;
  const found = locations.filter(location => location.found).length;
  const pending = locations.filter(location => location.isOffline).length;

  return { total, found, pending };
}
