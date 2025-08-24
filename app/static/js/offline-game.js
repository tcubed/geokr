// /static/js/offline-game.js
/* Contains shared game state management (loadState, saveState, gameState), 
and API wrapper helpers like markLocationFound() that call sendOrQueue.
*/
//import { syncAllQueuedUpdates, sendOrQueue } from './offline-sync.js';
//const sendOrQueue = self.sendOrQueue;
//const syncAllQueuedUpdates = self.syncAllQueuedUpdates;

//const {showCurrentClue, applyPendingValidationUI} = self.clueManager || {};
import { showCurrentClue } from './clue-manager.js';
import {createFirework} from './celebrate.js';
import { updateClueVisibility} from './findloc.js';
import { gameId } from './localStorage.js';

const root = typeof self !== 'undefined' ? self : window;
const { syncAllQueuedUpdates, sendOrQueue } = root.offlineSync;

const {saveState, loadState} = root.gameStorage;
const getGameState = () => root.gameStorage && root.gameStorage.gameState;

//import { offlineDB } from './offline-db.js'; // your existing DB wrapper
const offlineDB = self.offlineDB; // explicit for clarity


import {applyGameUpdate,applyOfflineUI } from './findloc.js'; // your game state update logic

export async function updatePendingBadge() {
  try {
    const updates = await offlineDB.getAllUpdates();
    // use authoritative IDs from GAME_DATA
    const { gameId, teamId } = window.GAME_DATA; // ✅ grab both

    // filter by team/game
    // const filtered = updates.filter(u => 
    //   u.body?.team_id === teamId && u.body?.game_id === gameId
    // );
    const filtered = updates.filter(u => 
      String(u.body?.team_id) === String(teamId) &&
      String(u.body?.game_id) === String(gameId)
    );



    const count = filtered.length;

    const badge = document.getElementById('pending-badge');
    const span = document.getElementById('pending-count');

    console.log('[Badge] updatePendingBadge called');
    console.log('[Badge] total updates in DB:', updates.length);
    console.log('[Badge] filtered for this team/game:', filtered.length);
    console.log('[Badge] DOM elements found:', !!badge, !!span);

    if (!badge || !span) return;

    if (count > 0) {
      span.textContent = count;
      badge.style.display = 'inline-flex';
      badge.title = `${count} update${count === 1 ? '' : 's'} pending to sync`;
      console.log('[Badge] Badge updated, count =', count);
    } else {
      badge.style.display = 'none';
      console.log('[Badge] No updates, hiding badge');
    }
  } catch (e) {
    console.warn('[Badge] Failed to update pending badge:', e);
  }
}

export function showToast(message, { duration = 4000, type = 'info' } = {}) {
  const container = document.getElementById('sync-toast-container');
  if (!container) return;

  const colors = {
    info: { bg: '#2563eb', text: '#fff' },
    success: { bg: '#16a34a', text: '#fff' },
    error: { bg: '#dc2626', text: '#fff' },
    warning: { bg: '#f59e0b', text: '#000' }
  };
  const { bg, text } = colors[type] || colors.info;

  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    background:${bg};
    color:${text};
    padding:12px 16px;
    border-radius:8px;
    box-shadow:0 8px 24px rgba(0,0,0,0.15);
    font-size:14px;
    position: relative;
    overflow: hidden;
    opacity:0;
    transition: opacity .3s ease, transform .3s ease;
  `;

  container.prepend(toast);
  // entrance
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  // auto-dismiss
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, duration);
}

window.syncAllQueuedUpdates = async () => {
  const teamId = window.GAME_DATA.teamId;
  const gId = gameId;

  const count = await syncAllQueuedUpdates({
    offlineDB,
    onSuccess: async (data) => {
      applyGameUpdate(data);
      await updatePendingBadge();
    },
    onQueued: () => updatePendingBadge(),
    onFailure: () => updatePendingBadge()
  });

  if (count > 0) {
    showToast(`Synced ${count} update${count === 1 ? '' : 's'}`, { type: 'success' });
  }
};

document.addEventListener('DOMContentLoaded', updatePendingBadge);
window.addEventListener('online', () => window.syncAllQueuedUpdates());






// const BACKOFF_BASE_MS = 2000; // initial backoff
// const MAX_BACKOFF_MS = 60 * 1000; // max 1 minute

/* Processes the result of a location validation attempt, updating 
the UI optimistically and sending the verification data to the server. 
If the validation requires manual review (e.g., selfie), it handles 
ending states accordingly. Supports offline queuing and retries with 
user feedback via toasts.
*/
export async function submitLocationValidation(methodResult, gameId) {
  const { passed, locationId, mode, metadata, needsValidation } = methodResult;
    console.log('submitLocationValidation:', methodResult);

  if (!passed) {
    // immediate failure feedback
    showToast(`Failed to validate via ${mode}: ${methodResult.reason}`, { type: 'error' });
    return;
  }

  // Optimistic UI: mark as found locally (if appropriate)
  console.log('Optimistically marking location as found:', locationId);
  applyGameUpdate({ locationId, mode, optimistic: true });
  console.log('done applying optimistic update');

  // Dynamically get gameStorage and gameState at runtime
  const root = typeof self !== 'undefined' ? self : window;
  const gameStorage = root.gameStorage;
  const gameState = root.gameState;
  if (!gameState) {
    console.warn('gameState not available in submitLocationValidation');
    return;
  }

  // Advance the clue index locally (offline-first)
  if (gameState.currentIndex < gameState.locations.length - 1) {
    gameState.currentIndex++;
    console.log('Advancing to next clue:', gameState.currentIndex);
    updateClueVisibility(); // Immediately show the new clue
    saveState();         // Persist locally (localStorage or IndexedDB)
    //showCurrentClue();   // Update DOM accordion, map, buttons, etc.
  } else {
    const container = document.getElementById('fireworks-container');
    createFirework(container.offsetWidth/2, container.offsetHeight/2);

    alert('🎉 All locations complete!');
  }

  // Build payload; include method-specific metadata and a flag if server must verify
  const payload = {
    game_id: gameId,
    team_id: GAME_DATA.teamId,
    location_id: locationId,
    method: mode,
    metadata, // e.g., selfie image reference, QR payload, image match scores, coords
    needs_validation: !!needsValidation
    // optionally a clientRequestId for idempotency
  };

  const update = {
    url: `/api/location/found`,
    method: 'POST',
    body: payload,
    timestamp: Date.now()
  };

  // If this requires human validation (selfie), you might treat the server response differently
  await sendOrQueue(update, {
    onSuccess: (data) => {
      if (needsValidation) {
        showToast('Selfie submitted; pending official validation.', { type: 'info' });
        // mark in UI as "pending review"
        applyPendingValidationUI(locationId);
      } else {
        showToast('Location confirmed!', { type: 'success' });
        applyGameUpdate(data); // authoritative state
      }
    },
    onQueued: () => {
      showToast(`Saved offline (${mode}), will sync when back online.`, { type: 'warning' });
      applyOfflineUI(locationId);
      updatePendingBadge();
    },
    onFailure: async (err, updateObj) => {
        // Check for 409 deleted record
        if (err && err.message && err.message.includes('409')) {
        console.warn('Update rejected by server (deleted record), removing from queue:', updateObj);
        if (updateObj.id != null) {
            await offlineDB.deleteUpdate(updateObj.id);
        }
        showToast(`This location was deleted on server; update removed.`, { type: 'error' });
        } else {
        showToast(`Error submitting via ${mode}; queued for retry.`, { type: 'error' });
        applyOfflineUI(locationId);
        }
    }
  });
}





document.addEventListener('DOMContentLoaded', () => {
  updatePendingBadge();
});

// Listen for regaining connectivity
window.addEventListener('online', () => {
  syncAllQueuedUpdates().catch(console.error);
  updatePendingBadge();
});

// Expose for other code
//window.markLocationFound = markLocationFound;
window.syncAllQueuedUpdates = syncAllQueuedUpdates;

// let syncing = false;
// async function syncAllQueuedUpdates() {
//   if (syncing) return; // avoid reentrancy
//   syncing = true;

//   try {
//     await updatePendingBadge(); // reflect before
//     const updates = await offlineDB.getAllUpdates({ ordered: true });
//     if (updates.length === 0) return;

//     let successCount = 0;
//     for (const update of updates) {
//       // If we recently tried and backoff hasn't elapsed, skip for now
//       if (update.attempts && update.lastTried) {
//         const delay = computeBackoff(update.attempts);
//         if (Date.now() - update.lastTried < delay) {
//           // skip this round, will try later
//           continue;
//         }
//       }

//       try {
//         await sendOrQueue(update, {
//           onSuccess: async (data, successfulUpdate) => {
//             applyGameUpdate(data);
//             if (successfulUpdate.id != null) {
//               await offlineDB.deleteUpdate(successfulUpdate.id);
//             }
//             successCount += 1;
//             await updatePendingBadge();
//           },
//           onQueued: () => {
//             // still queued, nothing special
//             updatePendingBadge();
//           },
//           onFailure: () => {
//             updatePendingBadge();
//           }
//         });

//         // if sendOrQueue re-queued it, we leave it; if it succeeded, deletion handled above
//       } catch (err) {
//         console.warn('Unexpected sync error for update:', update, err);
//       }
//     }

//     if (successCount > 0) {
//       showToast(`Synced ${successCount} update${successCount === 1 ? '' : 's'}`, { type: 'success' });
//     }
//   } finally {
//     syncing = false;
//     await updatePendingBadge(); // final state
//   }
// }




// async function markLocationFound(locationId, gameId, userLat, userLon) {
//   if (!gameId) {
//     console.warn('markLocationFound called without gameId');
//     return;
//   }

//   const payload = {
//     game_id: gameId,
//     lat: userLat,
//     lon: userLon
//   };

//   const update = {
//     url: `/api/location/${locationId}/found`,
//     method: 'POST',
//     body: payload,
//     timestamp: Date.now(),
//     // optional: a client-generated id to help de-dup on server, e.g. UUIDv4
//     // clientRequestId: crypto.randomUUID(),
//   };

//   // Optimistic UI: assume success, reflect immediately
//   applyGameUpdate({ locationId, optimistic: true });

//   await sendOrQueue(update, {
//     onSuccess: (data) => {
//       // Replace optimistic with authoritative server state
//       applyGameUpdate(data);
//     },
//     onQueued: () => {
//       applyOfflineUI(locationId);
//     },
//     onFailure: (err) => {
//       applyOfflineUI(locationId);
//     }
//   });
// }


// // Helper to compute backoff delay
// function computeBackoff(attempts) {
//   // exponential backoff with jitter
//   const exp = Math.min(MAX_BACKOFF_MS, BACKOFF_BASE_MS * 2 ** (attempts - 1));
//   // jitter ±25%
//   const jitter = exp * 0.25 * (Math.random() * 2 - 1);
//   return Math.round(exp + jitter);
// }

// async function sendOrQueue(update, {
//     onSuccess = () => {},
//     onQueued = () => {},
//     onFailure = () => {}
//     } = {}) {
//         // Ensure metadata
//         update.attempts = update.attempts || 0;
//         update.lastTried = Date.now();

//         const doQueue = async () => {
//             update.attempts += 1;
//             update.lastTried = Date.now();
//             await offlineDB.addUpdate(update);
//             onQueued(update);
//         };

//         if (navigator.onLine) {
//             try {
//             const response = await fetch(update.url, {
//                 method: update.method,
//                 headers: { 'Content-Type': 'application/json' },
//                 body: JSON.stringify(update.body)
//             });

//             if (!response.ok) {
//                 throw new Error(`Server responded ${response.status}`);
//             }

//             const data = await response.json();
//             onSuccess(data, update);
//             return true; // succeeded
//             } catch (err) {
//             console.warn('Online send failed, queuing update:', err, update);
//             await doQueue();
//             onFailure(err, update);
//             return false;
//             }
//         } else {
//             console.log('Offline, queueing update', update);
//             await doQueue();
//             onQueued(update);
//             return false;
//         }
// }





// this used the localStorage.js queue as a fallback
// export async function markLocationFound(locationId, teamId,gameId, lat, lon) {
//   if (!gameId||!teamId) {
//     console.warn('markLocationFound called without gameId or teamId');
//     return false;
//   }

//   const update = {
//     url: `/api/location/found`,
//     method: 'POST',
//     body: { location_id:locationId,team_id:teamId,game_id: gameId, lat, lon },
//     timestamp: Date.now(),
//   };

//   return sendOrQueue(update, {
//     offlineDB,
//     onSuccess: (data) => {
//       console.log(`Location ${locationId} synced successfully.`);
//     },
//     onQueued: () => {
//       console.log(`Location ${locationId} queued for syncing.`);
//     },
//     onFailure: (err) => {
//       console.error(`Failed to sync location ${locationId}:`, err);
//     },
//   });
// }

// // API call
// async function markLocationFound(locationId, gameId, lat, lon) {
//   const response = await fetch('/api/found_location', {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({ game_id: gameId, location_id: locationId, lat, lon })
//   });

//   if (!response.ok) {
//     throw new Error('Failed to mark location found');
//   }

//   return await response.json();
// }