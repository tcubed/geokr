// static/js/app-init.js
const offlineDB = self.offlineDB; // Explicit for clarity
const { syncWithServer } = self.offlineSync; // NEW: use our offline-sync

import { showToast, updatePendingBadge } from './offline-game.js';
import { initGame, updateClueVisibility} from './findloc.js';
import { setupValidationButtons } from './validate.js';

// Wait until clue cards exist in the DOM
async function waitForClues(timeout = 2000) {
  const start = Date.now();
  return new Promise(resolve => {
    const interval = setInterval(() => {
      const cards = document.querySelectorAll('.clue-card');
      if (cards.length > 0 || Date.now() - start > timeout) {
        clearInterval(interval);
        resolve();
      }
    }, 50);
  });
}

function revealUnlockedClues() {
  const cards = document.querySelectorAll('.clue-card');
  cards.forEach((card, idx) => {
    card.style.display = (idx <= gameState.currentIndex) ? '' : 'none';
  });
}

// Observe additions to the clue container
function watchClueContainer() {
  const container = document.querySelector('#clues-container'); // wrapper for all clues
  if (!container) return;

  const observer = new MutationObserver(() => {
    revealUnlockedClues();
  });

  observer.observe(container, { childList: true, subtree: true });
}

export function renderCluesFromState() {
  const container = document.querySelector('#clues-container');
  if (!container) return;

  container.innerHTML = ''; // Clear any stale content

  gameState.locations.forEach((loc, idx) => {
    const card = document.createElement('div');
    card.className = 'clue-card';
    card.dataset.clueIndex = idx;
    card.textContent = loc.clue_text; // or build full card HTML
    card.style.display = idx <= gameState.currentIndex ? '' : 'none';
    container.appendChild(card);
  });
}

export async function startApp() {
  try {
    // 1. Initialize the game UI and local gameState
    await initGame();
    updatePendingBadge();
    // wait until the next microtask to ensure DOM elements exist
    //await new Promise(requestAnimationFrame);
    //updateClueVisibility();

    // 2. Notify about pending offline updates
    const count = await offlineDB.count();
    if (count > 0) {
      showToast(`You have ${count} pending update${count === 1 ? '' : 's'}`, { type: 'warning' });
    }
    if (navigator.onLine) {
      await syncAllQueuedUpdates({ offlineDB });
    }

    // 3. FULL SYNC: send queued updates + reconcile server state
    if (navigator.onLine) {
      // NOTE: syncWithServer internally calls syncAllQueuedUpdates AND fetchServerGameState
      await syncWithServer({
        gameId: GAME_DATA.gameId,
        teamId: GAME_DATA.teamId,
        offlineDB
      });

      updatePendingBadge();  // ✅ updates the badge
      console.log('[App Init] Game state after server sync:', window.gameState);
      // NOW the DOM is safe to update
      //updateClueVisibility();
    }

    // 4. Wait until clue cards are in the DOM
    //await waitForClues();
    //updateClueVisibility(); // now safe to show all unlocked clues
    //watchClueContainer(); // attach observer immediately
    //revealUnlockedClues(); // also run once in case already rendered

    renderCluesFromState();

    // 3. Setup validation buttons or other UI hooks
    setupValidationButtons();

    // 4. Listen for future online events
    window.addEventListener('online', async () => {
      console.log('[App Init] Back online, syncing...');
      try {
        await syncWithServer({
          gameId: GAME_DATA.gameId,
          teamId: GAME_DATA.teamId,
          offlineDB
        });

        updatePendingBadge();  // ✅ updates the badge
      } catch (err) {
        console.error('[App Init] Error during online sync:', err);
      }
    });

  } catch (err) {
    showToast("Failed to initialize app", { type: 'error' });
    console.error('startApp failed:', err);
  }
}

export async function clearOfflineQueue() {
  if (!self.offlineDB) return;
  const updates = await self.offlineDB.getAllUpdates();
  for (const u of updates) {
    await self.offlineDB.deleteUpdate(u.id);
  }
  console.log('[DEBUG] Cleared offline queued updates');
}

export async function clearOfflineQueueForTeam(teamId) {
  const allUpdates = await offlineDB.getAllUpdates({ ordered: true });
  // for (const update of allUpdates) {
  //   if (update.body?.team_id === teamId) {
  //     await offlineDB.deleteUpdate(update.id);
  //     console.log('[offlineSync] Deleted queued update for team', teamId, update);
  //   }
  // }
  const deletions = allUpdates
    .filter(u => u.body?.team_id === teamId)
    .map(u => offlineDB.deleteUpdate(u.id).then(() => console.log('[offlineSync] Deleted queued update for team', teamId, u)));
  await Promise.all(deletions);
}



// Automatically start app after DOM loaded
document.addEventListener('DOMContentLoaded', startApp);

// ---------------- DEBUG GAME STATE ----------------
// Only enable if the flag is set
if (window.DEBUG_GAME_STATE) {

  // Simple throttled logger to avoid spamming the console
  function logChange(path, value) {
    console.log(`[gameState] ${path} changed:`, value);
  }

  // Recursive deep proxy for objects/arrays
  function createDeepProxy(obj, path = '') {
    return new Proxy(obj, {
      set(target, prop, value) {
        const fullPath = path ? `${path}.${prop}` : prop;
        const oldValue = target[prop];

        // If the value is an object/array, wrap it
        if (value && typeof value === 'object' && !value.__isProxy) {
          value = createDeepProxy(value, fullPath);
          value.__isProxy = true; // mark to avoid double wrapping
        }

        target[prop] = value;

        if (oldValue !== value) {
          logChange(fullPath, value);
        }
        return true;
      },
      get(target, prop) {
        const val = target[prop];
        // Wrap nested objects dynamically if not already wrapped
        if (val && typeof val === 'object' && !val.__isProxy) {
          target[prop] = createDeepProxy(val, path ? `${path}.${prop}` : prop);
          target[prop].__isProxy = true;
          return target[prop];
        }
        return val;
      }
    });
  }

  // Wrap global gameState
  window.gameState = createDeepProxy(window.gameState);
  console.log('[DEBUG] gameState proxy enabled');
}
// ---------------------------------------------------
