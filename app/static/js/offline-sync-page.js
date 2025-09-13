// /static/js/offline-sync.js

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

  async function sendOrQueue(update, { offlineDB, onSuccess, onQueued, onFailure } = {}) {
    const db = offlineDB || root.offlineDB;  // ✅ fallback

    update.attempts = update.attempts || 0;
    //update.lastTried = Date.now();
    console.log('[offlineSync] Sending update:', update);
    console.log('[Badge] Queuing update body:', update.body);


    const doQueue = async () => {
      console.log("doQueue called, offlineDB=", db);

      // ✅ Update badge immediately after queuing
      if (typeof root.updatePendingBadge === 'function') {
          root.updatePendingBadge();
      }

      update.attempts += 1;
      update.lastTried = Date.now();
      // Add to IndexedDB and capture the generated id
      // ✅ Only add if it's not already stored
      // if (!update.id) {
      //   const id = await db.addUpdate(update);
      //   update.id = id; 
      // } else {
      //   // optional: update the record instead of duplicating
      //   await db.deleteUpdate(update.id);
      //   update.id = await db.addUpdate(update);
      // }
      if (!update.id) {
          update.id = await db.addUpdate(update);
          console.log('[Badge] Queued update, id:', update.id);
          if (typeof root.updatePendingBadge === 'function') {
              root.updatePendingBadge();
          }
      }

      onQueued && onQueued(update);

      // Register background sync if available
      if (!IS_SERVICE_WORKER && 'serviceWorker' in navigator && 'SyncManager' in window) {
          try {
              const reg = await navigator.serviceWorker.ready;

              // Use teamId from the update itself
              const tid = update.body?.team_id;
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
        const response = await fetch(update.url, {
          method: update.method || 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(update.body)
        });

        // NEW: HANDLE 409 DELETED RECORD RESPONSE
        if (response.status === 409 && update.id != null) {
          await db.deleteUpdate(update.id);
          console.warn('Update removed from queue: record deleted on server', update);
          return false;
        }

        if (!response.ok) throw new Error(`Server responded ${response.status}`);

        const data = await response.json();
        onSuccess && onSuccess(data, update);
        return true;
      } catch (err) {
        await doQueue();
        onFailure && onFailure(err, update);
        return false;
      }
    } else {
      await doQueue();
      return false;
    }
  }


  async function syncAllQueuedUpdates({ offlineDB=defaultDB, 
                                      onSuccess, onQueued, onFailure, shouldStop }={}) {
    let successCount = 0;
    const updates = await offlineDB.getAllUpdates({ ordered: true });
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

        // 2.  Merge any pending offline updates (optimistic)
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
        
        // 4. Remove queued updates now that they’re merged
        for (const u of queued) {
          if (u.id != null) {
            await rootObj.offlineDB.deleteUpdate(u.id);
            console.log(`[Badge] Deleted update id=${u.id}`);
          }
        }
        // console.log('[Badge] Deleting queued updates:', queued.map(u => u.id));
        // await Promise.all(
        //   queued.map(async (u) => {
        //     if (u.id != null) {
        //       await rootObj.offlineDB.deleteUpdate(u.id);
        //       console.log(`[Badge] Deleted update id=${u.id}`);
        //     }
        //   })
        // );

        // 5. Update badge
        // if (typeof rootObj.updatePendingBadge === 'function') {
        //   console.log('[Badge] Calling updatePendingBadge after deletions...');
        //   await rootObj.updatePendingBadge();
        //   const remaining = await rootObj.offlineDB.getAllUpdates();
        //   console.log('[Badge] Updates remaining in DB after badge refresh:', remaining.length);
        // }

        // 5. Update badge (only if running in page, not SW)
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
  async function syncWithServer({ gameId, teamId, offlineDB=defaultDB } = {}) {
    console.log('[offlineSync] Starting full sync with server...');

    // 1. SEND QUEUED OFFLINE UPDATES FIRST
    const sentCount = await syncAllQueuedUpdates({ offlineDB,teamId });
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
    return true;
  }


  // Expose globally
  root.offlineSync = {
    computeBackoff,
    sendOrQueue,
    syncAllQueuedUpdates,
    fetchServerGameState, // NEW
    syncWithServer       // NEW
  };
})(typeof self !== 'undefined' ? self : window, window.findLocUtils); // Pass window.findLocUtils as the second argument
