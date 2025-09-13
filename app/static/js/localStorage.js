// localStorage.js

// Pull lightweight globals from base.html
const CONTEXT = window.GAME_CONTEXT || {};
const gameId = CONTEXT.gameId || "default";
const teamId = CONTEXT.teamId || null;

// Optional page-specific heavy data
const FINDLOC = window.FINDLOC_DATA || {}; // only defined on /findloc

const STORAGE_KEY = `geo-game-state_${gameId}`;

// GAMESTATE SHOULD BE MUTABLE, CLONE LOCATIONS TO AVOID MUTATING GAME_DATA
// INITIALIZE gameState FROM LOCALSTORAGE OR TEMPLATE
const savedState = localStorage.getItem(STORAGE_KEY);
const gameState = savedState 
  ? JSON.parse(savedState)
  : {
      gameId: CONTEXT.gameId || "default",
      teamId: CONTEXT.teamId || null,
      // only include locations/currentIndex if available on this page:
      locations: FINDLOC.locations || [],
      currentIndex: FINDLOC.currentIndex || 0,
    };
//const gameId = GAME_DATA.gameId;

// SAVE STATE TO LOCALSTORAGE
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(gameState));
  } catch (err) {
    console.warn('Failed to save gameState to localStorage:', err);
  }
}

// LOAD STATE FROM LOCALSTORAGE OR FALLBACK TO GAME_DATA.currentIndex
function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      Object.assign(gameState, JSON.parse(saved));
    } else {
      // default currentIndex if we have it
      gameState.currentIndex = FINDLOC.currentIndex || 0;
    }
  } catch (err) {
    console.warn('Failed to load gameState from localStorage:', err);
    gameState.currentIndex = FINDLOC.currentIndex || 0;
  }
}

// REMOVE OLD OFFLINE QUEUE LOGIC — USE offline-sync.js FOR CONSISTENCY
// function queueOfflineAction(action) { ... } -> DELETE
// async function syncOfflineQueue() { ... } -> DELETE

// EXPORT SINGLETONS
export { gameId, gameState, saveState, loadState };

// EXPOSE ON WINDOW FOR GLOBAL ACCESS
//window.gameState = gameState;
window.gameId = gameId;
window.gameStorage = {
  gameState,
  saveState,
  loadState
  // OFFLINE QUEUE FUNCTIONS ARE HANDLED IN offline-sync
};
