/**
 * LUZZY 共享类型定义
 */

/** 消息角色 */
export type MessageRole = 'user' | 'assistant' | 'system';

/** 单条聊天消息（内部使用） */
export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: number;
  updatedAt?: number;
  /** 是否处于生成中 */
  loading?: boolean;
  /** 错误信息 */
  error?: string;
  /** 关联的角色卡 ID */
  characterId?: string;
  /** 思考链内容 */
  cot?: string;
  /** 工具调用列表 */
  toolCalls?: ToolCall[];
  /** 记忆召回结果 */
  memoryRecalls?: MemoryRecall[];
  /** 生成耗时（毫秒） */
  generationTime?: number;
  /** 所属分支 ID（重试分支支持） */
  branchId?: string;
  /** 分支内序号 */
  branchIndex?: number;
  /** 翻译后内容 */
  translatedContent?: string;
  /** 翻译目标语言 */
  translationLanguage?: string;
  /** Token 使用统计 */
  tokenUsage?: TokenUsage;
  /** Agent 执行步骤（思考/工具调用/记忆注入等） */
  agentSteps?: AgentStep[];
  /** v0.4.6: 工具结果消息元数据（用于 buildContext 识别 tool 消息） */
  metadata?: {
    toolCallId?: string;
    toolName?: string;
    isToolResult?: boolean;
  };
}

/** Token 使用统计 */
export interface TokenUsage {
  /** 输入 tokens */
  promptTokens: number;
  /** 缓存命中的 tokens */
  cachedTokens?: number;
  /** 输出 tokens */
  completionTokens: number;
  /** 总 tokens */
  totalTokens?: number;
  /** 响应时间（毫秒） */
  responseTimeMs: number;
  /** 每秒输出 tokens */
  tokPerSec: number;
  /** 缓存命中率（0-100） */
  cacheHitRate?: number;
}

/** Agent 执行步骤 */
export interface AgentStep {
  id: string;
  type: 'thinking' | 'tool_call' | 'tool_result' | 'memory_inject' | 'knowledge_call';
  title: string;
  content?: string;
  status: 'running' | 'completed' | 'error';
  startedAt: number;
  endedAt?: number;
  /** v0.5.1: 所属请求阶段（1=工具决策, 2=CoT, 3=正文） */
  phase?: 1 | 2 | 3;
}

/** 工具调用状态 */
export type ToolCallStatus =
  | 'pending'
  | 'receiving'
  | 'queued'
  | 'running'
  | 'continuing'
  | 'completed'
  | 'error';

/** 工具调用 */
export interface ToolCall {
  id: string;
  toolName: string;
  callLabel: string;
  query: string;
  reason?: string;
  status: ToolCallStatus;
  result?: string;
  error?: string;
  mcpSubToolName?: string;
}

/** 记忆召回结果 */
export interface MemoryRecall {
  id: string;
  content: string;
  score: number;
  turn: number;
}

/** 角色卡 */
export interface Character {
  id: string;
  uuid: string;
  name: string;
  avatar?: string;
  description: string;
  personality: string;
  scenario: string;
  firstMessage: string;
  mesExample: string;
  /** 对话示例（结构化气泡样式，v0.3.1 新增） */
  dialogueExamples?: Array<{ agent: string; user: string }>;
  alternateGreetings: string[];
  tags: string[];
  creator: string;
  characterVersion: string;
  createdAt: number;
  updatedAt: number;
  favorite?: boolean;
  /** 角色卡扩展数据 */
  extensions?: Record<string, unknown>;
  /** 自定义背景配置（v0.3.0 新增） */
  customBackground?: {
    /** 背景图片（data URL 或路径） */
    image: string;
    /** 透明度 0-100 */
    opacity: number;
    /** 模糊度 0-20 (px) */
    blur: number;
  };
}

/** API 供应商 */
export interface ApiProvider {
  id: string;
  name: string;
  /** 显示名称（用户自定义，最大 20 字符，前端展示用；为空时回退到 name） */
  displayName?: string;
  apiUrl: string;
  isBuiltin?: boolean;
  /** API 协议类型 */
  apiType?: ApiType;
  /** 供应商下的多模型列表 */
  models?: ModelConfig[];
  /** 每供应商独立的自定义请求体 JSON */
  customRequestBody?: string;
  /** 思考深度档位（OpenAI 对齐） */
  thinkingDepth?: ThinkingDepth;
}

/** API 协议类型 */
export type ApiType =
  | 'openai-compatible'
  | 'google-gemini'
  | 'anthropic-messages'
  | 'openai-responses';

/** 思考深度档位（OpenAI reasoning_effort 对齐，v0.3.0 扩展为 6 档） */
export type ThinkingDepth = 'minimal' | 'auto' | 'low' | 'medium' | 'high' | 'max';

/** 模型配置（每供应商多模型） */
export interface ModelConfig {
  id: string;
  /** 模型名（向后兼容，作为 modelId 和 displayName 的回退值） */
  name: string;
  /** v0.3.5: 模型 ID（实际请求时的 model name，如 deepseek-v4-pro） */
  modelId?: string;
  /** v0.3.5: 显示名称（仅前端页面使用，如 DeepSeek V4 Pro） */
  displayName?: string;
  /** 上下文长度（数字，如 1000000） */
  contextLength?: number;
  /** 输出长度 */
  outputLength?: number;
  /** 是否支持视觉 */
  supportsVision?: boolean;
  /** 是否支持视频 */
  supportsVideo?: boolean;
  /** 是否支持音频 */
  supportsAudio?: boolean;
  /** 是否支持推理 */
  supportsReasoning?: boolean;
  /** 是否支持嵌入（v0.3.4 新增，勾选后可在记忆页下拉选择） */
  supportsEmbedding?: boolean;
  /** 历史消息数限制（0=不限制，默认 0。v0.3.0 新增） */
  historyMessageLimit?: number;
}

/** API 配置 */
export interface ApiSettings {
  apiUrl: string;
  apiKey: string;
  modelName: string;
  stream: boolean;
  enableThinking: boolean;
  /** 自定义请求体 JSON */
  customRequestBody?: string;
}

/** 主题模式 */
export type ThemeMode = 'light' | 'dark';

/** 底部 Tab 图标名称（与 BottomTabBar 的 TabIcon switch 一一对应） */
export type TabIconName = 'chat' | 'characters' | 'trpg' | 'tools' | 'mine';

/** 底部 Tab 项 */
export interface TabItem {
  key: string;
  label: string;
  icon: TabIconName;
  path: string;
}

/** 更多菜单项 */
export interface MoreMenuItem {
  key: string;
  label: string;
  description: string;
  icon: string;
  path: string;
}

/** 预设 */
export interface Preset {
  id: string;
  name: string;
  content: string;
  isBuiltin?: boolean;
  isLuzzy?: boolean;
  /** 是否启用（禁用的预设不注入上下文） */
  enabled: boolean;
  /** 角色卡绑定（空数组=全局启用） */
  enabledForCharacters?: string[];
  /** 内置预设默认只读，但允许用户解锁编辑 */
  isReadonly?: boolean;
  createdAt: number;
  updatedAt: number;
}

/** 世界书条目 */
export interface WorldInfoEntry {
  id: string;
  /** 条目名称 */
  name?: string;
  /** 所属世界书 ID（一级分组） */
  bookId?: string;
  /** 所属世界书名称（一级分组，冗余字段便于展示） */
  bookName?: string;
  keys: string[];
  /** 次要关键词（选择性模式需同时匹配） */
  secondaryKeys?: string[];
  content: string;
  enabled: boolean;
  constant: boolean;
  order: number;
  position: number;
  depth: number;
  probability: number;
  /** 插入顺序（越高影响力越大） */
  insertionOrder?: number;
  /** 是否使用正则表达式（启用后用 /regex/flags 搜索） */
  useRegex?: boolean;
  /** 是否选择性模式（需同时匹配关键词与次要关键词） */
  selective?: boolean;
  /** v0.4.6: 世界书条目的嵌入向量（用于 world-recall 语义检索） */
  embedding?: number[];
}

/** 正则脚本（v0.2.0 旧结构，保留用于迁移） */
export interface RegexScript {
  id: string;
  name: string;
  findRegex: string;
  replaceString: string;
  enabled: boolean;
  placement: number;
  mode: number;
  depth: number;
}

/** 正则作用范围（v0.3.0 新增） */
export type RegexScope = 'user' | 'character' | 'thinking' | 'worldinfo';

/** 正则执行时机（v0.3.0 新增） */
export type RegexTiming =
  | 'display'      // 显示时
  | 'send'         // 发送时
  | 'send_display' // 发送和显示时
  | 'receive'      // 接收时
  | 'receive_edit'; // 接收和改写时

/** 参数替换模式（v0.3.0 新增） */
export type RegexParamReplace = 'none' | 'raw' | 'escape';

/** 正则脚本条目（v0.3.0 重构） */
export interface RegexScriptEntry {
  id: string;
  /** 条目名称 */
  name: string;
  /** 正则表达式 (Find Regex) */
  findRegex: string;
  /** 替换内容 (Replace With)，支持 {{match}}、$1、$2 */
  replaceString: string;
  /** 替换前修剪 (Trim Out)，每行一个 */
  trimOut?: string;
  /** 作用范围（可多选） */
  scope: RegexScope[];
  /** 执行时机 */
  timing: RegexTiming;
  /** 参数替换模式 */
  paramReplace: RegexParamReplace;
  /** 消息深度范围 [min, max]，留空则不限制 */
  depthRange?: { min: number; max: number };
  /** 是否启用 */
  enabled: boolean;
}

/** 正则脚本组（v0.3.0：一组多条目） */
export interface RegexScriptGroup {
  id: string;
  /** 正则组名称 */
  name: string;
  /** 组内条目 */
  entries: RegexScriptEntry[];
  /** 是否启用整组 */
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

/** ActiveTool 类型 */
export type ActiveToolType =
  | 'vector'
  | 'keyword'
  | 'web'
  | 'world'
  | 'skill_readfile'
  | 'mcp_http'
  | 'skill';

/** ActiveTool 启用模式 */
export type ActiveToolEnableMode = 'all' | 'whitelist';

/** ActiveTool */
export interface ActiveTool {
  id: string;
  name: string;
  enabled: boolean;
  callName: string;
  type: ActiveToolType;
  description: string;
  displayDescription?: string;
  resultCount: number;
  resultCountVersion?: number;
  tavilyApiKey?: string;
  worldInfoAccessMode?: string;
  worldInfoAccessModeVersion?: number;
  enableMode?: ActiveToolEnableMode;
  allowedCharacterUuids?: string[];
  /** MCP 相关 */
  mcpServerUrl?: string;
  mcpServerName?: string;
  mcpTools?: McpSubTool[];
  /** v0.3.2: MCP 连接状态（导入后自动测试） */
  mcpConnectionStatus?: "connected" | "failed" | "untested";
  mcpConnectionError?: string;
  mcpLastTestedAt?: number;
  /** SKILL 相关 */
  skillFileContent?: string;
  skillFileName?: string;
}

/** MCP 子工具 */
export interface McpSubTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/** 记忆设置 */
export interface MemorySettings {
  enabled: boolean;
  embeddingModel: string;
  embeddingApiProviderId?: string;
  maxMemories: number;
  recallDepth: number;
  vectorTopK: number;
  similarityThreshold: number;
  compressionEnabled: boolean;
  compressionKeepRecent: number;
  /** v0.4.4: 长期记忆启用的角色卡 UUID 列表(空表示对所有角色卡启用) */
  longTermMemoryCharacterIds?: string[];
  /** v0.4.4: 全局记忆启用的角色卡 UUID 列表(空表示对所有角色卡启用) */
  globalMemoryCharacterIds?: string[];
}

/** 全局记忆 */
export interface GlobalMemory {
  content: string;
  updatedAt: number;
}

/** 向量记忆分片 */
export interface VectorMemoryShard {
  id: string;
  content: string;
  turn: number;
  embedding: number[];
  createdAt: number;
}

/** 用户档案 */
export interface UserProfile {
  uuid: string;
  name: string;
  description: string;
  person: 'first' | 'second' | 'third';
  /** 头像（data URL，仅本地展示，不注入聊天） */
  avatar?: string;
}

/** UI 模板 */
export interface UiTemplate {
  id: string;
  name: string;
  content: string;
  enabled: boolean;
  /** 角色卡绑定（空数组=全局） */
  enabledForCharacters?: string[];
  /** 注入类型 */
  injectionType?: 'markdown' | 'html' | 'css';
}

/** ActiveTool 调用 */
export interface ActiveToolCall {
  tool: ActiveTool;
  mode: 'add' | 'cover';
  callLabel: string;
  query: string;
  raw: string;
  reason?: string;
  mcpSubToolName?: string;
}

/** ActiveTool UI 状态 */
export interface ActiveToolUi {
  tool: ActiveTool;
  mode: 'add' | 'cover';
  callName: string;
  query: string;
  raw: string;
  reason?: string;
  mcpSubToolName?: string;
}

/** 工具执行上下文 */
export interface ToolExecutionContext {
  messages: ChatMessage[];
  character: Character | null;
  vectorMemoryShards: VectorMemoryShard[];
  worldInfoEntries: WorldInfoEntry[];
  tavilyApiKey?: string;
  mcpSessionIds: Map<string, string>;
  /** anysearch 内置工具配置（含 API Token 与返回条数） */
  anysearchConfig?: BuiltinToolConfig;
}

/** 世界书处理结果 */
export interface WorldInfoProcessResult {
  triggeredEntries: WorldInfoEntry[];
  injections: WorldInfoInjection[];
}

/** 世界书注入 */
export interface WorldInfoInjection {
  entry: WorldInfoEntry;
  position: number;
  depth: number;
}

/** 会话/对话 */
export interface Conversation {
  id: string;
  title: string;
  characterId?: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
}

/** TRPG 代理配置 */
export interface TrpgProxyConfig {
  apiUrl: string;
  apiKey: string;
  modelName: string;
  enableThinking: boolean;
  customRequestBody: string;
}

/** SKILL 文件节点（树形结构） */
export interface SkillFileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  content?: string;
  children?: SkillFileNode[];
}

/** SKILL 导入来源 */
export type SkillImportSource = 'github' | 'zip' | 'manual';

/** GitHub 镜像站 */
export interface GithubMirror {
  name: string;
  url: string;
}

/** 角色卡导出格式 */
export type CharacterExportFormat = 'png' | 'json' | 'chat';

/** 上下文查看器条目 */
export interface ContextViewerItem {
  role: MessageRole;
  content: string;
  source: 'system' | 'character' | 'history' | 'worldinfo' | 'memory' | 'preset' | 'tool';
  tokenEstimate?: number;
}

/** 模型信息 */
export interface ModelInfo {
  id: string;
  name: string;
  providerId: string;
  providerName: string;
  capabilities?: string[];
  contextLength?: number;
  favorite?: boolean;
}

/** 模型选择模式 */
export type ModelSelectionMode = 'quality' | 'balanced' | 'fast';

/** API 状态 */
export type ApiStatus = 'unknown' | 'checking' | 'connected' | 'error';

// ============================================================================
// v0.2.0 新增类型
// ============================================================================

/** 会话（多会话架构，每角色卡可有多个会话） */
export interface Session {
  id: string;
  title: string;
  characterId: string;
  characterName: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  /** 重试分支：messageId -> 该消息的多个版本 */
  retryBranches?: Record<string, ChatMessage[]>;
  /** 当前选中的重试版本索引 */
  retryActiveIndex?: Record<string, number>;
}

/** 翻译设置 */
export interface TranslationSettings {
  enabled: boolean;
  /** 目标语言（如 "简体中文"） */
  targetLanguage: string;
  /** 自定义语言（用户填写） */
  customLanguage: string;
  /** 翻译提示词模板（含 {message} 和 {language} 占位符） */
  promptTemplate: string;
}

/** 高亮显示设置（v0.3.7 新增） */
export interface HighlightSettings {
  enabled: boolean;
  /** 高亮字体颜色（CSS color 值） */
  color: string;
  /** 匹配模式（默认 "" 中文引号，支持自定义正则） */
  pattern: string;
}

/** 知识库 */
export interface KnowledgeBase {
  id: string;
  name: string;
  tags: string[];
  files: KnowledgeBaseFile[];
  /** 启用的角色卡 UUID 列表 */
  enabledForCharacters: string[];
  createdAt: number;
  updatedAt: number;
}

/** 知识库文件 */
export interface KnowledgeBaseFile {
  id: string;
  name: string;
  type: 'image' | 'md' | 'txt';
  /** 文本内容或图片 base64 */
  content: string;
  size: number;
  uploadedAt: number;
}

/** 记忆作用域 */
export type MemoryScope = 'session' | 'long-term' | 'global';

/** 记忆条目 */
export interface MemoryEntry {
  id: string;
  scope: MemoryScope;
  characterId: string;
  /** session 记忆关联会话 */
  sessionId?: string;
  content: string;
  turn?: number;
  embedding?: number[];
  createdAt: number;
}

/** 工具全局模式 */
export type ToolGlobalMode = 'force' | 'active' | 'adaptive';

/** 工具全局设置 */
export interface ToolGlobalSettings {
  mode: ToolGlobalMode;
}

/** SKILL（技能） */
export interface Skill {
  id: string;
  name: string;
  description: string;
  source: SkillImportSource;
  githubUrl?: string;
  files: SkillFileNode[];
  tags: string[];
  enabledForCharacters: string[];
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

/** 启动动画状态 */
export interface SplashState {
  visible: boolean;
  progress: number;
}

/** 内置工具类型（v0.2.0 重构） */
export type BuiltinToolType =
  | 'vector-memory'
  | 'keyword-search'
  | 'memory-recall'
  | 'world-recall'  // v0.4.3 新增:世界书召回（嵌入模型）
  | 'world-search'  // v0.4.3 新增:世界书检索（关键词）
  | 'anysearch';

/** 内置工具配置 */
export interface BuiltinToolConfig {
  type: BuiltinToolType;
  enabled: boolean;
  /** 返回条数 */
  resultCount: number;
  /** 是否检索全局记忆 */
  searchGlobalMemory: boolean;
  /** 启用的角色卡 UUID 列表 */
  enabledForCharacters: string[];
  /** anysearch API Token（可选，不填使用匿名免费配额） */
  anysearchToken?: string;
}

// ============================================================================
// ACE (Agentic Context Engineering) 记忆机制类型 — v0.3.0
// ============================================================================

/** ACE 策略来源标记 */
export type AceSkillSource = 'manual' | 'auto';

/** ACE 策略评估标签 */
export type AceSkillVerdict = 'helpful' | 'harmful' | 'neutral';

/** ACE 策略（Skill，此 Skill 非技能 SKILL） */
export interface AceSkill {
  /** 唯一标识，格式 mem-XXXXX，自增 */
  id: string;
  /** 分类标签 */
  category: string;
  /** 策略正文 */
  content: string;
  /** 被评估为"有帮助"的次数 */
  helpfulCount: number;
  /** 被评估为"有害"的次数 */
  harmfulCount: number;
  /** 被评估为"中性"的次数 */
  neutralCount: number;
  /** 是否启用，false 时停止注入但仍保留数据（软删除） */
  active: boolean;
  /** 创建时间 ISO 8601 */
  createdAt: string;
  /** 最后更新时间 ISO 8601 */
  updatedAt: string;
  /** 来源标记：manual(用户手动) | auto(自动反思) */
  source?: AceSkillSource;
}

/** ACE Skillbook（策略手册） */
export interface AceSkillbook {
  /** 所有策略 */
  skills: AceSkill[];
  /** 最后一次自增 ID 数字 */
  lastId: number;
  /** 最后更新时间 ISO 8601 */
  updatedAt: string;
}

/** 策略评估 */
export interface AceSkillEvaluation {
  skillId: string;
  /** helpful / harmful / neutral */
  verdict: AceSkillVerdict;
  /** 评估理由 */
  reason?: string;
}

/** 新策略建议 */
export interface AceNewSkill {
  category: string;
  content: string;
}

/** ACE 反思结果 */
export interface AceReflection {
  /** 策略评估标签 */
  evaluations: AceSkillEvaluation[];
  /** 改进建议 / 新策略 */
  newSkills: AceNewSkill[];
}

/** ACE 执行轨迹（用于反思的输入，仅含摘要不含完整内容） */
export interface AceExecutionTrace {
  /** 用户输入摘要（前 200 字符） */
  userInputSummary: string;
  /** Agent 步骤摘要列表 */
  agentSteps: string[];
  /** 最终输出摘要（前 300 字符） */
  outputSummary: string;
  /** 本次交互使用的 active 策略 ID 列表 */
  appliedSkillIds: string[];
  /** 时间戳 ISO 8601 */
  timestamp: string;
}
