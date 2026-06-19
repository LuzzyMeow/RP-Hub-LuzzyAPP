/**
 * 设置 Store（zustand + persist）
 *
 * 管理主题、API 配置、供应商路由、模型模式、用户档案等全局设置。
 * 使用 persist 中间件持久化到 localStorage，同时提供 IndexedDB 备份能力。
 *
 * 从旧 Vue 3 app.js 迁移，替换原有的骨架实现。
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type { ApiProvider, ThemeMode, UserProfile } from '@/types';
import { parseModelName } from '@/services/providerService';
import { getItem, setItem } from '@/services/storage';

// ============================================================================
// 常量定义
// ============================================================================

/** 默认选中的供应商 ID */
const DEFAULT_API_PROVIDER_ID = 'sta1n';

/** 内置 API 供应商列表 */
export const BUILTIN_PROVIDERS: ApiProvider[] = [
  { id: 'sta1n', name: 'Sta1N', apiUrl: 'https://cdn.sta1n.cn/v1', isBuiltin: true },
  { id: 'openai', name: 'OpenAI', apiUrl: 'https://api.openai.com/v1', isBuiltin: true },
  { id: 'deepseek', name: 'DeepSeek', apiUrl: 'https://api.deepseek.com/v1', isBuiltin: true },
  { id: 'ark', name: '火山方舟', apiUrl: 'https://ark.cn-beijing.volces.com/api/v3', isBuiltin: true },
  { id: 'glm', name: '智谱清言', apiUrl: 'https://open.bigmodel.cn/api/paas/v4', isBuiltin: true },
  { id: 'moonshot', name: 'Moonshot', apiUrl: 'https://api.moonshot.cn/v1', isBuiltin: true },
  { id: 'minimax', name: 'MiniMax', apiUrl: 'https://api.minimax.chat/v1', isBuiltin: true },
];

/** 模型模式 */
type ModelMode = 'quality' | 'balanced' | 'fast';

/** 默认用户档案 */
const DEFAULT_USER_PROFILE: UserProfile = {
  uuid: 'user',
  name: '请前往设置自定义你的名称',
  description: '',
  person: 'second',
};

/** 自定义请求体校验结果 */
interface CustomRequestBodyValidation {
  valid: boolean;
  error: string;
}

// ============================================================================
// 类型定义
// ============================================================================

/** 需要持久化的数据字段（不含函数） */
type SettingsPersistedData = Pick<
  SettingsState,
  | 'theme'
  | 'apiUrl'
  | 'apiKey'
  | 'modelName'
  | 'stream'
  | 'enableThinking'
  | 'customRequestBody'
  | 'apiProviderId'
  | 'customApiProviders'
  | 'apiProviderKeys'
  | 'modelMode'
  | 'qualityModel'
  | 'balancedModel'
  | 'fastModel'
  | 'user'
  | 'userProfiles'
  | 'activeProfileId'
>;

/** 设置 Store 状态与 Actions */
interface SettingsState {
  // ===== 主题 =====
  theme: ThemeMode;

  // ===== API 基础配置 =====
  apiUrl: string;
  apiKey: string;
  /** 模型名（格式: `<providerId>_<model_name>`） */
  modelName: string;
  stream: boolean;
  enableThinking: boolean;
  /** 自定义请求体 JSON（最高优先级） */
  customRequestBody: string;

  // ===== 供应商 =====
  /** 当前选中的供应商 ID */
  apiProviderId: string;
  /** 自定义供应商列表 */
  customApiProviders: ApiProvider[];
  /** 各供应商的 API Key 映射 */
  apiProviderKeys: Record<string, string>;

  // ===== 模型模式 =====
  modelMode: ModelMode;
  qualityModel: string;
  balancedModel: string;
  fastModel: string;

  // ===== 用户档案 =====
  user: UserProfile;
  userProfiles: UserProfile[];
  activeProfileId: string | null;

  // ===== Actions：主题 =====
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;

  // ===== Actions：API 基础 =====
  setApiUrl: (url: string) => void;
  setApiKey: (key: string) => void;
  setModelName: (name: string) => void;
  setStream: (stream: boolean) => void;
  setEnableThinking: (enable: boolean) => void;
  setCustomRequestBody: (body: string) => void;
  validateCustomRequestBody: () => CustomRequestBodyValidation;

  // ===== Actions：供应商 =====
  selectApiProvider: (provider: ApiProvider) => void;
  addCustomProvider: (provider: ApiProvider) => void;
  removeCustomProvider: (id: string) => void;
  setProviderKey: (id: string, key: string) => void;
  /** 获取所有供应商（内置 + 自定义） */
  getAllProviders: () => ApiProvider[];
  /** 按 ID 查询供应商 */
  getProviderById: (id: string) => ApiProvider | undefined;

  // ===== Actions：模型模式 =====
  setModelMode: (mode: ModelMode) => void;
  setQualityModel: (model: string) => void;
  setBalancedModel: (model: string) => void;
  setFastModel: (model: string) => void;

  // ===== Actions：用户档案 =====
  setUser: (partial: Partial<UserProfile>) => void;
  addProfile: (profile?: Partial<UserProfile>) => void;
  switchProfile: (uuid: string) => void;
  removeProfile: (uuid: string) => void;

  // ===== Actions：持久化（IndexedDB 备份） =====
  loadFromStorage: () => Promise<void>;
  saveToStorage: () => Promise<void>;
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 判断给定 ID 是否为合法的供应商 ID（仅英文字母）
 * @param id - 待校验的 ID
 * @returns 是否合法
 */
const isValidProviderId = (id: string): boolean => /^[a-zA-Z]+$/.test(id);

/**
 * 从状态中提取可持久化的数据字段
 * @param state - 当前状态
 * @returns 仅包含数据字段的对象
 */
const extractPersistableData = (state: SettingsState): SettingsPersistedData => ({
  theme: state.theme,
  apiUrl: state.apiUrl,
  apiKey: state.apiKey,
  modelName: state.modelName,
  stream: state.stream,
  enableThinking: state.enableThinking,
  customRequestBody: state.customRequestBody,
  apiProviderId: state.apiProviderId,
  customApiProviders: state.customApiProviders,
  apiProviderKeys: state.apiProviderKeys,
  modelMode: state.modelMode,
  qualityModel: state.qualityModel,
  balancedModel: state.balancedModel,
  fastModel: state.fastModel,
  user: state.user,
  userProfiles: state.userProfiles,
  activeProfileId: state.activeProfileId,
});

// ============================================================================
// Store 实现
// ============================================================================

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      // ===== 状态初始值 =====
      theme: 'light',
      apiUrl: BUILTIN_PROVIDERS[0].apiUrl,
      apiKey: '',
      modelName: '',
      stream: true,
      enableThinking: false,
      customRequestBody: '',
      apiProviderId: DEFAULT_API_PROVIDER_ID,
      customApiProviders: [],
      apiProviderKeys: {},
      modelMode: 'quality',
      qualityModel: '',
      balancedModel: '',
      fastModel: '',
      user: { ...DEFAULT_USER_PROFILE },
      userProfiles: [],
      activeProfileId: null,

      // ===== Actions：主题 =====
      setTheme: (theme) => set({ theme }),
      toggleTheme: () =>
        set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),

      // ===== Actions：API 基础 =====
      setApiUrl: (apiUrl) =>
        set((state) => {
          // 若当前为自定义供应商，同步 URL 回供应商对象
          const isCustom = state.customApiProviders.some(
            (p) => p.id === state.apiProviderId,
          );
          const customApiProviders = isCustom
            ? state.customApiProviders.map((p) =>
                p.id === state.apiProviderId ? { ...p, apiUrl } : p,
              )
            : state.customApiProviders;
          return { apiUrl, customApiProviders };
        }),

      setApiKey: (apiKey) =>
        set((state) => ({
          apiKey,
          // 同步到当前供应商的 key 槽位
          apiProviderKeys: {
            ...state.apiProviderKeys,
            [state.apiProviderId]: apiKey,
          },
        })),

      setModelName: (modelName) => set({ modelName }),
      setStream: (stream) => set({ stream }),
      setEnableThinking: (enableThinking) => set({ enableThinking }),
      setCustomRequestBody: (customRequestBody) => set({ customRequestBody }),

      validateCustomRequestBody: (): CustomRequestBodyValidation => {
        const { customRequestBody } = get();
        if (!customRequestBody.trim()) return { valid: true, error: '' };
        try {
          JSON.parse(customRequestBody);
          return { valid: true, error: '' };
        } catch (e) {
          return {
            valid: false,
            error: e instanceof Error ? e.message : 'JSON 格式错误',
          };
        }
      },

      // ===== Actions：供应商 =====
      selectApiProvider: (provider) =>
        set((state) => {
          // 先保存当前 apiKey 到当前供应商的 key 槽位
          const apiProviderKeys: Record<string, string> = {
            ...state.apiProviderKeys,
            [state.apiProviderId]: state.apiKey,
          };
          // 切换到新供应商
          return {
            apiProviderKeys,
            apiProviderId: provider.id,
            apiUrl: provider.apiUrl || '',
            apiKey: apiProviderKeys[provider.id] || '',
          };
        }),

      addCustomProvider: (provider) => {
        const id = provider.id.trim();
        if (!id) throw new Error('供应商 ID 不能为空');
        if (!isValidProviderId(id)) {
          throw new Error('供应商 ID 只能包含英文字母');
        }
        const exists = get()
          .getAllProviders()
          .some((p) => p.id === id);
        if (exists) throw new Error('供应商 ID 已存在');
        set((state) => ({
          customApiProviders: [
            ...state.customApiProviders,
            { ...provider, id, isBuiltin: false },
          ],
          apiProviderKeys: {
            ...state.apiProviderKeys,
            [id]: state.apiProviderKeys[id] ?? '',
          },
        }));
      },

      removeCustomProvider: (id) =>
        set((state) => {
          const exists = state.customApiProviders.some(
            (p) => p.id === id && !p.isBuiltin,
          );
          if (!exists) return {}; // 未找到或为内置供应商，不做改动

          const customApiProviders = state.customApiProviders.filter(
            (p) => p.id !== id,
          );
          // 删除对应的 key
          const apiProviderKeys: Record<string, string> = {
            ...state.apiProviderKeys,
          };
          delete apiProviderKeys[id];

          // 级联清理：移除模型名中已失效的供应商前缀
          const stripPrefix = (modelName: string): string => {
            if (!modelName) return modelName;
            const { providerId, modelName: actual } = parseModelName(modelName);
            if (providerId === id) return actual;
            return modelName;
          };

          const updates: Partial<SettingsState> = {
            customApiProviders,
            apiProviderKeys,
            qualityModel: stripPrefix(state.qualityModel),
            balancedModel: stripPrefix(state.balancedModel),
            fastModel: stripPrefix(state.fastModel),
            modelName: stripPrefix(state.modelName),
          };

          // 若删除的是当前选中的供应商，回退到第一个内置供应商
          if (state.apiProviderId === id) {
            const fallback = BUILTIN_PROVIDERS[0];
            updates.apiProviderId = fallback.id;
            updates.apiUrl = fallback.apiUrl;
            updates.apiKey = apiProviderKeys[fallback.id] ?? '';
          }

          return updates;
        }),

      setProviderKey: (id, key) =>
        set((state) => ({
          apiProviderKeys: { ...state.apiProviderKeys, [id]: key },
        })),

      getAllProviders: () => [
        ...BUILTIN_PROVIDERS,
        ...get().customApiProviders,
      ],

      getProviderById: (id) => get().getAllProviders().find((p) => p.id === id),

      // ===== Actions：模型模式 =====
      setModelMode: (modelMode) => set({ modelMode }),
      setQualityModel: (qualityModel) => set({ qualityModel }),
      setBalancedModel: (balancedModel) => set({ balancedModel }),
      setFastModel: (fastModel) => set({ fastModel }),

      // ===== Actions：用户档案 =====
      setUser: (partial) =>
        set((state) => {
          const newUser: UserProfile = { ...state.user, ...partial };
          // 若有激活的档案，同步更新到 userProfiles
          let userProfiles = state.userProfiles;
          if (state.activeProfileId) {
            const idx = userProfiles.findIndex(
              (p) => p.uuid === state.activeProfileId,
            );
            if (idx !== -1) {
              userProfiles = [...userProfiles];
              userProfiles[idx] = { ...newUser, uuid: state.activeProfileId };
            }
          }
          return { user: newUser, userProfiles };
        }),

      addProfile: (profile) =>
        set((state) => {
          const newProfile: UserProfile = {
            uuid: uuidv4(),
            name: profile?.name ?? '新档案',
            description: profile?.description ?? '',
            person: profile?.person ?? 'second',
          };
          return {
            userProfiles: [...state.userProfiles, newProfile],
            activeProfileId: newProfile.uuid,
            user: { ...newProfile },
          };
        }),

      switchProfile: (uuid) =>
        set((state) => {
          const profile = state.userProfiles.find((p) => p.uuid === uuid);
          if (!profile) return {};
          return {
            activeProfileId: uuid,
            user: { ...profile },
          };
        }),

      removeProfile: (uuid) =>
        set((state) => {
          const userProfiles = state.userProfiles.filter(
            (p) => p.uuid !== uuid,
          );
          // 若删除的是当前激活的档案，回退到第一个档案或默认档案
          if (state.activeProfileId === uuid) {
            const fallback = userProfiles[0] ?? null;
            return {
              userProfiles,
              activeProfileId: fallback?.uuid ?? null,
              user: fallback ? { ...fallback } : { ...DEFAULT_USER_PROFILE },
            };
          }
          return { userProfiles };
        }),

      // ===== Actions：持久化（IndexedDB 备份） =====
      loadFromStorage: async () => {
        try {
          const data = await getItem<Partial<SettingsPersistedData>>(
            'settings',
            'settings',
          );
          if (!data) return;
          set((state) => ({
            theme: data.theme ?? state.theme,
            apiUrl: data.apiUrl ?? state.apiUrl,
            apiKey: data.apiKey ?? state.apiKey,
            modelName: data.modelName ?? state.modelName,
            stream: data.stream ?? state.stream,
            enableThinking: data.enableThinking ?? state.enableThinking,
            customRequestBody: data.customRequestBody ?? state.customRequestBody,
            apiProviderId: data.apiProviderId ?? state.apiProviderId,
            customApiProviders: Array.isArray(data.customApiProviders)
              ? data.customApiProviders
              : state.customApiProviders,
            apiProviderKeys:
              data.apiProviderKeys &&
              typeof data.apiProviderKeys === 'object' &&
              !Array.isArray(data.apiProviderKeys)
                ? data.apiProviderKeys
                : state.apiProviderKeys,
            modelMode: data.modelMode ?? state.modelMode,
            qualityModel: data.qualityModel ?? state.qualityModel,
            balancedModel: data.balancedModel ?? state.balancedModel,
            fastModel: data.fastModel ?? state.fastModel,
            user: data.user ?? state.user,
            userProfiles: Array.isArray(data.userProfiles)
              ? data.userProfiles
              : state.userProfiles,
            activeProfileId: data.activeProfileId ?? state.activeProfileId,
          }));
        } catch (e) {
          console.error('[SettingsStore] 从 IndexedDB 加载设置失败:', e);
        }
      },

      saveToStorage: async () => {
        try {
          const data = extractPersistableData(get());
          await setItem('settings', 'settings', data);
        } catch (e) {
          console.error('[SettingsStore] 保存设置到 IndexedDB 失败:', e);
        }
      },
    }),
    {
      name: 'luzzy-settings',
      storage: createJSONStorage(() => localStorage),
      version: 2,
      // 版本迁移：旧版本数据直接作为部分状态合并
      migrate: (persistedState: unknown) => {
        return persistedState as Partial<SettingsState>;
      },
      // 仅持久化数据字段，排除函数
      partialize: (state): SettingsPersistedData =>
        extractPersistableData(state),
      // 自定义合并逻辑：合并持久化数据并规范化关键字段
      merge: (persisted, current): SettingsState => {
        const p =
          (persisted as Partial<SettingsPersistedData> | undefined) ?? {};
        // 过滤 undefined 字段，避免覆盖默认值
        const cleanP = Object.fromEntries(
          Object.entries(p).filter(([, v]) => v !== undefined),
        ) as Partial<SettingsPersistedData>;
        const customApiProviders: ApiProvider[] = Array.isArray(
          cleanP.customApiProviders,
        )
          ? cleanP.customApiProviders
          : [];
        const allProviders = [...BUILTIN_PROVIDERS, ...customApiProviders];
        let apiProviderId = cleanP.apiProviderId ?? current.apiProviderId;
        let apiUrl = cleanP.apiUrl ?? current.apiUrl;
        // 当前选中供应商不存在时回退到第一个内置供应商
        if (!allProviders.some((prov) => prov.id === apiProviderId)) {
          apiProviderId = BUILTIN_PROVIDERS[0].id;
          apiUrl = BUILTIN_PROVIDERS[0].apiUrl;
        }
        const apiProviderKeys: Record<string, string> =
          cleanP.apiProviderKeys &&
          typeof cleanP.apiProviderKeys === 'object' &&
          !Array.isArray(cleanP.apiProviderKeys)
            ? cleanP.apiProviderKeys
            : {};
        const userProfiles: UserProfile[] = Array.isArray(cleanP.userProfiles)
          ? cleanP.userProfiles
          : [];
        const user: UserProfile = cleanP.user ?? current.user;
        return {
          ...current,
          ...cleanP,
          customApiProviders,
          apiProviderKeys,
          userProfiles,
          user,
          apiProviderId,
          apiUrl,
        } as SettingsState;
      },
    },
  ),
);
