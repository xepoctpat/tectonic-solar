// ===== INDEXEDDB PERSISTENCE LAYER =====
// Store historical storms and earthquakes for 90-day rolling window

const DB_NAME = 'tectonic-solar';
const DB_VERSION = 1;
const STORES = {
  STORMS: 'storms',
  EARTHQUAKES: 'earthquakes',
};

let db = null;

/**
 * Initialize IndexedDB
 * @returns {Promise<IDBDatabase>}
 */
export async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      // Create storms store
      if (!database.objectStoreNames.contains(STORES.STORMS)) {
        const stormStore = database.createObjectStore(STORES.STORMS, { keyPath: 'id', autoIncrement: true });
        stormStore.createIndex('date', 'date', { unique: false });
      }

      // Create earthquakes store
      if (!database.objectStoreNames.contains(STORES.EARTHQUAKES)) {
        const eqStore = database.createObjectStore(STORES.EARTHQUAKES, { keyPath: 'id', autoIncrement: true });
        eqStore.createIndex('date', 'date', { unique: false });
      }
    };
  });
}

/**
 * Add or update a storm record
 * @param {Object} storm - { kp, date }
 * @returns {Promise<number>} - ID
 */
export async function addStorm(storm) {
  if (!db) await initDB();
  const tx = db.transaction([STORES.STORMS], 'readwrite');
  const store = tx.objectStore(STORES.STORMS);
  return new Promise((resolve, reject) => {
    const request = store.add({ ...storm, date: storm.date.getTime() });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Add or update an earthquake record
 * @param {Object} eq - { mag, lat, lon, depth, place, time, date }
 * @returns {Promise<number>} - ID
 */
export async function addEarthquake(eq) {
  if (!db) await initDB();
  const tx = db.transaction([STORES.EARTHQUAKES], 'readwrite');
  const store = tx.objectStore(STORES.EARTHQUAKES);
  return new Promise((resolve, reject) => {
    const request = store.add({ ...eq, date: eq.date.getTime() });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all storms from the last N days
 * @param {number} days - Days back (default 90)
 * @returns {Promise<Array>}
 */
export async function getStorms(days = 90) {
  if (!db) await initDB();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const tx = db.transaction([STORES.STORMS], 'readonly');
  const store = tx.objectStore(STORES.STORMS);
  const index = store.index('date');

  return new Promise((resolve, reject) => {
    const request = index.getAll(IDBKeyRange.lowerBound(cutoff));
    request.onsuccess = () => {
      const storms = request.result.map(s => ({
        ...s,
        date: new Date(s.date)
      }));
      resolve(storms);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all earthquakes from the last N days
 * @param {number} days - Days back (default 90)
 * @returns {Promise<Array>}
 */
export async function getEarthquakes(days = 90) {
  if (!db) await initDB();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const tx = db.transaction([STORES.EARTHQUAKES], 'readonly');
  const store = tx.objectStore(STORES.EARTHQUAKES);
  const index = store.index('date');

  return new Promise((resolve, reject) => {
    const request = index.getAll(IDBKeyRange.lowerBound(cutoff));
    request.onsuccess = () => {
      const earthquakes = request.result.map(eq => ({
        ...eq,
        date: new Date(eq.date)
      }));
      resolve(earthquakes);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear old records (> N days)
 * @param {number} days - Keep only records from last N days
 * @returns {Promise<void>}
 */
export async function pruneOldRecords(days = 90) {
  if (!db) await initDB();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  // Prune storms
  const stormTx = db.transaction([STORES.STORMS], 'readwrite');
  const stormStore = stormTx.objectStore(STORES.STORMS);
  const stormIndex = stormStore.index('date');
  stormIndex.openCursor(IDBKeyRange.upperBound(cutoff)).onsuccess = (event) => {
    const cursor = event.target.result;
    if (cursor) {
      cursor.delete();
      cursor.continue();
    }
  };

  // Prune earthquakes
  const eqTx = db.transaction([STORES.EARTHQUAKES], 'readwrite');
  const eqStore = eqTx.objectStore(STORES.EARTHQUAKES);
  const eqIndex = eqStore.index('date');
  eqIndex.openCursor(IDBKeyRange.upperBound(cutoff)).onsuccess = (event) => {
    const cursor = event.target.result;
    if (cursor) {
      cursor.delete();
      cursor.continue();
    }
  };
}

/**
 * Clear all data (for reset/debugging)
 * @returns {Promise<void>}
 */
export async function clearAll() {
  if (!db) await initDB();
  const tx = db.transaction([STORES.STORMS, STORES.EARTHQUAKES], 'readwrite');

  return new Promise((resolve, reject) => {
    const stormReq = tx.objectStore(STORES.STORMS).clear();
    const eqReq = tx.objectStore(STORES.EARTHQUAKES).clear();

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
