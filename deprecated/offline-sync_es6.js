// /static/js/offline-sync.js

import { updateUIFromState } from './findloc.js';
import { showToast } from './common-ui.js';
import { getGameState, saveState } from './localStorage.js';

const root = typeof self !== 'undefined' ? self : window;
const offlineDB = root.offlineDB;

const BACKOFF_BASE_MS = 2000;
const MAX_BACKOFF_MS = 60 * 1000;
const IS_SERVICE_WORKER = (typeof self !== 'undefined' && self.registration && self.skipWaiting);

function computeBackoff(attempts) {
    const exp = Math.min(MAX_BACKOFF_MS, BACKOFF_BASE_MS * 2 ** (attempts - 1));
    const jitter = exp * 0.25 * (Math.random() * 2 - 1);
    return Math.round(exp + jitter);
}

export async function sendOrQueue(update, { offlineDB, onSuccess, onQueued, onFailure } = {}) {
    const db = offlineDB || root.offlineDB;
    update.attempts = update.attempts || 0;
    console.log('[offlineSync] Sending update:', update);
    console.log('[Badge] Queuing update body:', update.body);

    const doQueue = async () => {
        console.log("doQueue called, offlineDB=", db);

        if (typeof root.updatePendingBadge === 'function') {
            root.updatePendingBadge();
        }

        update.attempts += 1;
        update.lastTried = Date.now();
        if (!update.id) {
            update.id = await db.addUpdate(update);
            console.log('[Badge] Queued update, id:', update.id);
            if (typeof root.updatePendingBadge === 'function') {
                root.updatePendingBadge();
            }
        }
        onQueued && onQueued(update);

        if (!IS_SERVICE_WORKER && 'serviceWorker' in navigator && 'SyncManager' in window) {
            try {
                const reg = await navigator.serviceWorker.ready;
                const tid = update.body?.team_id;
                const syncTag = tid ? `sync-found-locations-${tid}` : 'sync-found-locations';
                await reg.sync.register(syncTag);
            } catch (err) {
                console.warn('Background sync registration failed:', err);
            }
        }
    };

    if (IS_SERVICE_WORKER || (typeof navigator !== 'undefined' && navigator.onLine)) {
        try {
            update.attempts += 1;
            update.lastTried = Date.now();
            const response = await fetch(update.url, {
                method: update.method || 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(update.body)
            });

            if (response.status === 409 && update.id != null) {
                await db.deleteUpdate(update.id);
                console.warn('Update removed from queue: record deleted on server', update);
                return false;
            }

            if (!response.ok) throw new Error(`Server responded ${response.status}`);

            const data = await response.json();
            onSuccess && onSuccess(data, update);
            return true;
        } catch (err) {
            await doQueue();
            onFailure && onFailure(err, update);
            return false;
        }
    } else {
        await doQueue();
        return false;
    }
}

export async function syncAllQueuedUpdates({ offlineDB = root.offlineDB, onSuccess, onQueued, onFailure, shouldStop } = {}) {
    let successCount = 0;
    const updates = await offlineDB.getAllUpdates({ ordered: true });
    if (updates.length === 0) return successCount;

    for (const update of updates) {
        if (update.attempts > 0 && update.lastTried) {
            const delay = computeBackoff(update.attempts);
            if (Date.now() - update.lastTried < delay) continue;
        }

        try {
            const sent = await sendOrQueue(update, { offlineDB, onSuccess, onQueued, onFailure, teamId: update.body?.team_id });
            if (sent) successCount += 1;
            if (shouldStop && shouldStop()) break;
        } catch (err) {
            onFailure && onFailure(err, update);
        }
    }
    return successCount;
}

export async function fetchServerGameState(gameId, teamId, { onSuccess, onFailure } = {}) {
    try {
        const resp = await fetch(`/api/game/state?game_id=${gameId}&team_id=${teamId}`);
        if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
        const data = await resp.json();

        if (data) {
            const gameState = root.gameState;
            if (!gameState) return;

            Object.assign(gameState, data);
            
            const queued = await root.offlineDB.getAllUpdates();
            console.log('[offlineSync] Merging offline queued updates:', queued);
            queued.forEach(u => {
                if (u.body?.location_id != null) {
                    const idx = gameState.locations.findIndex(l => l.id == u.body.location_id);
                    if (idx !== -1) {
                        gameState.locations[idx].found = true;
                        if (idx >= gameState.currentIndex) gameState.currentIndex = idx + 1;
                        console.log(`[offlineSync] Offline update applied: location_id=${u.body.location_id}, index=${idx}`);
                    }
                }
            });

            if (typeof root.saveState === 'function') root.saveState();
            
            for (const u of queued) {
                if (u.id != null) {
                    await root.offlineDB.deleteUpdate(u.id);
                    console.log(`[Badge] Deleted update id=${u.id}`);
                }
            }
            
            if (typeof window !== 'undefined' && typeof window.updatePendingBadge === 'function') {
                console.log('[Badge] Calling updatePendingBadge from page context');
                window.updatePendingBadge();
            } else {
                console.log('[Badge] updatePendingBadge not available in this context (probably SW)');
            }
        }

        onSuccess && onSuccess(data);
        return data;
    } catch (err) {
        console.warn('[offlineSync] Could not fetch server game state:', err);
        onFailure && onFailure(err);
        return null;
    }
}

export async function syncWithServer({ gameId, teamId, offlineDB = root.offlineDB } = {}) {
    console.log('[offlineSync] Starting full sync with server...');

    const sentCount = await syncAllQueuedUpdates({ offlineDB, teamId });
    console.log(`[offlineSync] Sent ${sentCount} queued updates`);

    if (gameId && teamId) {
        await fetchServerGameState(gameId, teamId, {
            onSuccess: (data) => {
                console.log('[offlineSync] Server state reconciled', data);
                updateUIFromState();
            },
            onFailure: (err) => console.warn('[offlineSync] Failed to reconcile server state', err)
        });
    }
    
    if (typeof window !== 'undefined' && typeof window.updatePendingBadge === 'function') {
        window.updatePendingBadge();
        console.log('[Badge] updatePendingBadge called after full sync');
    }

    console.log('[offlineSync] Full sync complete');
    return true;
}