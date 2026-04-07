import { showToast } from './common-ui.js';

document.addEventListener('DOMContentLoaded', () => {
  const table = document.getElementById('gamesTable');
  if (!table) return;

  function renderStatusMarkup(status) {
    if (status === 'ongoing') {
      return '<span class="badge text-bg-success text-uppercase">ongoing</span>';
    }
    if (status === 'ready') {
      return '<span class="badge text-bg-primary text-uppercase">ready</span>';
    }
    if (status === 'complete') {
      return '<span class="badge text-bg-secondary text-uppercase">complete</span>';
    }
    return '<span class="text-muted">&mdash;</span>';
  }

  function updateRowStatus(row, status) {
    const statusCell = row.querySelector('[data-role="game-status"]');
    if (!statusCell) return;
    statusCell.dataset.status = status || '';
    statusCell.innerHTML = renderStatusMarkup(status || '');
  }

  // All actions and their endpoints live here:
  const actionsMap = {
    start: (gameId) => `/api/game/${gameId}/start_game`,
    clear: (gameId) => `/api/game/${gameId}/clear_assignments`,
    reset: (gameId) => `/api/game/${gameId}/reset_locations`,
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
      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(payload.message || payload.error || 'An unknown error occurred.');
      }

      const successData = payload;
      if (Object.prototype.hasOwnProperty.call(successData, 'status')) {
        updateRowStatus(row, successData.status);
      }
      showToast(successData.message);

    } catch (err) {
      console.error(err);
      showToast(`Error performing ${action}: ${err.message}`, true);
    }
  });
});


