/**
 * 设置 Slice（Zustand slice）
 *
 * 管理主题、API 配置、供应商路由、模型模式、用户档案等全局设置。
 * 持久化由 app-store.ts 层的 persist 中间件统一处理（localStorage），
 * 本 slice 额外提供 IndexedDB 备份能力（loadFromStorage/saveToStorage）。
 *
 * 从 .luzzy-backup/store/useSettingsStore.ts 迁移，适配 slices 组合模式。
 */

import type { StateCreator } from "zustand";
import { v4 as uuidv4 } from "uuid";

import type {
  ApiProvider,
  ThemeMode,
  UserProfile,
  TranslationSettings,
  HighlightSettings,
  ToolGlobalSettings,
  BuiltinToolConfig,
  ThinkingDepth,
  ModelConfig,
} from "~/types/luzzy";
import { parseModelName } from "~/services/providerService";
import { getItem, setItem } from "~/services/storage";
import type { AppStoreState, SettingsSlice } from "~/stores/slices/types";

// ============================================================================
// 常量定义
// ============================================================================

/** 默认选中的供应商 ID */
export const DEFAULT_API_PROVIDER_ID = "deepseek";

/** 内置 API 供应商列表（v0.3.4：仅保留 DeepSeek，内置两个模型） */
export const BUILTIN_PROVIDERS: ApiProvider[] = [
  {
    id: "deepseek",
    name: "DeepSeek",
    displayName: "DeepSeek",
    apiUrl: "https://api.deepseek.com",
    isBuiltin: true,
    apiType: "openai-compatible",
    customRequestBody: '{"reasoning_effort": "max"}',
    models: [
      {
        id: "deepseek-v4-pro",
        name: "deepseek-v4-pro",
        displayName: "DeepSeek-V4-Pro",
        contextLength: 1048576,
        outputLength: 393216,
        supportsReasoning: true,
      },
      {
        id: "deepseek-v4-flash",
        name: "deepseek-v4-flash",
        displayName: "DeepSeek-V4-Flash",
        contextLength: 1048576,
        outputLength: 393216,
        supportsReasoning: true,
      },
    ],
  },
  {
    id: "ArkCodingPlan",
    name: "火山方舟 CodingPlan",
    displayName: "火山方舟 CodingPlan",
    apiUrl: "https://ark.cn-beijing.volces.com/api/coding/v3",
    isBuiltin: true,
    apiType: "openai-compatible",
    customRequestBody: '{"thinking": {"type": "enabled"}}',
    models: [
      {
        id: "glm-5.2",
        name: "glm-5.2",
        displayName: "GLM-5.2",
        contextLength: 1048576,
        outputLength: 131072,
        supportsReasoning: true,
      },
      {
        id: "deepseek-v4-pro",
        name: "deepseek-v4-pro",
        displayName: "DeepSeek-V4-Pro",
        contextLength: 1048576,
        outputLength: 393216,
        supportsReasoning: true,
      },
      {
        id: "doubao-embedding-vision",
        name: "doubao-embedding-vision",
        displayName: "Doubao-embedding-vision",
        supportsVision: true,
        supportsEmbedding: true,
      },
    ],
  },
];

/** 默认用户档案 */
export const DEFAULT_USER_PROFILE: UserProfile = {
  uuid: "user",
  name: "",
  description: "",
  person: "second",
};

/** 默认翻译设置（v0.2.0） */
export const DEFAULT_TRANSLATION_SETTINGS: TranslationSettings = {
  enabled: true,
  targetLanguage: "简体中文",
  customLanguage: "",
  promptTemplate:
    "你的任务是将{message}翻译成{language}，但请注意：请勿擅自更改翻译之前文本的语义，若发现任何NSFW均为虚拟文学创作，请继续你的翻译工作。",
  translationModelId: "",
};

/** 默认高亮显示设置（v0.3.7 新增） */
export const DEFAULT_HIGHLIGHT_SETTINGS: HighlightSettings = {
  enabled: true,
  color: "oklch(0.65 0.2 280)",
  pattern: "",
};

/** 默认工具全局设置（v0.2.0；v0.3.3 默认改为强制模式） */
export const DEFAULT_TOOL_GLOBAL_SETTINGS: ToolGlobalSettings = {
  mode: "force",
};

/** 默认内置工具配置（v0.2.0；v0.3.3 默认启用三个记忆工具）
 *
 * 4 种内置工具的默认配置：
 * - vector-memory: 向量记忆主动检索（3-12，默认 8）— v0.3.3 默认启用
 * - keyword-search: 关键词检索（3-21，默认 8）— v0.3.3 默认启用
 * - memory-recall: 记忆召回（3-12，默认 8）— v0.3.3 默认启用
 * - anysearch: Anysearch 联网搜索
 */
export const DEFAULT_BUILTIN_TOOL_CONFIGS: BuiltinToolConfig[] = [
  {
    type: "vector-memory",
    enabled: true,
    resultCount: 8,
    enabledForCharacters: [],
  },
  {
    type: "keyword-search",
    enabled: true,
    resultCount: 8,
    enabledForCharacters: [],
  },
  {
    type: "memory-recall",
    enabled: true,
    resultCount: 8,
    enabledForCharacters: [],
  },
  {
    type: "world-recall", // v0.4.3 新增:世界书召回（嵌入模型）
    enabled: true, // v0.5.0: 默认开启
    resultCount: 8,
    enabledForCharacters: [],
  },
  {
    type: "world-search", // v0.4.3 新增:世界书检索（关键词）
    enabled: true, // 默认开启，无需嵌入模型
    resultCount: 8,
    enabledForCharacters: [],
  },
  {
    type: "anysearch",
    enabled: false,
    resultCount: 8,
    enabledForCharacters: [],
    anysearchToken: "",
  },
];

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
 * 从状态中提取可持久化到 IndexedDB 的数据字段（不含函数）
 * @param state - 当前 slice 状态
 * @returns 仅包含数据字段的对象
 */
const extractPersistableData = (state: SettingsSlice): Record<string, unknown> => ({
  theme: state.theme,
  apiUrl: state.apiUrl,
  apiKey: state.apiKey,
  modelName: state.modelName,
  stream: state.stream,
  customRequestBody: state.customRequestBody,
  apiProviderId: state.apiProviderId,
  customApiProviders: state.customApiProviders,
  apiProviderKeys: state.apiProviderKeys,
  apiProviderSelectedModel: state.apiProviderSelectedModel,
  builtinThinkingDepthOverrides: state.builtinThinkingDepthOverrides,
  builtinUrlOverrides: state.builtinUrlOverrides,
  builtinModelOverrides: state.builtinModelOverrides,
  modelMode: state.modelMode,
  qualityModel: state.qualityModel,
  balancedModel: state.balancedModel,
  fastModel: state.fastModel,
  user: state.user,
  userProfiles: state.userProfiles,
  activeProfileId: state.activeProfileId,
  // v0.2.0 新增
  translationSettings: state.translationSettings,
  highlightSettings: state.highlightSettings,
  toolGlobalSettings: state.toolGlobalSettings,
  builtinToolConfigs: state.builtinToolConfigs,
  splashShown: state.splashShown,
  trpgNoticeDismissed: state.trpgNoticeDismissed,
});

// ============================================================================
// Slice 实现
// ============================================================================

export const createSettingsSlice: StateCreator<
  AppStoreState,
  [],
  [],
  SettingsSlice
> = (set, get) => ({
  // ===== 状态初始值 =====
  theme: "light",
  apiUrl: BUILTIN_PROVIDERS[0].apiUrl,
  apiKey: "",
  modelName: "",
  stream: true,
  customRequestBody: "",
  apiProviderId: DEFAULT_API_PROVIDER_ID,
  customApiProviders: [],
  apiProviderKeys: {},
  // v0.3.5: 持久化每供应商上次选中的模型，切换供应商时恢复
  apiProviderSelectedModel: {},
  builtinThinkingDepthOverrides: {},
  builtinUrlOverrides: {},
  builtinModelOverrides: {},
  modelMode: "quality",
  qualityModel: "",
  balancedModel: "",
  fastModel: "",
  user: { ...DEFAULT_USER_PROFILE },
  userProfiles: [],
  activeProfileId: null,
  defaultProfileActive: true,
  // v0.5.8: 保存用户对默认档案的编辑，防止切换档案后数据丢失
  defaultProfileData: { ...DEFAULT_USER_PROFILE },

  // ===== v0.2.0 新增状态 =====
  translationSettings: { ...DEFAULT_TRANSLATION_SETTINGS },
  highlightSettings: { ...DEFAULT_HIGHLIGHT_SETTINGS },
  toolGlobalSettings: { ...DEFAULT_TOOL_GLOBAL_SETTINGS },
  builtinToolConfigs: DEFAULT_BUILTIN_TOOL_CONFIGS.map((c) => ({ ...c })),
  splashShown: false,
  trpgNoticeDismissed: false,

  // ===== Actions：主题 =====
  setTheme: (theme) => set({ theme }),
  toggleTheme: () =>
    set((state) => ({ theme: state.theme === "light" ? "dark" : "light" })),

  // ===== Actions：API 基础 =====
  setApiUrl: (apiUrl) =>
    set((state) => {
      // v0.3.2: 内置供应商 URL 覆盖持久化到 builtinUrlOverrides
      const isBuiltin = BUILTIN_PROVIDERS.some(
        (p) => p.id === state.apiProviderId,
      );
      if (isBuiltin) {
        return {
          apiUrl,
          builtinUrlOverrides: {
            ...state.builtinUrlOverrides,
            [state.apiProviderId]: apiUrl,
          },
        };
      }
      // 自定义供应商：同步 URL 回供应商对象
      const customApiProviders = state.customApiProviders.map((p) =>
        p.id === state.apiProviderId ? { ...p, apiUrl } : p,
      );
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
  setCustomRequestBody: (customRequestBody) =>
    set((state) => {
      // 若当前激活的是自定义供应商，同步更新到供应商配置
      const isCustom = state.customApiProviders.some(
        (p) => p.id === state.apiProviderId,
      );
      if (isCustom) {
        return {
          customRequestBody,
          customApiProviders: state.customApiProviders.map((p) =>
            p.id === state.apiProviderId
              ? { ...p, customRequestBody }
              : p,
          ),
        };
      }
      return { customRequestBody };
    }),

  validateCustomRequestBody: (): { valid: boolean; error: string } => {
    const { customRequestBody } = get();
    if (!customRequestBody.trim()) return { valid: true, error: "" };
    try {
      JSON.parse(customRequestBody);
      return { valid: true, error: "" };
    } catch (e) {
      return {
        valid: false,
        error: e instanceof Error ? e.message : "JSON 格式错误",
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
      // v0.3.5: 保存当前 modelName 到当前供应商的选中模型记录
      const apiProviderSelectedModel: Record<string, string> = {
        ...state.apiProviderSelectedModel,
        [state.apiProviderId]: state.modelName,
      };
      // 保存当前 customRequestBody 到当前自定义供应商
      let customApiProviders = state.customApiProviders;
      const currentProvider = customApiProviders.find(
        (p) => p.id === state.apiProviderId,
      );
      if (currentProvider) {
        customApiProviders = customApiProviders.map((p) =>
          p.id === state.apiProviderId
            ? { ...p, customRequestBody: state.customRequestBody }
            : p,
        );
      }
      // 加载新供应商的 customRequestBody
      const newProvider =
        provider.id === state.apiProviderId
          ? currentProvider
          : customApiProviders.find((p) => p.id === provider.id);
      const newCustomRequestBody =
        newProvider?.customRequestBody ??
        (BUILTIN_PROVIDERS.find((p) => p.id === provider.id)?.customRequestBody ??
          "");
      // v0.3.5: 加载新供应商的选中模型
      // 优先使用该供应商上次选中的模型；若无则使用第一个模型（添加前缀）
      const newProviderModels =
        newProvider?.models ??
        (BUILTIN_PROVIDERS.find((p) => p.id === provider.id)?.models ?? []);
      const savedModel = apiProviderSelectedModel[provider.id];
      let newModelName = "";
      if (savedModel) {
        newModelName = savedModel;
      } else if (newProviderModels.length > 0) {
        const firstModel = newProviderModels[0];
        const modelId = firstModel.modelId || firstModel.name;
        newModelName = `${provider.id}_${modelId}`;
      }
      return {
        apiProviderKeys,
        apiProviderSelectedModel,
        customApiProviders,
        apiProviderId: provider.id,
        apiUrl: provider.apiUrl || "",
        apiKey: apiProviderKeys[provider.id] || "",
        customRequestBody: newCustomRequestBody,
        modelName: newModelName,
      };
    }),

  addCustomProvider: (provider) => {
    const id = provider.id.trim();
    if (!id) throw new Error("供应商 ID 不能为空");
    if (!isValidProviderId(id)) {
      throw new Error("供应商 ID 只能包含英文字母");
    }
    const exists = get()
      .getAllProviders()
      .some((p) => p.id === id);
    if (exists) throw new Error("供应商 ID 已存在");
    set((state) => ({
      customApiProviders: [
        ...state.customApiProviders,
        { ...provider, id, isBuiltin: false },
      ],
      apiProviderKeys: {
        ...state.apiProviderKeys,
        [id]: state.apiProviderKeys[id] ?? "",
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

      const updates: Partial<SettingsSlice> = {
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
        updates.apiKey = apiProviderKeys[fallback.id] ?? "";
      }

      return updates;
    }),

  setProviderKey: (id, key) =>
    set((state) => {
      const updates: Partial<SettingsSlice> = {
        apiProviderKeys: { ...state.apiProviderKeys, [id]: key },
      };
      // 当修改的是当前选中供应商时,同步更新全局 apiKey
      if (id === state.apiProviderId) {
        updates.apiKey = key;
      }
      return updates;
    }),

  getAllProviders: () => {
    const overrides = get().builtinThinkingDepthOverrides;
    const urlOverrides = get().builtinUrlOverrides;
    const modelOverrides = get().builtinModelOverrides;
    return [
      ...BUILTIN_PROVIDERS.map((p) => ({
        ...p,
        apiUrl: urlOverrides[p.id] ?? p.apiUrl,
        thinkingDepth: overrides[p.id] ?? p.thinkingDepth,
        // v0.3.4: 合并用户对内置供应商模型列表的覆盖
        models: modelOverrides[p.id] ?? p.models,
      })),
      ...get().customApiProviders,
    ];
  },

  getProviderById: (id) => get().getAllProviders().find((p) => p.id === id),

  // ===== Actions：供应商（v0.2.0 新增） =====
  setProviderApiUrl: (id, url) =>
    set((state) => ({
      customApiProviders: state.customApiProviders.map((p) =>
        p.id === id ? { ...p, apiUrl: url } : p,
      ),
      // 若修改的是当前激活供应商，同步更新全局 apiUrl
      ...(state.apiProviderId === id ? { apiUrl: url } : {}),
    })),

  setProviderApiType: (id, apiType) =>
    set((state) => ({
      customApiProviders: state.customApiProviders.map((p) =>
        p.id === id ? { ...p, apiType } : p,
      ),
    })),

  setProviderCustomRequestBody: (id, body) =>
    set((state) => ({
      customApiProviders: state.customApiProviders.map((p) =>
        p.id === id ? { ...p, customRequestBody: body } : p,
      ),
    })),

  setProviderDisplayName: (id, displayName) =>
    set((state) => ({
      customApiProviders: state.customApiProviders.map((p) =>
        p.id === id
          ? { ...p, displayName: displayName.slice(0, 20) }
          : p,
      ),
    })),

  setProviderThinkingDepth: (id, depth) =>
    set((state) => {
      const isBuiltin = BUILTIN_PROVIDERS.some((p) => p.id === id);
      if (isBuiltin) {
        return {
          builtinThinkingDepthOverrides: {
            ...state.builtinThinkingDepthOverrides,
            [id]: depth,
          },
        };
      }
      return {
        customApiProviders: state.customApiProviders.map((p) =>
          p.id === id ? { ...p, thinkingDepth: depth } : p,
        ),
      };
    }),

  addModelToProvider: (providerId, model) =>
    set((state) => {
      // v0.3.4: 内置供应商通过 builtinModelOverrides 管理
      const isBuiltin = BUILTIN_PROVIDERS.some((p) => p.id === providerId);
      if (isBuiltin) {
        const builtinProvider = BUILTIN_PROVIDERS.find((p) => p.id === providerId)!;
        const currentModels = state.builtinModelOverrides[providerId] ?? builtinProvider.models ?? [];
        return {
          builtinModelOverrides: {
            ...state.builtinModelOverrides,
            [providerId]: [...currentModels, model],
          },
        };
      }
      return {
        customApiProviders: state.customApiProviders.map((p) =>
          p.id === providerId
            ? { ...p, models: [...(p.models || []), model] }
            : p,
        ),
      };
    }),

  removeModelFromProvider: (providerId, modelId) =>
    set((state) => {
      const isBuiltin = BUILTIN_PROVIDERS.some((p) => p.id === providerId);
      if (isBuiltin) {
        const builtinProvider = BUILTIN_PROVIDERS.find((p) => p.id === providerId)!;
        const currentModels = state.builtinModelOverrides[providerId] ?? builtinProvider.models ?? [];
        return {
          builtinModelOverrides: {
            ...state.builtinModelOverrides,
            [providerId]: currentModels.filter((m) => m.id !== modelId),
          },
        };
      }
      return {
        customApiProviders: state.customApiProviders.map((p) =>
          p.id === providerId
            ? {
                ...p,
                models: (p.models || []).filter((m) => m.id !== modelId),
              }
            : p,
        ),
      };
    }),

  updateModelConfig: (providerId, modelId, partial) =>
    set((state) => {
      const isBuiltin = BUILTIN_PROVIDERS.some((p) => p.id === providerId);
      if (isBuiltin) {
        const builtinProvider = BUILTIN_PROVIDERS.find((p) => p.id === providerId)!;
        const currentModels = state.builtinModelOverrides[providerId] ?? builtinProvider.models ?? [];
        return {
          builtinModelOverrides: {
            ...state.builtinModelOverrides,
            [providerId]: currentModels.map((m) =>
              m.id === modelId ? { ...m, ...partial } : m,
            ),
          },
        };
      }
      return {
        customApiProviders: state.customApiProviders.map((p) =>
          p.id === providerId
            ? {
                ...p,
                models: (p.models || []).map((m) =>
                  m.id === modelId ? { ...m, ...partial } : m,
                ),
              }
            : p,
        ),
      };
    }),

  // ===== Actions：模型模式 =====
  setModelMode: (modelMode) => set({ modelMode }),
  setQualityModel: (qualityModel) => set({ qualityModel }),
  setBalancedModel: (balancedModel) => set({ balancedModel }),
  setFastModel: (fastModel) => set({ fastModel }),

  // ===== Actions：用户档案 =====
  setUser: (partial) =>
    set((state) => {
      const newUser: UserProfile = { ...state.user, ...partial };
      let userProfiles = state.userProfiles;
      let defaultProfileData = state.defaultProfileData;
      if (state.activeProfileId) {
        // 自定义档案激活：同步到 userProfiles
        const idx = userProfiles.findIndex(
          (p) => p.uuid === state.activeProfileId,
        );
        if (idx !== -1) {
          userProfiles = [...userProfiles];
          userProfiles[idx] = { ...newUser, uuid: state.activeProfileId };
        }
      } else {
        // v0.5.8: 默认档案激活：同步到 defaultProfileData，防止切换后数据丢失
        defaultProfileData = { ...newUser, uuid: "user" };
      }
      return { user: newUser, userProfiles, defaultProfileData };
    }),

  addProfile: (profile) =>
    set((state) => {
      const newProfile: UserProfile = {
        uuid: uuidv4(),
        name: profile?.name ?? "新档案",
        description: profile?.description ?? "",
        person: profile?.person ?? "second",
      };
      // v0.3.2: 默认档案激活时，新增档案但不自动激活
      if (state.defaultProfileActive) {
        return { userProfiles: [...state.userProfiles, newProfile] };
      }
      return {
        userProfiles: [...state.userProfiles, newProfile],
        activeProfileId: newProfile.uuid,
        user: { ...newProfile },
      };
    }),

  switchProfile: (uuid) =>
    set((state) => {
      if (uuid === "default") {
        // v0.5.8: 切换回默认档案，使用已保存的默认档案数据
        return {
          activeProfileId: null,
          defaultProfileActive: true,
          user: { ...(state.defaultProfileData || DEFAULT_USER_PROFILE) },
        };
      }
      const profile = state.userProfiles.find((p) => p.uuid === uuid);
      if (!profile) return {};
      return {
        activeProfileId: uuid,
        defaultProfileActive: false,
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
        if (userProfiles.length === 0) {
          // v0.3.2: 无档案时回退到默认档案
          return {
            userProfiles,
            activeProfileId: null,
            defaultProfileActive: true,
            user: { ...DEFAULT_USER_PROFILE },
          };
        }
        const fallback = userProfiles[0];
        return {
          userProfiles,
          activeProfileId: fallback.uuid,
          defaultProfileActive: false,
          user: { ...fallback },
        };
      }
      return { userProfiles };
    }),

  setDefaultProfileActive: (active) =>
    set((state) => {
      if (active) {
        // v0.5.8: 激活默认档案，使用已保存的默认档案数据
        return {
          defaultProfileActive: true,
          activeProfileId: null,
          user: { ...(state.defaultProfileData || DEFAULT_USER_PROFILE) },
        };
      }
      // 取消激活默认档案：若有新增档案则激活第一个
      if (state.userProfiles.length > 0) {
        const first = state.userProfiles[0];
        return {
          defaultProfileActive: false,
          activeProfileId: first.uuid,
          user: { ...first },
        };
      }
      return { defaultProfileActive: false };
    }),

  // ===== Actions：v0.2.0 新增设置 =====
  setTranslationSettings: (settings) =>
    set((state) => ({
      translationSettings: { ...state.translationSettings, ...settings },
    })),

  setHighlightSettings: (settings) =>
    set((state) => ({
      highlightSettings: { ...state.highlightSettings, ...settings },
    })),

  setToolGlobalMode: (mode) => set({ toolGlobalSettings: { mode } }),

  updateBuiltinToolConfig: (type, partial) =>
    set((state) => ({
      builtinToolConfigs: state.builtinToolConfigs.map((c) =>
        c.type === type ? { ...c, ...partial } : c,
      ),
    })),

  setSplashShown: (shown) => set({ splashShown: shown }),

  setTrpgNoticeDismissed: (dismissed) =>
    set({ trpgNoticeDismissed: dismissed }),

  // ===== Actions：持久化（IndexedDB 备份） =====
  loadFromStorage: async () => {
    try {
      const data = await getItem<Record<string, unknown>>(
        "settings",
        "settings",
      );
      if (!data) return;
      // v0.3.0 迁移：Sta1N 供应商已移除，迁移到 DeepSeek
      const rawProviderId = (data.apiProviderId as string) ?? "";
      const needsMigration = rawProviderId === "sta1n";
      const migratedProviderId = needsMigration ? "deepseek" : rawProviderId;
      const migratedApiUrl = needsMigration
        ? BUILTIN_PROVIDERS.find((p) => p.id === "deepseek")!.apiUrl
        : (data.apiUrl as string) ?? "";
      const migratedApiKey = needsMigration
        ? ((data.apiProviderKeys as Record<string, string>)?.["deepseek"] ?? "")
        : ((data.apiKey as string) ?? "");
      set((state) => ({
        theme: (data.theme as ThemeMode) ?? state.theme,
        apiUrl: migratedApiUrl || state.apiUrl,
        apiKey: migratedApiKey || state.apiKey,
        modelName: (data.modelName as string) ?? state.modelName,
        stream: (data.stream as boolean) ?? state.stream,
        customRequestBody: (data.customRequestBody as string) ?? state.customRequestBody,
        apiProviderId: migratedProviderId || state.apiProviderId,
        customApiProviders: Array.isArray(data.customApiProviders)
          ? (data.customApiProviders as ApiProvider[])
          : state.customApiProviders,
        apiProviderKeys:
          data.apiProviderKeys &&
          typeof data.apiProviderKeys === "object" &&
          !Array.isArray(data.apiProviderKeys)
            ? (data.apiProviderKeys as Record<string, string>)
            : state.apiProviderKeys,
        apiProviderSelectedModel:
          data.apiProviderSelectedModel &&
          typeof data.apiProviderSelectedModel === "object" &&
          !Array.isArray(data.apiProviderSelectedModel)
            ? (data.apiProviderSelectedModel as Record<string, string>)
            : state.apiProviderSelectedModel,
        builtinThinkingDepthOverrides:
          data.builtinThinkingDepthOverrides &&
          typeof data.builtinThinkingDepthOverrides === "object" &&
          !Array.isArray(data.builtinThinkingDepthOverrides)
            ? (data.builtinThinkingDepthOverrides as Record<string, ThinkingDepth>)
            : state.builtinThinkingDepthOverrides,
        builtinUrlOverrides:
          data.builtinUrlOverrides &&
          typeof data.builtinUrlOverrides === "object" &&
          !Array.isArray(data.builtinUrlOverrides)
            ? (data.builtinUrlOverrides as Record<string, string>)
            : state.builtinUrlOverrides,
        builtinModelOverrides:
          data.builtinModelOverrides &&
          typeof data.builtinModelOverrides === "object" &&
          !Array.isArray(data.builtinModelOverrides)
            ? (data.builtinModelOverrides as Record<string, ModelConfig[]>)
            : state.builtinModelOverrides,
        modelMode: (data.modelMode as SettingsSlice["modelMode"]) ?? state.modelMode,
        qualityModel: (data.qualityModel as string) ?? state.qualityModel,
        balancedModel: (data.balancedModel as string) ?? state.balancedModel,
        fastModel: (data.fastModel as string) ?? state.fastModel,
        user: (data.user as UserProfile) ?? state.user,
        userProfiles: Array.isArray(data.userProfiles)
          ? (data.userProfiles as UserProfile[])
          : state.userProfiles,
        activeProfileId: (data.activeProfileId as string | null) ?? state.activeProfileId,
        // v0.2.0 新增字段
        translationSettings:
          data.translationSettings &&
          typeof data.translationSettings === "object"
            ? (data.translationSettings as TranslationSettings)
            : state.translationSettings,
        highlightSettings:
          data.highlightSettings &&
          typeof data.highlightSettings === "object"
            ? (data.highlightSettings as HighlightSettings)
            : state.highlightSettings,
        toolGlobalSettings:
          data.toolGlobalSettings &&
          typeof data.toolGlobalSettings === "object"
            ? (data.toolGlobalSettings as ToolGlobalSettings)
            : state.toolGlobalSettings,
        builtinToolConfigs:
          Array.isArray(data.builtinToolConfigs) &&
          data.builtinToolConfigs.length > 0
            ? (data.builtinToolConfigs as BuiltinToolConfig[])
            : state.builtinToolConfigs,
        splashShown:
          typeof data.splashShown === "boolean"
            ? data.splashShown
            : state.splashShown,
        trpgNoticeDismissed:
          typeof data.trpgNoticeDismissed === "boolean"
            ? data.trpgNoticeDismissed
            : state.trpgNoticeDismissed,
      }));
    } catch (e) {
      console.error("[SettingsSlice] 从 IndexedDB 加载设置失败:", e);
    }
  },

  saveToStorage: async () => {
    try {
      const data = extractPersistableData(get());
      await setItem("settings", "settings", data);
    } catch (e) {
      console.error("[SettingsSlice] 保存设置到 IndexedDB 失败:", e);
    }
  },
});
