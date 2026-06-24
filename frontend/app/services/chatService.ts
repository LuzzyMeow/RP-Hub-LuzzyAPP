/**
 * 聊天核心服务
 *
 * 提供上下文构建、正则脚本处理和记忆提取功能。
 * 从旧 Vue 3 app.js 迁移，改为纯函数风格，状态由 zustand store 管理。
 */

import type {
  ChatMessage,
  Character,
  UserProfile,
  Preset,
  WorldInfoEntry,
  ApiSettings,
  ApiProvider,
  MemorySettings,
  MessageRole,
  RegexScript,
  RegexScriptGroup,
  RegexScriptEntry,
  RegexScope,
  RegexTiming,
  VectorMemoryShard,
  BuiltinToolConfig,
  BuiltinToolType,
  ActiveTool,
  ToolGlobalMode,
} from "~/types/luzzy";
import { PASSIVE_TOOL_TYPES } from "~/types/luzzy";
import { parseCot } from "~/services/markdownService";
import {
  buildVectorMemory,
  loadVectorMemoryShards,
  saveVectorMemoryShards,
  compressContext,
} from "~/services/memoryService";
import { logger } from "~/services/logger";

// ============================================================================
// 类型定义
// ============================================================================

/** API 消息格式（发送给 API 的消息结构） */
export interface ApiMessage {
  role: MessageRole | "tool";
  content: string;
  name?: string;
  /** v0.4.6: 工具结果消息的关联 tool_call_id（OpenAI function calling 协议） */
  tool_call_id?: string;
  /** v0.4.6: assistant 消息携带的 tool_calls 数组（OpenAI function calling 协议） */
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

/** buildContext 参数 */
export interface BuildContextParams {
  messages: ChatMessage[];
  character: Character | null;
  user: UserProfile;
  presets: Preset[];
  worldInfoEntries: WorldInfoEntry[];
  settings: ApiSettings;
  apiProviders: ApiProvider[];
  apiProviderKeys: Record<string, string>;
  /** 向量记忆分片（用于记忆召回） */
  vectorMemoryShards?: VectorMemoryShard[];
  /** 记忆设置（启用时进行向量记忆召回） */
  memorySettings?: MemorySettings;
  /** 当前会话 ID（用于记忆压缩时识别可移除的轮次） */
  sessionId?: string;
  /** v0.4.3: 内置工具配置（用于注入工具描述到 system prompt） */
  builtinToolConfigs?: BuiltinToolConfig[];
  /** v0.4.6: 用户工具（用于注入工具描述到 system prompt） */
  activeTools?: ActiveTool[];
  /** v0.7.3-fix: 跳过 [World Info] 注入到 system prompt（当 world-recall 预执行已注入 <world_recall_result> 时为 true，避免双重注入+反馈回路） */
  skipWorldInfoInjection?: boolean;
  /** v0.8.1: 工具模式（控制协议注入方式：force=文本标签，active/adaptive=原生 function calling） */
  toolMode?: ToolGlobalMode;
  /** v0.8.1: Agentic 循环最大步数（写入协议提示词） */
  maxAgentSteps?: number;
}

/** buildContext 返回值 */
export interface BuildContextResult {
  systemPrompt: string;
  apiMessages: ApiMessage[];
}

// v0.7.1: 单阶段架构 — 三个协议常量已合并到 LUZZY_PRESET_CONTENT (Step 8-10)
// 删除：NSFW_CREATION_MODE_DECLARATION、STAGE2_COMBINED_PROTOCOL、TOOL_DECISION_PROMPT

/** extractMemory 参数 */
export interface ExtractMemoryParams {
  messages: ChatMessage[];
  character: Character | null;
  settings: ApiSettings;
  memorySettings: MemorySettings;
  /** 供应商列表（内置 + 自定义），用于嵌入 API 路由 */
  apiProviders: ApiProvider[];
  /** 各供应商的 API Key 映射 */
  apiProviderKeys: Record<string, string>;
  /** 当前会话 ID（提供时记忆分片保存到会话级键） */
  sessionId?: string;
}

// ============================================================================
// 内置工具描述（v0.4.3 新增）
// ============================================================================
/**
 * 内置工具元信息：callLabel 为工具调用标签，description 为工具描述
 *
 * 用于在 system prompt 末尾注入工具描述，提升模型主动调用工具的概率
 */
export const BUILTIN_TOOL_INFO: Record<
  BuiltinToolType,
  {
    callLabel: string;
    description: string;
    parameters: Record<string, unknown>;
  }
> = {
  "memory-recall": {
    callLabel: "memory-recall",
    description:
      "【被动触发】使用嵌入模型自动召回会话中与用户消息相关的历史对话轮次，按相似度排序返回。不需手动调用。",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "记忆召回的查询关键词" } },
      required: ["query"],
    },
  },
  "vector-memory": {
    callLabel: "vector-memory",
    description:
      '在当前会话的向量记忆中语义检索。当你需要回忆之前对话的细节、查找已讨论过的内容时调用。参数 query 为空格分隔的关键词列表（如"城堡 之前 名字"）。',
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "空格分隔的多个关键词" } },
      required: ["query"],
    },
  },
  "keyword-search": {
    callLabel: "keyword-search",
    description:
      "在当前会话中按关键词搜索聊天消息。当你需要查找包含特定词汇的历史对话时调用。参数 query 为空格分隔的多个关键词。",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "空格分隔的多个关键词" } },
      required: ["query"],
    },
  },
  "world-recall": {
    callLabel: "world-recall",
    description:
      "【被动触发】三策略混合召回世界书条目：(1) constant=true 条目直接注入 (2) keys 匹配用户输入的关键词条目直接召回 (3) 剩余条目使用嵌入模型语义检索。不需手动调用。",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "空格分隔的多个关键词" } },
      required: ["query"],
    },
  },
  anysearch: {
    callLabel: "anysearch",
    description:
      "联网搜索外部实时信息。当需要查找实时数据、最新资讯、事实核查时调用。参数 query 为搜索查询内容。",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "联网搜索的查询内容" } },
      required: ["query"],
    },
  },
};

/**
 * 构建工具描述文本，注入 system prompt 末尾
 *
 * v0.4.3: 提升模型主动调用工具的概率
 * v0.4.6: 同时列出内置工具和用户工具，统一标签格式
 * v0.5.8: 按工具类型分组动态输出，支持 SKILL/MCP 自动出现在列表中
 */
function buildToolDescriptions(
  builtinConfigs: BuiltinToolConfig[] | undefined,
  activeTools: ActiveTool[] | undefined,
): string {
  const enabledBuiltin = (builtinConfigs || []).filter((c) => c.enabled);
  const enabledActive = (activeTools || []).filter((t) => t.enabled);
  if (enabledBuiltin.length === 0 && enabledActive.length === 0) return "";

  const lines: string[] = [
    "<available_tools>",
    "以下是当前可用的所有工具。调用格式：<tool_calls>callLabel:关键词1 关键词2|callLabel2:关键词3</tool_calls>",
    "请优先查看每个工具的描述，选择最适合当前需求的工具。",
  ];

  // 内置记忆/搜索工具
  const memorySearchBuiltins = enabledBuiltin.filter(
    (c) => c.type === "vector-memory" || c.type === "keyword-search",
  );
  // 内置世界书工具
  // v0.7.2: world-search 已合并到 world-recall（三策略混合召回），world-recall 为被动触发不在 available_tools 列出
  const worldBuiltins = enabledBuiltin.filter((c) => c.type === "world-recall");
  // 内置联网工具
  const webBuiltins = enabledBuiltin.filter((c) => c.type === "anysearch");
  // 其他内置工具（排除已分类和被动触发的 memory-recall / world-recall）
  const otherBuiltins = enabledBuiltin.filter(
    (c) =>
      !["vector-memory", "keyword-search", "world-recall", "anysearch", "memory-recall"].includes(
        c.type,
      ),
  );

  // 按工具类型分组的用户工具
  const skillTools = enabledActive.filter((t) => t.type === "skill" || t.type === "skill_readfile");
  const mcpTools = enabledActive.filter((t) => t.type === "mcp_http");
  const webUserTools = enabledActive.filter((t) => t.type === "web");
  const vectorUserTools = enabledActive.filter((t) => t.type === "vector" || t.type === "keyword");
  const worldUserTools = enabledActive.filter((t) => t.type === "world");
  const otherUserTools = enabledActive.filter(
    (t) =>
      !(
        ["skill", "skill_readfile", "mcp_http", "web", "vector", "keyword", "world"] as string[]
      ).includes(t.type),
  );

  const addGroup = (
    title: string,
    configs: typeof enabledBuiltin,
    tools?: typeof enabledActive,
  ) => {
    const items: string[] = [];
    for (const c of configs) {
      // v0.8.1: 使用 PASSIVE_TOOL_TYPES 常量过滤被动触发工具
      if (PASSIVE_TOOL_TYPES.has(c.type)) continue;
      const info = BUILTIN_TOOL_INFO[c.type];
      if (info)
        items.push(`- \`${info.callLabel}\`: ${info.description}（返回 ${c.resultCount} 条）`);
    }
    if (tools) {
      for (const t of tools) {
        const callLabel = t.callName || t.name;
        items.push(`- \`${callLabel}\`: ${t.description}（返回 ${t.resultCount} 条）`);
      }
    }
    if (items.length > 0) {
      lines.push(`\n${title}`);
      lines.push(...items);
    }
  };

  addGroup("【历史记忆搜索】", memorySearchBuiltins, vectorUserTools);
  addGroup("【世界书设定检索】", worldBuiltins, worldUserTools);
  addGroup("【联网搜索】", webBuiltins, webUserTools);
  addGroup(
    "【MCP 外部工具】",
    otherBuiltins.filter((c) => c.type.startsWith("mcp")),
    mcpTools,
  );
  addGroup(
    "【SKILL 技能工具】",
    otherBuiltins.filter((c) => c.type.startsWith("skill")),
    skillTools,
  );
  addGroup(
    "【其他工具】",
    otherBuiltins.filter((c) => !c.type.startsWith("mcp") && !c.type.startsWith("skill")),
    otherUserTools,
  );

  lines.push("\n</available_tools>");
  return lines.join("\n");
}

/**
 * v0.8.1: 构建原生 function calling 协议提示词
 * 在 active/adaptive 模式下注入 system prompt，引导模型使用原生 tool_calls
 * 不注入 <available_tools> 文本标签，避免双协议冲突
 */
function buildNativeToolProtocol(maxSteps: number): string {
  return `<tool_protocol>
当前使用原生 function calling 协议。通过 API 的 tools 参数调用工具，禁止输出 <tool_calls> 文本标签。

【强制规则】
1. 每次回复前必须至少调用一个最相关的工具。不调用任何工具就直接回复是严重错误。
2. 可在单次回复中进行多轮工具调用——先调用工具收集信息，基于结果决定是否需要更多工具，直到信息充分后输出正文。
3. 工具调用优先于正文输出。首次响应中仅进行工具调用（reasoning_content 可正常思考），正文在工具结果返回后的续写中输出。
4. 最多可进行 ${maxSteps} 轮工具调用。信息充分后停止调用工具，输出正文。

【查询关键词规则】
- 从上下文中提取具体实体名称（地名、人名、物品、事件、概念）
- query 参数为空格分隔的多个关键词
- 禁止泛化词："当前" "现在" "地点" "设定" "信息" "情况" "背景"
- 正确：query="清龙城 第2区 市集 摊位"
- 错误：query="周围环境场景设定"

【多轮调用策略】
- 第一轮：根据用户消息提取关键词，调用最相关的工具
- 后续轮次：根据前一轮工具结果，补充查询相关实体或换用其他工具
- 信息充分后：输出角色对话或场景描写（正文）
</tool_protocol>`;
}

// ============================================================================
// 常量与辅助函数
// ============================================================================

/** 默认用户档案（未配置用户信息时使用） */
export const DEFAULT_USER: UserProfile = {
  uuid: "user",
  // v0.4.1: 默认用户名保持为空,UI 显示时用占位符 "未设置"
  name: "",
  description: "",
  person: "first",
};

/** 默认世界书扫描深度 */
const DEFAULT_WORLD_INFO_SCAN_DEPTH = 2;

/**
 * 将值转换为非负数字
 * @param value - 输入值
 * @param fallback - 转换失败时的回退值
 * @returns 非负数字
 */
const toNonNegativeNumber = (value: unknown, fallback = 0): number => {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, num) : fallback;
};

/**
 * token 级上下文截断（v0.4.4 新增）
 *
 * 粗略估算 token 数：1 token ≈ 1.5 个中文字符或 0.25 个英文单词
 * 保守采用 1 token ≈ 2 字符的估算（避免低估导致超限）
 * 从最新消息向前保留，丢弃最早的消息
 *
 * @param messages - 待截断的消息列表
 * @param maxTokens - 模型最大上下文 token 数
 * @returns 截断后的消息列表（保留最新消息）
 */
const truncateByTokens = (messages: ChatMessage[], maxTokens: number): ChatMessage[] => {
  if (messages.length === 0) return [];
  // 预留 4096 token 给系统提示词和模型输出
  const reservedTokens = 4096;
  const availableTokens = Math.max(1000, maxTokens - reservedTokens);
  // 保守估算：1 token ≈ 2 字符
  const maxChars = availableTokens * 2;

  let totalChars = 0;
  const result: ChatMessage[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const msgChars = (msg.content?.length ?? 0) + (msg.cot?.length ?? 0);
    if (totalChars + msgChars > maxChars && result.length > 0) break;
    result.unshift(msg);
    totalChars += msgChars;
  }
  return result;
};

/**
 * 拼接世界书条目内容为文本
 * @param entries - 世界书条目列表
 * @returns 拼接后的文本
 */
const joinWorldInfoContent = (entries: WorldInfoEntry[]): string => {
  return entries.map((e) => `[${e.id}]\n${e.content}`).join("\n\n");
};

// ============================================================================
// 世界书关键词匹配
// ============================================================================

/**
 * 创建世界书关键词正则表达式
 *
 * 支持 /pattern/flags 格式，自动添加 'i' 标志（不区分大小写）。
 *
 * @param pattern - 正则模式字符串
 * @returns 编译后的 RegExp 对象
 */
export const createWorldInfoRegex = (pattern: string): RegExp => {
  let source = String(pattern || "");
  let flags = "i";
  if (source.startsWith("/") && source.lastIndexOf("/") > 0) {
    const lastSlash = source.lastIndexOf("/");
    const potentialFlags = source.slice(lastSlash + 1);
    if (/^[dgimsuvy]*$/.test(potentialFlags)) {
      source = source.slice(1, lastSlash);
      flags = potentialFlags;
    }
  }
  flags = flags.replace(/g/g, "");
  if (!flags.includes("i")) flags += "i";
  if (/\\[pP]\{/.test(source) && !flags.includes("u")) flags += "u";
  return new RegExp(source, flags);
};

/**
 * 检查世界书条目的关键词是否匹配文本
 *
 * @param key - 关键词
 * @param text - 待匹配文本
 * @param useRegex - 是否使用正则匹配
 * @returns 是否匹配
 */
export const worldInfoKeyMatchesText = (key: string, text: string, useRegex = false): boolean => {
  const rawKey = String(key || "").trim();
  const rawText = String(text || "");
  if (!rawKey || !rawText) return false;

  if (useRegex) {
    try {
      return createWorldInfoRegex(rawKey).test(rawText);
    } catch {
      return false;
    }
  }

  return rawText.toLowerCase().includes(rawKey.toLowerCase());
};

/**
 * 检查世界书条目是否通过概率检查
 *
 * @param entry - 世界书条目
 * @returns 是否通过概率检查
 */
export const passesWorldInfoProbability = (entry: WorldInfoEntry): boolean => {
  const probability = Math.min(100, toNonNegativeNumber(entry.probability, 100));
  if (probability >= 100) return true;
  if (probability <= 0) return false;
  return Math.random() * 100 < probability;
};

/**
 * 扫描聊天记录，返回触发的世界书条目
 *
 * 1. 常驻条目（constant）直接触发
 * 2. 关键词条目扫描最近 N 条消息进行匹配
 * 3. 概率检查
 * 4. 排序：常驻优先，然后按 order 降序
 *
 * @param entries - 启用的世界书条目列表
 * @param messages - 聊天记录
 * @param scanDepth - 扫描深度（最近 N 条消息）
 * @returns 触发的世界书条目列表
 */
const matchWorldInfoEntries = (
  entries: WorldInfoEntry[],
  messages: ChatMessage[],
  scanDepth: number,
): WorldInfoEntry[] => {
  const triggered: WorldInfoEntry[] = [];

  const scanText = messages
    .slice(-scanDepth)
    .map((m) => m.content)
    .join("\n");

  for (const entry of entries) {
    // 常驻条目直接触发
    if (entry.constant) {
      triggered.push(entry);
      continue;
    }

    // 概率检查
    if (!passesWorldInfoProbability(entry)) continue;

    // 关键词匹配
    if (!entry.keys || entry.keys.length === 0) continue;

    const hasMatch = entry.keys.some((key) => worldInfoKeyMatchesText(key, scanText));

    if (hasMatch) {
      triggered.push(entry);
    }
  }

  // 排序：常驻优先，然后按 order 降序
  triggered.sort((a, b) => {
    if (a.constant && !b.constant) return -1;
    if (!a.constant && b.constant) return 1;
    return (b.order || 0) - (a.order || 0);
  });

  return triggered;
};

// ============================================================================
// buildContext - 构建发送给 API 的消息上下文
// ============================================================================

/**
 * 构建发送给 API 的消息上下文
 *
 * 逻辑：
 * 1. 构建系统提示词（预设内容 + 世界书条目 + 角色描述 + 用户信息 + 全局记忆）
 * 2. 添加开场白（如果聊天记录为空）
 * 3. 添加聊天记录（移除 CoT 内容）
 * 4. 世界书关键词匹配注入
 * 5. 记忆压缩（保留最近 N 楼，其余有向量记忆覆盖的从原始上下文移除）
 *
 * @param params - 构建参数
 * @returns 系统提示词与 API 消息列表
 */
export const buildContext = async (params: BuildContextParams): Promise<BuildContextResult> => {
  const {
    messages,
    character,
    user,
    presets,
    worldInfoEntries,
    settings,
    apiProviders,
    apiProviderKeys: _apiProviderKeys,
    vectorMemoryShards,
    memorySettings,
    sessionId,
  } = params;

  // 1. 过滤启用的世界书条目
  const activeWorldInfo = worldInfoEntries.filter((e) => e.enabled);

  // 2. 世界书关键词匹配（扫描最近的消息）
  // v0.7.3-fix: 当 world-recall 预执行已注入 <world_recall_result> 时跳过此步骤，避免双重注入+反馈回路
  // 回退保障：预执行失败时 skipWorldInfoInjection 保持 false，走经典注入路径
  const triggeredWorldInfo = params.skipWorldInfoInjection
    ? []
    : matchWorldInfoEntries(activeWorldInfo, messages, DEFAULT_WORLD_INFO_SCAN_DEPTH);

  // 3. 构建系统提示词
  const systemPromptParts: string[] = [];

  // 3.1 预设内容（保持 NSFW 预设内容完整）
  // v0.7.1: 单阶段架构 — 预设始终注入（含 Step 8-10 工具/CoT/NSFW 协议）
  const presetContents = presets
    .filter((p) => p.enabled !== false && p.content && p.content.trim())
    .map((p) => p.content)
    .filter((content) => content.trim())
    .join("\n\n---\n\n");
  if (presetContents) {
    systemPromptParts.push(presetContents);
  }

  // v0.7.0: 两阶段架构 — 阶段2 现在同时输出 CoT 和正文，设定内容不再是"仅参考素材"
  // 移除原 cotReferenceHeader 隔离说明
  const cotReferenceHeader = "";

  // 3.2 世界书条目（常驻 + 关键词触发）
  if (triggeredWorldInfo.length > 0) {
    systemPromptParts.push(
      `${cotReferenceHeader}[World Info]\n${joinWorldInfoContent(triggeredWorldInfo)}`,
    );
  }

  // 3.3 文风优先级提示
  systemPromptParts.push(
    "[Style Priority]\n" +
      "开场白和历史消息只用于理解剧情事实、人物关系和场景状态，不作为文风模板；" +
      "不要继承或模仿开场白、前文回复的句式、语气密度、段落节奏或排版习惯。" +
      "最终回复的文风必须优先遵守上方系统预设中的规定文风。",
  );

  // 3.4 角色定义
  if (character) {
    const charPrompt = `Name: ${character.name}\nPersonality: ${character.personality}\nScenario: ${character.scenario}`;
    const charParts: string[] = [`${cotReferenceHeader}[Character]`, charPrompt];
    if (character.mesExample && character.mesExample.trim()) {
      charParts.push(character.mesExample);
    }
    // v0.3.1: 注入结构化对话示例（气泡样式）
    if (character.dialogueExamples && character.dialogueExamples.length > 0) {
      const exampleBlocks = character.dialogueExamples
        .map((ex) => `{{char}}: ${ex.agent}\n{{user}}: ${ex.user}`)
        .join("\n\n");
      charParts.push(`<example>\n${exampleBlocks}\n</example>`);
    }
    systemPromptParts.push(charParts.join("\n\n"));
  }

  // 3.5 用户信息
  systemPromptParts.push(`[User Info]\nName: ${user.name}\nDescription: ${user.description || ""}`);

  // 3.6 全局记忆
  // v0.5.6: ACE 记忆机制已删除，不再注入 <global_memory> 段落
  // 向量记忆召回由 memory-recall 预执行（chat-slice.ts）处理

  // 3.7 向量记忆召回
  // v0.4.6: 已由 memory-recall 预执行（chat-slice.ts）处理——
  //   搜索会话向量分片 → agentSteps（UI 可见）→ 注入 contextMessages
  //   此处不再重复搜索，避免双倍嵌入 API 消耗

  // v0.7.1: 单阶段架构 — 工具/CoT/NSFW 协议已合并到 LUZZY_PRESET_CONTENT (Step 8-10)
  // 不再需要单独注入协议常量

  // v0.4.3: 注入内置工具描述，提升模型主动调用工具的概率
  // v0.4.6: 同时注入用户工具描述，统一标签格式
  // v0.8.1: 按 toolMode 条件分支 — force 模式注入 <available_tools> 文本标签，active/adaptive 模式注入原生 function calling 协议
  const toolMode = params.toolMode ?? "active";
  const maxSteps = params.maxAgentSteps ?? 10;

  if (toolMode === "force") {
    // force 模式：注入 <available_tools> 文本标签列表（现有逻辑）
    const toolDescriptions = buildToolDescriptions(params.builtinToolConfigs, params.activeTools);
    if (toolDescriptions) {
      systemPromptParts.push(toolDescriptions);
    }
  } else {
    // active/adaptive 模式：注入原生 function calling 协议指引
    // 不注入 <available_tools>，避免双协议冲突
    systemPromptParts.push(buildNativeToolProtocol(maxSteps));
  }

  const systemPrompt = systemPromptParts.join("\n\n");

  // 4. 构建 API 消息列表
  const apiMessages: ApiMessage[] = [];

  // 4.1 系统消息
  apiMessages.push({ role: "system", content: systemPrompt });

  // 4.2 开场白（如果聊天记录为空或第一条不是开场白）
  // v0.7.1: 单阶段架构 — 始终注入开场白作为上下文参考
  if (character && character.firstMessage) {
    const hasFirstMesInHistory =
      messages.length > 0 &&
      messages[0].role === "assistant" &&
      messages[0].content === character.firstMessage;

    if (!hasFirstMesInHistory) {
      apiMessages.push({
        role: "assistant",
        content: character.firstMessage,
        name: character.name,
      });
    }
  }

  // 4.3 记忆压缩：保留最近 N 楼，其余有向量记忆覆盖的楼层从原始上下文移除
  // 仅在启用压缩且有向量记忆分片时生效
  let compressedMessages = messages;
  if (
    memorySettings?.compressionEnabled &&
    memorySettings.compressionKeepRecent > 0 &&
    vectorMemoryShards &&
    vectorMemoryShards.length > 0
  ) {
    compressedMessages = compressContext(
      messages,
      vectorMemoryShards,
      memorySettings.compressionKeepRecent,
    );
  }

  // 4.3.1 历史消息数限制（v0.3.0 新增）
  // 根据当前供应商+模型的 historyMessageLimit 配置，仅保留最后 N 条历史消息
  // 0 = 不限制；每条历史消息包括 user 消息 + 工具调用结果 + 思考链 + 模型回复
  // modelName 格式为 `${providerId}_${model.name}`，通过前缀匹配定位供应商与模型
  let limitedMessages = compressedMessages;
  if (settings.modelName && apiProviders.length > 0) {
    const matchedProvider = apiProviders.find((p) => settings.modelName.startsWith(`${p.id}_`));
    if (matchedProvider?.models) {
      const prefix = `${matchedProvider.id}_`;
      const rawModelName = settings.modelName.slice(prefix.length);
      const currentModel = matchedProvider.models.find((m) => m.name === rawModelName);
      const limit = currentModel?.historyMessageLimit ?? 0;
      if (limit > 0 && compressedMessages.length > limit) {
        limitedMessages = compressedMessages.slice(-limit);
      }
    }
  }

  // 4.3.2 token 级上下文截断（v0.4.4 新增）
  // 当历史消息总 token 估算超出模型上下文长度时，从最早的消息开始丢弃
  // 丢弃的消息由记忆召回/向量记忆工具补充（已在阶段一实现）
  const MAX_CONTEXT_TOKENS = (() => {
    if (settings.modelName && apiProviders.length > 0) {
      const matchedProvider = apiProviders.find((p) => settings.modelName.startsWith(`${p.id}_`));
      if (matchedProvider?.models) {
        const prefix = `${matchedProvider.id}_`;
        const rawModelName = settings.modelName.slice(prefix.length);
        const currentModel = matchedProvider.models.find((m) => m.name === rawModelName);
        return currentModel?.contextLength ?? 128000;
      }
    }
    return 128000;
  })();

  const truncatedMessages = truncateByTokens(limitedMessages, MAX_CONTEXT_TOKENS);
  if (truncatedMessages.length < limitedMessages.length) {
    logger.info(
      "memory",
      `Token 级截断: ${limitedMessages.length} → ${truncatedMessages.length} 条(上限 ${MAX_CONTEXT_TOKENS} tokens)`,
    );
    limitedMessages = truncatedMessages;
  }

  // 4.4 聊天记录（移除 CoT 内容）
  // v0.7.1: 单阶段架构 — 始终使用完整历史消息（含 assistant 回复）
  // 包含 user + assistant 全部消息、工具结果转换、parseCot 分离正文与思考链
  for (const msg of limitedMessages) {
    // v0.4.6: 处理工具结果消息（metadata.isToolResult === true）
    // 输出 OpenAI function calling 协议的 role:'tool' 消息
    if (msg.metadata?.isToolResult && msg.metadata?.toolCallId) {
      apiMessages.push({
        role: "tool",
        content: msg.content,
        tool_call_id: msg.metadata.toolCallId,
      });
      continue;
    }

    // v0.4.6: 处理带 tool_calls 的 assistant 消息
    // 输出 OpenAI function calling 协议的 assistant 消息（携带 tool_calls 数组）
    if (msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0) {
      const parsed = parseCot(msg.content || "");
      apiMessages.push({
        role: "assistant",
        content: parsed.main || "",
        tool_calls: msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.toolName,
            arguments: typeof tc.query === "string" ? JSON.stringify({ query: tc.query }) : "{}",
          },
        })),
      });
      continue;
    }

    // 普通消息处理（现有逻辑）
    const parsed = parseCot(msg.content || "");
    let content = parsed.main;
    // 用户消息的系统指令保留
    if (parsed.sys && msg.role === "user") {
      content += "\n\n[系统指令: " + parsed.sys + "]";
    }
    content = content.trim();
    if (content) {
      apiMessages.push({
        role: msg.role === "user" ? "user" : msg.role === "system" ? "system" : "assistant",
        content,
        name: msg.role === "user" ? user.name : character?.name,
      });
    }
  }

  // sessionId 仅用于记忆压缩时识别可移除的轮次，此处保留参数以备扩展
  void sessionId;

  return { systemPrompt, apiMessages };
};

// ============================================================================
// processRegex - 正则脚本处理
// ============================================================================

/**
 * 受保护内容的正则模式
 *
 * 匹配以下内容使其不被普通正则破坏：
 * - 完整的 HTML 文档（<!DOCTYPE html>...</html>）
 * - HTML 标签（<html>...</html>）
 * - Script 块（<script>...</script>）
 * - Style 块（<style>...</style>）
 * - CoT/Think 块（<cot>/<think>/<thinking>/<reasoning>/<thought>/<thoughts>/<reflection>/<analysis>...</tag>，支持未闭合）
 * - Markdown 代码块（```...```）
 * - 行内代码（`...`）
 * - HTML 标签（<tag>）
 */
const PROTECTION_PATTERN =
  /(<!DOCTYPE html>[\s\S]*?<\/html>|<html\b[^>]*>[\s\S]*?<\/html>|<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>|<(?:cot|think|thinking|reasoning|thought|thoughts|reflection|analysis)>[\s\S]*?(?:<\/(?:cot|think|thinking|reasoning|thought|thoughts|reflection|analysis)>|<(?:cot|think|thinking|reasoning|thought|thoughts|reflection|analysis)>|$)|```[\s\S]*?```|`[^`]+`|<\/?[a-zA-Z][\w:-]*[^>]*>)/gi;

/** 受保护内容的测试模式（用于判断分割后的部分是否受保护） */
const PROTECTION_TEST_PATTERN =
  /^(<!DOCTYPE html>[\s\S]*?<\/html>|<html\b[^>]*>[\s\S]*?<\/html>|<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>|<(?:cot|think|thinking|reasoning|thought|thoughts|reflection|analysis)>[\s\S]*?(?:<\/(?:cot|think|thinking|reasoning|thought|thoughts|reflection|analysis)>|<(?:cot|think|thinking|reasoning|thought|thoughts|reflection|analysis)>|$)|```[\s\S]*?```|`[^`]+`|<\/?[a-zA-Z][\w:-]*[^>]*>)$/i;

/**
 * 正则脚本处理（v0.3.0 重构）
 *
 * 遍历启用的正则脚本组及其条目，按 scope/timing/depthRange 过滤，执行正则替换。
 * 保护 HTML 文档、Script/Style 块、Markdown 代码块、行内代码、HTML 标签、<cot> 块不被普通正则破坏。
 *
 * @param text - 原始文本
 * @param regexGroups - 正则脚本组列表（v0.3.0 新结构）
 * @param scope - 当前消息作用范围（'user' | 'character' | 'thinking' | 'worldinfo'）
 * @param timing - 当前执行时机（'display' | 'send' | 'send_display' | 'receive' | 'receive_edit'）
 * @param user - 用户档案（用于 {{user}} 替换）
 * @param messageDepth - 当前消息深度（用于 depthRange 过滤，可选）
 * @returns 处理后的文本
 */
export const processRegex = (
  text: string,
  regexGroups: RegexScriptGroup[],
  scope: RegexScope,
  timing: RegexTiming,
  user: UserProfile,
  messageDepth?: number,
): string => {
  if (!text) return "";
  if (!regexGroups || regexGroups.length === 0) return text;

  let result = text;

  // 收集所有启用的条目（组启用 + 条目启用 + scope/timing/depth 匹配）
  const activeEntries: RegexScriptEntry[] = [];
  for (const group of regexGroups) {
    if (group.enabled === false) continue;
    for (const entry of group.entries) {
      if (entry.enabled === false) continue;
      // scope 检查：条目的 scope 数组必须包含当前 scope
      if (!entry.scope || !entry.scope.includes(scope)) continue;
      // timing 检查：条目的 timing 必须匹配当前 timing
      // send_display 匹配 send 和 display；receive_edit 匹配 receive 和 receive_edit
      if (!matchTiming(entry.timing, timing)) continue;
      // depthRange 检查
      if (messageDepth !== undefined && entry.depthRange) {
        const { min, max } = entry.depthRange;
        if (messageDepth < min || messageDepth > max) continue;
      }
      activeEntries.push(entry);
    }
  }

  for (const entry of activeEntries) {
    try {
      let regexPattern = entry.findRegex;
      let flags = "g";

      if (!regexPattern) continue;

      // 解析 /pattern/flags 格式
      if (regexPattern.startsWith("/") && regexPattern.lastIndexOf("/") > 0) {
        const lastSlash = regexPattern.lastIndexOf("/");
        const potentialFlags = regexPattern.substring(lastSlash + 1);
        if (/^[gimsuy]*$/.test(potentialFlags)) {
          flags = potentialFlags;
          regexPattern = regexPattern.substring(1, lastSlash);
        }
      }

      // 兼容内联修饰符 (?s), (?i), (?m)
      if (regexPattern.includes("(?s)")) {
        regexPattern = regexPattern.replace(/\(\?s\)/g, "");
        if (!flags.includes("s")) flags += "s";
      }
      if (regexPattern.includes("(?i)")) {
        regexPattern = regexPattern.replace(/\(\?i\)/g, "");
        if (!flags.includes("i")) flags += "i";
      }
      if (regexPattern.includes("(?m)")) {
        regexPattern = regexPattern.replace(/\(\?m\)/g, "");
        if (!flags.includes("m")) flags += "m";
      }

      const re = new RegExp(regexPattern, flags);

      // 替换 {{user}} 为用户名
      let replacement = entry.replaceString || "";
      replacement = replacement.replace(/\{\{user\}\}/g, user.name);

      // v0.3.0 新增：替换前修剪 (Trim Out)
      // 每行一个正则，在替换前从文本中移除匹配的内容
      if (entry.trimOut) {
        const trimPatterns = entry.trimOut.split("\n").filter((l) => l.trim());
        for (const trimPattern of trimPatterns) {
          try {
            let trimRegex = trimPattern;
            let trimFlags = "g";
            if (trimRegex.startsWith("/") && trimRegex.lastIndexOf("/") > 0) {
              const lastSlash = trimRegex.lastIndexOf("/");
              const potentialFlags = trimRegex.substring(lastSlash + 1);
              if (/^[gimsuy]*$/.test(potentialFlags)) {
                trimFlags = potentialFlags;
                trimRegex = trimRegex.substring(1, lastSlash);
              }
            }
            result = result.replace(new RegExp(trimRegex, trimFlags), "");
          } catch {
            // 忽略无效的 trim 正则
          }
        }
      }

      // v0.3.0 新增：参数替换模式
      // none: 不处理（默认）
      // raw: 将替换字符串中的 $1, $2 等作为原文输出（先转义）
      // escape: 对匹配内容进行 HTML 转义后替换
      if (entry.paramReplace === "raw") {
        // 转义 $ 符号，使 $1 等变为字面量
        replacement = replacement.replace(/\$/g, "$$$$");
      } else if (entry.paramReplace === "escape") {
        // 对 result 中的匹配内容先进行 HTML 转义
        result = result.replace(re, (match, ...groups) => {
          const escaped = escapeHtml(match);
          // replacement 中的 $1 等引用转义后的内容
          return replacement
            .replace(/\$(\d+)/g, (_, n) => {
              const idx = parseInt(n, 10);
              return idx <= groups.length ? escapeHtml(String(groups[idx - 1] ?? "")) : "";
            })
            .replace(/\{\{match\}\}/g, escaped)
            .replace(/\$0/g, escaped);
        });
        continue; // 已处理，跳过下方的保护逻辑
      }

      // 保护逻辑：只有当正则不包含 < 或 > 且不包含 ``` 时，才启用保护
      // 如果正则本身在匹配代码块或 HTML，则跳过保护直接替换
      if (
        !/[<>]/.test(regexPattern) &&
        !regexPattern.includes("```") &&
        entry.name !== "Auto Replace {{user}}"
      ) {
        const parts = result.split(PROTECTION_PATTERN);
        result = parts
          .map((part) => {
            if (!part) return part;
            // 受保护的内容保持原样
            if (PROTECTION_TEST_PATTERN.test(part)) {
              return part;
            }
            // 对普通文本应用替换
            // 支持 {{match}} 作为 $0 的别名
            const finalReplacement = replacement.replace(/\{\{match\}\}/g, "$0");
            if (finalReplacement.includes("$0")) {
              return part.replace(re, (match, ...groups) => {
                return finalReplacement.replace(/\$0/g, match).replace(/\$(\d+)/g, (_, n) => {
                  const idx = parseInt(n, 10);
                  return idx <= groups.length ? String(groups[idx - 1] ?? "") : "";
                });
              });
            }
            return part.replace(re, finalReplacement);
          })
          .join("");
      } else {
        // 正则明确包含 <, > 或 ```，直接替换
        const finalReplacement = replacement.replace(/\{\{match\}\}/g, "$0");
        if (finalReplacement.includes("$0")) {
          result = result.replace(re, (match, ...groups) => {
            return finalReplacement.replace(/\$0/g, match).replace(/\$(\d+)/g, (_, n) => {
              const idx = parseInt(n, 10);
              return idx <= groups.length ? String(groups[idx - 1] ?? "") : "";
            });
          });
        } else {
          result = result.replace(re, finalReplacement);
        }
      }
    } catch (e) {
      console.error(
        `Regex error in entry "${entry.name || "Unnamed"}":`,
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  return result;
};

/**
 * 检查条目的 timing 是否匹配当前 timing
 * send_display 匹配 send 和 display
 * receive_edit 匹配 receive 和 receive_edit
 */
function matchTiming(entryTiming: RegexTiming, currentTiming: RegexTiming): boolean {
  if (entryTiming === currentTiming) return true;
  if (entryTiming === "send_display" && (currentTiming === "send" || currentTiming === "display"))
    return true;
  if (
    entryTiming === "receive_edit" &&
    (currentTiming === "receive" || currentTiming === "receive_edit")
  )
    return true;
  return false;
}

/** HTML 转义 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 将旧的 RegexScript[] 迁移为新的 RegexScriptGroup[]
 * 每个旧脚本 → 一个含单条目的组
 */
export const migrateRegexScripts = (oldScripts: RegexScript[]): RegexScriptGroup[] => {
  return oldScripts.map((script) => {
    // 旧 placement → 新 scope
    // 0 = 全部, 1 = User, 2 = AI, 3 = User+AI
    let scope: RegexScope[] = ["character"]; // 默认角色消息
    if (script.placement === 1) scope = ["user"];
    else if (script.placement === 2) scope = ["character"];
    else if (script.placement === 3 || script.placement === 0) scope = ["user", "character"];

    // 旧 mode → 新 timing
    // 0 = 两者都处理, 1 = 仅显示(markdownOnly), 2 = 仅AI可见(promptOnly)
    let timing: RegexTiming = "send_display";
    if (script.mode === 1) timing = "display";
    else if (script.mode === 2) timing = "send";
    else timing = "send_display";

    // 旧 depth → 新 depthRange
    const depthRange =
      script.depth > 0 ? { min: script.depth, max: Number.MAX_SAFE_INTEGER } : undefined;

    const now = Date.now();
    return {
      id: script.id,
      name: script.name || "迁移组",
      enabled: true,
      createdAt: now,
      updatedAt: now,
      entries: [
        {
          id: `${script.id}-entry`,
          name: script.name,
          findRegex: script.findRegex,
          replaceString: script.replaceString,
          scope,
          timing,
          paramReplace: "none",
          depthRange,
          enabled: script.enabled !== false,
        },
      ],
    };
  });
};

// ============================================================================
// extractMemory - 记忆提取
// ============================================================================

/**
 * 记忆提取
 *
 * 在对话正常完成后异步提取记忆，不阻塞主流程。
 * 提取最新的完整对话轮次（1 用户 + 1 AI），生成嵌入向量并存储。
 *
 * 完整的记忆提取需要嵌入模型服务支持，此处为框架实现：
 * - 检查记忆功能是否启用
 * - 获取最新的完整对话轮次
 * - 移除 CoT 内容
 * - 实际嵌入向量生成和存储在记忆服务中实现
 *
 * @param params - 记忆提取参数
 * @returns Promise<void>（异步提取，不阻塞主流程）
 */
export const extractMemory = async (params: ExtractMemoryParams): Promise<void> => {
  const {
    messages,
    character,
    settings,
    memorySettings,
    apiProviders,
    apiProviderKeys,
    sessionId,
  } = params;

  // v0.5.9: pipeline 诊断日志 - 每个 early return 记录具体原因
  // 检查记忆功能是否启用
  if (!memorySettings.enabled) {
    logger.debug("memory", "extractMemory 跳过: 记忆功能未启用");
    return;
  }

  // 检查是否有角色和足够的消息
  if (!character) {
    logger.debug("memory", "extractMemory 跳过: 无当前角色卡");
    return;
  }
  if (messages.length < 2) {
    logger.debug("memory", `extractMemory 跳过: 消息不足 2 条 (实际 ${messages.length} 条)`);
    return;
  }

  // 获取最新的完整对话轮次（用户 + AI）
  const lastUserIndex = messages.map((m) => m.role).lastIndexOf("user");
  if (lastUserIndex === -1) {
    logger.debug("memory", "extractMemory 跳过: 未找到用户消息");
    return;
  }
  if (lastUserIndex >= messages.length - 1) {
    logger.debug("memory", "extractMemory 跳过: 用户消息后无 assistant 消息");
    return;
  }

  const userMessage = messages[lastUserIndex];
  const assistantMessage = messages[lastUserIndex + 1];
  if (!userMessage || !assistantMessage) {
    logger.debug("memory", "extractMemory 跳过: 用户或 assistant 消息对象为空");
    return;
  }
  if (assistantMessage.role !== "assistant") {
    logger.debug(
      "memory",
      `extractMemory 跳过: 最后一条消息非 assistant (实际 ${assistantMessage.role})`,
    );
    return;
  }

  // 异步提取记忆（不阻塞主流程）
  try {
    // v0.5.6: 直接使用 message.content，不再调用 parseCot
    // 原因：Fix 1 已确保 assistant 的 content 是纯叙事正文（phase=3 的 content）
    // user 的 content 本身就是用户原始文本，无需剥离 <cot> 标签
    // 之前调用 parseCot 会错误地剥离正文中的 CoT 标签，导致向量记忆切片内容不正确
    const userContent = userMessage.content || "";
    const assistantContent = assistantMessage.content || "";

    if (!userContent.trim() || !assistantContent.trim()) {
      logger.debug("memory", "extractMemory 跳过: 消息内容为空");
      return;
    }

    // 计算当前轮次号（用户消息的序号，从 1 开始）
    const turnNumber = messages.slice(0, lastUserIndex + 1).filter((m) => m.role === "user").length;

    logger.info(
      "memory",
      `extractMemory 启动: turn=${turnNumber} character=${character.uuid} sessionId=${sessionId ?? "无"}`,
    );

    // 使用 buildVectorMemory 生成本轮的向量记忆分片
    // buildVectorMemory 内部会调用嵌入 API 生成向量
    const latestTurnMessages: ChatMessage[] = [
      { ...userMessage, content: userContent },
      { ...assistantMessage, content: assistantContent },
    ];
    const newShards = await buildVectorMemory(
      latestTurnMessages,
      character,
      memorySettings,
      settings,
      apiProviders,
      apiProviderKeys,
    );

    if (newShards.length === 0) {
      logger.debug("memory", "extractMemory: buildVectorMemory 返回 0 个分片");
      return;
    }

    // 调整轮次号（buildVectorMemory 从 1 开始编号，需修正为实际轮次）
    const adjustedShards: VectorMemoryShard[] = newShards.map((s) => ({
      ...s,
      turn: turnNumber,
    }));

    // 合并已有分片并持久化到 IndexedDB
    // 优先使用会话级存储键，未提供 sessionId 时回退到角色级（向后兼容）
    const existingShards = await loadVectorMemoryShards(character.uuid, sessionId);
    // v0.5.1: 按 turn 去重，处理重试/重新生成导致的同轮多次分片冗余
    const dedupedExisting = existingShards.filter((s) => s.turn !== turnNumber);
    const allShards = [...dedupedExisting, ...adjustedShards];

    await saveVectorMemoryShards(character.uuid, allShards, sessionId);
    logger.info(
      "memory",
      `extractMemory 完成: 新增=${adjustedShards.length}个 总计=${allShards.length}个 turn=${turnNumber}`,
    );
  } catch (e) {
    // v0.6.4-fix: 重新 throw，让外层 chat-slice.ts 的 .catch 能捕获到并 toast.error 通知用户
    // 之前只 logger.warn 不 throw，导致 401 等错误被静默吞掉，外层 .catch 永远不触发
    logger.warn("memory", `extractMemory 异常: ${(e as Error).message}`);
    throw e;
  }
};
