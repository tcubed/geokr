import { showToast } from './common-ui.js';

// function showToast(message, isError = false) {
//   const container = document.getElementById('sync-toast-container');
//   const toast = document.createElement('div');
//   toast.className = `alert alert-${isError ? 'danger' : 'success'} p-2 mb-1`;
//   toast.textContent = message;
//   container.appendChild(toast);
//   setTimeout(() => toast.remove(), 4000);
// }

document.addEventListener('DOMContentLoaded', () => {
  
  const table = document.getElementById('gamesTable');

  // All actions and their endpoints live here:
  const actionsMap = {
    start: (gameId) => `/api/game/${gameId}/start_game`,
    clear: (gameId) => `/api/game/${gameId}/clear_assignments`,
    reset: (teamId) => `/api/team/${teamId}/reset_locations`,
    // add new ones here, no JS logic below changes
    // pause: (gameId) => `/api/games/${gameId}/pause`,
  };

  table.addEventListener('click', async (e) => {
    const link = e.target.closest('.game-action');
    if (!link) return;

    e.preventDefault();

    const action = link.dataset.action;
    const row = link.closest('tr');
    const gameId = row.dataset.gameId;

    // Look up the endpoint function:
    const endpointFn = actionsMap[action];
    if (!endpointFn) {
      console.warn(`No action mapping for "${action}"`);
      return;
    }

    try {
      const resp = await fetch(endpointFn(gameId), { method: 'POST' });
      if (!resp.ok) throw new Error(await resp.text());

      //showToast(`Action "${action}" completed for game ${gameId}`);

      // Check if the response is OK (status 200-299)
      if (!resp.ok) {
          // If the response is not OK, parse the error message from the response body
          const errorData = await resp.json();
          throw new Error(errorData.message || 'An unknown error occurred.');
      }

      // If the response is OK, parse the success message from the response body
      const successData = await resp.json();
      showToast(successData.message);

    } catch (err) {
      console.error(err);
      showToast(`Error performing ${action}: ${err.message}`, true);
    }
  });
});


