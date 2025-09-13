// /static/js/offline-db.js

(function (root) {
  const offlineDB = (() => {
  const DB_NAME = 'geo-game-db';
  const STORE_NAME = 'updates';
  const VERSION = 1;

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        // index by timestamp to allow ordered retrieval
        store.createIndex('by_timestamp', 'timestamp', { unique: false });
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

  async function addUpdate(update) {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.add(update);
    const id = await promisifyRequest(req);
    await promisifyTransaction(tx);
    return id;  // <-- ensure your sync code gets update.id
  }

  async function getAllUpdates({ ordered = true } = {}) {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
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
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    await promisifyTransaction(tx);
  }

  async function clearAll() {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    await promisifyTransaction(tx);
  }

  async function count() {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.count();
    return await promisifyRequest(req);
  }

  return {
    addUpdate,
    getAllUpdates,
    deleteUpdate,
    clearAll,
    count
  };
})();

root.offlineDB = offlineDB;
})(typeof self !== 'undefined' ? self : window);

//window.offlineDB = offlineDB;

// extra safety
if (typeof window !== 'undefined') {
  window.offlineDB = offlineDB;
}
if (typeof self !== 'undefined') {
  self.offlineDB = offlineDB;
}
