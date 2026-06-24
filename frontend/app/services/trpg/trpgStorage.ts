/**
 * TRPG IndexedDB 持久化
 * v0.8.0: 独立数据库 luzzy_trpg，与自由聊天 RPHubDB 隔离
 *
 * 4 个 store：
 * - saves：存档（byUpdatedAt/byTitle/byContentRating 索引）
 * - worldCards：世界卡（byUpdatedAt/byTitle/byContentRating 索引）
 * - characters：D&D 角色卡模板
 * - vectorMemories：复用现有 memoryService
 */

import type { SaveSlot, WorldCard, TrpgCharacter } from "~/types/trpg";

// ============================================================================
// 数据库配置
// ============================================================================

const TRPG_DB_NAME = "luzzy_trpg";
const TRPG_DB_VERSION = 2;

const STORE_SAVES = "saves";
const STORE_WORLD_CARDS = "worldCards";
const STORE_CHARACTERS = "characters";

// ============================================================================
// 数据库打开/创建
// ============================================================================

let dbInstance: IDBDatabase | null = null;
let dbOpening: Promise<IDBDatabase> | null = null;

/**
 * 打开/创建 TRPG 数据库
 * 使用共享 Promise 避免并发打开
 */
export function openTrpgDb(): Promise<IDBDatabase> {
  if (dbInstance && dbInstance.objectStoreNames.length > 0) {
    return Promise.resolve(dbInstance);
  }
  if (dbOpening) return dbOpening;

  dbOpening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(TRPG_DB_NAME, TRPG_DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const upgradeTx = (event.target as IDBOpenDBRequest).transaction!;

      // saves store
      if (!db.objectStoreNames.contains(STORE_SAVES)) {
        const store = db.createObjectStore(STORE_SAVES, { keyPath: "saveId" });
        store.createIndex("byUpdatedAt", "updatedAt", { unique: false });
        store.createIndex("byTitle", "title", { unique: false });
        store.createIndex("byWorldCardId", "worldCardId", { unique: false });
      } else {
        // v2 迁移：重命名 byContentRating → byWorldCardId
        const store = upgradeTx.objectStore(STORE_SAVES);
        if (store.indexNames.contains("byContentRating")) {
          store.deleteIndex("byContentRating");
        }
        if (!store.indexNames.contains("byWorldCardId")) {
          store.createIndex("byWorldCardId", "worldCardId", { unique: false });
        }
      }

      // worldCards store
      if (!db.objectStoreNames.contains(STORE_WORLD_CARDS)) {
        const store = db.createObjectStore(STORE_WORLD_CARDS, { keyPath: "metadata.cardId" });
        store.createIndex("byUpdatedAt", "metadata.updatedAt", { unique: false });
        store.createIndex("byTitle", "metadata.title", { unique: false });
        store.createIndex("byContentRating", "metadata.contentRating", { unique: false });
      }

      // characters store
      if (!db.objectStoreNames.contains(STORE_CHARACTERS)) {
        db.createObjectStore(STORE_CHARACTERS, { keyPath: "charId" });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      dbInstance.onclose = () => {
        dbInstance = null;
        dbOpening = null;
      };
      dbInstance.onerror = () => {
        dbInstance = null;
        dbOpening = null;
      };
      resolve(dbInstance);
    };

    request.onerror = () => {
      dbOpening = null;
      reject(request.error);
    };
  });

  return dbOpening;
}

// ============================================================================
// 通用 CRUD 封装
// ============================================================================

async function dbGet<T>(storeName: string, key: string): Promise<T | undefined> {
  const db = await openTrpgDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await openTrpgDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut<T>(storeName: string, value: T): Promise<void> {
  const db = await openTrpgDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbDelete(storeName: string, key: string): Promise<void> {
  const db = await openTrpgDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ============================================================================
// 存档 CRUD
// ============================================================================

/** 读取存档 */
export async function getSave(saveId: string): Promise<SaveSlot | undefined> {
  return dbGet<SaveSlot>(STORE_SAVES, saveId);
}

/** 读取所有存档 */
export async function getAllSaves(): Promise<SaveSlot[]> {
  return dbGetAll<SaveSlot>(STORE_SAVES);
}

/**
 * 原子写入存档（备份 → 写入 → 删备份）
 * 确保写入失败时不会丢失原有数据
 *
 * 注意：saves store 使用 in-line key（keyPath: 'saveId'），
 * 备份时必须覆盖 saveId 字段以保持 key 模式一致，
 * 不能使用 out-of-line key（第二个参数），否则违反 IndexedDB 规范。
 */
export async function putSave(save: SaveSlot): Promise<void> {
  const db = await openTrpgDb();
  const backupKey = `${save.saveId}_bak`;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SAVES, "readwrite");
    const store = tx.objectStore(STORE_SAVES);

    // 1. 读取当前版本作为备份
    const getReq = store.get(save.saveId);
    getReq.onsuccess = () => {
      const current = getReq.result as SaveSlot | undefined;
      // 2. 备份当前版本（使用 in-line key：覆盖 saveId 字段为 backupKey）
      if (current) {
        store.put({ ...current, saveId: backupKey, _backup: true });
      }
      // 3. 写入新版本
      store.put(save);
    };

    tx.oncomplete = () => {
      // 4. 成功后删除备份（使用 backupKey 作为主键）
      const deleteTx = db.transaction(STORE_SAVES, "readwrite");
      deleteTx.objectStore(STORE_SAVES).delete(backupKey);
      deleteTx.oncomplete = () => resolve();
      deleteTx.onerror = () => resolve(); // 备份删除失败不阻塞主流程
    };
    tx.onerror = () => reject(tx.error);
  });
}

/** 删除存档 */
export async function deleteSave(saveId: string): Promise<void> {
  return dbDelete(STORE_SAVES, saveId);
}

// ============================================================================
// 世界卡 CRUD
// ============================================================================

/** 读取世界卡 */
export async function getWorldCard(cardId: string): Promise<WorldCard | undefined> {
  return dbGet<WorldCard>(STORE_WORLD_CARDS, cardId);
}

/** 读取所有世界卡（仅元数据列表，用于选择器展示） */
export async function getAllWorldCards(): Promise<WorldCard[]> {
  return dbGetAll<WorldCard>(STORE_WORLD_CARDS);
}

/** 写入世界卡 */
export async function putWorldCard(card: WorldCard): Promise<void> {
  return dbPut(STORE_WORLD_CARDS, card);
}

/** 删除世界卡（级联解除存档关联） */
export async function deleteWorldCard(cardId: string): Promise<void> {
  // 删除世界卡
  await dbDelete(STORE_WORLD_CARDS, cardId);

  // 级联：将关联存档的 worldCardId 置空
  const saves = await getAllSaves();
  for (const save of saves) {
    if (save.worldCardId === cardId) {
      save.worldCardId = null;
      save.updatedAt = Date.now();
      await putSave(save);
    }
  }
}

// ============================================================================
// 角色卡模板 CRUD
// ============================================================================

/** 读取角色卡模板 */
export async function getCharacterTemplate(charId: string): Promise<TrpgCharacter | undefined> {
  return dbGet<TrpgCharacter>(STORE_CHARACTERS, charId);
}

/** 读取所有角色卡模板 */
export async function getAllCharacterTemplates(): Promise<TrpgCharacter[]> {
  return dbGetAll<TrpgCharacter>(STORE_CHARACTERS);
}

/** 写入角色卡模板 */
export async function putCharacterTemplate(char: TrpgCharacter): Promise<void> {
  return dbPut(STORE_CHARACTERS, char);
}

/** 删除角色卡模板 */
export async function deleteCharacterTemplate(charId: string): Promise<void> {
  return dbDelete(STORE_CHARACTERS, charId);
}
