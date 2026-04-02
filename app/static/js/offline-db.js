// /static/js/offline-db.js

(function (root) {
  const offlineDB = (() => {
  const DB_NAME = 'geo-game-db';
  const UPDATE_STORE_NAME = 'updates';
  const BUNDLE_STORE_NAME = 'bundles';
  const VERSION = 3;

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        let updateStore;

        if (!db.objectStoreNames.contains(UPDATE_STORE_NAME)) {
          updateStore = db.createObjectStore(UPDATE_STORE_NAME, { keyPath: 'id', autoIncrement: true });
          updateStore.createIndex('by_timestamp', 'timestamp', { unique: false });
        } else {
          updateStore = e.target.transaction.objectStore(UPDATE_STORE_NAME);
        }

        if (updateStore && !updateStore.indexNames.contains('by_queue_key')) {
          updateStore.createIndex('by_queue_key', 'queue_key', { unique: false });
        }

        if (updateStore && !updateStore.indexNames.contains('by_type')) {
          updateStore.createIndex('by_type', 'type', { unique: false });
        }

        if (updateStore && !updateStore.indexNames.contains('by_team_id')) {
          updateStore.createIndex('by_team_id', 'team_id', { unique: false });
        }

        if (!db.objectStoreNames.contains(BUNDLE_STORE_NAME)) {
          const bundleStore = db.createObjectStore(BUNDLE_STORE_NAME, { keyPath: 'game_id' });
          bundleStore.createIndex('by_team_id', 'team_id', { unique: false });
          bundleStore.createIndex('by_downloaded_at', 'downloaded_at', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => console.warn('IndexedDB open blocked; close other tabs if any.');
    });
  }

  function promisifyRequest(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function promisifyTransaction(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
      tx.onerror = () => reject(tx.error);
    });
  }

  function normalizeBundleRecord(bundle) {
    const gameId = bundle?.game?.id;
    if (!gameId) {
      throw new Error('Offline bundle must include game.id');
    }

    return {
      game_id: gameId,
      team_id: bundle?.team?.id ?? null,
      bundle_version: bundle?.bundle_version ?? 1,
      generated_at: bundle?.generated_at ?? null,
      downloaded_at: Date.now(),
      payload: bundle,
    };
  }

  async function addUpdate(update) {
    const db = await openDB();
    const tx = db.transaction(UPDATE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(UPDATE_STORE_NAME);
    const req = store.add(update);
    const id = await promisifyRequest(req);
    await promisifyTransaction(tx);
    return id;  // <-- ensure your sync code gets update.id
  }

  async function putUpdate(update) {
    const db = await openDB();
    const tx = db.transaction(UPDATE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(UPDATE_STORE_NAME);
    const req = store.put(update);
    const id = await promisifyRequest(req);
    await promisifyTransaction(tx);
    return id;
  }

  async function getAllUpdates({ ordered = true } = {}) {
    const db = await openDB();
    const tx = db.transaction(UPDATE_STORE_NAME, 'readonly');
    const store = tx.objectStore(UPDATE_STORE_NAME);
    let req;
    if (ordered) {
        try {
        const idx = store.index('by_timestamp');
        req = idx.getAll();
        } catch (err) {
        console.warn('Index missing, falling back to unordered getAll:', err);
        req = store.getAll();
        }
    } else {
        req = store.getAll();
    }
    const results = await promisifyRequest(req);
    return results;
    }


  async function deleteUpdate(id) {
    const db = await openDB();
    const tx = db.transaction(UPDATE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(UPDATE_STORE_NAME);
    store.delete(id);
    await promisifyTransaction(tx);
  }

  async function findUpdateByQueueKey(queueKey) {
    if (!queueKey) return null;

    const db = await openDB();
    const tx = db.transaction(UPDATE_STORE_NAME, 'readonly');
    const store = tx.objectStore(UPDATE_STORE_NAME);

    try {
      const index = store.index('by_queue_key');
      const req = index.getAll(queueKey);
      const matches = await promisifyRequest(req);
      return matches && matches.length ? matches[0] : null;
    } catch (err) {
      console.warn('Queue-key index missing, falling back to scan:', err);
      const req = store.getAll();
      const updates = await promisifyRequest(req);
      return updates.find(update => update.queue_key === queueKey) || null;
    }
  }

  async function clearAll() {
    const db = await openDB();
    const tx = db.transaction(UPDATE_STORE_NAME, 'readwrite');
    tx.objectStore(UPDATE_STORE_NAME).clear();
    await promisifyTransaction(tx);
  }

  async function count() {
    const db = await openDB();
    const tx = db.transaction(UPDATE_STORE_NAME, 'readonly');
    const store = tx.objectStore(UPDATE_STORE_NAME);
    const req = store.count();
    return await promisifyRequest(req);
  }

  async function saveOfflineBundle(bundle) {
    const record = normalizeBundleRecord(bundle);
    const db = await openDB();
    const tx = db.transaction(BUNDLE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(BUNDLE_STORE_NAME);
    store.put(record);
    await promisifyTransaction(tx);
    return record;
  }

  async function getOfflineBundle(gameId) {
    const db = await openDB();
    const tx = db.transaction(BUNDLE_STORE_NAME, 'readonly');
    const store = tx.objectStore(BUNDLE_STORE_NAME);
    const req = store.get(gameId);
    const record = await promisifyRequest(req);
    return record ? record.payload : null;
  }

  async function getOfflineBundleRecord(gameId) {
    const db = await openDB();
    const tx = db.transaction(BUNDLE_STORE_NAME, 'readonly');
    const store = tx.objectStore(BUNDLE_STORE_NAME);
    const req = store.get(gameId);
    return await promisifyRequest(req);
  }

  async function deleteOfflineBundle(gameId) {
    const db = await openDB();
    const tx = db.transaction(BUNDLE_STORE_NAME, 'readwrite');
    tx.objectStore(BUNDLE_STORE_NAME).delete(gameId);
    await promisifyTransaction(tx);
  }

  async function listOfflineBundles() {
    const db = await openDB();
    const tx = db.transaction(BUNDLE_STORE_NAME, 'readonly');
    const store = tx.objectStore(BUNDLE_STORE_NAME);
    const req = store.getAll();
    const records = await promisifyRequest(req);
    return records.map(record => ({
      game_id: record.game_id,
      team_id: record.team_id,
      bundle_version: record.bundle_version,
      generated_at: record.generated_at,
      downloaded_at: record.downloaded_at,
      game_name: record.payload?.game?.name ?? null,
    }));
  }

  return {
    addUpdate,
    putUpdate,
    getAllUpdates,
    deleteUpdate,
    findUpdateByQueueKey,
    clearAll,
    count,
    saveOfflineBundle,
    getOfflineBundle,
    getOfflineBundleRecord,
    deleteOfflineBundle,
    listOfflineBundles,
  };
})();

root.offlineDB = offlineDB;
})(typeof self !== 'undefined' ? self : window);

