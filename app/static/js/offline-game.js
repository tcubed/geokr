// static/js/offline-game.js
import { showToast } from './common-ui.js';
import { createFirework, launchFireworks } from './celebrate.js';
import { updateClueVisibility, applyGameUpdate, applyOfflineUI, updatePendingBadge, getGameState} from './findloc.js';
import { saveState } from './localStorage.js';
//import { waitForSelector } from './utils.js';

const root = typeof self !== 'undefined' ? self : window;
const offlineDB = root.offlineDB;
const { syncAllQueuedUpdates, sendOrQueue } = root.offlineSync;


// Submit a location validation
export async function submitLocationValidation(methodResult) {
//   console.log('[offline-game] root === window', root === window);
// console.log('[offline-game] root.gameState', root.gameState);
// console.log('[offline-game] imported gameState', gameState);

  const { passed, locationId, mode, metadata, needsValidation, photoBlob } = methodResult;
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

  const payload = {
    game_id: window.GAME_DATA.gameId,
    team_id: window.GAME_DATA.teamId,
    location_id: locationId,
    method: mode,
    metadata,
    needs_validation: !!needsValidation
  };

  let update;
  if (mode === 'selfie' && photoBlob) {
    // 🌟 Use FormData to send the file and metadata
    const formData = new FormData();
    formData.append('photo', photoBlob, 'selfie.jpg'); // The server will look for the 'photo' key
    formData.append('data', JSON.stringify(payload)); // Send metadata as a JSON string

    update = {
      url: `/api/location/found`,
      method: 'POST',
      body: formData,
      isMultipart: true // Add a flag for the service worker
    };
  } else {
    // Regular JSON update for other validation methods
    update = {
      url: `/api/location/found`,
      method: 'POST',
      body: payload,
      timestamp: Date.now()
    };
  }

  await sendOrQueue(update, {
    onSuccess: (data) => {
      // Check if the server response indicates success
      if (data.success) {
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
    },
    onQueued: () => {
      showToast(`Saved offline (${mode}), will sync when back online.`, { type: 'warning' });
      applyOfflineUI(locationId);
      updatePendingBadge?.(); // refresh badge immediately on queue
    },
    onFailure: async (err, updateObj) => {
      if (err?.message?.includes('409') && updateObj?.id != null) {
        await offlineDB.deleteUpdate(updateObj.id);
        showToast(`This location was deleted on server; update removed.`, { type: 'error' });
      } else {
        showToast(`Error submitting via ${mode}; queued for retry.`, { type: 'error' });
        applyOfflineUI(locationId);
      }
      updatePendingBadge?.();
    }
  });
}

// Listen for online events
document.addEventListener('DOMContentLoaded', updatePendingBadge);
window.addEventListener('online', () => root.syncAllQueuedUpdates?.().catch(console.error));
