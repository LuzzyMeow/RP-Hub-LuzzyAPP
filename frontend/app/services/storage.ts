/**
 * IndexedDB 持久化服务
 *
 * 提供基于 IndexedDB 的键值存储，支持多个 object store。
 * 从旧 Vue 3 app.js 迁移，改为纯函数风格。
 *
 * 支持的 store: characters, chatHistory, settings, memory, presets,
 *               worldInfo, regexScripts, activeTools, uiTemplates,
 *               sessions, knowledgeBases, skills, longTermMemory（v0.2.0 新增）
 */

/** 数据库配置 */
const DB_NAME = 'RPHubDB';
const DB_VERSION = 2;

/** 所有支持的 object store 名称 */
const STORE_NAMES = [
  'characters',
  'chatHistory',
  'settings',
  'memory',
  'presets',
  'worldInfo',
  'regexScripts',
  'activeTools',
  'uiTemplates',
  // v0.2.0 新增
  'sessions',
  'knowledgeBases',
  'skills',
  'longTermMemory',
] as const;

/** object store 名称类型 */
export type StorageStoreName = (typeof STORE_NAMES)[number];

/** 数据库实例缓存 */
let dbInstance: IDBDatabase | null = null;
/** 正在进行中的数据库打开 Promise（用于并发去重） */
let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * 打开/创建数据库
 *
 * 首次打开时在 onupgradeneeded 中创建所有 object store。
 * 绑定 onclose/onversionchange 以在连接异常关闭或版本变更时清空缓存。
 * @returns IDBDatabase 实例
 */
export const openDB = (): Promise<IDBDatabase> => {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = (): void => {
      reject(request.error ?? new Error('数据库打开失败'));
    };
    request.onsuccess = (): void => {
      const db = request.result;
      db.onclose = (): void => {
        dbInstance = null;
        dbPromise = null;
      };
      db.onversionchange = (): void => {
        db.close();
        dbInstance = null;
        dbPromise = null;
      };
      dbInstance = db;
      resolve(db);
    };
    request.onupgradeneeded = (event): void => {
      const db = request.result;
      const oldVersion = event.oldVersion;

      // v1 初始 stores：全新安装时创建
      for (const name of STORE_NAMES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name);
        }
      }

      // v2 迁移：oldVersion < 2 时创建新增的 sessions, knowledgeBases, skills, longTermMemory
      // （上方循环已通过 contains 检查保证幂等，此处显式标注版本迁移逻辑）
      if (oldVersion < 2) {
        const v2Stores = ['sessions', 'knowledgeBases', 'skills', 'longTermMemory'];
        for (const name of v2Stores) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name);
          }
        }
      }
    };
  });
};

/**
 * 获取数据库实例（若未打开则自动打开）
 *
 * 使用共享 Promise 去重，避免并发调用导致多个数据库连接泄漏。
 * @returns IDBDatabase 实例
 */
const getDB = async (): Promise<IDBDatabase> => {
  if (dbInstance) return dbInstance;
  if (dbPromise) return dbPromise;
  dbPromise = openDB();
  try {
    return await dbPromise;
  } finally {
    dbPromise = null;
  }
};

/**
 * 判断错误是否为数据库正在关闭的错误
 * @param error - 捕获的错误
 * @returns 是否为数据库关闭错误
 */
const isDatabaseClosingError = (error: unknown): boolean => {
  const message = String(
    (error as { message?: unknown })?.message ?? error ?? '',
  );
  return /connection is closing|database is closing|close pending/i.test(message);
};

/**
 * 重新打开数据库（处理数据库意外关闭的情况）
 * @returns 新的 IDBDatabase 实例
 */
const reopenDB = async (): Promise<IDBDatabase> => {
  try {
    dbInstance?.close();
  } catch {
    /* 忽略关闭错误 */
  }
  dbInstance = null;
  dbPromise = null;
  return openDB();
};

/**
 * 克隆值用于存储（避免引用共享问题）
 * @param value - 原始值
 * @returns 克隆后的值
 */
const cloneForStorage = <T>(value: T): T => {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      /* 回退到 JSON 克隆 */
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

/**
 * 获取指定 store 中的数据
 *
 * @typeParam T - 数据类型
 * @param storeName - object store 名称
 * @param key - 数据键
 * @returns 数据值，不存在则返回 undefined
 */
export const getItem = async <T = unknown>(
  storeName: StorageStoreName,
  key: string,
  retryCount = 0,
): Promise<T | undefined> => {
  const db = await getDB();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(key);
      request.onsuccess = (): void => {
        resolve(request.result as T | undefined);
      };
      request.onerror = (): void => {
        reject(request.error);
      };
    });
  } catch (error) {
    if (!isDatabaseClosingError(error)) throw error;
    if (retryCount >= 3) throw error;
    await reopenDB();
    return getItem<T>(storeName, key, retryCount + 1);
  }
};

/**
 * 保存数据到指定 store
 *
 * @param storeName - object store 名称
 * @param key - 数据键
 * @param value - 数据值
 */
export const setItem = async <T = unknown>(
  storeName: StorageStoreName,
  key: string,
  value: T,
  retryCount = 0,
): Promise<void> => {
  const db = await getDB();
  const cloned = cloneForStorage(value);
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.put(cloned, key);
      tx.oncomplete = (): void => {
        resolve();
      };
      tx.onerror = (): void => {
        reject(tx.error);
      };
      tx.onabort = (): void => {
        reject(tx.error);
      };
    });
  } catch (error) {
    if (!isDatabaseClosingError(error)) throw error;
    if (retryCount >= 3) throw error;
    await reopenDB();
    return setItem<T>(storeName, key, value, retryCount + 1);
  }
};

/**
 * 删除指定 store 中的数据
 *
 * @param storeName - object store 名称
 * @param key - 数据键
 */
export const removeItem = async (
  storeName: StorageStoreName,
  key: string,
  retryCount = 0,
): Promise<void> => {
  const db = await getDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.delete(key);
      tx.oncomplete = (): void => {
        resolve();
      };
      tx.onerror = (): void => {
        reject(tx.error);
      };
      tx.onabort = (): void => {
        reject(tx.error);
      };
    });
  } catch (error) {
    if (!isDatabaseClosingError(error)) throw error;
    if (retryCount >= 3) throw error;
    await reopenDB();
    return removeItem(storeName, key, retryCount + 1);
  }
};

/**
 * 获取指定 store 中的所有键
 *
 * @param storeName - object store 名称
 * @returns 所有键的数组
 */
export const getAllKeys = async (
  storeName: StorageStoreName,
  retryCount = 0,
): Promise<IDBValidKey[]> => {
  const db = await getDB();
  try {
    return await new Promise<IDBValidKey[]>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAllKeys();
      request.onsuccess = (): void => {
        resolve(request.result);
      };
      request.onerror = (): void => {
        reject(request.error);
      };
    });
  } catch (error) {
    if (!isDatabaseClosingError(error)) throw error;
    if (retryCount >= 3) throw error;
    await reopenDB();
    return getAllKeys(storeName, retryCount + 1);
  }
};
