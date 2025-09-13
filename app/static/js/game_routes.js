import { showToast } from '/static/js/common-ui.js';

const gameSelect = document.getElementById('gameSelect');
const routesContainer = document.getElementById('routesContainer');
const addRouteBtn = document.getElementById('addRouteBtn');
const saveRoutesBtn = document.getElementById('saveRoutesBtn')

const routeTemplate = document.getElementById('routeTemplate');
const locationTemplate = document.getElementById('locationTemplate');

let allLocations = [];  // Locations for the selected game
let routes = [];        // In-memory routes array

// ------------------ Fetch locations and routes when game is selected ------------------
gameSelect.addEventListener('change', async () => {
  const gameId = gameSelect.value;
  if (!gameId) return;

  try {
    const resp = await fetch(`/api/locations?game_id=${gameId}`);
    allLocations = await resp.json();

    const routesResp = await fetch(`/api/game/${gameId}/routes`);
    const data = await routesResp.json();
    routes = data.routes || [];

    renderRoutes();
  } catch (err) {
    console.error(err);
    showToast('Failed to load locations or routes', { type: 'danger' });
  }
});

// ------------------ Render all routes ------------------
function renderRoutes() {
  routesContainer.innerHTML = '';
  routes.forEach((route, index) => addRouteCard(route, index));
}

// ------------------ Add a new route ------------------
addRouteBtn.addEventListener('click', async () => {
  const gameId = gameSelect.value;
  if (!gameId) return;

  try {
    // Start with empty route
    const resp = await fetch(`/api/game/${gameId}/routes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ route: [] })
    });
    const data = await resp.json();
    if (!data.success) throw new Error('Failed to add route');

    // Append to in-memory array
    routes.push(data.route);
    addRouteCard(data.route, data.route_index);
    //showToast('Route added', { duration: 2000, type: 'success' });
  } catch (err) {
    console.error(err);
    showToast('Failed to add route: ' + err.message, { type: 'danger' });
  }
});

// ------------------ Add a route card ------------------
function addRouteCard(route, index) {
  const card = routeTemplate.content.cloneNode(true);
  const routeNumberEl = card.querySelector('.route-number');
  const locationsList = card.querySelector('.locations-list');

  routeNumberEl.textContent = index + 1;

  // Populate existing locations
  route.forEach(locId => addLocationSelect(locationsList, locId, index));

  // Add location button
  card.querySelector('.add-loc-btn').addEventListener('click', () => {
    addLocationSelect(locationsList, null, index);
  });

  // Remove route button
  card.querySelector('.remove-route-btn').addEventListener('click', async () => {
    const gameId = gameSelect.value;
    if (!confirm('Are you sure you want to delete this route?')) return;

    try {
      const resp = await fetch(`/api/game/${gameId}/route/${index}`, { method: 'DELETE' });
      const data = await resp.json();
      if (!data.success) throw new Error('Failed to delete route');

      routes.splice(index, 1);
      renderRoutes();
      //showToast('Route deleted', { duration: 2000, type: 'success' });
    } catch (err) {
      console.error(err);
      showToast('Failed to delete route: ' + err.message, { type: 'danger' });
    }
  });

  routesContainer.appendChild(card);
}

// ------------------ Add a location select to a route ------------------
function addLocationSelect(container, selectedId = null, routeIndex) {
  const locNode = locationTemplate.content.cloneNode(true);
  const select = locNode.querySelector('select.location-select');

  // Populate select with all locations
  allLocations.forEach(loc => {
    const opt = document.createElement('option');
    opt.value = loc.id;
    opt.textContent = loc.name;
    if (loc.id === selectedId) opt.selected = true;
    select.appendChild(opt);
  });

  // Remove location button
  locNode.querySelector('.remove-loc-btn').addEventListener('click', async (e) => {
    const locItem = e.target.closest('.list-group-item');
    const locIdx = Array.from(container.children).indexOf(locItem);

    const gameId = gameSelect.value;
    routes[routeIndex].splice(locIdx, 1);

    try {
      const resp = await fetch(`/api/game/${gameId}/route/${routeIndex}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ route: routes[routeIndex] })
      });
      if (!resp.ok) throw new Error('Failed to update route');

      container.removeChild(locItem);
      //showToast('Location removed from route', { duration: 2000, type: 'success' });
    } catch (err) {
      console.error(err);
      showToast('Failed to update route: ' + err.message, { type: 'danger' });
    }
  });

  // Update route on change
  select.addEventListener('change', async () => {
    const locIdx = Array.from(container.children).indexOf(select.closest('.list-group-item'));
    routes[routeIndex][locIdx] = parseInt(select.value) || null;

    const gameId = gameSelect.value;
    try {
      const resp = await fetch(`/api/game/${gameId}/route/${routeIndex}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ route: routes[routeIndex] })
      });
      if (!resp.ok) throw new Error('Failed to update route');
      //showToast('Route updated', { duration: 2000, type: 'success' });
    } catch (err) {
      console.error(err);
      showToast('Failed to update route: ' + err.message, { type: 'danger' });
    }
  });

  container.appendChild(locNode);
}


// ------------------ Save all routes ------------------
saveRoutesBtn.addEventListener('click', async () => {
    const gameId = gameSelect.value;
    if (!gameId) {
        showToast('Please select a game first', { type: 'danger' });
        return;
    }

    // Get the current state of routes from the UI
    const updatedRoutes = [];
    const routeCards = routesContainer.querySelectorAll('.route-card');
    routeCards.forEach(card => {
        const route = [];
        const selects = card.querySelectorAll('.location-select');
        selects.forEach(select => {
            const locId = parseInt(select.value);
            // Only add valid location IDs
            if (!isNaN(locId) && locId !== -1) { 
                route.push(locId);
            }
        });
        updatedRoutes.push(route);
    });

    try {
        const resp = await fetch(`/api/game/${gameId}/routes/all`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ routes: updatedRoutes })
        });

        // Check for a non-200 OK status
        if (!resp.ok) {
            const errorData = await resp.json();
            throw new Error(errorData.message || 'An unknown error occurred on the server.');
        }

        const data = await resp.json();
        // The server response should contain a success message.
        showToast(data.message || 'Routes saved successfully!', { duration: 3000, type: 'success' });

        // Optional: Update the in-memory 'routes' array with the server's response
        // in case the server made any changes (e.g., reordering or validation)
        routes = data.routes || updatedRoutes;
        
    } catch (err) {
        console.error('Failed to save all routes:', err);
        showToast(`Error: ${err.message}`, { type: 'danger' });
    }
});