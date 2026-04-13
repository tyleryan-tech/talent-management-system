/**
 * IndexedDB 缓存层 — 替代 localStorage（A-2）
 *
 * localStorage 有 ~5MB 限制，IndexedDB 可存储数百 MB。
 * API 保持与 storage.js 一致（loadKey / saveKey / loadKeyForLine / saveKeyForLine），
 * 通过 TM._idb 命名空间暴露异步版本 + 同步降级。
 *
 * 策略：
 *   1. 首次加载时从 IndexedDB 读取数据到内存 Map（async hydrate）
 *   2. 写入时先写内存 Map（同步），再异步刷入 IndexedDB
 *   3. 若 IndexedDB 不可用（如隐私模式），自动降级到 localStorage
 *   4. 初始化时自动将 localStorage 数据迁移到 IndexedDB
 */
(function (w) {
  w.TM = w.TM || {};
  w.TM._idb = {};

  const DB_NAME = 'talent-hub-cache';
  const DB_VERSION = 1;
  const STORE_NAME = 'kv';

  let _db = null;
  let _ready = false;
  let _fallbackToLS = false;
  const _cache = new Map();
  const _writeQueue = [];
  let _flushTimer = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  function idbGet(key) {
    if (!_db) return Promise.resolve(undefined);
    return new Promise((resolve) => {
      try {
        const tx = _db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(undefined);
      } catch {
        resolve(undefined);
      }
    });
  }

  function idbPut(key, value) {
    if (!_db) return Promise.resolve();
    return new Promise((resolve) => {
      try {
        const tx = _db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  function idbDelete(key) {
    if (!_db) return Promise.resolve();
    return new Promise((resolve) => {
      try {
        const tx = _db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  function idbGetAllKeys() {
    if (!_db) return Promise.resolve([]);
    return new Promise((resolve) => {
      try {
        const tx = _db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAllKeys();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  function idbGetAll() {
    if (!_db) return Promise.resolve([]);
    return new Promise((resolve) => {
      try {
        const tx = _db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const results = [];
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            results.push({ key: cursor.key, value: cursor.value });
            cursor.continue();
          } else {
            resolve(results);
          }
        };
        cursorReq.onerror = () => resolve(results);
      } catch {
        resolve([]);
      }
    });
  }

  function scheduleFlush() {
    if (_flushTimer) return;
    _flushTimer = setTimeout(async () => {
      _flushTimer = null;
      const batch = _writeQueue.splice(0);
      for (const { key, value, remove } of batch) {
        if (remove) {
          await idbDelete(key);
        } else {
          await idbPut(key, value);
        }
      }
    }, 50);
  }

  function enqueueWrite(key, value) {
    _writeQueue.push({ key, value });
    scheduleFlush();
  }

  function enqueueDelete(key) {
    _writeQueue.push({ key, remove: true });
    scheduleFlush();
  }

  /** Migrate all localStorage entries with tm_ prefix into IndexedDB */
  async function migrateFromLocalStorage() {
    if (!_db) return;
    const migrated = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('tm_') || key === '_seedVersion')) {
        try {
          const raw = localStorage.getItem(key);
          if (raw != null) {
            const parsed = JSON.parse(raw);
            _cache.set(key, parsed);
            await idbPut(key, parsed);
            migrated.push(key);
          }
        } catch {
          // skip unparseable entries
        }
      }
    }
    if (migrated.length > 0) {
      migrated.forEach((k) => {
        try { localStorage.removeItem(k); } catch { /* ignore */ }
      });
      console.log(`[IDB] Migrated ${migrated.length} keys from localStorage to IndexedDB`);
    }
  }

  /** Initialize IndexedDB and hydrate cache */
  w.TM._idb.init = async function init() {
    try {
      _db = await openDB();
      const all = await idbGetAll();
      all.forEach(({ key, value }) => _cache.set(key, value));
      await migrateFromLocalStorage();
      _ready = true;
      console.log(`[IDB] Ready, ${_cache.size} keys in cache`);
    } catch (err) {
      console.warn('[IDB] IndexedDB not available, falling back to localStorage:', err);
      _fallbackToLS = true;
      _ready = true;
    }
  };

  w.TM._idb.isReady = function () { return _ready; };
  w.TM._idb.isFallback = function () { return _fallbackToLS; };

  // ─── Sync API (reads from cache, writes async to IDB) ─────

  w.TM._idb.loadKey = function loadKey(key, fallback) {
    if (_fallbackToLS) return w.TM.loadKey(key, fallback);
    const val = _cache.get(key);
    return val !== undefined ? val : fallback;
  };

  w.TM._idb.saveKey = function saveKey(key, value) {
    if (_fallbackToLS) {
      w.TM.saveKey(key, value);
      return;
    }
    _cache.set(key, value);
    enqueueWrite(key, value);
  };

  w.TM._idb.loadKeyForLine = function loadKeyForLine(lineId, key, fallback) {
    const fullKey = w.TM.lineStorageKey(lineId, key);
    return w.TM._idb.loadKey(fullKey, fallback);
  };

  w.TM._idb.saveKeyForLine = function saveKeyForLine(lineId, key, value) {
    const fullKey = w.TM.lineStorageKey(lineId, key);
    w.TM._idb.saveKey(fullKey, value);
  };

  w.TM._idb.lineHasEmployeeStorage = function lineHasEmployeeStorage(lineId) {
    const fullKey = w.TM.lineStorageKey(lineId, 'employees');
    return _cache.has(fullKey);
  };

  w.TM._idb.clearLineStorage = function clearLineStorage(lineId) {
    const lid = Number(lineId);
    if (Number.isNaN(lid)) return;
    const prefix = `tm_L${lid}_`;
    const toRemove = [];
    _cache.forEach((_, k) => {
      if (k.startsWith(prefix)) toRemove.push(k);
    });
    toRemove.forEach((k) => {
      _cache.delete(k);
      enqueueDelete(k);
    });
  };

  /**
   * 安装 IDB 为活跃存储后端：覆盖 TM.loadKey / saveKey / loadKeyForLine / saveKeyForLine
   * 原始 localStorage 版本保留在 TM._ls_* 下以备降级
   */
  w.TM._idb.activate = function activate() {
    if (_fallbackToLS) return;

    w.TM._ls_loadKey = w.TM.loadKey;
    w.TM._ls_saveKey = w.TM.saveKey;
    w.TM._ls_loadKeyForLine = w.TM.loadKeyForLine;
    w.TM._ls_saveKeyForLine = w.TM.saveKeyForLine;
    w.TM._ls_lineHasEmployeeStorage = w.TM.lineHasEmployeeStorage;
    w.TM._ls_clearLineStorage = w.TM.clearLineStorage;

    w.TM.loadKey = w.TM._idb.loadKey;
    w.TM.saveKey = w.TM._idb.saveKey;
    w.TM.loadKeyForLine = w.TM._idb.loadKeyForLine;
    w.TM.saveKeyForLine = w.TM._idb.saveKeyForLine;
    w.TM.lineHasEmployeeStorage = w.TM._idb.lineHasEmployeeStorage;
    w.TM.clearLineStorage = w.TM._idb.clearLineStorage;

    console.log('[IDB] Activated as primary storage backend');
  };
})(window);
