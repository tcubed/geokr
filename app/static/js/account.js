// account.js

import { gameState, saveState } from "./localStorage.js";
import { showToast } from "./common-ui.js";

// Global window variables from base.html
const teamsByGame = window.TEAMS_BY_GAME || {};
const games = window.GAMES || [];

// DOM elements
const gameSelect = document.getElementById('game_id');
const teamSelect = document.getElementById('team_id');
const activeTeamSelect = document.getElementById('active_team_select');

// --- Main function to switch team and synchronize state ---
export async function switchTeam(newTeamId) {
    try {
        console.log("[switchTeam] Switching team:", newTeamId);

        // 1. Optimistically update local state for immediate UI feedback
        // This is the core of the offline-first approach.
        gameState.teamId = parseInt(newTeamId, 10);
        // Resetting game-specific state
        //gameState.gameId = null; 
        //gameState.locations = []; 
        gameState.currentIndex = 0; 
        saveState();
        updateJoinGameSelects();
        if (activeTeamSelect) activeTeamSelect.value = gameState.teamId;

         // --- Show toast immediately ---
        const teamName = activeTeamSelect.selectedOptions[0]?.text || `Team ${teamId}`;
        showToast(`Now on ${teamName}`, { type: "info" });

        // 2. Prepare payload for server synchronization
        const payload = { team_id: newTeamId };
        const update = {
            url: `/api/switch_team`,
            method: "POST",
            body: payload,
            timestamp: Date.now()
        };

        // 3. Send/Queue the update. `await` ensures we wait for a response if online.
        const responseData = await window.offlineSync.sendOrQueue(update, {
            onQueued: () => {
                showToast("Team switch saved locally; will sync when online.", { type: "warning" });
                // No redirection here, as they're not fully ready to play.
            },
            onFailure: (err) => {
                console.error("[switchTeam] Failed to switch team:", err);
                showToast("Failed to switch team; action queued for retry.", { type: "error" });
            }
        });

        // 4. If online and successful, update with authoritative server data
        if (responseData && responseData.success) {
            console.log("[switchTeam] Server acknowledged team switch and provided game data.");

            // Update local state with authoritative info from the server
            gameState.teamId = responseData.team.id;
            gameState.gameId = responseData.game.id;
            gameState.locations = responseData.locations;
            gameState.currentIndex = responseData.current_index;
            saveState();

            updateJoinGameSelects();
            if (activeTeamSelect) activeTeamSelect.value = gameState.teamId;

            showToast(responseData.message || "Switched teams successfully!", { type: "success" });

            // Now that we have the full game data, redirect to the main game page.
            window.location.href = '/findloc';
        }

    } catch (err) {
        console.error("[switchTeam] Unexpected error:", err);
        showToast("Error switching team.", { type: "error" });
    }
}

// --- Join Game Tab Dropdown Prepopulation ---
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

function updateJoinGameSelects() {
    if (!gameSelect || !teamSelect) return;
    const selectedGameId = gameState.gameId || (games[0] && games[0].id);
    gameSelect.value = selectedGameId;
    populateTeams(selectedGameId);
}

// --- Event Listeners ---
// Switch Game Select Listener
if (activeTeamSelect) {
    activeTeamSelect.value = gameState.teamId || '';
    activeTeamSelect.addEventListener('change', async () => {
        const newTeamId = activeTeamSelect.value;
        if (!newTeamId) return;
        await switchTeam(newTeamId);
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
    populateTeams(gameSelect.value);
    gameSelect.addEventListener('change', () => populateTeams(gameSelect.value));
}

// Join Game Form Submit
const joinForm = document.getElementById('joinGameForm');
if (joinForm) {
    joinForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const gameId = gameSelect.value;
        const teamSelect = document.getElementById('team_id');
        const teamId = teamSelect.value || null;
        const newTeamInput = document.getElementById('new_team_name');
        const newTeamName = newTeamInput.value.trim() || null;
        
        if (!teamId && !newTeamName) {
            return showToast('Please select a team or enter a new team name.', { type: 'danger' });
        }

        // 🌟 Conditionally build the body
        let bodyData = { game_id: gameId };
        if (newTeamName) {
            bodyData.new_team_name = newTeamName;
        } else {
            bodyData.team_id = teamId;
        }

        try {
            await window.offlineSync.sendOrQueue({
                url: '/api/joingame',
                method: 'POST',
                credentials:'include', 
                body: bodyData, // 🌟 Use the conditionally built object
                timestamp: Date.now()
            }, {
                onSuccess: (data) => {
                    if (data.success) {
                        gameState.teamId = data.team_id;
                        gameState.gameId = gameId;
                        saveState();
                        updateJoinGameSelects();

                        if (data.already_on_team) {
                        // User is already on a team, show info but stay on page
                        showToast(data.message || 'You are already on this team.', { type: 'info' });
                        } else {
                        // Fresh join or new team
                        showToast(data.message || 'Joined game successfully!', { type: 'success' });
                        // Redirect to main game page
                        window.location.href = '/findloc';
                        }
                    } else {
                        showToast(data.message || 'Failed to join game.', { type: 'danger' });
                    }
                },
                onQueued: () => {
                    showToast('Offline: join/create action saved locally and will sync later.', { type: 'info' });
                    //window.location.href = '/findloc';
                    updateJoinGameSelects();
                },
                onFailure: (err) => console.error('Join game failed:', err)
            });
        } catch (err) {
            console.error('Unexpected error in joinForm submit:', err);
            showToast('Unexpected error joining game.', { type: 'danger' });
        }
    });
}


// Options Save Form
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