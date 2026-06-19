/**
 * 角色卡 Store（zustand）
 *
 * 管理角色卡列表的增删改查、收藏、导入导出、搜索过滤等。
 * 数据持久化到 IndexedDB（不使用 persist 中间件）。
 *
 * 从旧 Vue 3 app.js 迁移。
 */

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Character } from '@/types';
import { getItem, setItem, removeItem } from '@/services/storage';

// ============================================================================
// 常量定义
// ============================================================================

/** 角色卡在 IndexedDB 中的存储键 */
const CHARACTERS_STORAGE_KEY = 'characters';

/** 默认展示数量上限 */
const DEFAULT_DISPLAY_LIMIT = 100;

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 从角色卡数据中提取有效数据对象
 *
 * 兼容两种格式：
 * - V2 包装格式：`{ spec, data: { ... } }`
 * - V1 扁平格式：`{ name, description, ... }`
 *
 * @param cardData - 原始角色卡数据
 * @returns 角色卡数据对象
 */
const extractCardData = (cardData: any): any => {
  if (
    cardData &&
    typeof cardData === 'object' &&
    cardData.data &&
    typeof cardData.data === 'object'
  ) {
    return cardData.data;
  }
  return cardData;
};

/**
 * 将任意值安全转换为字符串
 * @param value - 原始值
 * @param fallback - 转换失败时的回退值
 * @returns 字符串
 */
const toSafeString = (value: unknown, fallback = ''): string => {
  if (value === null || value === undefined) return fallback;
  return String(value);
};

/**
 * 将任意值安全转换为字符串数组
 * @param value - 原始值
 * @returns 字符串数组
 */
const toSafeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => toSafeString(item));
};

/**
 * 将外部角色卡数据映射为内部 Character 结构
 *
 * 兼容 SillyTavern 角色卡字段命名（first_mes / mes_example / alternate_greetings 等）
 * 与内部驼峰命名（firstMessage / mesExample / alternateGreetings）。
 *
 * @param cardData - 原始角色卡数据
 * @returns 标准 Character 对象
 */
const mapCardDataToCharacter = (cardData: any): Character => {
  const data = extractCardData(cardData);
  const now = Date.now();
  const uuid = uuidv4();
  return {
    id: uuid,
    uuid,
    name: toSafeString(data?.name, '未命名角色'),
    avatar: data?.avatar ? toSafeString(data.avatar) : undefined,
    description: toSafeString(data?.description),
    personality: toSafeString(data?.personality),
    scenario: toSafeString(data?.scenario),
    firstMessage: toSafeString(
      data?.first_mes ?? data?.firstMessage,
    ),
    mesExample: toSafeString(
      data?.mes_example ?? data?.mesExample,
    ),
    alternateGreetings: toSafeStringArray(
      data?.alternate_greetings ?? data?.alternateGreetings,
    ),
    tags: toSafeStringArray(data?.tags),
    creator: toSafeString(data?.creator),
    characterVersion: toSafeString(
      data?.character_version ?? data?.characterVersion,
      '1.0',
    ),
    createdAt: now,
    updatedAt: now,
    favorite: false,
  };
};

// ============================================================================
// 类型定义
// ============================================================================

/** 角色卡 Store 状态与 Actions */
interface CharacterState {
  // ===== 状态 =====
  /** 角色卡列表 */
  characters: Character[];
  /** 当前选中的角色卡 UUID */
  currentCharacterUuid: string | null;
  /** 搜索关键词 */
  searchQuery: string;
  /** 展示数量上限 */
  displayLimit: number;

  // ===== Actions：持久化 =====
  /** 从 IndexedDB 加载角色卡列表 */
  loadCharacters: () => Promise<void>;
  /** 保存角色卡列表到 IndexedDB */
  saveCharacters: () => Promise<void>;

  // ===== Actions：增删改 =====
  /** 添加角色卡 */
  addCharacter: (character: Character) => Promise<void>;
  /** 更新角色卡（按 UUID 合并部分字段） */
  updateCharacter: (uuid: string, partial: Partial<Character>) => Promise<void>;
  /** 删除角色卡 */
  deleteCharacter: (uuid: string) => Promise<void>;
  /** 设置当前角色卡 */
  setCurrentCharacter: (uuid: string | null) => void;
  /** 切换角色卡收藏状态 */
  toggleFavorite: (uuid: string) => Promise<void>;

  // ===== Actions：导入导出 =====
  /** 从 JSON 字符串导入角色卡 */
  importCharacter: (json: string) => Promise<void>;
  /** 从角色卡数据对象导入角色卡 */
  importCharacterFromCard: (cardData: any) => Promise<void>;
  /** 导出角色卡为 JSON 字符串 */
  exportCharacter: (uuid: string) => string;

  // ===== Actions：搜索过滤 =====
  /** 设置搜索关键词 */
  searchCharacters: (query: string) => void;
  /** 获取过滤后的角色卡（搜索 + 收藏优先排序） */
  getFilteredCharacters: () => Character[];
}

// ============================================================================
// Store 实现
// ============================================================================

export const useCharacterStore = create<CharacterState>((set, get) => ({
  // ===== 状态初始值 =====
  characters: [],
  currentCharacterUuid: null,
  searchQuery: '',
  displayLimit: DEFAULT_DISPLAY_LIMIT,

  // ===== Actions：持久化 =====
  loadCharacters: async () => {
    try {
      const data = await getItem<Character[]>(
        'characters',
        CHARACTERS_STORAGE_KEY,
      );
      const characters = data ?? [];
      const { currentCharacterUuid } = get();
      const uuidValid =
        currentCharacterUuid !== null &&
        characters.some((c) => c.uuid === currentCharacterUuid);
      set({
        characters,
        currentCharacterUuid: uuidValid ? currentCharacterUuid : null,
      });
    } catch (e) {
      console.error('[CharacterStore] 加载角色卡失败:', e);
      set({ characters: [] });
    }
  },

  saveCharacters: async () => {
    try {
      await setItem('characters', CHARACTERS_STORAGE_KEY, get().characters);
    } catch (e) {
      console.error('[CharacterStore] 保存角色卡失败:', e);
    }
  },

  // ===== Actions：增删改 =====
  addCharacter: async (character) => {
    const now = Date.now();
    const newCharacter: Character = {
      ...character,
      uuid: character.uuid || uuidv4(),
      id: character.id || character.uuid || uuidv4(),
      createdAt: character.createdAt || now,
      updatedAt: now,
      alternateGreetings: character.alternateGreetings ?? [],
      tags: character.tags ?? [],
    };
    set((state) => ({
      characters: [...state.characters, newCharacter],
    }));
    await get().saveCharacters();
  },

  updateCharacter: async (uuid, partial) => {
    set((state) => ({
      characters: state.characters.map((c) =>
        c.uuid === uuid
          ? { ...c, ...partial, uuid, updatedAt: Date.now() }
          : c,
      ),
    }));
    await get().saveCharacters();
  },

  deleteCharacter: async (uuid) => {
    set((state) => ({
      characters: state.characters.filter((c) => c.uuid !== uuid),
      currentCharacterUuid:
        state.currentCharacterUuid === uuid ? null : state.currentCharacterUuid,
    }));
    await get().saveCharacters();
    // 清理关联的聊天记录
    try {
      await removeItem('chatHistory', uuid);
    } catch (e) {
      console.error('[CharacterStore] 清理聊天记录失败:', e);
    }
  },

  setCurrentCharacter: (uuid) => set({ currentCharacterUuid: uuid }),

  toggleFavorite: async (uuid) => {
    set((state) => ({
      characters: state.characters.map((c) =>
        c.uuid === uuid
          ? { ...c, favorite: !c.favorite, updatedAt: Date.now() }
          : c,
      ),
    }));
    await get().saveCharacters();
  },

  // ===== Actions：导入导出 =====
  importCharacter: async (json) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new Error(`角色卡 JSON 解析失败: ${message}`);
    }
    await get().importCharacterFromCard(parsed);
  },

  importCharacterFromCard: async (cardData) => {
    if (!cardData || typeof cardData !== 'object') {
      throw new Error('角色卡数据格式无效');
    }
    const newCharacter = mapCardDataToCharacter(cardData);
    set((state) => ({
      characters: [...state.characters, newCharacter],
    }));
    await get().saveCharacters();
  },

  exportCharacter: (uuid) => {
    const character = get().characters.find((c) => c.uuid === uuid);
    if (!character) {
      throw new Error('未找到指定角色卡');
    }
    return JSON.stringify(character, null, 2);
  },

  // ===== Actions：搜索过滤 =====
  searchCharacters: (query) => set({ searchQuery: query }),

  getFilteredCharacters: () => {
    const { characters, searchQuery, displayLimit } = get();
    const q = searchQuery.trim().toLowerCase();

    // 1. 关键词过滤（匹配名称、描述、标签）
    let filtered = characters;
    if (q) {
      filtered = characters.filter((c) => {
        const name = c.name.toLowerCase();
        const description = c.description.toLowerCase();
        const tags = c.tags.map((t) => t.toLowerCase());
        return (
          name.includes(q) ||
          description.includes(q) ||
          tags.some((t) => t.includes(q))
        );
      });
    }

    // 2. 收藏优先排序，其次按更新时间倒序
    const sorted = [...filtered].sort((a, b) => {
      const fa = a.favorite ? 1 : 0;
      const fb = b.favorite ? 1 : 0;
      if (fa !== fb) return fb - fa;
      return b.updatedAt - a.updatedAt;
    });

    // 3. 应用展示数量上限（0 或负数表示不限制）
    return displayLimit > 0 ? sorted.slice(0, displayLimit) : sorted;
  },
}));
