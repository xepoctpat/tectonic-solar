// ===== INDEXEDDB PERSISTENCE LAYER =====
// Stores: 90-day rolling storms + earthquakes, hourly Dst samples, and typed
// solar-terrestrial driver events (Dst storms, pressure pulses, proton events,
// X-class flares) available to the research engine as alternative storm
// definitions.

const DB_NAME = 'tectonic-solar';
const DB_VERSION = 2;
const STORES = {
  STORMS: 'storms',
  EARTHQUAKES: 'earthquakes',
  DST: 'dst',
  DRIVER_EVENTS: 'driverEvents',
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

      // v2: hourly Dst samples for the Dst chart and storm detection
      if (!database.objectStoreNames.contains(STORES.DST)) {
        const dstStore = database.createObjectStore(STORES.DST, { keyPath: 'id', autoIncrement: true });
        dstStore.createIndex('date', 'date', { unique: false });
      }

      // v2: typed solar-terrestrial driver events
      if (!database.objectStoreNames.contains(STORES.DRIVER_EVENTS)) {
        const eventStore = database.createObjectStore(STORES.DRIVER_EVENTS, { keyPath: 'id', autoIncrement: true });
        eventStore.createIndex('date', 'date', { unique: false });
        eventStore.createIndex('type', 'type', { unique: false });
      }
    };
  });
}

function addRecord(storeName, record) {
  const tx = db.transaction([storeName], 'readwrite');
  const store = tx.objectStore(storeName);
  return new Promise((resolve, reject) => {
    const request = store.add(record);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getByDate(storeName, days) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const tx = db.transaction([storeName], 'readonly');
  const index = tx.objectStore(storeName).index('date');

  return new Promise((resolve, reject) => {
    const request = index.getAll(IDBKeyRange.lowerBound(cutoff));
    request.onsuccess = () => {
      resolve(request.result.map(record => ({
        ...record,
        date: new Date(record.date),
      })));
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Add or update a storm record
 * @param {Object} storm - { kp, date }
 * @returns {Promise<number>} - ID
 */
export async function addStorm(storm) {
  if (!db) await initDB();
  return addRecord(STORES.STORMS, { ...storm, date: storm.date.getTime() });
}

/**
 * Add or update an earthquake record
 * @param {Object} eq - { mag, lat, lon, depth, place, time, date }
 * @returns {Promise<number>} - ID
 */
export async function addEarthquake(eq) {
  if (!db) await initDB();
  return addRecord(STORES.EARTHQUAKES, { ...eq, date: eq.date.getTime() });
}

/**
 * Add an hourly Dst sample { date, dst }
 * @returns {Promise<number>} - ID
 */
export async function addDstSample(sample) {
  if (!db) await initDB();
  return addRecord(STORES.DST, { ...sample, date: sample.date.getTime() });
}

/**
 * Add a typed driver event { type, date, value, unit, source }
 * type: 'dst-storm' | 'pressure-pulse' | 'proton-event' | 'x-flare'
 * @returns {Promise<number>} - ID
 */
export async function addDriverEvent(event) {
  if (!db) await initDB();
  return addRecord(STORES.DRIVER_EVENTS, { ...event, date: event.date.getTime() });
}

/**
 * Get all storms from the last N days
 * @param {number} days - Days back (default 90)
 * @returns {Promise<Array>}
 */
export async function getStorms(days = 90) {
  if (!db) await initDB();
  return getByDate(STORES.STORMS, days);
}

/**
 * Get all earthquakes from the last N days
 * @param {number} days - Days back (default 90)
 * @returns {Promise<Array>}
 */
export async function getEarthquakes(days = 90) {
  if (!db) await initDB();
  return getByDate(STORES.EARTHQUAKES, days);
}

/**
 * Get hourly Dst samples from the last N days
 * @returns {Promise<Array>}
 */
export async function getDstSamples(days = 90) {
  if (!db) await initDB();
  return getByDate(STORES.DST, days);
}

/**
 * Get typed driver events from the last N days, optionally filtered by type
 * @param {number} days - Days back
 * @param {string} [type] - Driver event type filter
 * @returns {Promise<Array>}
 */
export async function getDriverEvents(days = 90, type = null) {
  if (!db) await initDB();
  const events = await getByDate(STORES.DRIVER_EVENTS, days);
  return type ? events.filter(event => event.type === type) : events;
}

function pruneStore(storeName, cutoff) {
  const tx = db.transaction([storeName], 'readwrite');
  const index = tx.objectStore(storeName).index('date');
  index.openCursor(IDBKeyRange.upperBound(cutoff)).onsuccess = (event) => {
    const cursor = event.target.result;
    if (cursor) {
      cursor.delete();
      cursor.continue();
    }
  };
}

/**
 * Clear old records (> N days) across all stores
 * @param {number} days - Keep only records from last N days
 * @returns {Promise<void>}
 */
export async function pruneOldRecords(days = 90) {
  if (!db) await initDB();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  Object.values(STORES).forEach((storeName) => pruneStore(storeName, cutoff));
}

/**
 * Clear all data (for reset/debugging)
 * @returns {Promise<void>}
 */
export async function clearAll() {
  if (!db) await initDB();
  const tx = db.transaction(Object.values(STORES), 'readwrite');

  return new Promise((resolve, reject) => {
    Object.values(STORES).forEach((storeName) => tx.objectStore(storeName).clear());

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
