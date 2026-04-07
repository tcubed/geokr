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
const prefetchPanel = document.getElementById('offline-prefetch-panel');
const downloadOfflineBundleBtn = document.getElementById('downloadOfflineBundleBtn');
const removeOfflineBundleBtn = document.getElementById('removeOfflineBundleBtn');
const offlinePrefetchStatus = document.getElementById('offline-prefetch-status');
const offlinePrefetchSummary = document.getElementById('offline-prefetch-summary');
const offlinePrefetchProgress = document.getElementById('offline-prefetch-progress');
const accountTabButtons = Array.from(document.querySelectorAll('#accountTab [data-bs-toggle="tab"]'));

const TILE_CACHE = 'tile-cache-v1';
const IMAGE_CACHE = 'image-cache-v1';
const API_CACHE = 'api-cache-v1';

function setPrefetchStatus(message, { tone = 'muted' } = {}) {
    if (!offlinePrefetchStatus) return;
    offlinePrefetchStatus.className = `small text-${tone} mb-3`;
    offlinePrefetchStatus.textContent = message;
}

function setPrefetchProgress(completed, total) {
    if (!offlinePrefetchProgress) return;
    const safeTotal = Math.max(total || 0, 1);
    const percent = total ? Math.min(100, Math.round((completed / safeTotal) * 100)) : 0;
    offlinePrefetchProgress.style.width = `${percent}%`;
    offlinePrefetchProgress.textContent = `${percent}%`;
    offlinePrefetchProgress.setAttribute('aria-valuenow', String(percent));
}

function setPrefetchBusy(isBusy) {
    if (downloadOfflineBundleBtn) downloadOfflineBundleBtn.disabled = isBusy;
    if (removeOfflineBundleBtn) removeOfflineBundleBtn.disabled = isBusy;
}

function getSelectedActiveTeamOption() {
    return activeTeamSelect?.selectedOptions?.[0] || null;
}

function updateNavbarMeta(id, value, prefix) {
    const el = document.getElementById(id);
    if (!el) return;

    if (value) {
        el.textContent = `${prefix}: ${value}`;
        el.style.display = '';
    } else {
        el.textContent = '';
        el.style.display = 'none';
    }
}

function applyThemePreviewFromOption(option) {
    if (!option) return;

    const navbar = document.getElementById('app-navbar');
    const brandIconImg = document.getElementById('brand-icon-img');
    const brandCaption = document.getElementById('brand-caption');
    const navbarColor = option.dataset.navbarColor;
    const brandIconUrl = option.dataset.brandIconUrl;
    const brandIconAlt = option.dataset.brandIconAlt;
    const gameName = option.dataset.gameName;
    const teamName = option.dataset.teamName;
    const gameId = option.dataset.gameId;

    if (navbarColor && navbar) {
        navbar.style.setProperty('--bs-primary', navbarColor);
    }

    if (brandIconUrl && brandIconImg) {
        brandIconImg.src = brandIconUrl;
    }

    if (brandIconAlt && brandIconImg) {
        brandIconImg.alt = brandIconAlt;
    }

    if (brandCaption && brandIconAlt) {
        brandCaption.textContent = brandIconAlt;
    }

    updateNavbarMeta('navbar-game-meta', gameName, 'Game');
    updateNavbarMeta('navbar-team-meta', teamName, 'Team');

    const activePrefetchGameName = document.getElementById('active-prefetch-game-name');
    const activePrefetchTeamName = document.getElementById('active-prefetch-team-name');
    if (activePrefetchGameName && gameName) {
        activePrefetchGameName.textContent = gameName;
    }
    if (activePrefetchTeamName && teamName) {
        activePrefetchTeamName.textContent = teamName;
    }

    if (prefetchPanel) {
        prefetchPanel.dataset.gameId = gameId || '';
        prefetchPanel.dataset.teamId = option.value || '';
        prefetchPanel.dataset.gameName = gameName || '';
        prefetchPanel.dataset.teamName = teamName || '';
    }
}

function syncAccountTabWithHash() {
    if (!accountTabButtons.length || !window.bootstrap?.Tab) return;

    const hash = window.location.hash?.replace(/^#/, '');
    if (!hash) return;

    const matchingButton = accountTabButtons.find((button) => {
        const target = button.getAttribute('data-bs-target') || '';
        return target === `#${hash}`;
    });

    if (matchingButton) {
        window.bootstrap.Tab.getOrCreateInstance(matchingButton).show();
    }
}

function bindAccountTabHashState() {
    if (!accountTabButtons.length) return;

    accountTabButtons.forEach((button) => {
        button.addEventListener('shown.bs.tab', (event) => {
            const target = event.target.getAttribute('data-bs-target') || '';
            const nextHash = target.replace(/^#/, '');

            if (!nextHash || nextHash === 'profile') {
                history.replaceState(null, '', window.location.pathname);
                return;
            }

            history.replaceState(null, '', `#${nextHash}`);
        });
    });

    window.addEventListener('hashchange', syncAccountTabWithHash);
    syncAccountTabWithHash();
}

function getActivePrefetchGameId() {
    const rawValue = prefetchPanel?.dataset.gameId || gameState.gameId || null;
    if (rawValue == null || rawValue === '') return null;

    const parsed = Number.parseInt(rawValue, 10);
    return Number.isNaN(parsed) ? null : parsed;
}

function normalizeAssetUrl(url) {
    if (!url) return null;
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith('/')) return url;
    return `/static/${url.replace(/^\/+/, '')}`;
}

function toAbsoluteUrl(url) {
    const normalized = normalizeAssetUrl(url);
    return normalized ? new URL(normalized, window.location.origin) : null;
}

function toCacheKey(url) {
    const absoluteUrl = toAbsoluteUrl(url);
    return absoluteUrl ? absoluteUrl.pathname : null;
}

function dedupeUrls(urls) {
    const seen = new Set();
    return urls.filter((url) => {
        const absoluteUrl = toAbsoluteUrl(url);
        if (!absoluteUrl) return false;
        const key = absoluteUrl.toString();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function getBundleImageUrls(bundle) {
    if (!bundle) return [];

    const brandingIcon = bundle.game?.branding?.icon_url;
    const locationImages = Array.isArray(bundle.locations)
        ? bundle.locations.map((location) => location.image_url)
        : [];

    return dedupeUrls([brandingIcon, ...locationImages].filter(Boolean));
}

function getBundleTileUrls(bundle) {
    return dedupeUrls(bundle?.tiles?.urls || []);
}

function updatePrefetchSummary(bundle) {
    if (!offlinePrefetchSummary) return;
    if (!bundle) {
        offlinePrefetchSummary.textContent = 'Not downloaded yet.';
        return;
    }

    const imageCount = getBundleImageUrls(bundle).length;
    const tileCount = getBundleTileUrls(bundle).length;
    const generatedAt = bundle.generated_at
        ? new Date(bundle.generated_at).toLocaleString()
        : 'unknown time';

    offlinePrefetchSummary.textContent = `Saved ${bundle.game?.name || 'game'} for ${bundle.team?.name || 'team'} · ${imageCount} images · ${tileCount} tiles · updated ${generatedAt}.`;
}

async function cacheJsonPayload(url, payload) {
    const cache = await caches.open(API_CACHE);
    const cacheKey = toCacheKey(url);
    if (!cacheKey) throw new Error('Could not build cache key for offline bundle');
    const response = new Response(JSON.stringify(payload), {
        headers: { 'Content-Type': 'application/json' }
    });
    await cache.put(cacheKey, response);
}

async function cacheAssetUrl(cacheName, url) {
    const absoluteUrl = toAbsoluteUrl(url);
    const cacheKey = toCacheKey(url);
    if (!absoluteUrl || !cacheKey) {
        throw new Error(`Invalid cache URL: ${url}`);
    }

    const isCrossOrigin = absoluteUrl.origin !== window.location.origin;
    const response = await fetch(absoluteUrl.toString(), {
        credentials: isCrossOrigin ? 'omit' : 'same-origin',
    });

    if (!response.ok && response.type !== 'opaque') {
        throw new Error(`Failed to cache ${absoluteUrl.pathname} (${response.status})`);
    }

    const cache = await caches.open(cacheName);
    await cache.put(cacheKey, response.clone());
}

async function deleteCachedUrl(cacheName, url) {
    const cacheKey = toCacheKey(url);
    if (!cacheKey) return;
    const cache = await caches.open(cacheName);
    await cache.delete(cacheKey);
}

async function fetchOfflineBundle(gameId) {
    const response = await fetch(`/api/game/${gameId}/offline_bundle`, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
    });

    if (!response.ok) {
        let message = `Failed to fetch offline bundle (${response.status})`;
        try {
            const payload = await response.json();
            message = payload?.error || payload?.message || message;
        } catch {
            // keep fallback message
        }
        throw new Error(message);
    }

    return response.json();
}

async function saveOfflineBundle(bundle) {
    if (!window.offlineDB?.saveOfflineBundle) {
        throw new Error('Offline storage is not available in this browser');
    }
    await window.offlineDB.saveOfflineBundle(bundle);
}

async function loadOfflineBundleRecord(gameId) {
    if (!window.offlineDB?.getOfflineBundleRecord || !gameId) return null;
    return window.offlineDB.getOfflineBundleRecord(gameId);
}

async function removeOfflineBundleRecord(gameId) {
    if (!window.offlineDB?.deleteOfflineBundle || !gameId) return;
    await window.offlineDB.deleteOfflineBundle(gameId);
}

function shouldConfirmCellularDownload() {
    const networkState = window.offlineSync?.getNetworkState?.({ allowCellular: false });
    if (networkState) {
        return Boolean(networkState.online && networkState.isMetered);
    }

    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!connection) return false;

    return Boolean(connection.saveData || String(connection.type || '').toLowerCase() === 'cellular');
}

async function refreshOfflinePrefetchState() {
    const gameId = getActivePrefetchGameId();
    if (!gameId) return;

    const bundle = await loadOfflineBundleRecord(gameId);
    updatePrefetchSummary(bundle?.payload || null);

    if (removeOfflineBundleBtn) {
        removeOfflineBundleBtn.disabled = !bundle;
    }

    if (bundle) {
        setPrefetchProgress(1, 1);
        setPrefetchStatus('Offline bundle is stored on this device.', { tone: 'success' });
    } else {
        setPrefetchProgress(0, 1);
        setPrefetchStatus('Ready to download offline assets.', { tone: 'muted' });
    }
}

async function downloadOfflinePackage() {
    const gameId = getActivePrefetchGameId();
    if (!gameId) {
        throw new Error('No active game is available for offline download');
    }
    if (!('caches' in window)) {
        throw new Error('Cache storage is not available in this browser');
    }
    if (!navigator.onLine) {
        throw new Error('Reconnect to the internet before downloading offline assets');
    }
    if (shouldConfirmCellularDownload()) {
        const confirmed = window.confirm('You appear to be on a cellular or data-saving connection. Offline download may use a lot of data. Continue?');
        if (!confirmed) return;
    }

    setPrefetchBusy(true);
    setPrefetchStatus('Fetching offline bundle…');
    setPrefetchProgress(0, 1);
    showToast('Downloading offline bundle to this device…', { type: 'info' });

    let bundle = null;
    let completed = 0;
    let total = 1;
    let completedSuccessfully = false;

    try {
        bundle = await fetchOfflineBundle(gameId);
        const bundleUrl = `/api/game/${gameId}/offline_bundle`;
        const imageUrls = getBundleImageUrls(bundle);
        const tileUrls = getBundleTileUrls(bundle);
        const workItems = [
            { cacheName: API_CACHE, url: bundleUrl, kind: 'bundle' },
            ...imageUrls.map((url) => ({ cacheName: IMAGE_CACHE, url, kind: 'image' })),
            ...tileUrls.map((url) => ({ cacheName: TILE_CACHE, url, kind: 'tile' })),
        ];

        total = workItems.length;
        setPrefetchProgress(completed, total);

        await saveOfflineBundle(bundle);
        await cacheJsonPayload(bundleUrl, bundle);
        completed += 1;
        setPrefetchProgress(completed, total);
        setPrefetchStatus(`Saved offline bundle metadata (${completed}/${total}).`);

        for (const item of workItems.slice(1)) {
            await cacheAssetUrl(item.cacheName, item.url);
            completed += 1;
            setPrefetchProgress(completed, total);
            setPrefetchStatus(`Cached ${item.kind} ${completed}/${total}.`);
        }

        updatePrefetchSummary(bundle);
        setPrefetchStatus('Offline bundle, images, and map tiles are ready on this device.', { tone: 'success' });
        showToast('Offline bundle downloaded successfully.', { type: 'success' });
        completedSuccessfully = true;
        await refreshOfflinePrefetchState();
    } catch (err) {
        if (bundle) {
            updatePrefetchSummary(bundle);
        }
        setPrefetchProgress(completed, total);
        setPrefetchStatus(`Offline download stopped after ${completed}/${total} items. ${err.message}`, { tone: 'danger' });
        throw err;
    } finally {
        setPrefetchBusy(false);
        if (!completedSuccessfully && removeOfflineBundleBtn) {
            const existingBundle = await loadOfflineBundleRecord(gameId);
            removeOfflineBundleBtn.disabled = !existingBundle;
        }
    }
}

async function removeOfflinePackage() {
    const gameId = getActivePrefetchGameId();
    if (!gameId) {
        throw new Error('No active game is selected');
    }

    setPrefetchBusy(true);
    setPrefetchStatus('Removing offline bundle…');

    try {
        const bundleRecord = await loadOfflineBundleRecord(gameId);
        const bundle = bundleRecord?.payload || null;
        const bundleUrl = `/api/game/${gameId}/offline_bundle`;

        await removeOfflineBundleRecord(gameId);
        await deleteCachedUrl(API_CACHE, bundleUrl);

        if (bundle) {
            for (const url of getBundleImageUrls(bundle)) {
                await deleteCachedUrl(IMAGE_CACHE, url);
            }
            for (const url of getBundleTileUrls(bundle)) {
                await deleteCachedUrl(TILE_CACHE, url);
            }
        }

        setPrefetchProgress(0, 1);
        updatePrefetchSummary(null);
        setPrefetchStatus('Offline bundle removed from this device.', { tone: 'muted' });
        showToast('Offline bundle removed.', { type: 'info' });
        await refreshOfflinePrefetchState();
    } finally {
        setPrefetchBusy(false);
    }
}

// --- Main function to switch team and synchronize state ---
export async function switchTeam(newTeamId) {
    try {
        console.log("[switchTeam] Switching team:", newTeamId);

        const selectedOption = getSelectedActiveTeamOption();
        const selectedGameId = Number.parseInt(selectedOption?.dataset.gameId || '', 10);

        // 1. Optimistically update local state for immediate UI feedback
        // This is the core of the offline-first approach.
        gameState.teamId = parseInt(newTeamId, 10);
        gameState.gameId = Number.isNaN(selectedGameId) ? null : selectedGameId;
        gameState.locations = [];
        gameState.currentIndex = 0; 
        saveState();
        updateJoinGameSelects();
        if (activeTeamSelect) activeTeamSelect.value = gameState.teamId;
        applyThemePreviewFromOption(selectedOption);
        await refreshOfflinePrefetchState().catch(() => null);

        const teamName = selectedOption?.dataset.teamName || activeTeamSelect?.selectedOptions[0]?.text || `Team ${newTeamId}`;

        showToast(`Switched active team to ${teamName}.`, { type: "info" });

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
            gameState.teamId = Number.parseInt(responseData.team?.id ?? responseData.team_id ?? newTeamId, 10);
            gameState.gameId = Number.parseInt(responseData.game?.id ?? responseData.game_id ?? selectedOption?.dataset.gameId ?? '', 10);
            gameState.locations = [];
            gameState.currentIndex = 0;
            saveState();

            updateJoinGameSelects();
            if (activeTeamSelect) activeTeamSelect.value = gameState.teamId;
            applyThemePreviewFromOption(getSelectedActiveTeamOption());
            await refreshOfflinePrefetchState().catch(() => null);

            showToast(responseData.message || "Switched teams successfully!", { type: "success" });
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
        //const teamSelect = document.getElementById('team_id');
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
                        window.location.href = '/';
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

const leaveBtn = document.getElementById('leaveTeamBtn');
if (leaveBtn) {
  leaveBtn.addEventListener('click', async () => {
    if (!confirm("Are you sure you want to leave this team?")) return;

    const teamId = leaveBtn.dataset.teamId;

    await window.offlineSync.sendOrQueue({
      url: '/api/leaveteam',
      method: 'POST',
      body: { team_id: teamId },
      timestamp: Date.now()
    }, {
      onSuccess: (data) => {
        // alert(data.message);
        // // clear local state
        // gameState.teamId = null;
        // saveState();
        // window.location.reload();

        // showToast(data.message, { type: "success" });

                gameState.teamId = null;
                gameState.gameId = null;
                gameState.locations = [];
                gameState.currentIndex = 0;
                saveState();

                showToast(data.message || 'You have left the team.', { type: 'success' });
                window.location.href = '/account#joingame';

      },
            onQueued: () => showToast('Offline: leave request queued.', { type: 'warning' }),
      onFailure: err => console.error(err)
    });
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
        window.location = '/';
    });
}

// On page load: make sure Join Game tab reflects current active team
const initialGameId = gameState.gameId || (games[0] && games[0].id);
if (initialGameId) {
    updateJoinGameSelects();
}

if (downloadOfflineBundleBtn) {
    downloadOfflineBundleBtn.addEventListener('click', async () => {
        try {
            await downloadOfflinePackage();
        } catch (err) {
            console.error('[offline-prefetch] Download failed:', err);
            setPrefetchStatus(err.message || 'Offline download failed.', { tone: 'danger' });
            showToast(err.message || 'Offline download failed.', { type: 'error' });
            setPrefetchBusy(false);
        }
    });
}

if (removeOfflineBundleBtn) {
    removeOfflineBundleBtn.addEventListener('click', async () => {
        try {
            await removeOfflinePackage();
        } catch (err) {
            console.error('[offline-prefetch] Remove failed:', err);
            setPrefetchStatus(err.message || 'Could not remove offline bundle.', { tone: 'danger' });
            showToast(err.message || 'Could not remove offline bundle.', { type: 'error' });
            setPrefetchBusy(false);
        }
    });
}

if (prefetchPanel?.dataset.gameId) {
    refreshOfflinePrefetchState().catch((err) => {
        console.error('[offline-prefetch] State refresh failed:', err);
        setPrefetchStatus('Could not load offline bundle status.', { tone: 'danger' });
    });
}

applyThemePreviewFromOption(getSelectedActiveTeamOption());
bindAccountTabHashState();