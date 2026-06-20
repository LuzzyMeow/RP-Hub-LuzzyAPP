/**
 * 知识库 Slice（Zustand slice，v0.2.0 新增）
 *
 * 管理知识库列表的增删改查、角色卡启用切换。
 * 数据持久化到 IndexedDB（store: knowledgeBases）。
 */

import type { StateCreator } from "zustand";

import type { KnowledgeBase } from "~/types/luzzy";
import { getItem, setItem } from "~/services/storage";
import type { AppStoreState, KnowledgeBaseSlice } from "~/stores/slices/types";

/** 知识库在 IndexedDB 中的存储键 */
const KNOWLEDGE_BASES_STORAGE_KEY = "knowledgeBases";

export const createKnowledgeBaseSlice: StateCreator<
  AppStoreState,
  [],
  [],
  KnowledgeBaseSlice
> = (set, get) => ({
  // ===== 状态初始值 =====
  knowledgeBases: [],

  // ===== Actions =====
  addKnowledgeBase: (kb) =>
    set((state) => ({
      knowledgeBases: [...state.knowledgeBases, kb],
    })),

  updateKnowledgeBase: (id, partial) =>
    set((state) => ({
      knowledgeBases: state.knowledgeBases.map((kb) =>
        kb.id === id
          ? { ...kb, ...partial, updatedAt: Date.now() }
          : kb,
      ),
    })),

  removeKnowledgeBase: (id) =>
    set((state) => ({
      knowledgeBases: state.knowledgeBases.filter((kb) => kb.id !== id),
    })),

  toggleCharacterEnabled: (kbId, characterUuid) =>
    set((state) => ({
      knowledgeBases: state.knowledgeBases.map((kb) => {
        if (kb.id !== kbId) return kb;
        const enabled = kb.enabledForCharacters ?? [];
        const exists = enabled.includes(characterUuid);
        return {
          ...kb,
          enabledForCharacters: exists
            ? enabled.filter((u) => u !== characterUuid)
            : [...enabled, characterUuid],
          updatedAt: Date.now(),
        };
      }),
    })),

  loadKnowledgeBases: async () => {
    try {
      const data = await getItem<KnowledgeBase[]>(
        "knowledgeBases",
        KNOWLEDGE_BASES_STORAGE_KEY,
      );
      set({ knowledgeBases: data ?? [] });
    } catch (e) {
      console.error("[KnowledgeBaseSlice] 加载知识库失败:", e);
      set({ knowledgeBases: [] });
    }
  },

  saveKnowledgeBases: async () => {
    try {
      await setItem(
        "knowledgeBases",
        KNOWLEDGE_BASES_STORAGE_KEY,
        get().knowledgeBases,
      );
    } catch (e) {
      console.error("[KnowledgeBaseSlice] 保存知识库失败:", e);
    }
  },
});
