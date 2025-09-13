// /static/js/offline-sync-sw.js

(function (root) {
    const defaultDB = root.offlineDB;

    const BACKOFF_BASE_MS = 2000;
    const MAX_BACKOFF_MS = 60 * 1000;

    function computeBackoff(attempts) {
        const exp = Math.min(MAX_BACKOFF_MS, BACKOFF_BASE_MS * 2 ** (attempts - 1));
        const jitter = exp * 0.25 * (Math.random() * 2 - 1);
        return Math.round(exp + jitter);
    }

    async function sendOrQueue(update, { offlineDB, onSuccess, onQueued, onFailure } = {}) {
        const db = offlineDB || root.offlineDB;
        update.attempts = update.attempts || 0;
        
        const doQueue = async () => {
            update.attempts += 1;
            update.lastTried = Date.now();
            if (!update.id) {
                update.id = await db.addUpdate(update);
            }
            onQueued && onQueued(update);
        };

        // Service Worker logic: always go to network if online, otherwise queue
        if (root.navigator && root.navigator.onLine) {
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

    async function syncAllQueuedUpdates({ offlineDB = defaultDB, onSuccess, onFailure, shouldStop } = {}) {
        let successCount = 0;
        const updates = await offlineDB.getAllUpdates({ ordered: true });
        if (updates.length === 0) return successCount;

        for (const update of updates) {
            if (update.attempts > 0 && update.lastTried) {
                const delay = computeBackoff(update.attempts);
                if (Date.now() - update.lastTried < delay) continue;
            }
            try {
                const sent = await sendOrQueue(update, { offlineDB, onSuccess, onFailure });
                if (sent) {
                    successCount += 1;
                    // Inform the page that an update was sent so it can update its UI
                    self.clients.matchAll().then(clients => {
                        clients.forEach(client => {
                            client.postMessage({ type: 'UPDATE_SENT', id: update.id, teamId: update.body?.team_id });
                        });
                    });
                }
                if (shouldStop && shouldStop()) break;
            } catch (err) {
                onFailure && onFailure(err, update);
            }
        }
        return successCount;
    }
    
    // Expose only the necessary functions globally for the Service Worker
    root.offlineSyncSW = {
        syncAllQueuedUpdates,
        sendOrQueue,
        computeBackoff,
    };

})(self);