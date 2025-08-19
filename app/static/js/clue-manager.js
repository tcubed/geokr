// static/js/clue-manager.js
//import { gameState, gameId,loadState, saveState } from './localStorage.js';

// Import game storage from your other ES module file (adjust path as needed)
import { gameState, loadState, saveState } from './localStorage.js';
//import { startTracking,stopTracking } from './map.js';

import { initPositionTracking, stopPositionTracking } from './position-provider.js';


// Assuming GAME_DATA is globally available or imported similarly
const gameId = window.GAME_DATA && window.GAME_DATA.gameId;

function onPositionUpdate(position) {
  if (!position) {
    console.warn("No position available");
    // fallback clue validation logic here if needed
    return;
  }
  const lat = position.coords.latitude;
  const lon = position.coords.longitude;

  // Your existing clue validation logic here,
  // e.g., fetch clues, update markers, etc.
}

export function startClueTracking() {
  initPositionTracking(onPositionUpdate);
}

export function stopClueTracking() {
  stopPositionTracking();
}



export function showCurrentClue() {
  if (!gameState) return;

  const loc = gameState.locations[gameState.currentIndex];
  const clueContainer = document.getElementById('clue-container');

  if (loc && clueContainer) {
    clueContainer.innerHTML = `
      <h4>Clue #${gameState.currentIndex + 1}</h4>
      <p>${loc.clue_text}</p>
      ${loc.image_url ? `<img src="${loc.image_url}" alt="Clue image" style="max-width:100%;">` : ''}
    `;
  } else if (clueContainer) {
    clueContainer.innerHTML = `<p>No more clues available.</p>`;
  }
}

export function renderCluePins(clues) {
  clueMarkers.forEach(m => map.removeLayer(m));
  clueMarkers = [];

  clues.forEach(clue => {
    if (clue.latitude && clue.longitude) {
      const marker = L.marker([clue.latitude, clue.longitude], {
        icon: redIcon,
        zIndexOffset: 1000,
      }).addTo(map);

      marker.bindPopup(`${clue.name}: ${defaultPosMode ? clue.clue : 'Get closer to unlock this clue!'}`);
      marker.on('click', () => marker.openPopup());

      clueMarkers.push(marker);
    }
  });
}

export function checkProximity(lat, lon, clues) {
  if (defaultPosMode) return; // skip proximity checks in default mode

  const visited = JSON.parse(localStorage.getItem('visited_locations') || '[]');

  clues.forEach(clue => {
    if (clue.latitude && clue.longitude) {
      const distance = haversine(lat, lon, clue.latitude, clue.longitude);

      if (distance <= distanceThreshold && !visited.includes(clue.id)) {
        visited.push(clue.id);
        localStorage.setItem('visited_locations', JSON.stringify(visited));
        window.location = `/location/${clue.id}`;
      }
    }
  });
}


// export function renderClues(lat, lon, clues) {
//   clueMarkers.forEach(m => map.removeLayer(m));
//   clueMarkers = [];

//   clues.forEach(clue => {
//     if (clue.latitude && clue.longitude) {
//       const distance = haversine(lat, lon, clue.latitude, clue.longitude);
//       const clueMarker = L.marker([clue.latitude, clue.longitude], {
//         icon: redIcon,
//         zIndexOffset: 1000
//       }).addTo(map);

//       if (!defaultPosMode && distance <= distanceThreshold) {
//         let visited = JSON.parse(localStorage.getItem('visited_locations') || '[]');
//         if (!visited.includes(clue.id)) {
//           visited.push(clue.id);
//           localStorage.setItem('visited_locations', JSON.stringify(visited));
//           window.location = `/location/${clue.id}`;
//         } else {
//           clueMarker.bindPopup(`${clue.name}: ${clue.clue}`);
//           clueMarker.on('click', () => window.location = `/location/${clue.id}`);
//         }
//       } else {
//         clueMarker.bindPopup(`${clue.name}: ${defaultPosMode ? clue.clue : 'Get closer to unlock this clue!'}`);
//         clueMarker.on('click', function () { this.openPopup(); });
//       }

//       clueMarkers.push(clueMarker);
//     }
//   });
// }

export async function getCluesFromPosition(position) {
  const lat = position.coords.latitude;
  const lon = position.coords.longitude;
  const accuracy = position.coords.accuracy;
  latestPosition = position;

  const posTime = new Date(position.timestamp);
  const now = new Date();
  const diff = Math.round((now - posTime) / 1000);
  const nowMs = Date.now();

  if (debugMode && (nowMs - lastDebugAlertTime > 30000)) {
    alert(`Position timestamp: ${posTime}\nAge: ${diff}s old\nPos: (${lat.toFixed(3)}, ${lon.toFixed(3)})\nAccuracy: ${accuracy.toFixed(1)}m`);
    lastDebugAlertTime = nowMs;
  }

  showMap(lat, lon);

  const response = await fetch('/api/locations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latitude: lat, longitude: lon, game_id: gameId })
  });

  const clues = await response.json();
  renderClues(lat, lon, clues);
}

export async function startClueTracking_legacy() {
  if (!gameId) {
    alert('No game selected.');
    return;
  }

  if (defaultPosMode) {
    const response = await fetch('/api/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game_id: gameId })
    });

    const clues = await response.json();
    if (clues.length > 0) {
      const { latitude: lat, longitude: lon } = clues[0];
      //showMap(lat, lon);
      //renderClues(lat, lon, clues);
    }
    return;
  }

  if (!navigator.geolocation) {
    alert("Geolocation not supported.");
    return;
  }

  // Delegate to your existing tracking infrastructure
  startTracking(getCluesFromPosition);
}

// export async function initGame() {
//   loadState();
//   showCurrentClue();

//   // Setup "Found" button handler
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
// }

// Attach public API to global

// async function getCluesFromPosition(position) {
//   const lat = position.coords.latitude;
//   const lon = position.coords.longitude;
//   const accuracy = position.coords.accuracy;
//   latestPosition = position;

//   const posTime = new Date(position.timestamp);
//   const now = new Date();
//   const diff = Math.round((now - posTime) / 1000);
//   const nowMs = Date.now();

//   if (debugMode && (nowMs - lastDebugAlertTime > 30000)) {
//     alert(`Position timestamp: ${posTime}\nAge: ${diff}s old\nPos: (${lat.toFixed(3)}, ${lon.toFixed(3)})\nAccuracy: ${accuracy.toFixed(1)}m`);
//     lastDebugAlertTime = nowMs;
//   }

//   showMap(lat, lon);

//   const response = await fetch('/api/locations', {
//     method: 'POST',
//     headers: {'Content-Type': 'application/json'},
//     body: JSON.stringify({ latitude: lat, longitude: lon, game_id: gameId })
//   });

//   const clues = await response.json();

//   clueMarkers.forEach(m => map.removeLayer(m));
//   clueMarkers = [];

//   clues.forEach(clue => {
//     if (clue.latitude && clue.longitude) {
//       const distance = haversine(lat, lon, clue.latitude, clue.longitude);
//       const clueMarker = L.marker([clue.latitude, clue.longitude], { icon: redIcon, zIndexOffset: 1000 }).addTo(map);

//       if (distance <= distanceThreshold) {
//         let visited = JSON.parse(localStorage.getItem('visited_locations') || '[]');
//         if (!visited.includes(clue.id)) {
//           visited.push(clue.id);
//           localStorage.setItem('visited_locations', JSON.stringify(visited));
//           window.location = `/location/${clue.id}`;
//         } else {
//           clueMarker.bindPopup(`${clue.name}: ${clue.clue}`);
//           clueMarker.on('click', () => window.location = `/location/${clue.id}`);
//         }
//       } else {
//         clueMarker.bindPopup(`${clue.name}: Get closer to unlock this clue!`);
//         clueMarker.on('click', function() { this.openPopup(); });
//       }

//       clueMarkers.push(clueMarker);
//     }
//   });
// }

// async function getClues() {
//   if (!gameId) {
//     alert('No game selected.');
//     return;
//   }

//   if (defaultPosMode) {
//     const response = await fetch('/api/locations', {
//       method: 'POST',
//       headers: {'Content-Type': 'application/json'},
//       body: JSON.stringify({ game_id: gameId })
//     });

//     const clues = await response.json();
//     if (clues.length > 0) {
//       const { latitude: lat, longitude: lon } = clues[0];
//       showMap(lat, lon);
//       clueMarkers.forEach(m => map.removeLayer(m));
//       clueMarkers = [];

//       clues.forEach(clue => {
//         if (clue.latitude && clue.longitude) {
//           const clueMarker = L.marker([clue.latitude, clue.longitude], { icon: redIcon, zIndexOffset: 1000 }).addTo(map);
//           clueMarker.bindPopup(`${clue.name}: ${clue.clue}`);
//           clueMarker.on('click', () => window.location = `/location/${clue.id}`);
//           clueMarkers.push(clueMarker);
//         }
//       });
//     }
//     return;
//   }

//   if (!navigator.geolocation) {
//     alert("Geolocation not supported.");
//     return;
//   }

//   if (watchPosition) {
//     if (watchId !== null) navigator.geolocation.clearWatch(watchId);
//     watchId = navigator.geolocation.watchPosition(
//       getCluesFromPosition,
//       err => alert("Geolocation error: " + err.message),
//       { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
//     );
//   } else {
//     navigator.geolocation.getCurrentPosition(
//       getCluesFromPosition,
//       err => alert("Geolocation error: " + err.message),
//       { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
//     );
//   }
// }


