// switchTeam.js
import { gameState} from "./localStorage.js";
//import { sendOrQueue } from "./offline-sync.js";

export async function switchTeam(newTeamId) {
  try {
    console.log("[switchTeam] Switching team:", newTeamId);

    // --- Offline-first local update ---
    gameState.teamId = newTeamId;
    gameState.currentIndex = 0; // reset progress for new team
    window.gameStorage.saveState();
    console.log("[switchTeam] Local state updated and saved");

    // --- Prepare payload for server ---
    const payload = {
      team_id: newTeamId,
      game_id: gameState.gameId
    };

    const update = {
      url: `/api/switch_team/${newTeamId}`,
      method: "POST",
      body: payload,
      timestamp: Date.now()
    };

    await window.offlineSync.sendOrQueue(update, {
      onSuccess: (data) => {
        console.log("[switchTeam] Server acknowledged team switch:", data);
        showToast(data.message || "Switched teams successfully!", { type: "success" });

        // Update local state with authoritative info from server if provided
        if (data.game_id) {
          gameState.gameId = data.game_id;
          window.gameStorage.saveState();
        }

        // Optional: redirect or update UI
        window.location.reload(); // refresh UI for new team
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

window.switchTeam = async function(teamId) {
  const prevActive = document.querySelector("#team-list li button:disabled");
  if (prevActive) {
    prevActive.disabled = false;
    prevActive.textContent = "Switch";
  }

  // Offline-first switch
  await switchTeam(teamId);

  // Update UI immediately
  const newActiveBtn = document.querySelector(`#team-list li[data-team-id="${teamId}"] button`);
  if (newActiveBtn) {
    newActiveBtn.disabled = true;
    newActiveBtn.textContent = "Active";
  }
};