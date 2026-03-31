// account.js
import { gameState, saveState} from "./localStorage.js";
import { showToast } from "./common-ui.js";
//import { sendOrQueue } from "./offline-sync.js";

// Global window variables from base.html
const teamsByGame = window.TEAMS_BY_GAME || {};
const games = window.GAMES || [];

// DOM elements
// --- Join Game Tab Dropdown Prepopulation ---
const gameSelect = document.getElementById('game_id');
const teamSelect = document.getElementById('team_id');
const activeTeamSelect = document.getElementById('active_team_select'); // Switch Game tab

// --- Main function to switch team and synchronize state ---
export async function switchTeam(newTeamId) {
  try {
    console.log("[switchTeam] Switching team:", newTeamId);

    // --- Offline-first local update ---
    gameState.teamId = parseInt(newTeamId, 10);
    gameState.currentIndex = 0; // reset progress for new team
    window.gameStorage.saveState();
    console.log("[switchTeam] Local state updated and saved");

    // --- Prepare payload for server ---
    const payload = {team_id: newTeamId,game_id: gameState.gameId};
    const update = {url: `/api/switch_team/${newTeamId}`,method: "POST",body: payload,timestamp: Date.now()};

    await window.offlineSync.sendOrQueue(update, {
      onSuccess: (data) => {
        console.log("[switchTeam] Server acknowledged team switch:", data);
        
        // Update local state with authoritative info from server if provided
        gameState.teamId = data.team_id; // local
        if (data.game_id) {gameState.gameId = data.game_id;}
        window.gameStorage.saveState();

        updateJoinGameSelects();
        if (activeTeamSelect) activeTeamSelect.value = gameState.teamId;
        showToast(data.message || "Switched teams successfully!", { type: "success" });

        // Optional: redirect or update UI
        //window.location.reload(); // refresh UI for new team
      },
      onQueued: () => {
        console.log("[switchTeam] Offline: queued team switch");
        showToast("Team switch saved locally; will sync when online.", { type: "warning" });
      },
      onFailure: (err, updateObj) => {
        console.error("[switchTeam] Failed to switch team:", err);
        showToast("Failed to switch team; action queued for retry.", { type: "error" });
      }
    });

  } catch (err) {
    console.error("[switchTeam] Unexpected error:", err);
    showToast("Error switching team.", { type: "error" });
  }
}

// Populate teams for selected game
function populateTeams(selectedGameId) {
  const teams = teamsByGame[String(selectedGameId)] || [];
  if (!teamSelect) return;
  teamSelect.innerHTML = '';
  teams.forEach(team => {
    const option = document.createElement('option');
    option.value = team.id;
    option.textContent = team.name;
    if (gameState.teamId && gameState.teamId == team.id) option.selected = true;
    teamSelect.appendChild(option);
  });
}

// Update Join Game tab selects to match current state
function updateJoinGameSelects() {
  if (!gameSelect || !teamSelect) return;
  const selectedGameId = gameState.gameId || (games[0] && games[0].id);
  gameSelect.value = selectedGameId;
  populateTeams(selectedGameId);
}

// --- Switch Game Select Listener ---
if (activeTeamSelect) {
  activeTeamSelect.value = gameState.teamId || '';
  activeTeamSelect.addEventListener('change', async () => {
    const newTeamId = activeTeamSelect.value;
    if (!newTeamId) return;
    await switchTeam(newTeamId);

    // Update Join Game selects after switch
    updateJoinGameSelects();
  });
}

// Populate games dropdown and set selected
if (gameSelect) {
  gameSelect.innerHTML = '';
  games.forEach(game => {
    const option = document.createElement('option');
    option.value = game.id;
    option.textContent = game.name;
    if (gameState.gameId && gameState.gameId == game.id) option.selected = true;
    gameSelect.appendChild(option);
  });

  // Initial populate of teams
  populateTeams(gameSelect.value);

  // Update teams when game changes
  gameSelect.addEventListener('change', () => populateTeams(gameSelect.value));
}

// --- Join Game Form Submit ---
const joinForm = document.getElementById('joinGameForm');
if (joinForm) {
  joinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newTeamInput = document.getElementById('new_team_name');
    const gameId = gameSelect.value;
    const teamId = teamSelect.value || null;
    const newTeamName = newTeamInput.value.trim() || null;
    if (!teamId && !newTeamName) return alert('Please select a team or enter a new team name.');
    await sendOrQueue({
      url: '/api/joingame',
      method: 'POST',
      body: { game_id: gameId, team_id: teamId, new_team_name: newTeamName },
      timestamp: Date.now()
    }, {
      onSuccess: (data) => {
        if (data.success) window.location.href = '/';
        else alert(data.message || 'Failed to join game.');
      },
      onQueued: () => alert('Offline: join/create action saved locally and will sync later.'),
      onFailure: (err) => console.error('Join game failed:', err)
    });
  });
}

// --- Options Save Form ---
const optionsForm = document.getElementById('options-form');
if (optionsForm) {
  optionsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const debug = document.getElementById('debug_mode').checked ? '1' : '';
    const locationMode = document.getElementById('location_mode').value;
    const defaultPos = document.getElementById('default_pos_mode').checked ? '1' : '';
    document.cookie = `debug_mode=${debug};path=/;max-age=31536000`;
    document.cookie = `location_mode=${locationMode};path=/;max-age=31536000`;
    document.cookie = `default_pos_mode=${defaultPos};path=/;max-age=31536000`;
    const mapperBox = document.getElementById('mapper_mode');
    if (mapperBox) document.cookie = `mapper_mode=${mapperBox.checked ? '1' : ''};path=/;max-age=31536000`;
    window.location = '/findloc';
  });
}

// On page load: make sure Join Game tab reflects current active team
const initialGameId = gameState.gameId || (games[0] && games[0].id);
if (initialGameId) {
  updateJoinGameSelects();
}



// **Wrapper with UI handling**
// window.switchTeam = async function(teamId) {
//   const prevActive = document.querySelector("#team-list li button:disabled");
//   if (prevActive) {
//     prevActive.disabled = false;
//     prevActive.textContent = "Switch";
//   }

//   // Offline-first switch
//   await switchTeam(teamId);

//   // Update UI immediately
//   const newActiveBtn = document.querySelector(`#team-list li[data-team-id="${teamId}"] button`);
//   if (newActiveBtn) {
//     newActiveBtn.disabled = true;
//     newActiveBtn.textContent = "Active";
//   }
// };

// // at the bottom of account.js
// document.querySelectorAll("#team-list li button").forEach(btn => {
//   btn.addEventListener("click", async () => {
//     const teamId = btn.closest("li").dataset.teamId;
//     btn.disabled = true;
//     await window.switchTeam(teamId);
//   });
// });


// async function switchTeamOnline(newTeamId) {
//   try {
//     console.log("[switchTeamOnline] Switching team:", newTeamId);

//     // --- Make sure user is online ---
//     if (!navigator.onLine) {
//       showToast("You must be online to switch teams.", { type: "error" });
//       return;
//     }

//     const payload = { team_id: newTeamId, game_id: gameState.gameId };

//     const resp = await fetch(`/api/switch_team/${newTeamId}`, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify(payload)
//     });

//     const data = await resp.json();

//     if (!data.success) {
//       showToast(data.message || "Failed to switch team.", { type: "error" });
//       return;
//     }

//     // --- Update local state ---
//     gameState.teamId = data.team_id;
//     if (data.game_id) gameState.gameId = data.game_id;
//     gameState.currentIndex = 0; // reset progress for new team
//     window.gameStorage.saveState();

//     showToast(data.message || "Switched teams successfully!", { type: "success" });

//     // Optional: reload to load new assets
//     window.location.reload();

//   } catch (err) {
//     console.error("[switchTeamOnline] Error:", err);
//     showToast("Error switching team.", { type: "error" });
//   }
// }

// // Attach to buttons
// document.querySelectorAll("#team-list li button").forEach(btn => {
//   btn.addEventListener("click", async () => {
//     const teamId = btn.closest("li").dataset.teamId;
//     await switchTeamOnline(teamId);
//   });
// });


