/**
 * 应用全局 Store（Zustand slices 组合模式）
 *
 * 组合 9 个 slice：
 * - SettingsSlice：主题、API 配置、供应商路由、模型模式、用户档案
 * - CharacterSlice：角色卡列表 CRUD、导入导出、搜索过滤
 * - ChatSlice：聊天消息、生成状态、API 调用、历史记录
 * - UISlice：侧边菜单开/关状态
 * - ChatInputSlice（rikkahub 保留）：输入草稿、消息 parts
 * - ClockSlice（rikkahub 保留）：时钟偏移
 * - SessionSlice（v0.2.0 新增）：多会话架构
 * - KnowledgeBaseSlice（v0.2.0 新增）：知识库管理
 * - SkillSlice（v0.2.0 新增）：技能管理
 *
 * 持久化策略：
 * - localStorage（persist 中间件）：仅持久化 settings + ui 相关字段
 * - IndexedDB：角色卡、聊天记录、预设、世界书等（由各 slice 自行处理）
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import { createChatInputSlice } from "~/stores/slices/chat-input-slice";
import { createClockSlice } from "~/stores/slices/clock-slice";
import { createSettingsSlice } from "~/stores/slices/settings-slice";
import { createCharacterSlice } from "~/stores/slices/character-slice";
import { createChatSlice } from "~/stores/slices/chat-slice";
import { createUISlice } from "~/stores/slices/ui-slice";
import { createSessionSlice } from "~/stores/slices/session-slice";
import { createKnowledgeBaseSlice } from "~/stores/slices/knowledge-base-slice";
import { createSkillSlice } from "~/stores/slices/skill-slice";
import { createTrpgSlice } from "~/stores/slices/trpg-slice";
import type { AppStoreState } from "~/stores/slices/types";

/**
 * 需要持久化到 localStorage 的字段（仅 settings + ui 相关）
 * 不持久化 messages/characters 等运行时状态（由 IndexedDB 处理）
 */
const PERSIST_KEYS = [
  "theme",
  "colorScheme",
  "apiUrl",
  "apiKey",
  "modelName",
  "stream",
  "customRequestBody",
  "apiProviderId",
  "customApiProviders",
  "apiProviderKeys",
  "modelMode",
  "qualityModel",
  "balancedModel",
  "fastModel",
  "user",
  "userProfiles",
  "activeProfileId",
  "defaultProfileActive",
  "defaultProfileData",
  // v0.8.7-fix: sideMenuOpen 不持久化 — 临时 UI 状态，每次启动应为关闭，避免切换时同步写入 localStorage 阻塞动画
  // v0.2.0 新增
  "translationSettings",
  "toolGlobalSettings",
  "builtinToolConfigs",
  "builtinThinkingDepthOverrides",
  "builtinUrlOverrides",
  "builtinModelOverrides",
  "splashShown",
  "trpgNoticeDismissed",
  "sessions",
  "currentSessionId",
  // v0.3.2: 持久化当前角色 UUID，跨启动恢复聊天状态
  "currentCharacterUuid",
  "knowledgeBases",
  "skills",
  // v0.8.0: TRPG 模式持久化
  "trpgMode",
  "trpgModel",
] as const;

export const useAppStore = create<AppStoreState>()(
  persist(
    (...args) => ({
      ...createSettingsSlice(...args),
      ...createChatInputSlice(...args),
      ...createClockSlice(...args),
      ...createCharacterSlice(...args),
      ...createChatSlice(...args),
      ...createUISlice(...args),
      // v0.2.0 新增 slices
      ...createSessionSlice(...args),
      ...createKnowledgeBaseSlice(...args),
      ...createSkillSlice(...args),
      // v0.8.0 新增 TRPG slice
      ...createTrpgSlice(...args),
    }),
    {
      name: "luzzy-settings", // localStorage 键名
      version: 3,
      storage: createJSONStorage(() => localStorage),
      // 仅持久化白名单字段，排除函数和运行时状态
      partialize: (state) => {
        const persisted: Record<string, unknown> = {};
        for (const key of PERSIST_KEYS) {
          if (key in state) {
            persisted[key] = state[key as keyof AppStoreState];
          }
        }
        return persisted as Partial<AppStoreState>;
      },
      // 自定义合并逻辑：合并持久化数据并规范化关键字段
      merge: (persisted, current) => {
        const p = (persisted as Partial<AppStoreState> | undefined) ?? {};
        // 过滤 undefined 字段，避免覆盖默认值
        const cleanP = Object.fromEntries(
          Object.entries(p).filter(([, v]) => v !== undefined),
        ) as Partial<AppStoreState>;
        // v0.5.8: 升级时种子化 defaultProfileData（旧数据无此字段）
        // 若用户在默认档案激活状态下升级，用现有 user 填充 defaultProfileData
        if (!cleanP.defaultProfileData && cleanP.user && !cleanP.activeProfileId) {
          cleanP.defaultProfileData = { ...cleanP.user };
        }
        return {
          ...current,
          ...cleanP,
        } as AppStoreState;
      },
      // 版本迁移：v2 → v3（v0.2.0 新增字段，旧数据无新字段时使用默认值）
      migrate: (persisted, version) => {
        const p = (persisted as Partial<AppStoreState> | undefined) ?? {};
        // version < 3 表示旧版本数据，新字段未持久化，
        // 直接返回原数据，缺失字段由各 slice 初始值 + merge 填充
        if (version < 3) {
          return p as Partial<AppStoreState>;
        }
        return p as Partial<AppStoreState>;
      },
    },
  ),
);

// ============================================================================
// 兼容旧代码的导出别名
// ============================================================================

export const useSettingsStore = useAppStore;
export const useChatStore = useAppStore;
export const useCharacterStore = useAppStore;
export const useUIStore = useAppStore;
export const useChatInputStore = useAppStore;
export const useClockStore = useAppStore;

export type {
  AppStoreState,
  ChatInputSlice,
  ClockSlice,
  SettingsSlice,
  CharacterSlice,
  ChatSlice,
  UISlice,
  SessionSlice,
  KnowledgeBaseSlice,
  SkillSlice,
  Draft,
} from "~/stores/slices/types";
