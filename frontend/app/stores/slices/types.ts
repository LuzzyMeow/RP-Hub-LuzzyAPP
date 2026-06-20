import type { UIMessagePart } from "~/types";
import type {
  ApiProvider,
  ThemeMode,
  UserProfile,
  ChatMessage,
  Character,
  Session,
  TranslationSettings,
  ToolGlobalSettings,
  KnowledgeBase,
  Skill,
  ModelConfig,
  ApiType,
  ThinkingDepth,
  BuiltinToolConfig,
  BuiltinToolType,
} from "~/types/luzzy";

// ============================================================================
// rikkahub 原有 slices（保留）
// ============================================================================

export interface Draft {
  text: string;
  parts: UIMessagePart[];
  modeInjectionIds?: string[];
  lorebookIds?: string[];
}

export interface ChatInputSlice {
  drafts: Record<string, Draft>;
  setText: (conversationId: string, text: string) => void;
  addParts: (conversationId: string, parts: UIMessagePart[]) => void;
  removePartAt: (conversationId: string, index: number) => void;
  setPromptInjectionIds: (
    conversationId: string,
    ids: { modeInjectionIds: string[]; lorebookIds: string[] },
  ) => void;
  getPromptInjectionIds: (conversationId: string) => {
    modeInjectionIds: string[];
    lorebookIds: string[];
  };
  clearDraft: (conversationId: string) => void;
  isEmpty: (conversationId: string) => boolean;
  getSubmitParts: (conversationId: string) => UIMessagePart[];
}

export interface ClockSlice {
  clockOffset: number;
  setClockOffset: (serverTime: number) => void;
}

// ============================================================================
// LUZZY slices
// ============================================================================

/** 模型模式 */
export type ModelMode = "quality" | "balanced" | "fast";

/** 自定义请求体校验结果 */
export interface CustomRequestBodyValidation {
  valid: boolean;
  error: string;
}

/** 设置 Slice（LUZZY 完整设置状态） */
export interface SettingsSlice {
  // ===== 主题 =====
  theme: ThemeMode;

  // ===== API 基础配置 =====
  apiUrl: string;
  apiKey: string;
  modelName: string;
  stream: boolean;
  enableThinking: boolean;
  customRequestBody: string;

  // ===== 供应商 =====
  apiProviderId: string;
  customApiProviders: ApiProvider[];
  apiProviderKeys: Record<string, string>;
  /** 内置供应商的思考深度覆盖（v0.3.0：内置供应商不可变，用 override map 存储） */
  builtinThinkingDepthOverrides: Record<string, ThinkingDepth>;

  // ===== 模型模式（v0.2.0 保留但设置页不展示，向后兼容） =====
  modelMode: ModelMode;
  qualityModel: string;
  balancedModel: string;
  fastModel: string;

  // ===== 用户档案 =====
  user: UserProfile;
  userProfiles: UserProfile[];
  activeProfileId: string | null;

  // ===== v0.2.0 新增 =====
  /** 翻译设置 */
  translationSettings: TranslationSettings;
  /** 工具全局设置 */
  toolGlobalSettings: ToolGlobalSettings;
  /** 内置工具配置列表 */
  builtinToolConfigs: BuiltinToolConfig[];
  /** 本次启动是否已显示启动动画 */
  splashShown: boolean;
  /** TRPG 提示本次启动不再弹出 */
  trpgNoticeDismissed: boolean;

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
  getAllProviders: () => ApiProvider[];
  getProviderById: (id: string) => ApiProvider | undefined;
  /** 更新供应商的 API 地址 */
  setProviderApiUrl: (id: string, url: string) => void;
  /** 更新供应商的 API 类型 */
  setProviderApiType: (id: string, apiType: ApiType) => void;
  /** 更新供应商的自定义请求体 */
  setProviderCustomRequestBody: (id: string, body: string) => void;
  /** 更新供应商的显示名称（最大 20 字符） */
  setProviderDisplayName: (id: string, displayName: string) => void;
  /** 更新供应商的思考深度 */
  setProviderThinkingDepth: (id: string, depth: ThinkingDepth) => void;
  /** 向供应商添加模型 */
  addModelToProvider: (providerId: string, model: ModelConfig) => void;
  /** 从供应商移除模型 */
  removeModelFromProvider: (providerId: string, modelId: string) => void;
  /** 更新供应商的模型配置 */
  updateModelConfig: (providerId: string, modelId: string, partial: Partial<ModelConfig>) => void;

  // ===== Actions：模型模式（保留向后兼容） =====
  setModelMode: (mode: ModelMode) => void;
  setQualityModel: (model: string) => void;
  setBalancedModel: (model: string) => void;
  setFastModel: (model: string) => void;

  // ===== Actions：用户档案 =====
  setUser: (partial: Partial<UserProfile>) => void;
  addProfile: (profile?: Partial<UserProfile>) => void;
  switchProfile: (uuid: string) => void;
  removeProfile: (uuid: string) => void;

  // ===== Actions：v0.2.0 新增 =====
  setTranslationSettings: (settings: Partial<TranslationSettings>) => void;
  setToolGlobalMode: (mode: ToolGlobalSettings['mode']) => void;
  updateBuiltinToolConfig: (
    type: BuiltinToolType,
    partial: Partial<BuiltinToolConfig>,
  ) => void;
  setSplashShown: (shown: boolean) => void;
  setTrpgNoticeDismissed: (dismissed: boolean) => void;

  // ===== Actions：持久化（IndexedDB 备份） =====
  loadFromStorage: () => Promise<void>;
  saveToStorage: () => Promise<void>;
}

/** 角色卡 Slice */
export interface CharacterSlice {
  characters: Character[];
  currentCharacterUuid: string | null;
  searchQuery: string;
  displayLimit: number;

  loadCharacters: () => Promise<void>;
  saveCharacters: () => Promise<void>;
  addCharacter: (character: Character) => Promise<void>;
  updateCharacter: (uuid: string, partial: Partial<Character>) => Promise<void>;
  deleteCharacter: (uuid: string) => Promise<void>;
  setCurrentCharacterUuid: (uuid: string | null) => void;
  toggleFavorite: (uuid: string) => Promise<void>;
  importCharacter: (json: string) => Promise<void>;
  importCharacterFromCard: (cardData: unknown) => Promise<void>;
  exportCharacter: (uuid: string) => string;
  searchCharacters: (query: string) => void;
  getFilteredCharacters: () => Character[];
  /** 确保默认角色"鹿溪"存在（首次启动时创建） */
  ensureDefaultCharacter: () => Promise<void>;
}

/** 聊天 Slice */
export interface ChatSlice {
  messages: ChatMessage[];
  currentCharacter: Character | null;
  isGenerating: boolean;
  isThinking: boolean;
  isReceiving: boolean;
  inputDraft: string;
  abortController: AbortController | null;

  setMessages: (messages: ChatMessage[]) => void;
  addMessage: (message: ChatMessage) => void;
  updateMessage: (id: string, partial: Partial<ChatMessage>) => void;
  setCurrentCharacter: (character: Character | null) => void;
  setInputDraft: (draft: string) => void;

  sendMessage: (content: string) => Promise<void>;
  stopGenerating: () => void;
  regenerate: () => Promise<void>;
  editMessage: (id: string, content: string) => void;
  deleteMessage: (id: string) => void;
  clearMessages: () => void;
  loadChatHistory: (characterUuid: string) => Promise<void>;
  saveChatHistory: () => Promise<void>;

  // ===== v0.2.0 新增 =====
  /** 翻译消息（调用当前模型，独立提示词通道） */
  translateMessage: (messageId: string) => Promise<void>;
  /** 重试消息（生成新版本存入 retryBranches） */
  retryMessage: (messageId: string) => Promise<void>;
  /** 切换重试版本 */
  switchRetryVersion: (messageId: string, direction: 'prev' | 'next') => void;
  /** 创建对话分支 */
  createBranch: (messageId: string) => void;
  /** 分享消息 */
  shareMessage: (messageId: string) => Promise<void>;
}

/** UI Slice */
export interface UISlice {
  sideMenuOpen: boolean;
  toggleSideMenu: () => void;
  setSideMenuOpen: (open: boolean) => void;
}

/** 会话 Slice（v0.2.0 新增 — 多会话架构） */
export interface SessionSlice {
  sessions: Session[];
  currentSessionId: string | null;

  createSession: (characterId: string, characterName: string) => string;
  switchSession: (id: string) => void;
  deleteSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  getSessionMessages: (id: string) => ChatMessage[];
  setSessionMessages: (id: string, messages: ChatMessage[]) => void;
  addRetryBranch: (sessionId: string, messageId: string, newMessage: ChatMessage) => void;
  switchRetryBranch: (sessionId: string, messageId: string, index: number) => void;
  loadSessions: () => Promise<void>;
  saveSessions: () => Promise<void>;
}

/** 知识库 Slice（v0.2.0 新增） */
export interface KnowledgeBaseSlice {
  knowledgeBases: KnowledgeBase[];

  addKnowledgeBase: (kb: KnowledgeBase) => void;
  updateKnowledgeBase: (id: string, partial: Partial<KnowledgeBase>) => void;
  removeKnowledgeBase: (id: string) => void;
  toggleCharacterEnabled: (kbId: string, characterUuid: string) => void;
  loadKnowledgeBases: () => Promise<void>;
  saveKnowledgeBases: () => Promise<void>;
}

/** SKILL Slice（v0.2.0 新增） */
export interface SkillSlice {
  skills: Skill[];

  addSkill: (skill: Skill) => void;
  updateSkill: (id: string, partial: Partial<Skill>) => void;
  removeSkill: (id: string) => void;
  toggleSkillEnabled: (id: string) => void;
  toggleSkillCharacterEnabled: (id: string, characterUuid: string) => void;
  toggleSkillGlobalEnabled: (id: string) => void;
  loadSkills: () => Promise<void>;
  saveSkills: () => Promise<void>;
}

// ============================================================================
// 组合类型
// ============================================================================

export type AppStoreState = SettingsSlice &
  CharacterSlice &
  ChatSlice &
  UISlice &
  ChatInputSlice &
  ClockSlice &
  SessionSlice &
  KnowledgeBaseSlice &
  SkillSlice;
