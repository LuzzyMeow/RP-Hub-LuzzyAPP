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
  alternateGreetings: string[];
  tags: string[];
  creator: string;
  characterVersion: string;
  createdAt: number;
  updatedAt: number;
  favorite?: boolean;
  /** 角色卡扩展数据 */
  extensions?: Record<string, unknown>;
}

/** API 供应商 */
export interface ApiProvider {
  id: string;
  name: string;
  apiUrl: string;
  isBuiltin?: boolean;
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

/** 底部 Tab 项 */
export interface TabItem {
  key: string;
  label: string;
  icon: string;
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
  createdAt: number;
  updatedAt: number;
}

/** 世界书条目 */
export interface WorldInfoEntry {
  id: string;
  keys: string[];
  content: string;
  enabled: boolean;
  constant: boolean;
  order: number;
  position: number;
  depth: number;
  probability: number;
  insertionOrder?: number;
}

/** 正则脚本 */
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
}

/** UI 模板 */
export interface UiTemplate {
  id: string;
  name: string;
  content: string;
  enabled: boolean;
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
