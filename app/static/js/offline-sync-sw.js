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

    function buildQueueKey(update) {
        if (update?.queue_key) return update.queue_key;
        if (update?.body?.queue_key) return update.body.queue_key;

        const gameId = update?.body?.game_id;
        const teamId = update?.body?.team_id;
        const locationId = update?.body?.location_id;
        if (gameId != null && teamId != null && locationId != null) {
            return `location_found:${gameId}:${teamId}:${locationId}`;
        }

        return null;
    }

    function serializeUpdateBody(body) {
        if (!(body instanceof FormData)) return body;
        return Object.fromEntries(body.entries());
    }

    async function queueOrUpdate(update, db) {
        const queueKey = buildQueueKey(update);
        const existing = (queueKey && typeof db.findUpdateByQueueKey === 'function')
            ? await db.findUpdateByQueueKey(queueKey)
            : null;

        const queuedUpdate = {
            ...(existing || {}),
            ...update,
            id: update.id ?? existing?.id,
            queue_key: queueKey,
            body: serializeUpdateBody(update.body),
            type: update.type || existing?.type || null,
            game_id: update.game_id ?? existing?.game_id ?? update.body?.game_id ?? null,
            team_id: update.team_id ?? existing?.team_id ?? update.body?.team_id ?? null,
            location_id: update.location_id ?? existing?.location_id ?? update.body?.location_id ?? null,
            sync_state: 'pending',
            last_error: null,
        };

        if (typeof db.putUpdate === 'function') {
            queuedUpdate.id = await db.putUpdate(queuedUpdate);
        } else if (!queuedUpdate.id) {
            queuedUpdate.id = await db.addUpdate(queuedUpdate);
        }

        return queuedUpdate;
    }

    async function markQueuedFailure(update, db, err) {
        const failedUpdate = {
            ...update,
            sync_state: err?.isPermanent ? 'failed' : 'pending',
            last_error: err?.message || null,
            last_error_status: err?.status || null,
            last_failure_at: Date.now(),
        };

        if (typeof db.putUpdate === 'function') {
            failedUpdate.id = await db.putUpdate(failedUpdate);
        }

        return failedUpdate;
    }

    async function parseResponsePayload(response) {
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) return null;

        try {
            return await response.json();
        } catch {
            return null;
        }
    }

    function buildResponseError(response, payload) {
        const message = payload?.error || payload?.message || `Server responded ${response.status}`;
        const err = new Error(message);
        err.status = response.status;
        err.payload = payload;
        err.isRetryable = response.status >= 500 || response.status === 429 || response.status === 401;
        err.isPermanent = !err.isRetryable;
        err.shouldDelete = response.status === 409;
        return err;
    }

    async function sendOrQueue(update, { offlineDB, onSuccess, onQueued, onFailure } = {}) {
        const db = offlineDB || root.offlineDB;
        update.attempts = update.attempts || 0;
        
        const doQueue = async () => {
            update.attempts += 1;
            update.lastTried = Date.now();
            const queuedUpdate = await queueOrUpdate(update, db);
            onQueued && onQueued(queuedUpdate);
            return queuedUpdate;
        };

        // Service Worker logic: always go to network if online, otherwise queue
        if (root.navigator && root.navigator.onLine) {
            try {
                update.attempts += 1;
                update.lastTried = Date.now();
                if (update.id && typeof db.putUpdate === 'function') {
                    await db.putUpdate(update);
                }
                const response = await fetch(update.url, {
                    method: update.method || 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(update.body),
                    credentials: 'same-origin'
                });

                const data = await parseResponsePayload(response);

                if (response.status === 409 && update.id != null) {
                    await db.deleteUpdate(update.id);
                    return true;
                }
                if (!response.ok) throw buildResponseError(response, data);

                if (update.id != null) {
                    await db.deleteUpdate(update.id);
                }
                onSuccess && onSuccess(data, update);
                return true;
            } catch (err) {
                let queuedUpdate;

                if (err?.shouldDelete && update.id != null) {
                    await db.deleteUpdate(update.id);
                    queuedUpdate = null;
                } else if (err?.isPermanent && update.id != null) {
                    queuedUpdate = await markQueuedFailure(update, db, err);
                } else {
                    queuedUpdate = await doQueue();
                }

                onFailure && onFailure(err, queuedUpdate || update);
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