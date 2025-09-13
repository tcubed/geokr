// debug_utils.js
import { clearOfflineQueueForTeam } from '/static/js/app-init.js';

// grab once at module load
const resetBtn = document.getElementById('btn-reset-locations');

// only attach if the button exists in the DOM
if (resetBtn) {
  resetBtn.addEventListener('click', handleResetClick);
} else {
  console.warn('[debug_utils] #btn-reset-locations not found in DOM');
}

async function handleResetClick() {
  console.log("Page load: currentIndex =", window.gameState?.currentIndex);

  if (!confirm('Really reset all location progress for this team?')) return;

  try {
    // Reset local game state first (offline-safe)
    if (window.gameState) {
      window.gameState.locations.forEach(loc => (loc.found = false));
      window.gameState.currentIndex = 0;

      if (typeof window.saveState === 'function') window.saveState();
    }

    // Clear queued offline updates for this team
    await clearOfflineQueueForTeam(window.GAME_DATA.teamId);

    // Try server reset if online
    if (navigator.onLine) {
      const resp = await fetch('/debug/reset-locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_id: window.GAME_DATA.teamId }),
      });
      const data = await resp.json();
      console.log('Server reset:', data);
      alert(data.message || 'Reset done');
    } else {
      alert('Offline: local reset done. Server will sync when back online.');
    }

    console.log("After reset click: currentIndex =", window.gameState?.currentIndex);

    location.reload();
  } catch (err) {
    console.error(err);
    alert('Reset failed');
  }
}


/*
Defer binding until DOMContentLoaded if debug_utils.js is in <head> rather than at the bottom:

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btn-reset-locations');
  if (btn) btn.addEventListener('click', handleResetClick);
});
*/