// findloc.js (progressive reveal)
import { gameState, loadState, saveState } from './localStorage.js';

export async function initGame() {
  loadState();
  //showCurrentClue();

  // Setup "Found" button handler
//   const foundBtn = document.getElementById('found-btn');
//   if (foundBtn) {
//     foundBtn.addEventListener('click', async () => {
//         console.log('should not run this')
//       const loc = gameState.locations[gameState.currentIndex];
//       if (!loc) {
//         alert('No current location found.');
//         return;
//       }

//       let currentLat = null;
//       let currentLon = null;
//       try {
//         const position = await new Promise((resolve, reject) => {
//           navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
//         });
//         currentLat = position.coords.latitude;
//         currentLon = position.coords.longitude;
//       } catch {
//         console.warn('Geolocation unavailable or timed out.');
//       }

//       loc.found = true;  // mark found in local state
//       saveState();

//     //   try {
//     //     await markLocationFound(loc.id, teamId,gameId, currentLat, currentLon);
//     //   } catch (err) {
//     //     console.warn('markLocationFound error:', err);
//     //     // offline queue handled inside markLocationFound
//     //   }

//       if (gameState.currentIndex < gameState.locations.length - 1) {
//         gameState.currentIndex++;
//         saveState();
//         showCurrentClue();
//       } else {
//         alert('🎉 All locations complete!');
//       }
//     });
//   }

//   // Start clue tracking (map + geo updates)
//   try {
//     await startClueTracking();
//     console.log("Clue tracking started.");
//   } catch (err) {
//     console.error("Error starting clue tracking:", err);
//   }
}

export function applyGameUpdate(data) {
  console.log('applyGameUpdate:', data);
  if (!data) return;

    const location_id = data.locationId || data.location_id;
    if (!location_id) {
        console.warn('No locationId in update data:', data);
        return;
    }

    const gameState = window.gameState;
    if (!gameState) {
        console.warn('No gameState available');
        return;
    }
    
    // close current clue
    console.log('applyGameUpdate locationId:', location_id);
    const foundCollapse = document.getElementById(`collapse-${location_id}`);
    const foundButton = document.querySelector(`button[data-bs-target="#collapse-${location_id}"]`);
    if (foundCollapse) {
        //console.log('found collapse',foundCollapse)
        foundCollapse.classList.remove('show');
        foundCollapse.setAttribute('aria-expanded', 'false');
    } else {
    console.warn('No collapse element found for locationId:', location_id);}

    if (foundButton) {
        //console.log('found collapse',foundButton)
    foundButton.classList.add('collapsed');
    foundButton.setAttribute('aria-expanded', 'false');
    } else {
    console.warn('No button element found for locationId:', location_id);}

    // move to next clue
    const nextLoc = gameState.locations[gameState.currentIndex];
    // if (nextLoc && nextLoc.id) {
    //     const nextCollapse = document.getElementById(`collapse-${nextLoc.id}`);
    //     const nextButton = document.querySelector(`button[data-bs-target="#collapse-${nextLoc.id}"]`);
    //     if (nextCollapse) {
    //         nextCollapse.classList.add('show');
    //         nextCollapse.setAttribute('aria-expanded', 'true');
    //     } else {
    //         console.warn('No collapse element found for next locationId:', nextLoc.id);
    //     }
    //     if (nextButton) {
    //         nextButton.classList.remove('collapsed');
    //         nextButton.setAttribute('aria-expanded', 'true');
    //     } else {
    //         console.warn('No button element found for next locationId:', nextLoc.id);
    //     }
    // } else {
    //     console.log('No more clues to reveal.');
    // }
    revealNextClue(gameState.currentIndex);
}

export function applyOfflineUI(locationId) {
  const el = document.querySelector(`[data-location-id="${locationId}"]`);
  if (el) el.classList.add('found-offline');

  const statusEl = document.querySelector('#status');
  if (statusEl) statusEl.textContent = 'Progress saved offline';
}

function revealNextClue(clueIndex) {
  const nextItem = document.querySelector(`.accordion-item[data-clue-index="${clueIndex}"]`);
  if (nextItem) {
    nextItem.style.display = ''; // restores default display
    const nextCollapse = nextItem.querySelector('.accordion-collapse');
    const nextButton = nextItem.querySelector('.accordion-button');

    if (nextCollapse) {
      nextCollapse.classList.add('show');
      nextCollapse.setAttribute('aria-expanded', 'true');
    }
    if (nextButton) {
      nextButton.classList.remove('collapsed');
      nextButton.setAttribute('aria-expanded', 'true');
    }
  } else {
    console.warn(`No accordion item found for index ${clueIndex}`);
  }
}

// Sync DOM with current gameState
export function updateClueVisibility() {
  const cards = document.querySelectorAll('.clue-card'); // Make sure this matches your clue wrapper
  cards.forEach((card, idx) => {
    if (idx <= gameState.currentIndex) {
      card.style.display = '';  // Show clue
    } else {
      card.style.display = 'none'; // Hide future clues
    }
  });
}

//window.applyGameUpdate = applyGameUpdate;
//window.applyOfflineUI = applyOfflineUI;



//const { gameState, loadState, saveState } = window.gameStorage;
//const gameId = window.GAME_DATA.gameId;  // or window.gameStorage.gameId if you expose it there


// document.addEventListener('DOMContentLoaded', () => {
//   loadState();
//   showCurrentClue();

//   const foundBtn = document.getElementById('found-btn');
//   if (!foundBtn) return;

//   foundBtn.addEventListener('click', async () => {
//     const loc = gameState.locations[gameState.currentIndex];
//     if (!loc) {
//       alert('No current location found.');
//       return;
//     }

//     let currentLat = null;
//     let currentLon = null;

//     try {
//       const position = await new Promise((resolve, reject) => {
//         navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
//       });
//       currentLat = position.coords.latitude;
//       currentLon = position.coords.longitude;
//     } catch {
//       console.warn('Geolocation unavailable or timed out.');
//     }

//     // Optimistically mark found in local game state & save
//     loc.found = true;
//     saveState();

//     try {
//       await markLocationFound(loc.id, GAME_DATA.gameId, currentLat, currentLon);
//     } catch (err) {
//       console.warn('markLocationFound error:', err);
//       // Offline queueing handled inside markLocationFound via sendOrQueue
//     }

//     // Advance to next clue or finish
//     if (gameState.currentIndex < gameState.locations.length - 1) {
//       gameState.currentIndex++;
//       saveState();
//       showCurrentClue();
//     } else {
//       alert('🎉 All locations complete!');
//     }
//   });
// });


// // Load from localStorage if available
// const foundBtn = document.getElementById('found-btn');
// // let gameState = {
// //   locations: GAME_DATA.locations,
// //   currentIndex: GAME_DATA.nextIndex || 0
// // };

// // Load state from local storage if available
// loadState();
// showCurrentClue();

