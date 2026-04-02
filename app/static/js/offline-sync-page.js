// /static/js/offline-sync-page.js

(function (root, findLocUtils) { // Add findLocUtils as a parameter
    const defaultDB = root.offlineDB;
    // CRITICAL FIX: Destructure from the parameter, not a global variable
    const { updateUIFromState } = findLocUtils || {};

  const BACKOFF_BASE_MS = 2000; // initial backoff
  const MAX_BACKOFF_MS = 60 * 1000; // max 1 minute
  const IS_SERVICE_WORKER = (typeof self !== 'undefined' && self.registration && self.skipWaiting);

  function computeBackoff(attempts) {
    const exp = Math.min(MAX_BACKOFF_MS, BACKOFF_BASE_MS * 2 ** (attempts - 1));
    const jitter = exp * 0.25 * (Math.random() * 2 - 1); // ±25%
    return Math.round(exp + jitter);
  }

  function isFoundUpdate(update) {
    return update?.type === 'location_found' || /^\/api\/location\/\d+\/found$/.test(update?.url || '');
  }

  function buildQueueKey(update) {
    if (update?.queue_key) return update.queue_key;
    if (update?.body?.queue_key) return update.body.queue_key;

    if (isFoundUpdate(update)) {
      const gameId = update?.body?.game_id;
      const teamId = update?.body?.team_id;
      const locationId = update?.body?.location_id;
      if (gameId != null && teamId != null && locationId != null) {
        return `location_found:${gameId}:${teamId}:${locationId}`;
      }
    }

    return null;
  }

  function serializeUpdateBody(body) {
    if (!(body instanceof FormData)) return body;
    return Object.fromEntries(body.entries());
  }

  function buildFetchOptions(update) {
    if (update.body instanceof FormData) {
      return {
        method: update.method || 'POST',
        body: update.body,
        credentials: 'same-origin',
      };
    }

    return {
      method: update.method || 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update.body),
      credentials: 'same-origin',
    };
  }

  async function parseResponsePayload(response) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        return await response.json();
      } catch {
        return null;
      }
    }
    return null;
  }

  function buildResponseError(response, payload) {
    const message = payload?.error || payload?.message || `Server responded ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    err.payload = payload;
    err.isRetryable = response.status >= 500 || response.status === 429 || response.status === 401;
    err.isPermanent = !err.isRetryable;
    err.shouldDelete = response.status === 409;
    return err;
  }

  async function queueOrUpdate(update, db) {
    const timestamp = Date.now();
    const queueKey = buildQueueKey(update);
    const storedBody = serializeUpdateBody(update.body);
    const existing = (queueKey && typeof db.findUpdateByQueueKey === 'function')
      ? await db.findUpdateByQueueKey(queueKey)
      : null;

    const queuedUpdate = {
      ...(existing || {}),
      ...update,
      id: update.id ?? existing?.id,
      queue_key: queueKey,
      body: storedBody,
      type: update.type || existing?.type || null,
      game_id: update.game_id ?? existing?.game_id ?? storedBody?.game_id ?? null,
      team_id: update.team_id ?? existing?.team_id ?? storedBody?.team_id ?? null,
      location_id: update.location_id ?? existing?.location_id ?? storedBody?.location_id ?? null,
      timestamp: update.timestamp ?? existing?.timestamp ?? timestamp,
      first_queued_at: existing?.first_queued_at ?? update.first_queued_at ?? timestamp,
      lastTried: update.lastTried ?? timestamp,
      attempts: update.attempts || existing?.attempts || 0,
      sync_state: 'pending',
      last_error: null,
    };

    if (typeof db.putUpdate === 'function') {
      queuedUpdate.id = await db.putUpdate(queuedUpdate);
    } else if (!queuedUpdate.id) {
      queuedUpdate.id = await db.addUpdate(queuedUpdate);
    } else {
      await db.deleteUpdate(queuedUpdate.id);
      queuedUpdate.id = await db.addUpdate(queuedUpdate);
    }

    return queuedUpdate;
  }

  async function markQueuedFailure(update, db, err) {
    const failedUpdate = {
      ...update,
      sync_state: err?.isPermanent ? 'failed' : 'pending',
      last_error: err?.message || null,
      last_error_status: err?.status || null,
      last_failure_at: Date.now(),
    };

    if (typeof db.putUpdate === 'function') {
      failedUpdate.id = await db.putUpdate(failedUpdate);
    }

    return failedUpdate;
  }

  function getNetworkState({ allowCellular = false } = {}) {
    const connection = root.navigator?.connection || root.navigator?.mozConnection || root.navigator?.webkitConnection;
    const online = typeof navigator === 'undefined' ? true : navigator.onLine;
    const type = String(connection?.type || '').toLowerCase();
    const effectiveType = String(connection?.effectiveType || '').toLowerCase();
    const saveData = Boolean(connection?.saveData);
    const isMetered = saveData || type === 'cellular' || /(^|[^a-z])([2345]g)([^a-z]|$)/.test(effectiveType);
    const waitingForWifi = Boolean(online && isMetered && !allowCellular);

    return {
      online,
      type,
      effectiveType,
      saveData,
      isMetered,
      allowCellular,
      waitingForWifi,
      canAutoSync: Boolean(online && !waitingForWifi),
    };
  }

  async function getPendingUpdatesSummary({ offlineDB = defaultDB, gameId, teamId } = {}) {
    const updates = await offlineDB.getAllUpdates({ ordered: true });
    const filtered = updates.filter((update) => {
      const matchesGame = gameId == null || String(update.body?.game_id ?? update.game_id) === String(gameId);
      const matchesTeam = teamId == null || String(update.body?.team_id ?? update.team_id) === String(teamId);
      return matchesGame && matchesTeam;
    });

    const failedCount = filtered.filter(update => update.sync_state === 'failed').length;

    return {
      total: filtered.length,
      failedCount,
      pendingCount: filtered.length - failedCount,
      updates: filtered,
    };
  }

  async function sendOrQueue(update, { offlineDB, onSuccess, onQueued, onFailure } = {}) {
    const db = offlineDB || root.offlineDB;  // ✅ fallback

    update.attempts = update.attempts || 0;
    //update.lastTried = Date.now();
    console.log('[offlineSync] Sending update:', update);
    console.log('[Badge] Queuing update body:', update.body);
    const doQueue = async () => {
      update.attempts += 1;
      update.lastTried = Date.now();
    const newUpdate = await queueOrUpdate(update, db);

    console.log('[Badge] Queued update, id:', newUpdate.id);
    if (typeof root.updatePendingBadge === 'function') {
      root.updatePendingBadge();
    }

      onQueued && onQueued(newUpdate);

      // Register background sync if available
      if (!IS_SERVICE_WORKER && 'serviceWorker' in navigator && 'SyncManager' in window) {
          try {
              const reg = await navigator.serviceWorker.ready;

              // Use teamId from the update itself
              const tid = newUpdate.body?.team_id;
              const syncTag = tid ? `sync-found-locations-${tid}` : 'sync-found-locations';
              await reg.sync.register(syncTag);
          } catch (err) {
              console.warn('Background sync registration failed:', err);
          }
      }
    };

    // ONLY TRY NETWORK IF ONLINE OR IN SERVICE WORKER
    if (IS_SERVICE_WORKER || (typeof navigator !== 'undefined' && navigator.onLine)) {

      try {
        update.attempts += 1;
        update.lastTried = Date.now(); // attempt timestamp

        if (update.id && typeof db.putUpdate === 'function') {
          await db.putUpdate(update);
        }

        const response = await fetch(update.url, buildFetchOptions(update));
        const data = await parseResponsePayload(response);

        if (response.status === 409 && update.id != null) {
          await db.deleteUpdate(update.id);
          console.warn('Update removed from queue: record deleted on server', update);
          return true;
        }

        if (!response.ok) {
          throw buildResponseError(response, data);
        }

        if (update.id != null) {
          await db.deleteUpdate(update.id);
        }
        onSuccess && onSuccess(data, update);
        return true;
      } catch (err) {
        let queuedUpdate;

        if (err?.shouldDelete && update.id != null) {
          await db.deleteUpdate(update.id);
          queuedUpdate = null;
        } else if (err?.isPermanent && update.id != null) {
          queuedUpdate = await markQueuedFailure(update, db, err);
        } else {
          queuedUpdate = await doQueue();
        }

        onFailure && onFailure(err, queuedUpdate || update);
        return false;
      }
    } else {
      await doQueue();
      return false;
    }
  }


  async function syncAllQueuedUpdates({ offlineDB=defaultDB, 
                                      onSuccess, onQueued, onFailure, shouldStop, gameId, teamId }={}) {
    let successCount = 0;
    let updates = await offlineDB.getAllUpdates({ ordered: true });
    if (gameId != null || teamId != null) {
      updates = updates.filter((update) => {
        const matchesGame = gameId == null || String(update.body?.game_id ?? update.game_id) === String(gameId);
        const matchesTeam = teamId == null || String(update.body?.team_id ?? update.team_id) === String(teamId);
        return matchesGame && matchesTeam;
      });
    }
    if (updates.length === 0) return successCount;

    for (const update of updates) {
      if (update.attempts >0 && update.lastTried) {
        const delay = computeBackoff(update.attempts);
        if (Date.now() - update.lastTried < delay) continue;
      }

      try {
        const sent = await sendOrQueue(update, { offlineDB, onSuccess, onQueued, onFailure, teamId: update.body?.team_id });
        if (sent) successCount += 1;
        if (shouldStop && shouldStop()) break;
      } catch (err) {
        onFailure && onFailure(err, update);
      }
    }
    return successCount;
  }

  // NEW: FETCH AUTHORITATIVE SERVER STATE
  async function fetchServerGameState(gameId, teamId, { onSuccess, onFailure } = {}) {
    try {
      const resp = await fetch(`/api/game/state?game_id=${gameId}&team_id=${teamId}`);
      if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
      const data = await resp.json();

      // RECONCILE LOCAL STATE
      if (data) {
        const rootObj = typeof self !== 'undefined' ? self : window;
        const gameState = rootObj.gameState;
        if (!gameState) return;

        // 1. Update from server
        gameState.currentIndex = data.current_index;
        data.locations_found.forEach((loc, idx) => {
          if (gameState.locations[idx]) {
            gameState.locations[idx].found = loc.found;
          }
        });

        // 2.  Merge any still-pending offline updates (optimistic)
        const queued = await rootObj.offlineDB.getAllUpdates();
        if (queued && queued.length > 0) {
          console.log('[offlineSync] Merging offline queued updates:', queued);
        }
        queued.forEach(u => {
          if (u.body?.location_id != null) {
            const idx = gameState.locations.findIndex(l => l.id == u.body.location_id);
            if (idx !== -1) {
              gameState.locations[idx].found = true;
              if (idx >= gameState.currentIndex) gameState.currentIndex = idx + 1;
              console.log(`[offlineSync] Offline update applied: location_id=${u.body.location_id}, index=${idx}`);
            }
          }
        });

        // NEW: UPDATE CURRENT INDEX FROM SERVER
        //gameState.currentIndex = data.current_index;

        // NEW: PERSIST LOCALLY
        // if (typeof rootObj.saveState === 'function') {
        //   rootObj.saveState();
        // }

        // 3. Persist
        if (typeof rootObj.saveState === 'function') rootObj.saveState();

        // 4. Update badge (only if running in page, not SW)
        if (typeof window !== 'undefined' && typeof window.updatePendingBadge === 'function') {
          console.log('[Badge] Calling updatePendingBadge from page context');
          window.updatePendingBadge();
        } else {
          console.log('[Badge] updatePendingBadge not available in this context (probably SW)');
        }
      }

      onSuccess && onSuccess(data);
      return data;
    } catch (err) {
      console.warn('[offlineSync] Could not fetch server game state:', err);
      onFailure && onFailure(err);
      return null;
    }
  }

  // NEW: FULL SYNC FUNCTION
  async function syncWithServer({ gameId, teamId, offlineDB=defaultDB, allowCellular=false, manual=false } = {}) {
    console.log('[offlineSync] Starting full sync with server...');

    const networkState = getNetworkState({ allowCellular });
    if (!networkState.online) {
      return { synced: false, reason: 'offline', networkState };
    }

    if (!manual && networkState.waitingForWifi) {
      return { synced: false, reason: 'waiting-for-wifi', networkState };
    }

    // 1. SEND QUEUED OFFLINE UPDATES FIRST
    const sentCount = await syncAllQueuedUpdates({ offlineDB, gameId, teamId });
    if(sentCount>0){
      console.log(`[offlineSync] Sent ${sentCount} queued updates`);
    }
    
    // 2. FETCH AUTHORITATIVE SERVER STATE AND RECONCILE
    if (gameId && teamId) {
      await fetchServerGameState(gameId, teamId, {
        onSuccess: (data) => {
                    console.log('[offlineSync] Server state reconciled', data);
                    // CRITICAL FIX: Check if the function exists before calling it
                    if (updateUIFromState) {
                        updateUIFromState();
                    }
                },
        onFailure: (err) => console.warn('[offlineSync] Failed to reconcile server state', err)
      });
    }

    // ✅ Update badge from main page context again (just in case)
    if (typeof window !== 'undefined' && typeof window.updatePendingBadge === 'function') {
      window.updatePendingBadge();
      console.log('[Badge] updatePendingBadge called after full sync');
    }

    //updatePendingBadge();
    console.log('[offlineSync] Full sync complete');
    //console.log('[offlineSync] Full sync complete, reconciled state:', data);
    return { synced: true, sentCount, networkState };
  }


  // Expose globally
  root.offlineSync = {
    computeBackoff,
    sendOrQueue,
    syncAllQueuedUpdates,
    getNetworkState,
    getPendingUpdatesSummary,
    fetchServerGameState, // NEW
    syncWithServer       // NEW
  };
})(typeof self !== 'undefined' ? self : window, window.findLocUtils); // Pass window.findLocUtils as the second argument
