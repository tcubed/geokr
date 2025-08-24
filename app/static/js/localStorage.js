// localStorage.js

// SAVE STORAGE KEY SHOULD BE GENERATED DYNAMICALLY BASED ON GAME_DATA
const STORAGE_KEY = `geo-game-state_${GAME_DATA.gameId}`; // OK

// GAMESTATE SHOULD BE MUTABLE, CLONE LOCATIONS TO AVOID MUTATING GAME_DATA
// INITIALIZE gameState FROM LOCALSTORAGE OR TEMPLATE
const savedState = localStorage.getItem(STORAGE_KEY);
const gameState = savedState 
  ? JSON.parse(savedState)
  : {
      gameId: GAME_DATA.gameId,
      teamId: GAME_DATA.teamId || null,
      locations: window.GAME_DATA.locations,
      currentIndex: window.GAME_DATA.nextIndex || 0
    };
const gameId = GAME_DATA.gameId;

// SAVE STATE TO LOCALSTORAGE
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(gameState));
  } catch (err) {
    console.warn('Failed to save gameState to localStorage:', err);
  }
}

// LOAD STATE FROM LOCALSTORAGE OR FALLBACK TO GAME_DATA.nextIndex
function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const savedState = JSON.parse(saved);
      Object.assign(gameState, savedState); // DO NOT REASSIGN, UPDATE PROPERTIES ONLY
    } else {
      gameState.currentIndex = GAME_DATA.nextIndex || 0; // DEFAULT TO SERVER VALUE
    }
  } catch (err) {
    console.warn('Failed to load gameState from localStorage:', err);
    gameState.currentIndex = GAME_DATA.nextIndex || 0; // ENSURE VALID DEFAULT
  }
}

// REMOVE OLD OFFLINE QUEUE LOGIC — USE offline-sync.js FOR CONSISTENCY
// function queueOfflineAction(action) { ... } -> DELETE
// async function syncOfflineQueue() { ... } -> DELETE

// EXPORT SINGLETONS
export { gameState, gameId, saveState, loadState };

// EXPOSE ON WINDOW FOR GLOBAL ACCESS
window.gameState = gameState;
window.gameId = gameId;
window.gameStorage = {
  saveState,
  loadState
  // OFFLINE QUEUE FUNCTIONS ARE HANDLED IN offline-sync
};
