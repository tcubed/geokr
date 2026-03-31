// localStorage.js

const STORAGE_KEY = gameStorageKey();

function gameStorageKey() {
  return `geo-game-state_${GAME_DATA.gameId}`;
}

const gameState = {
  locations: window.GAME_DATA.locations,
  currentIndex: window.GAME_DATA.nextIndex || 0
};
const gameId = GAME_DATA.gameId;

// export const gameState = {
//   locations: GAME_DATA.locations,
//   currentIndex: GAME_DATA.nextIndex || 0
// };
//export const gameId = GAME_DATA.gameId;

// Save state to localStorage
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(gameState));
  } catch (err) {
    console.warn('Failed to save gameState to localStorage:', err);
  }
}

// Load state from localStorage
function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      //gameState = JSON.parse(saved);
      const savedState = JSON.parse(saved);
      // Update properties of gameState object, don’t reassign
      Object.assign(gameState, savedState);
    }
  } catch (err) {
    console.warn('Failed to load gameState from localStorage:', err);
  }
}

// Queue offline actions
function queueOfflineAction(action) {
  const key = 'offlineQueue';
  const queue = JSON.parse(localStorage.getItem(key)) || [];
  queue.push(action);
  localStorage.setItem(key, JSON.stringify(queue));
}

async function syncOfflineQueue() {
  const key = 'offlineQueue';
  const queue = JSON.parse(localStorage.getItem(key)) || [];
  const remaining = [];

  for (const action of queue) {
    if (action.type === 'FOUND_LOCATION') {
      try {
        await markLocationFound(action.locationId, action.teamId,action.gameId, action.lat, action.lon);
        console.log(`Synced location ${action.locationId}`);
      } catch (err) {
        console.warn(`Retry later for ${action.locationId}`);
        remaining.push(action);
      }
    }
  }

  localStorage.setItem(key, JSON.stringify(remaining));
}



export { gameState, gameId,saveState, loadState };

// Initial game state object
// const gameState = {
//   locations: window.GAME_DATA.locations,
//   currentIndex: window.GAME_DATA.nextIndex || 0
// };
// const gameId = GAME_DATA.gameId;

window.gameState=gameState;
window.gameId=gameId;
window.gameStorage = {
  //gameState,
  //gameId,
  saveState,
  loadState,
  //queueOfflineAction,
  //syncOfflineQueue
};

// // Sync offline queue automatically when back online
// window.addEventListener('online', () => window.gameStorage.syncOfflineQueue());
