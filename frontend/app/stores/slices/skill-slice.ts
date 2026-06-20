/**
 * 技能 Slice（Zustand slice，v0.2.0 新增）
 *
 * 管理 SKILL 技能列表的增删改查、启用切换、角色卡绑定。
 * 数据持久化到 IndexedDB（store: skills）。
 */

import type { StateCreator } from "zustand";

import type { Skill } from "~/types/luzzy";
import { getItem, setItem } from "~/services/storage";
import type { AppStoreState, SkillSlice } from "~/stores/slices/types";

/** 技能在 IndexedDB 中的存储键 */
const SKILLS_STORAGE_KEY = "skills";

export const createSkillSlice: StateCreator<
  AppStoreState,
  [],
  [],
  SkillSlice
> = (set, get) => ({
  // ===== 状态初始值 =====
  skills: [],

  // ===== Actions =====
  addSkill: (skill) =>
    set((state) => ({
      skills: [...state.skills, skill],
    })),

  updateSkill: (id, partial) =>
    set((state) => ({
      skills: state.skills.map((s) =>
        s.id === id ? { ...s, ...partial, updatedAt: Date.now() } : s,
      ),
    })),

  removeSkill: (id) =>
    set((state) => ({
      skills: state.skills.filter((s) => s.id !== id),
    })),

  toggleSkillEnabled: (id) =>
    set((state) => ({
      skills: state.skills.map((s) =>
        s.id === id
          ? { ...s, enabled: !s.enabled, updatedAt: Date.now() }
          : s,
      ),
    })),

  toggleSkillCharacterEnabled: (id, characterUuid) =>
    set((state) => ({
      skills: state.skills.map((s) => {
        if (s.id !== id) return s;
        const enabled = s.enabledForCharacters ?? [];
        const exists = enabled.includes(characterUuid);
        return {
          ...s,
          enabledForCharacters: exists
            ? enabled.filter((u) => u !== characterUuid)
            : [...enabled, characterUuid],
          updatedAt: Date.now(),
        };
      }),
    })),

  toggleSkillGlobalEnabled: (id) =>
    set((state) => ({
      skills: state.skills.map((s) =>
        s.id === id
          ? { ...s, enabled: !s.enabled, updatedAt: Date.now() }
          : s,
      ),
    })),

  loadSkills: async () => {
    try {
      const data = await getItem<Skill[]>("skills", SKILLS_STORAGE_KEY);
      set({ skills: data ?? [] });
    } catch (e) {
      console.error("[SkillSlice] 加载技能失败:", e);
      set({ skills: [] });
    }
  },

  saveSkills: async () => {
    try {
      await setItem("skills", SKILLS_STORAGE_KEY, get().skills);
    } catch (e) {
      console.error("[SkillSlice] 保存技能失败:", e);
    }
  },
});
