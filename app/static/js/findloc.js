// findloc.js (progressive reveal)
import { gameState, loadState, saveState } from './localStorage.js';
import { setupValidationButtons } from './validate.js'; // You'll need to call this after rendering
import { showToast } from './common-ui.js';

// Get a safe reference to the game state
export function getGameState() {
  if (!window.gameState) {
    // If no state exists, initialize from server data.
    // This happens only on the very first page load.
    window.gameState = window.GAME_DATA || { currentIndex: 0, locations: [] };
  }
  return window.gameState;
}

export function initGame() {
    loadState();
    console.log('[Findloc] gameState after loadState():', window.gameState);

    const gs = getGameState();
    if (gs.locations.length === 0 && window.GAME_DATA) {
        Object.assign(gs, window.GAME_DATA);
        saveState();
        console.log('[Findloc] gameState initialized from server data:', window.gameState);
    }
}

/**
 * Applies an optimistic offline UI update after a user action.
 * This function updates the local state and triggers a re-render.
 * It does NOT communicate with the server.
 * @param {string} locationId - The ID of the location that was found.
 */
export function applyOfflineUI(locationId) {
    const gs = getGameState();
    const foundIndex = gs.locations.findIndex(loc => String(loc.id) === String(locationId));

    if (foundIndex > -1) {
        // Step 1: Update the local game state.
        // We set the location to 'found' and a temporary 'isOffline' flag.
        gs.locations[foundIndex].found = true;
        gs.locations[foundIndex].isOffline = true;
        
        // Step 2: Advance the current index for the next clue.
        // This makes the next clue card visible.
        gs.currentIndex = foundIndex + 1;
        
        // Step 3: Persist the updated state to local storage.
        saveState();

        // Step 4: Re-render the entire UI based on the new state.
        // The `renderCluesFromState` function will read the `isOffline` flag
        // and apply the correct styling.
        renderCluesFromState();
    }
}

/**
 * Applies a server-confirmed game state update.
 * This function updates the local state and triggers a re-render.
 * @param {object} data - The data received from the server, confirming the update.
 */
export function applyGameUpdate(data) {
    console.log('applyGameUpdate:', data);
    if (!data) return;

    const location_id = data.locationId || data.location_id;
    if (!location_id) {
        console.warn('No locationId in update data:', data);
        return;
    }

    const gs = getGameState();
    if (!gs) {
        console.warn('No gameState available');
        return;
    }

    const foundIndex = gs.locations.findIndex(loc => String(loc.id) === String(location_id));

    if (foundIndex > -1) {
        // Step 1: Update the local game state with server-confirmed data.
        gs.locations[foundIndex].found = true;
        
        // Step 2: Remove the temporary 'isOffline' flag.
        // This is crucial for clearing the offline styling.
        gs.locations[foundIndex].isOffline = false;
        
        // Step 3: Advance the current index.
        // This is the true, server-confirmed index.
        gs.currentIndex = foundIndex + 1;

        // Step 4: Persist the updated state to local storage.
        saveState();

        // Step 5: Re-render the entire UI based on the new, authoritative state.
        renderCluesFromState();
    } else {
        console.warn(`Location with ID ${location_id} not found in gameState.`);
    }
}

// Sync DOM with current gameState
export function updateClueVisibility() {
  const gs = getGameState();
  if (!gs) return;

  document.querySelectorAll('.clue-card').forEach((card, idx) => {
    card.style.display = idx <= gs.currentIndex ? '' : 'none';
  });
}


export function updateUIFromState() {
    renderCluesFromState();
    setupValidationButtons();
}

export function renderCluesFromState() {
  const container = document.querySelector('#locationAccordion');
  const gs = getGameState();
  if (!container || !gs || !gs.locations) {
    console.warn('Container or gameState locations not available for rendering.');
    return;
  }

  // Clear existing HTML
  container.innerHTML = '';

  // Iterate over all locations to render the full accordion structure
  gs.locations.forEach((loc, idx) => {
    const isFound = loc.found;
    const isCurrent = idx === gs.currentIndex;
    
    // Corrected logic: a card is visible if it's found or its index
    // is less than or equal to the current index.
    const isVisible = isFound || idx <= gs.currentIndex;
    // The current clue should be expanded; others are collapsed.
    const isExpanded = isCurrent;

    const selfieBtnId = `btn-validate-selfie-${loc.id}`;
    const geoBtnId = `btn-validate-geo-${loc.id}`;

    const cardHtml = `
      <div class="accordion-item clue-card ${isFound ? 'found-clue' : ''}" 
           data-clue-index="${idx}"
           data-location-id="${loc.id}"
           style="display: ${isVisible ? 'block' : 'none'};">
        
        <h2 class="accordion-header">
          <button class="accordion-button ${isExpanded ? '' : 'collapsed'}" 
                  type="button" 
                  data-bs-toggle="collapse" 
                  data-bs-target="#collapse-${loc.id}"
                  aria-expanded="${isExpanded ? 'true' : 'false'}">
            ${loc.name}
          </button>
        </h2>

        <div id="collapse-${loc.id}" 
             class="accordion-collapse collapse ${isExpanded ? 'show' : ''}"
             data-bs-parent="#locationAccordion">
          <div class="accordion-body">
            ${loc.description ? `<p>${loc.description}</p>` : ''}
            ${loc.image_url ? `
              <div class="location-image-container position-relative mb-3">
                <img src="${loc.image_url}" alt="${loc.name}" class="card-img-top" style="max-width: 300px;">
              </div>
            ` : ''}
            <p class="card-text">${loc.clue_text}</p>
            ${loc.latitude && loc.longitude ? `
              <div id="map-${loc.id}" class="map-container"
                   data-lat="${loc.latitude}" data-lon="${loc.longitude}" style="height: 200px;"></div>
            ` : ''}

            <div id="validation-methods">

              <button class="btn btn-primary btn-validate-direct" 
                      data-location-id="${loc.id}"
                      data-clue-index="${idx}">
                  Mark Directly
              </button>

              ${window.GAME_DATA.enable_selfie ? `
                    <button id="btn-validate-selfie-${loc.id}" 
                            class="btn btn-primary btn-validate-selfie"
                            data-location-id="${loc.id}"
                            data-location-image="${loc.image_url}">
                        Take Selfie
                    </button>
                ` : ''}

              
              ${window.GAME_DATA.enable_geolocation ? `
                <button class="btn btn-primary btn-validate-geo"
                        data-location-id="${loc.id}">
                  Use Location
                </button>` : ''}
              
              
              ${window.GAME_DATA.enable_image_verify ? `
                <button id="btn-validate-image" class="btn btn-primary"
                  data-location-id="${loc.id}">
                Match Image</button>
                <div>
                  <h1>Find the Clue</h1>
                  <div id="container">
                    <video id="camera" autoplay playsinline></video>
                    <img class="overlay" src="/static/target.png" />
                  </div>
                  <br>
                  <button id="capture-btn">Verify</button>
                  <div id="status-img"></div>
                </div>
              ` : ''}
              ${window.GAME_DATA.enable_qr_scanner ? `
                <button id="btn-validate-qr" class="btn btn-primary" 
                  data-location-id="${loc.id}">
                Scan QR Code</button>
                <div id="qr-container">
                  <video id="qr-video" style="width: 100%; max-width: 400px;"></video>
                  <canvas id="qr-canvas" style="display: none;"></canvas>
                  <p id="qr-result">Awaiting scan...</p>
                </div>
              ` : ''}
              
            </div>
          </div>
        </div>
      </div>
    `;

    container.insertAdjacentHTML('beforeend', cardHtml);
  });
}

// Clear offline queue
export async function clearOfflineQueue() {
  if (!offlineDB) return;
  const updates = await offlineDB.getAllUpdates();
  for (const u of updates) await offlineDB.deleteUpdate(u.id);
  console.log('[DEBUG] Cleared offline queued updates');
}

// Clear offline queue for a specific team
export async function clearOfflineQueueForTeam(teamId) {
  if (!window.offlineDB) return;
  const allUpdates = await window.offlineDB.getAllUpdates({ ordered: true });
  const deletions = allUpdates
    .filter(u => u.body?.team_id === teamId)
    .map(u => window.offlineDB.deleteUpdate(u.id)
      .then(() => console.log('[offlineSync] Deleted queued update for team', teamId, u)));
  await Promise.all(deletions);
}


// Update pending badge for queued updates
export async function updatePendingBadge() {
  try {
    if (!window.offlineDB) return;
    const updates = await window.offlineDB.getAllUpdates();
    const { gameId, teamId } = window.GAME_DATA || {};
    const filtered = updates.filter(u =>
      String(u.body?.team_id) === String(teamId) &&
      String(u.body?.game_id) === String(gameId)
    );

    const count = filtered.length;
    const badge = document.getElementById('pending-badge');
    const span = document.getElementById('pending-count');
    if (!badge || !span) return;

    if (count > 0) {
      span.textContent = count;
      badge.style.display = 'inline-flex';
      badge.title = `${count} update${count === 1 ? '' : 's'} pending to sync`;
    } else {
      badge.style.display = 'none';
    }
  } catch (e) {
    console.warn('[Badge] Failed to update pending badge:', e);
  }
}

// Create a global object to hold the "exports" for the IIFE
window.findLocUtils = {
  updateUIFromState: updateUIFromState,
  getGameState: getGameState, // You might need this too
  saveState: saveState // You might need this too
};



// export function applyGameUpdate(data) {
//   console.log('applyGameUpdate:', data);
//   if (!data) return;

//   const location_id = data.locationId || data.location_id;
//   if (!location_id) {
//     console.warn('No locationId in update data:', data);
//     return;
//   }

//   const gs = getGameState();
//   if (!gs) {
//     console.warn('No gameState available');
//     return;
//   }

//   // Find the location in the local state and update it
//   const foundIndex = gs.locations.findIndex(loc => String(loc.id) === String(location_id)); // Changed locationId to location_id
  
//   if (foundIndex > -1) {
//     gs.locations[foundIndex].found = true;
//     gs.currentIndex = foundIndex + 1;
//     saveState();
//   } else {
//     console.warn(`Location with ID ${location_id} not found in gameState.`);
//   }

//   // Now, re-render the entire UI based on the new state.
//   renderCluesFromState();
// }

// export function applyOfflineUI(locationId) {
//   const el = document.querySelector(`[data-location-id="${locationId}"]`);
//   if (el) el.classList.add('found-offline');

//   const statusEl = document.querySelector('#status');
//   if (statusEl) statusEl.textContent = 'Progress saved offline';

//   advanceUI(locationId); // reuse same accordion logic
// }

// function advanceUI(locationId) {
//   const gs = getGameState();
//   if (!gs || !gs.locations) return;

//   // close current
//   const foundCollapse = document.getElementById(`collapse-${locationId}`);
//   const foundButton = document.querySelector(`button[data-bs-target="#collapse-${locationId}"]`);
//   if (foundCollapse) {
//     foundCollapse.classList.remove('show');
//     foundCollapse.setAttribute('aria-expanded', 'false');
//   }
//   if (foundButton) {
//     foundButton.classList.add('collapsed');
//     foundButton.setAttribute('aria-expanded', 'false');
//   }

//   // open next
//   revealNextClue(gs.currentIndex);
// }

// function revealNextClue(clueIndex) {
//   const nextItem = document.querySelector(`.accordion-item[data-clue-index="${clueIndex}"]`);
//   if (!nextItem) {
//     console.warn(`No accordion item found for index ${clueIndex}`);
//     return;
//   }

//   nextItem.style.display = ''; // restores default display
//   const nextCollapse = nextItem.querySelector('.accordion-collapse');
//   const nextButton = nextItem.querySelector('.accordion-button');

//   if (nextCollapse) {
//     nextCollapse.classList.add('show');
//     nextCollapse.setAttribute('aria-expanded', 'true');
//   }
//   if (nextButton) {
//     nextButton.classList.remove('collapsed');
//     nextButton.setAttribute('aria-expanded', 'true');
//   }

// }



// // Show/hide clue cards based on currentIndex
// function revealUnlockedClues() {
//   const cards = document.querySelectorAll('.clue-card');
//   const gameState = root.gameState;
//   if (!gameState) return;
//   cards.forEach((card, idx) => {
//     card.style.display = idx <= gameState.currentIndex ? '' : 'none';
//   });
// }

// Render clues from current gameState
// export function renderCluesFromState_legacy() {
//   const container = document.querySelector('#clues-container');
//   const gs = getGameState();
//   if (!container || !gs) return;

//   container.innerHTML = '';
//   gs.locations.forEach((loc, idx) => {
//     const card = document.createElement('div');
//     card.className = 'clue-card';
//     card.dataset.clueIndex = idx;
//     card.textContent = loc.clue_text;
//     card.style.display = idx <= gs.currentIndex ? '' : 'none';
//     container.appendChild(card);
//   });
// }