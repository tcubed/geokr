// static/js/offline-game.js
import { showToast } from './common-ui.js';
import { createFirework, launchFireworks } from './celebrate.js';
import { updateClueVisibility, applyGameUpdate, applyOfflineUI, updatePendingBadge, getGameState} from './findloc.js';
import { saveState } from './localStorage.js';
//import { waitForSelector } from './utils.js';

const root = typeof self !== 'undefined' ? self : window;
const offlineDB = root.offlineDB;
const { sendOrQueue, syncWithServer, getPendingUpdatesSummary, getNetworkState } = root.offlineSync || {};
const ALLOW_CELLULAR_SYNC_KEY = 'geo-allow-cellular-sync';

function createClientEventId() {
  if (root.crypto?.randomUUID) {
    return root.crypto.randomUUID();
  }
  return `evt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getAllowCellularSync() {
  return root.localStorage?.getItem(ALLOW_CELLULAR_SYNC_KEY) === '1';
}

function setAllowCellularSync(enabled) {
  root.localStorage?.setItem(ALLOW_CELLULAR_SYNC_KEY, enabled ? '1' : '0');
}

function getLocationFromState(locationId) {
  const gs = getGameState();
  return gs?.locations?.find(location => String(location.id) === String(locationId)) || null;
}

function getSubmissionCoordinates(methodResult, locationId) {
  const metadata = methodResult?.metadata || {};
  const latestPosition = root.latestPosition?.coords;
  const location = getLocationFromState(locationId);

  const lat = metadata.lat
    ?? metadata.latitude
    ?? metadata.position?.lat
    ?? latestPosition?.latitude
    ?? null;
  const lon = metadata.lon
    ?? metadata.longitude
    ?? metadata.position?.lon
    ?? latestPosition?.longitude
    ?? null;

  return {
    lat,
    lon,
    fallbackLat: location?.lat ?? null,
    fallbackLon: location?.lon ?? null,
  };
}

function getSyncUIElements() {
  return {
    statusText: document.getElementById('sync-state-text'),
    syncNowButton: document.getElementById('sync-now-btn'),
    allowCellularCheckbox: document.getElementById('allow-cellular-sync'),
  };
}

function setSyncStatusText(message, tone = 'muted') {
  const { statusText } = getSyncUIElements();
  if (!statusText) return;
  statusText.className = `small text-${tone}`;
  statusText.textContent = message;
}

let syncInProgress = false;

async function refreshSyncStatus() {
  const gameId = root.GAME_DATA?.gameId;
  const teamId = root.GAME_DATA?.teamId;
  const allowCellular = getAllowCellularSync();
  const { syncNowButton, allowCellularCheckbox } = getSyncUIElements();

  if (allowCellularCheckbox) {
    allowCellularCheckbox.checked = allowCellular;
  }

  if (!gameId || !teamId || !getPendingUpdatesSummary || !getNetworkState) {
    return;
  }

  const summary = await getPendingUpdatesSummary({ gameId, teamId });
  const networkState = getNetworkState({ allowCellular });

  if (syncNowButton) {
    syncNowButton.disabled = syncInProgress || summary.total === 0 || !networkState.online;
  }

  await updatePendingBadge();

  if (syncInProgress) {
    setSyncStatusText('Sync in progress…', 'primary');
    return;
  }

  if (summary.total === 0) {
    setSyncStatusText(
      networkState.online ? 'All progress synced.' : 'Offline. New finds will queue locally.',
      networkState.online ? 'success' : 'warning'
    );
    return;
  }

  if (!networkState.online) {
    setSyncStatusText(`${summary.total} pending. Reconnect to sync.`, 'warning');
    return;
  }

  if (networkState.waitingForWifi) {
    setSyncStatusText(`${summary.total} pending. Waiting for Wi‑Fi or manual sync.`, 'warning');
    return;
  }

  if (summary.failedCount > 0) {
    setSyncStatusText(`${summary.total} pending. ${summary.failedCount} need review before sync can complete.`, 'danger');
    return;
  }

  setSyncStatusText(`${summary.total} pending. Ready to sync now.`, 'info');
}

async function runSync({ manual = false } = {}) {
  if (!syncWithServer || syncInProgress) return;

  const gameId = root.GAME_DATA?.gameId;
  const teamId = root.GAME_DATA?.teamId;
  if (!gameId || !teamId) return;

  syncInProgress = true;
  await refreshSyncStatus();

  try {
    const result = await syncWithServer({
      gameId,
      teamId,
      allowCellular: getAllowCellularSync(),
      manual,
    });

    if (result?.reason === 'waiting-for-wifi') {
      setSyncStatusText('Waiting for Wi‑Fi to sync. Enable cellular sync or use Sync now.', 'warning');
    } else if (result?.reason === 'offline') {
      setSyncStatusText('Offline. Progress will sync when connectivity returns.', 'warning');
    } else if (result?.synced) {
      if (result.sentCount > 0) {
        showToast(`Synced ${result.sentCount} pending update${result.sentCount === 1 ? '' : 's'}.`, { type: 'success' });
      }
      setSyncStatusText('Sync complete.', 'success');
    }
  } catch (err) {
    console.error('[offline-game] Sync failed:', err);
    setSyncStatusText(err.message || 'Sync failed.', 'danger');
    showToast(err.message || 'Sync failed.', { type: 'error' });
  } finally {
    syncInProgress = false;
    await refreshSyncStatus();
  }
}

function initializeSyncControls() {
  const { syncNowButton, allowCellularCheckbox } = getSyncUIElements();

  if (allowCellularCheckbox) {
    allowCellularCheckbox.checked = getAllowCellularSync();
    allowCellularCheckbox.addEventListener('change', async () => {
      setAllowCellularSync(allowCellularCheckbox.checked);
      await refreshSyncStatus();
      if (allowCellularCheckbox.checked && navigator.onLine) {
        runSync({ manual: false }).catch(console.error);
      }
    });
  }

  if (syncNowButton) {
    syncNowButton.addEventListener('click', () => runSync({ manual: true }).catch(console.error));
  }

  if (root.navigator?.serviceWorker) {
    root.navigator.serviceWorker.addEventListener('message', () => {
      refreshSyncStatus().catch(console.error);
    });
  }

  root.addEventListener('online', () => runSync({ manual: false }).catch(console.error));
  root.addEventListener('offline', () => refreshSyncStatus().catch(console.error));
}


async function fetchOfflineBundle(gameId) {
  const response = await fetch(`/api/game/${gameId}/offline_bundle`, {
    headers: { 'Accept': 'application/json' },
    credentials: 'same-origin',
  });

  if (!response.ok) {
    let message = `Failed to fetch offline bundle (${response.status})`;
    try {
      const payload = await response.json();
      message = payload?.error || payload?.message || message;
    } catch {
      // ignore json parsing failure; keep default message
    }
    throw new Error(message);
  }

  return response.json();
}


export async function downloadOfflineBundle(gameId = root.GAME_DATA?.gameId) {
  if (!offlineDB?.saveOfflineBundle) {
    throw new Error('offlineDB.saveOfflineBundle is not available');
  }
  if (!gameId) {
    throw new Error('gameId is required to download an offline bundle');
  }

  const bundle = await fetchOfflineBundle(gameId);
  await offlineDB.saveOfflineBundle(bundle);
  showToast('Offline bundle saved to this device.', { type: 'success' });
  return bundle;
}


export async function loadOfflineBundle(gameId = root.GAME_DATA?.gameId) {
  if (!offlineDB?.getOfflineBundle) {
    throw new Error('offlineDB.getOfflineBundle is not available');
  }
  if (!gameId) return null;
  return offlineDB.getOfflineBundle(gameId);
}


export async function removeOfflineBundle(gameId = root.GAME_DATA?.gameId) {
  if (!offlineDB?.deleteOfflineBundle) {
    throw new Error('offlineDB.deleteOfflineBundle is not available');
  }
  if (!gameId) {
    throw new Error('gameId is required to delete an offline bundle');
  }
  await offlineDB.deleteOfflineBundle(gameId);
}


export async function listOfflineBundles() {
  if (!offlineDB?.listOfflineBundles) {
    throw new Error('offlineDB.listOfflineBundles is not available');
  }
  return offlineDB.listOfflineBundles();
}


// Submit a location validation
export async function submitLocationValidation(methodResult) {
//   console.log('[offline-game] root === window', root === window);
// console.log('[offline-game] root.gameState', root.gameState);
// console.log('[offline-game] imported gameState', gameState);

  const { passed, locationId, mode, metadata, needsValidation } = methodResult;
  if (!passed) {
    showToast(`Failed to validate via ${mode}: ${methodResult.reason}`, { type: 'error' });
    return;
  }

  applyGameUpdate({ locationId, mode, optimistic: true });

  const gameState = root.gameState;
  const gameStorage = root.gameStorage;

  // if (!gameState) {
  //   console.warn('gameState not available in submitLocationValidation');
  //   return;
  // }

  const gs = getGameState(); // single source of truth
  if (!gs || !gs.locations) {
    console.warn('[offline-game] gameState or locations not available yet');
    return;
  }

  console.log('[offline-game]  gameState.locations', gameState.locations );
  if (gs.currentIndex < gs.locations.length) {
    gs.currentIndex++;
    console.log('[offline-game] currentIndex now', gs.currentIndex);
    updateClueVisibility();
    saveState();
  } else {
    console.log('[offline-game] DONE! currentIndex now', gs.currentIndex);
    const container = document.getElementById('fireworks-container');
    if (container) createFirework(container.offsetWidth / 2, container.offsetHeight / 2);
    //alert('🎉 All locations complete!');
    showToast(`All locations found!  Head back to celebrate!`, { type: 'success' ,duration: 10000});
    launchFireworks();
  }

  const { lat, lon, fallbackLat, fallbackLon } = getSubmissionCoordinates(methodResult, locationId);
  const clientEventId = createClientEventId();
  const clientTimestamp = new Date().toISOString();
  const payload = {
    game_id: root.GAME_DATA.gameId,
    team_id: root.GAME_DATA.teamId,
    location_id: locationId,
    method: mode,
    metadata,
    needs_validation: !!needsValidation,
    lat,
    lon,
    fallback_lat: fallbackLat,
    fallback_lon: fallbackLon,
    client_event_id: clientEventId,
    client_timestamp: clientTimestamp,
    queue_key: `location_found:${root.GAME_DATA.gameId}:${root.GAME_DATA.teamId}:${locationId}`,
  };

  const update = {
    type: 'location_found',
    url: `/api/location/${locationId}/found`,
    method: 'POST',
    body: payload,
    timestamp: Date.now(),
    queue_key: payload.queue_key,
    game_id: payload.game_id,
    team_id: payload.team_id,
    location_id: payload.location_id,
  };

  await sendOrQueue(update, {
    onSuccess: (data) => {
      if (data?.success !== false) {
          // Apply the server-side update to the client's game state
          applyGameUpdate(data);

          if (needsValidation) {
              showToast('Selfie submitted; pending official validation.', { type: 'info' });
              // No need to call applyPendingValidationUI; applyGameUpdate handles it
          } else {
              showToast('Location confirmed!', { type: 'success' });
          }
      } else {
          // Handle cases where the server returns success: false
          showToast(`Failed to validate via ${mode}: ${data.reason || 'Server-side error'}`, { type: 'error' });
      }
      refreshSyncStatus().catch(console.error);
    },
    onQueued: () => {
      showToast(`Saved offline (${mode}), will sync when back online.`, { type: 'warning' });
      applyOfflineUI(locationId);
      updatePendingBadge?.(); // refresh badge immediately on queue
      refreshSyncStatus().catch(console.error);
    },
    onFailure: async (err, updateObj) => {
      if (err?.message?.includes('409') && updateObj?.id != null) {
        await offlineDB.deleteUpdate(updateObj.id);
        showToast(`This location was deleted on server; update removed.`, { type: 'error' });
      } else if (err?.isPermanent) {
        showToast(`Sync blocked for ${mode}: ${err.message}`, { type: 'error' });
      } else {
        showToast(`Error submitting via ${mode}; queued for retry.`, { type: 'error' });
        applyOfflineUI(locationId);
      }
      updatePendingBadge?.();
      refreshSyncStatus().catch(console.error);
    }
  });
}

// Listen for online events
document.addEventListener('DOMContentLoaded', async () => {
  initializeSyncControls();
  await updatePendingBadge();
  await refreshSyncStatus();
});

root.offlineGame = {
  ...(root.offlineGame || {}),
  submitLocationValidation,
  downloadOfflineBundle,
  loadOfflineBundle,
  removeOfflineBundle,
  listOfflineBundles,
  refreshSyncStatus,
  runSync,
};
