// static/js/app-init.js
import { showToast } from './common-ui.js';
import { initGame, updateClueVisibility,renderCluesFromState, updatePendingBadge } from './findloc.js';
import { setupValidationButtons } from './validate.js';
import { waitForSelector, watchContainer, sleep } from './utils.js';
//import { syncWithServer } from './offline-sync.js'; // Import the sync function

const root = typeof self !== 'undefined' ? self : window;
const offlineDB = root.offlineDB;
const syncWithServer = root.offlineSync.syncWithServer
// async function safeInitGame() {
//   // Load from localStorage or initialize default
//   let gs = await initGame(); // should return object or null
//   if (!gs || typeof gs !== 'object') {
//     console.warn('[App Init] No saved gameState, initializing default');
//     gs = { currentIndex: 0, locations: [] };
//   }
//   window.gameState = gs;
//   return gs;
// }


export async function startApp() {
  console.log('[App Init] Starting...');

  try {
    // 1️⃣ Load/init game state
    await initGame();
    //enableDebugProxy();

    // Add this log to verify the state
    console.log('[App Init] Game state after init:', window.gameState);
    // 2️⃣ Render the UI from the locally loaded state immediately
    renderCluesFromState();

    // 2️⃣ Update pending offline updates
    updatePendingBadge();

    // Notify user if there are offline updates
    const count = await offlineDB.count();
    if (count > 0) {
      showToast(`You have ${count} pending update${count === 1 ? '' : 's'}`, { type: 'warning' });
    }

    // 3️⃣ Sync with server if online
    if (navigator.onLine && window.GAME_DATA?.gameId) {
      await syncWithServer({
        gameId: GAME_DATA.gameId,
        teamId: GAME_DATA.teamId,
        offlineDB
      });
      await updatePendingBadge();
      // After sync, re-render to reflect any server-side changes
      renderCluesFromState();
    }

    // 5️⃣ Setup buttons/UI
    setupValidationButtons();

    // 6️⃣ Listen for future online events
    window.addEventListener('online', async () => {
      console.log('[App Init] Back online, syncing...');
      try {
        await syncWithServer({
          gameId: GAME_DATA.gameId,
          teamId: GAME_DATA.teamId,
          offlineDB
        });
        await updatePendingBadge();
        renderCluesFromState();
      } catch (err) {
        console.error('[App Init] Error during online sync:', err);
      }
    });

  } catch (err) {
    showToast('Failed to initialize app', { type: 'error' });
    console.error('[App Init] startApp failed:', err);
  }
}

// Automatically start app
document.addEventListener('DOMContentLoaded', startApp);


// // Optional deep-proxy for debug
// function enableDebugProxy() {
//   if (!window.DEBUG_GAME_STATE || !window.gameState || typeof window.gameState !== 'object') return;

//   function logChange(path, value) {
//     console.log(`[gameState] ${path} changed:`, value);
//   }

//   function createDeepProxy(obj, path = '') {
//     return new Proxy(obj, {
//       set(target, prop, value) {
//         const fullPath = path ? `${path}.${prop}` : prop;
//         const oldValue = target[prop];
//         if (value && typeof value === 'object' && !value.__isProxy) {
//           value = createDeepProxy(value, fullPath);
//           value.__isProxy = true;
//         }
//         target[prop] = value;
//         if (oldValue !== value) logChange(fullPath, value);
//         return true;
//       },
//       get(target, prop) {
//         const val = target[prop];
//         if (val && typeof val === 'object' && !val.__isProxy) {
//           target[prop] = createDeepProxy(val, path ? `${path}.${prop}` : prop);
//           target[prop].__isProxy = true;
//           return target[prop];
//         }
//         return val;
//       }
//     });
//   }

//   window.gameState = createDeepProxy(window.gameState);
//   console.log('[DEBUG] gameState proxy enabled');
// }




// // Start the app
// export async function startApp() {
//   console.log('[App Init] Page loaded, gameState.currentIndex =', root.gameState?.currentIndex);

//   try {
//     await initGame();
//     updatePendingBadge();

//     // Notify about pending offline updates
//     const count = await offlineDB.count();
//     if (count > 0) {
//       showToast(`You have ${count} pending update${count === 1 ? '' : 's'}`, { type: 'warning' });
//     }

//     // Full server sync if online
//     if (navigator.onLine) {
//       await syncWithServer({
//         gameId: GAME_DATA.gameId,
//         teamId: GAME_DATA.teamId,
//         offlineDB
//       });
//       updatePendingBadge();
//       console.log('[App Init] Game state after server sync:', root.gameState);
//     }

//     // Render clues after state sync
//     renderCluesFromState();

//     // Setup validation buttons
//     setupValidationButtons();

//     // Listen for online events
//     window.addEventListener('online', async () => {
//       console.log('[App Init] Back online, syncing...');
//       try {
//         await syncWithServer({
//           gameId: GAME_DATA.gameId,
//           teamId: GAME_DATA.teamId,
//           offlineDB
//         });
//         updatePendingBadge();
//       } catch (err) {
//         console.error('[App Init] Error during online sync:', err);
//       }
//     });

//   } catch (err) {
//     showToast("Failed to initialize app", { type: 'error' });
//     console.error('startApp failed:', err);
//   }
// }


// Observe container for dynamic additions
export function observeClues() {
  watchContainer('#clues-container', revealUnlockedClues);
}

// Auto-start app on DOMContentLoaded
document.addEventListener('DOMContentLoaded', startApp);

// // ---------------- DEBUG GAME STATE ----------------
// if (window.DEBUG_GAME_STATE) {
//   function logChange(path, value) { console.log(`[gameState] ${path} changed:`, value); }

//   function createDeepProxy(obj, path = '') {
//     return new Proxy(obj, {
//       set(target, prop, value) {
//         const fullPath = path ? `${path}.${prop}` : prop;
//         const oldValue = target[prop];
//         if (value && typeof value === 'object' && !value.__isProxy) {
//           value = createDeepProxy(value, fullPath);
//           value.__isProxy = true;
//         }
//         target[prop] = value;
//         if (oldValue !== value) logChange(fullPath, value);
//         return true;
//       },
//       get(target, prop) {
//         const val = target[prop];
//         if (val && typeof val === 'object' && !val.__isProxy) {
//           target[prop] = createDeepProxy(val, path ? `${path}.${prop}` : prop);
//           target[prop].__isProxy = true;
//           return target[prop];
//         }
//         return val;
//       }
//     });
//   }

//   root.gameState = createDeepProxy(root.gameState);
//   console.log('[DEBUG] gameState proxy enabled');
// }
