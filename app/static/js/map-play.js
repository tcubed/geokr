import { showToast } from './common-ui.js';
import { computeProgressSummary, getOfflineBundleState } from './offline-play.js';

const root = typeof self !== 'undefined' ? self : window;
const syncApi = root.offlineSync || {};
const ALLOW_CELLULAR_SYNC_KEY = 'geo-allow-cellular-sync';

function getAllowCellularSync() {
  return root.localStorage?.getItem(ALLOW_CELLULAR_SYNC_KEY) === '1';
}

function setAllowCellularSync(enabled) {
  root.localStorage?.setItem(ALLOW_CELLULAR_SYNC_KEY, enabled ? '1' : '0');
}

function createClientEventId() {
  if (root.crypto?.randomUUID) return root.crypto.randomUUID();
  return `evt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getSyncElements() {
  return {
    pendingBadge: document.getElementById('pending-badge'),
    pendingCount: document.getElementById('pending-count'),
    syncStateText: document.getElementById('sync-state-text'),
    syncNowButton: document.getElementById('sync-now-btn'),
    allowCellularCheckbox: document.getElementById('allow-cellular-sync'),
  };
}

function setSyncText(message, tone = 'muted') {
  const { syncStateText } = getSyncElements();
  if (!syncStateText) return;
  syncStateText.className = `small text-${tone}`;
  syncStateText.textContent = message;
}

function updatePendingBadge(count) {
  const { pendingBadge, pendingCount } = getSyncElements();
  if (!pendingBadge || !pendingCount) return;

  if (count > 0) {
    pendingCount.textContent = String(count);
    pendingBadge.style.display = 'inline-flex';
  } else {
    pendingBadge.style.display = 'none';
  }
}

function buildPopupHtml(loc) {
  const isPending = Boolean(loc.isOffline);
  const disabled = loc.found && !isPending ? 'disabled' : '';
  const btnClass = isPending ? 'popup-found-btn pending' : (loc.found ? 'popup-found-btn found-ok' : 'popup-found-btn');
  const btnLabel = isPending ? 'Pending sync' : (loc.found ? '✓ Found' : "I'm Here");
  const clue = loc.clue_text ? `<p style="font-size:0.82rem;margin:0.25rem 0 0.5rem">${escHtml(loc.clue_text)}</p>` : '';
  const syncNote = isPending ? '<div class="small text-warning">Saved offline. Will sync later.</div>' : '';
  return `
    <strong>${escHtml(loc.name)}</strong>
    ${clue}
    ${syncNote}
    <button class="${btnClass}" ${disabled} data-loc-id="${loc.id}">${btnLabel}</button>
  `;
}

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function getNetworkState() {
  return syncApi.getNetworkState ? syncApi.getNetworkState({ allowCellular: getAllowCellularSync() }) : { online: navigator.onLine, waitingForWifi: false };
}

async function createMapController() {
  const liveData = root.MAP_PLAY_DATA || {};
  const offlineState = await getOfflineBundleState({
    gameId: liveData.gameId,
    teamId: liveData.teamId,
  });

  const data = (!navigator.onLine && offlineState)
    ? {
        gameId: offlineState.gameId,
        teamId: offlineState.teamId,
        locations: offlineState.locations,
        bounds: offlineState.bounds || liveData.bounds,
        source: offlineState.source,
      }
    : {
        ...liveData,
        source: 'live',
      };

  if ((data.source === 'live') && offlineState && !(liveData.locations?.length)) {
    data.gameId = offlineState.gameId;
    data.teamId = offlineState.teamId;
    data.locations = offlineState.locations;
    data.bounds = offlineState.bounds || liveData.bounds;
    data.source = offlineState.source;
  }

  const map = L.map('map');
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map);

  const bounds = data.bounds || {};
  if (bounds.minLat != null && bounds.maxLat != null && bounds.minLng != null && bounds.maxLng != null) {
    map.fitBounds([[bounds.minLat, bounds.minLng], [bounds.maxLat, bounds.maxLng]]);
  } else if (bounds.min_lat != null && bounds.max_lat != null && bounds.min_lon != null && bounds.max_lon != null) {
    map.fitBounds([[bounds.min_lat, bounds.min_lon], [bounds.max_lat, bounds.max_lon]]);
  } else {
    map.setView([0, 0], 2);
  }

  const markerRefs = {};
  let userMarker = null;
  let userLat = null;
  let userLon = null;
  let syncInProgress = false;

  function updateHud() {
    const hudCount = document.getElementById('hud-count');
    if (!hudCount) return;

    const progress = computeProgressSummary(data.locations);
    let text = `${progress.found} / ${progress.total} found`;
    if (progress.pending > 0) {
      text += ` · ${progress.pending} pending sync`;
    }
    hudCount.textContent = text;
  }

  function markerColor(loc) {
    if (loc.isOffline) return '#f59e0b';
    if (loc.found) return '#198754';
    return '#0d6efd';
  }

  function refreshMarker(locId) {
    const ref = markerRefs[locId];
    if (!ref) return;
    const loc = data.locations.find(item => String(item.id) === String(locId));
    if (!loc) return;

    ref.circle.setStyle({ fillColor: markerColor(loc) });
    ref.circle.setPopupContent(buildPopupHtml(loc));
  }

  function reconcileFromServerState(serverState) {
    if (!serverState?.locations_found) return;

    data.locations.forEach((loc) => {
      const serverLoc = serverState.locations_found.find(item => String(item.location_id) === String(loc.id));
      if (!serverLoc) return;
      loc.found = Boolean(serverLoc.found);
      loc.isOffline = false;
    });

    Object.keys(markerRefs).forEach(refreshMarker);
    updateHud();
  }

  data.locations.forEach((loc) => {
    if (loc.show_pin === false) return;
    if (loc.lat == null || loc.lon == null) return;

    const circle = L.circleMarker([loc.lat, loc.lon], {
      radius: 10,
      fillColor: markerColor(loc),
      color: '#fff',
      weight: 2,
      fillOpacity: 0.85,
    }).addTo(map);

    circle.bindPopup(buildPopupHtml(loc));
    circle.on('popupopen', () => wirePopupButton(loc.id));
    markerRefs[loc.id] = { circle };
  });

  function onPosition(pos) {
    userLat = pos.coords.latitude;
    userLon = pos.coords.longitude;
    if (!userMarker) {
      userMarker = L.circleMarker([userLat, userLon], {
        radius: 8, fillColor: '#ffc107', color: '#fff', weight: 2, fillOpacity: 1,
      }).addTo(map).bindTooltip('You', { permanent: false });
    } else {
      userMarker.setLatLng([userLat, userLon]);
    }
  }

  if (navigator.geolocation) {
    navigator.geolocation.watchPosition(onPosition, null, { enableHighAccuracy: true });
  }

  async function refreshSyncStatus() {
    if (!syncApi.getPendingUpdatesSummary) return;

    const summary = await syncApi.getPendingUpdatesSummary({ gameId: data.gameId, teamId: data.teamId });
    const networkState = getNetworkState();
    const { syncNowButton, allowCellularCheckbox } = getSyncElements();

    updatePendingBadge(summary.total);
    if (allowCellularCheckbox) allowCellularCheckbox.checked = getAllowCellularSync();
    if (syncNowButton) syncNowButton.disabled = syncInProgress || summary.total === 0 || !networkState.online;

    if (syncInProgress) {
      setSyncText('Sync in progress…', 'primary');
      return;
    }
    if (summary.total === 0) {
      setSyncText(networkState.online ? 'All progress synced.' : 'Offline. New finds will queue locally.', networkState.online ? 'success' : 'warning');
      return;
    }
    if (!networkState.online) {
      setSyncText(`${summary.total} pending. Reconnect to sync.`, 'warning');
      return;
    }
    if (networkState.waitingForWifi) {
      setSyncText(`${summary.total} pending. Waiting for Wi‑Fi or manual sync.`, 'warning');
      return;
    }
    setSyncText(`${summary.total} pending. Ready to sync now.`, 'info');
  }

  async function runSync({ manual = false } = {}) {
    if (!syncApi.syncWithServer || syncInProgress) return;
    syncInProgress = true;
    await refreshSyncStatus();

    try {
      const result = await syncApi.syncWithServer({
        gameId: data.gameId,
        teamId: data.teamId,
        allowCellular: getAllowCellularSync(),
        manual,
      });

      if (result?.synced) {
        if (syncApi.fetchServerGameState) {
          const serverState = await syncApi.fetchServerGameState(data.gameId, data.teamId);
          reconcileFromServerState(serverState);
        } else {
          data.locations = data.locations.map(loc => ({ ...loc, isOffline: false }));
          Object.keys(markerRefs).forEach(refreshMarker);
          updateHud();
        }
      }
    } catch (err) {
      console.error('[map-play] Sync failed:', err);
      showToast(err.message || 'Sync failed.', { type: 'error' });
    } finally {
      syncInProgress = false;
      await refreshSyncStatus();
    }
  }

  function markPending(locId) {
    const loc = data.locations.find(item => String(item.id) === String(locId));
    if (!loc) return;
    loc.found = true;
    loc.isOffline = true;
    refreshMarker(locId);
    updateHud();
  }

  function markSynced(locId) {
    const loc = data.locations.find(item => String(item.id) === String(locId));
    if (!loc) return;
    loc.found = true;
    loc.isOffline = false;
    refreshMarker(locId);
    updateHud();
  }

  async function markFound(locId, btn) {
    btn.disabled = true;
    btn.textContent = '…';

    const payload = {
      game_id: data.gameId,
      team_id: data.teamId,
      location_id: locId,
      method: 'geo',
      lat: userLat,
      lon: userLon,
      client_event_id: createClientEventId(),
      client_timestamp: new Date().toISOString(),
      queue_key: `location_found:${data.gameId}:${data.teamId}:${locId}`,
    };

    const update = {
      type: 'location_found',
      url: `/api/location/${locId}/found`,
      method: 'POST',
      body: payload,
      timestamp: Date.now(),
      queue_key: payload.queue_key,
      game_id: payload.game_id,
      team_id: payload.team_id,
      location_id: payload.location_id,
    };

    await syncApi.sendOrQueue(update, {
      onSuccess: () => {
        markSynced(locId);
        showToast('Location confirmed!', { type: 'success' });
        refreshSyncStatus().catch(console.error);
      },
      onQueued: () => {
        markPending(locId);
        showToast('Saved offline and queued for sync.', { type: 'warning' });
        refreshSyncStatus().catch(console.error);
      },
      onFailure: (err) => {
        btn.disabled = false;
        btn.textContent = err?.isPermanent ? 'Blocked' : 'Retry';
        if (err?.isPermanent) {
          showToast(err.message || 'Could not sync this location.', { type: 'error' });
        }
        refreshSyncStatus().catch(console.error);
      },
    });
  }

  function wirePopupButton(locId) {
    const btn = document.querySelector(`.popup-found-btn[data-loc-id="${locId}"]`);
    if (!btn || btn.disabled) return;
    btn.addEventListener('click', () => markFound(locId, btn), { once: true });
  }

  const { syncNowButton, allowCellularCheckbox } = getSyncElements();
  if (syncNowButton) {
    syncNowButton.addEventListener('click', () => runSync({ manual: true }).catch(console.error));
  }
  if (allowCellularCheckbox) {
    allowCellularCheckbox.checked = getAllowCellularSync();
    allowCellularCheckbox.addEventListener('change', async () => {
      setAllowCellularSync(allowCellularCheckbox.checked);
      await refreshSyncStatus();
    });
  }

  root.addEventListener('online', () => runSync({ manual: false }).catch(console.error));
  root.addEventListener('offline', () => refreshSyncStatus().catch(console.error));

  updateHud();
  await refreshSyncStatus();

  if (data.source === 'offline-bundle') {
    showToast('Loaded saved offline map bundle.', { type: 'info' });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  createMapController().catch((err) => {
    console.error('[map-play] Initialization failed:', err);
    showToast('Could not initialize the map view.', { type: 'error' });
  });
});
