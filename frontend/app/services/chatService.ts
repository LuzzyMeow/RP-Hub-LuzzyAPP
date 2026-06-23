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
} from '~/types/luzzy';
import { parseCot } from '~/services/markdownService';
import {
  buildVectorMemory,
  loadVectorMemoryShards,
  saveVectorMemoryShards,
  compressContext,
} from '~/services/memoryService';
import { logger } from '~/services/logger';

// ============================================================================
// 类型定义
// ============================================================================

/** API 消息格式（发送给 API 的消息结构） */
export interface ApiMessage {
  role: MessageRole | 'tool';
  content: string;
  name?: string;
  /** v0.4.6: 工具结果消息的关联 tool_call_id（OpenAI function calling 协议） */
  tool_call_id?: string;
  /** v0.4.6: assistant 消息携带的 tool_calls 数组（OpenAI function calling 协议） */
  tool_calls?: Array<{
    id: string;
    type: 'function';
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
  /** v0.5.1: 请求阶段 (1=工具决策, 2=CoT, 3=正文) */
  phase?: 1 | 2 | 3;
}

/** buildContext 返回值 */
export interface BuildContextResult {
  systemPrompt: string;
  apiMessages: ApiMessage[];
}

// ============================================================================
// CoT 输出协议指令（v0.3.6 新增）
// ============================================================================
/**
 * 强制要求模型将思考链包裹在 <cot> 标签内，按 Step 顺序输出。
 *
 * 解决问题：LUZZY_PRESET_CONTENT 的 14 个 Step 从未明确指示模型输出 <cot> 标签，
 * 导致 parseCot 提取不到思考链，思考卡片永不显示。
 *
 * 此指令作为独立片段追加到系统提示词末尾，不修改 presetContent.ts 中的 NSFW 预设内容。
 * 兼容 LUXI_PROMPT 的 5 步框架：模型根据当前角色选择 Step 数量。
 */
const COT_OUTPUT_PROTOCOL = `<cot_output_protocol>
【致命禁令 — 本阶段输出正文将导致整个生成流程失败】
你正处于三请求架构的第 2 阶段（CoT 思考链）。第 3 阶段是独立请求，拥有完整上下文。
如果你在本阶段输出了任何正文、角色对话或场景描写，系统将丢弃所有这些内容，
并因为三阶段分离设计而无法将它们传递到第 3 阶段——它们会永远消失，用户看不到任何回复。

这是 HARD GATE，不是建议。本阶段是专门用来组织内部推理的"安全沙箱"，
你在这里写正文就像把邮件投进了不存在的地址——你白写了，用户也看不到。

【本阶段唯一允许的输出】
1. reasoning_content 字段（方式 A）或 <cot> 标签内部（方式 B）的思考步骤
2. content 字段只能为空或只有一个占位符"（思考中...）"

本阶段不允许、不需要、禁止：
- 任何剧情正文、角色对话、场景描写
- 任何面向用户的回复文本
- 任何以角色身份说的话
- 任何"接下来我来写..."、"以下是我的回复..."之类的过渡语
- 任何与上方历史消息文风相似的叙事段落
- </cot> 标签之外出现任何可见文本

【输出格式强制要求 — 二选一】

方式 A（强烈推荐）：使用 reasoning_content 字段
- 将所有推理过程写到 reasoning_content 字段
- content 字段必须留空，或只输出一个占位符："（思考中...）"
- 禁止在 content 字段写任何正文或推理

方式 B（仅当不支持 reasoning_content 时使用）：content 字段必须被 <cot> 标签完整包裹
1. 以 <cot> 开始，以 </cot> 结束
2. 标签内按系统预设的 Step 顺序输出，每个 Step 以 **Step N：步骤标题** 开头
3. Step 之间用空行分隔
4. </cot> 之后不得有任何字符——</cot> 标签外的任何内容都会在第 3 阶段被系统丢弃

【必须遵守的格式示例】
<example_A>
content: （思考中...）
reasoning_content: Step 1: ...\n\nStep 2: ...
</example_A>
<example_B>
content: <cot>Step 1: ...\n\nStep 2: ...</cot>
</example_B>

【违规示例 — 以下行为会导致你的输出被丢弃】
<violation_1>❌ 错误：在 CoT 后开始写正文
<cot>Step 1...</cot>
巷子里的光已经暗下来了...（这是第 3 阶段才该输出的内容！）
</violation_1>

<violation_2>❌ 错误：以角色身份说话
<cot>Step 1...</cot>
"你好，我是..."（角色对话属于正文，不应出现在 CoT 阶段）
</violation_2>

<violation_3>❌ 错误：在 CoT 标签外写过渡语
<cot>Step 1...</cot>
以上是我的思考。以下是我的回复：（正文会丢失！）
</violation_3>

【通用提示】上方历史消息仅供你理解剧情事实，不是让你模仿或续写。本阶段不输出剧情，不输出对话，不输出描写。</cot_output_protocol>`;

/**
 * v0.5.1: 三请求架构 — 请求 1 工具决策阶段的内部提示词
 *
 * 仅注入 phase=1 的系统提示。引导模型根据上下文判断是否调用工具。
 * 不含任何角色扮演设定、文风约束或 CoT 框架。
 */
const TOOL_DECISION_PROMPT = `<tool_decision_phase>
【致命禁令 — 本阶段只输出工具调用或 NO_TOOLS】
你正处于三请求架构的第 1 阶段（工具决策）。本阶段是纯粹的决策层。
任何剧情正文、角色对话、场景描写或思考过程都不会被传递到后续阶段——它们会被丢弃，
因为后续阶段有独立的设计目标，不会接收本阶段的额外输出。

你的输出只能是以下两种格式之一，绝不能包含任何其他内容：

【输出格式 — 严格遵守】
格式 1 — 需要调用工具：
<tool_calls>工具名:关键词1 关键词2|工具名2:关键词3 关键词4</tool_calls>

格式 2 — 不需要任何工具：
NO_TOOLS

注意：即使你认为"不需要工具，但已经想到了回复内容"，你也只能输出 NO_TOOLS 四个字母。
你的正文回复将在第 3 阶段由独立请求生成，届时你自然可以输出它。本阶段输出正文没有任何意义。

【输出长度硬限制】
你的总输出长度不得超过 200 个字符。超过此限制意味着你正在输出不该输出的内容。
多段落输出、长篇解释、角色身份说话——这些在本阶段一律无效且会被丢弃。

【查询关键词拆分规则 — 极其重要】
query 参数必须为空格分隔的多个关键词，从上下文中提取具体实体名称，禁止泛化描述词。

禁止词（无效泛化）："当前" "现在" "地点" "设定" "信息" "情况" "背景" "上下文"
正确做法：从开场白/世界书/历史对话中提取地名、人名、物品、事件、概念等具体名词。

错误：world-recall:周围环境场景设定
正确：world-recall:环境 场景 第2区 人类 摊位 街区 市场 华宗山

错误：world-recall:环境 场景 当前 地点 设定
正确：world-search:清龙城 第2区 市集 摊位 人类

【可用工具说明】
具体的工具列表、调用名称（callLabel）、功能介绍和返回条数请参考下方 <available_tools> 部分。
该列表由系统根据当前启用的内置工具、SKILL 工具和 MCP 工具动态生成。
当没有可用工具时，直接回复 NO_TOOLS。

【违规示例 — 以下行为无效】
❌ 错误：输出正文
NO_TOOLS
好的，让我来描写这个场景...（正文会被丢弃！只识别到 NO_TOOLS）

❌ 错误：输出解释
<tool_calls>world-recall:环境 第2区</tool_calls>
我认为这里需要召回世界观信息...（多余解释会被丢弃）

❌ 错误：以角色身份说话
<tool_calls>world-recall:环境 场景</tool_calls>
（角色名）环顾四周，心想...（正文会被丢弃！）

【再次强调】
你的输出只能是 NO_TOOLS 或 <tool_calls>...</tool_calls>。
任何多余的字符——哪怕是一个句号、一个换行、一个字——都会被视为输出错误。
输出长度超过 200 字符即视为违规，所有超出内容将被系统丢弃。
</tool_decision_phase>`;

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
const BUILTIN_TOOL_INFO: Record<BuiltinToolType, {
  callLabel: string;
  description: string;
  parameters: Record<string, unknown>;
}> = {
  'memory-recall': {
    callLabel: 'memory-recall',
    description: '【被动触发】使用嵌入模型自动召回会话中与用户消息相关的历史对话轮次，按相似度排序返回。不需手动调用。',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: '记忆召回的查询关键词' } },
      required: ['query'],
    },
  },
  'vector-memory': {
    callLabel: 'vector-memory',
    description: '在当前会话的向量记忆中语义检索。当你需要回忆之前对话的细节、查找已讨论过的内容时调用。参数 query 为空格分隔的关键词列表（如"城堡 之前 名字"）。',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: '空格分隔的多个关键词' } },
      required: ['query'],
    },
  },
  'keyword-search': {
    callLabel: 'keyword-search',
    description: '在当前会话中按关键词搜索聊天消息。当你需要查找包含特定词汇的历史对话时调用。参数 query 为空格分隔的多个关键词。',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: '空格分隔的多个关键词' } },
      required: ['query'],
    },
  },
  'world-recall': {
    callLabel: 'world-recall',
    description: '在世界书中语义检索世界观设定。当需要查找角色卡绑定的世界观、场景、NPC 等设定信息时调用。需要嵌入模型已配置。参数 query 为空格分隔的关键词列表。',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: '空格分隔的多个关键词' } },
      required: ['query'],
    },
  },
  'world-search': {
    callLabel: 'world-search',
    description: '在世界书中按关键词检索（无需嵌入模型）。参数 query 为空格分隔的多个关键词，可选 keys 按条目 keys 筛选。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '空格分隔的多个关键词' },
        keys: { type: 'string', description: '可选的世界书条目 keys 筛选（逗号分隔）' },
      },
      required: ['query'],
    },
  },
  'anysearch': {
    callLabel: 'anysearch',
    description: '联网搜索外部实时信息。当需要查找实时数据、最新资讯、事实核查时调用。参数 query 为搜索查询内容。',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: '联网搜索的查询内容' } },
      required: ['query'],
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
  if (enabledBuiltin.length === 0 && enabledActive.length === 0) return '';

  const lines: string[] = [
    '<available_tools>',
    '以下是当前可用的所有工具。调用格式：<tool_calls>callLabel:关键词1 关键词2|callLabel2:关键词3</tool_calls>',
    '请优先查看每个工具的描述，选择最适合当前需求的工具。',
  ];

  // 内置记忆/搜索工具
  const memorySearchBuiltins = enabledBuiltin.filter(
    (c) => c.type === 'vector-memory' || c.type === 'keyword-search',
  );
  // 内置世界书工具
  const worldBuiltins = enabledBuiltin.filter(
    (c) => c.type === 'world-recall' || c.type === 'world-search',
  );
  // 内置联网工具
  const webBuiltins = enabledBuiltin.filter(
    (c) => c.type === 'anysearch',
  );
  // 其他内置工具（排除已分类和被动触发的 memory-recall）
  const otherBuiltins = enabledBuiltin.filter(
    (c) => !['vector-memory', 'keyword-search', 'world-recall', 'world-search', 'anysearch', 'memory-recall'].includes(c.type),
  );

  // 按工具类型分组的用户工具
  const skillTools = enabledActive.filter((t) => t.type === 'skill' || t.type === 'skill_readfile');
  const mcpTools = enabledActive.filter((t) => t.type === 'mcp_http');
  const webUserTools = enabledActive.filter((t) => t.type === 'web');
  const vectorUserTools = enabledActive.filter((t) => t.type === 'vector' || t.type === 'keyword');
  const worldUserTools = enabledActive.filter((t) => t.type === 'world');
  const otherUserTools = enabledActive.filter(
    (t) => !(['skill', 'skill_readfile', 'mcp_http', 'web', 'vector', 'keyword', 'world'] as string[]).includes(t.type),
  );

  const addGroup = (title: string, configs: typeof enabledBuiltin, tools?: typeof enabledActive) => {
    const items: string[] = [];
    for (const c of configs) {
      if (c.type === 'memory-recall') continue;
      const info = BUILTIN_TOOL_INFO[c.type];
      if (info) items.push(`- \`${info.callLabel}\`: ${info.description}（返回 ${c.resultCount} 条）`);
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

  addGroup('【历史记忆搜索】', memorySearchBuiltins, vectorUserTools);
  addGroup('【世界书设定检索】', worldBuiltins, worldUserTools);
  addGroup('【联网搜索】', webBuiltins, webUserTools);
  addGroup('【MCP 外部工具】', otherBuiltins.filter(c => c.type.startsWith('mcp')), mcpTools);
  addGroup('【SKILL 技能工具】', otherBuiltins.filter(c => c.type.startsWith('skill')), skillTools);
  addGroup('【其他工具】', otherBuiltins.filter(c => !c.type.startsWith('mcp') && !c.type.startsWith('skill')), otherUserTools);

  lines.push('\n</available_tools>');
  return lines.join('\n');
}

// ============================================================================
// 常量与辅助函数
// ============================================================================

/** 默认用户档案（未配置用户信息时使用） */
export const DEFAULT_USER: UserProfile = {
  uuid: 'user',
  // v0.4.1: 默认用户名保持为空,UI 显示时用占位符 "未设置"
  name: '',
  description: '',
  person: 'first',
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
  return entries.map((e) => `[${e.id}]\n${e.content}`).join('\n\n');
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
const createWorldInfoRegex = (pattern: string): RegExp => {
  let source = String(pattern || '');
  let flags = 'i';
  if (source.startsWith('/') && source.lastIndexOf('/') > 0) {
    const lastSlash = source.lastIndexOf('/');
    const potentialFlags = source.slice(lastSlash + 1);
    if (/^[dgimsuvy]*$/.test(potentialFlags)) {
      source = source.slice(1, lastSlash);
      flags = potentialFlags;
    }
  }
  flags = flags.replace(/g/g, '');
  if (!flags.includes('i')) flags += 'i';
  if (/\\[pP]\{/.test(source) && !flags.includes('u')) flags += 'u';
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
const worldInfoKeyMatchesText = (
  key: string,
  text: string,
  useRegex = false,
): boolean => {
  const rawKey = String(key || '').trim();
  const rawText = String(text || '');
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
const passesWorldInfoProbability = (entry: WorldInfoEntry): boolean => {
  const probability = Math.min(
    100,
    toNonNegativeNumber(entry.probability, 100),
  );
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
    .join('\n');

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

    const hasMatch = entry.keys.some((key) =>
      worldInfoKeyMatchesText(key, scanText),
    );

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
export const buildContext = async (
  params: BuildContextParams,
): Promise<BuildContextResult> => {
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
    phase = 2, // v0.5.1: 默认 phase=2 (CoT)，兼容旧调用
  } = params;

  // 1. 过滤启用的世界书条目
  const activeWorldInfo = worldInfoEntries.filter((e) => e.enabled);

  // 2. 世界书关键词匹配（扫描最近的消息）
  const triggeredWorldInfo = matchWorldInfoEntries(
    activeWorldInfo,
    messages,
    DEFAULT_WORLD_INFO_SCAN_DEPTH,
  );

  // 3. 构建系统提示词
  const systemPromptParts: string[] = [];

  // 3.1 预设内容（保持 NSFW 预设内容完整）
  // v0.5.1: phase=1（工具决策）时跳过角色扮演相关段落
  if (phase !== 1) {
  const presetContents = presets
    .filter((p) => p.enabled !== false && p.content && p.content.trim())
    .map((p) => p.content)
    .filter((content) => content.trim())
    .join('\n\n---\n\n');
  if (presetContents) {
    systemPromptParts.push(presetContents);
  }

  // v0.5.5-arch-fix: phase=2（CoT 阶段）时，角色设定/世界书段落加隔离说明
  // 明确告知模型：下列设定内容仅为 CoT 推理的参考素材，本阶段不输出正文
  const isCotPhase = phase === 2;
  const cotReferenceHeader = isCotPhase
    ? '[以下设定内容仅为你的 CoT 推理参考素材，本阶段你只输出思考链，不输出正文]\n'
    : '';

  // 3.2 世界书条目（常驻 + 关键词触发）
  if (triggeredWorldInfo.length > 0) {
    systemPromptParts.push(
      `${cotReferenceHeader}[World Info]\n${joinWorldInfoContent(triggeredWorldInfo)}`,
    );
  }

  // 3.3 文风优先级提示
  systemPromptParts.push(
    '[Style Priority]\n' +
      '开场白和历史消息只用于理解剧情事实、人物关系和场景状态，不作为文风模板；' +
      '不要继承或模仿开场白、前文回复的句式、语气密度、段落节奏或排版习惯。' +
      '最终回复的文风必须优先遵守上方系统预设中的规定文风。',
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
        .join('\n\n');
      charParts.push(`<example>\n${exampleBlocks}\n</example>`);
    }
    systemPromptParts.push(charParts.join('\n\n'));
  }
  } // v0.5.1: phase !== 1 guard — 跳过角色预设/世界书/文风/角色定义

  // 3.5 用户信息
  systemPromptParts.push(
    `[User Info]\nName: ${user.name}\nDescription: ${user.description || ''}`,
  );

  // 3.6 全局记忆
  // v0.5.6: ACE 记忆机制已删除，不再注入 <global_memory> 段落
  // 向量记忆召回由 memory-recall 预执行（chat-slice.ts）处理

  // 3.7 向量记忆召回
  // v0.4.6: 已由 memory-recall 预执行（chat-slice.ts）处理——
  //   搜索会话向量分片 → agentSteps（UI 可见）→ 注入 contextMessages
  //   此处不再重复搜索，避免双倍嵌入 API 消耗

  // 3.x 输出协议指令
  // v0.5.1: phase 感知 — 1=工具决策协议, 2=CoT 协议, 3=无协议
  if (phase === 1) {
    systemPromptParts.push(TOOL_DECISION_PROMPT);
  } else if (phase === 2) {
    systemPromptParts.push(COT_OUTPUT_PROTOCOL);
  }
  // phase=3 不注入任何输出协议（末尾 user 消息已明确指令）

  // v0.4.3: 注入内置工具描述，提升模型主动调用工具的概率
  // v0.4.6: 同时注入用户工具描述，统一标签格式
  // 工具描述追加到 system prompt 末尾，不破坏前缀（KV 缓存友好）
  const toolDescriptions = buildToolDescriptions(params.builtinToolConfigs, params.activeTools);
  if (toolDescriptions) {
    systemPromptParts.push(toolDescriptions);
  }

  const systemPrompt = systemPromptParts.join('\n\n');

  // 4. 构建 API 消息列表
  const apiMessages: ApiMessage[] = [];

  // 4.1 系统消息
  apiMessages.push({ role: 'system', content: systemPrompt });

  // 4.2 开场白（如果聊天记录为空或第一条不是开场白）
  // v0.5.4-fix: phase=1 时跳过开场白注入，避免模型误将 assistant 消息视为对话结构而续写正文
  // v0.5.6-fix: phase=2（CoT）也跳过，避免开场白 assistant 消息污染 CoT 推理
  // 仅 phase=3（正文）需要开场白作为上下文参考
  if (phase === 3 && character && character.firstMessage) {
    const hasFirstMesInHistory =
      messages.length > 0 &&
      messages[0].role === 'assistant' &&
      messages[0].content === character.firstMessage;

    if (!hasFirstMesInHistory) {
      apiMessages.push({
        role: 'assistant',
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
    const matchedProvider = apiProviders.find((p) =>
      settings.modelName.startsWith(`${p.id}_`),
    );
    if (matchedProvider?.models) {
      const prefix = `${matchedProvider.id}_`;
      const rawModelName = settings.modelName.slice(prefix.length);
      const currentModel = matchedProvider.models.find(
        (m) => m.name === rawModelName,
      );
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
      const matchedProvider = apiProviders.find((p) =>
        settings.modelName.startsWith(`${p.id}_`),
      );
      if (matchedProvider?.models) {
        const prefix = `${matchedProvider.id}_`;
        const rawModelName = settings.modelName.slice(prefix.length);
        const currentModel = matchedProvider.models.find(
          (m) => m.name === rawModelName,
        );
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
  // v0.5.4-fix: phase=1 时仅保留最后一条 user 消息，避免完整历史对话引导模型续写正文
  // v0.5.5-arch-fix: phase=2（CoT）时同样高度截断历史，不暴露 assistant 剧情回复，
  //   避免模型把前文的剧情文本当作续写模板。CoT 阶段只需要用户输入和工具结果。
  if (phase === 1 || phase === 2) {
    const recentUserMsgs = [...limitedMessages]
      .reverse()
      .filter((m) => m.role === "user")
      .slice(0, phase === 1 ? 1 : 3)
      .reverse();
    for (const msg of recentUserMsgs) {
      apiMessages.push({ role: "user", content: msg.content });
    }
    // phase=2 时额外追加工具结果，保证 CoT 推理能看到检索到的素材
    if (phase === 2) {
      for (const msg of limitedMessages) {
        if (msg.metadata?.isToolResult && msg.metadata?.toolCallId) {
          apiMessages.push({
            role: 'tool',
            content: msg.content,
            tool_call_id: msg.metadata.toolCallId,
          });
        }
      }
    }
  } else {
    for (const msg of limitedMessages) {
      // v0.4.6: 处理工具结果消息（metadata.isToolResult === true）
      // 输出 OpenAI function calling 协议的 role:'tool' 消息
      if (msg.metadata?.isToolResult && msg.metadata?.toolCallId) {
        apiMessages.push({
          role: 'tool',
          content: msg.content,
          tool_call_id: msg.metadata.toolCallId,
        });
        continue;
      }

      // v0.4.6: 处理带 tool_calls 的 assistant 消息
      // 输出 OpenAI function calling 协议的 assistant 消息（携带 tool_calls 数组）
      if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        const parsed = parseCot(msg.content || '');
        apiMessages.push({
          role: 'assistant',
          content: parsed.main || '',
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.toolName,
              arguments: typeof tc.query === 'string' ? JSON.stringify({ query: tc.query }) : '{}',
            },
          })),
        });
        continue;
      }

      // 普通消息处理（现有逻辑）
      const parsed = parseCot(msg.content || '');
      let content = parsed.main;
      // 用户消息的系统指令保留
      if (parsed.sys && msg.role === 'user') {
        content += '\n\n[系统指令: ' + parsed.sys + ']';
      }
      content = content.trim();
      if (content) {
        apiMessages.push({
          role: msg.role === 'user' ? 'user' : msg.role === 'system' ? 'system' : 'assistant',
          content,
          name: msg.role === 'user' ? user.name : character?.name,
        });
      }
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
  if (!text) return '';
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
      let flags = 'g';

      if (!regexPattern) continue;

      // 解析 /pattern/flags 格式
      if (
        regexPattern.startsWith('/') &&
        regexPattern.lastIndexOf('/') > 0
      ) {
        const lastSlash = regexPattern.lastIndexOf('/');
        const potentialFlags = regexPattern.substring(lastSlash + 1);
        if (/^[gimsuy]*$/.test(potentialFlags)) {
          flags = potentialFlags;
          regexPattern = regexPattern.substring(1, lastSlash);
        }
      }

      // 兼容内联修饰符 (?s), (?i), (?m)
      if (regexPattern.includes('(?s)')) {
        regexPattern = regexPattern.replace(/\(\?s\)/g, '');
        if (!flags.includes('s')) flags += 's';
      }
      if (regexPattern.includes('(?i)')) {
        regexPattern = regexPattern.replace(/\(\?i\)/g, '');
        if (!flags.includes('i')) flags += 'i';
      }
      if (regexPattern.includes('(?m)')) {
        regexPattern = regexPattern.replace(/\(\?m\)/g, '');
        if (!flags.includes('m')) flags += 'm';
      }

      const re = new RegExp(regexPattern, flags);

      // 替换 {{user}} 为用户名
      let replacement = entry.replaceString || '';
      replacement = replacement.replace(/\{\{user\}\}/g, user.name);

      // v0.3.0 新增：替换前修剪 (Trim Out)
      // 每行一个正则，在替换前从文本中移除匹配的内容
      if (entry.trimOut) {
        const trimPatterns = entry.trimOut.split('\n').filter((l) => l.trim());
        for (const trimPattern of trimPatterns) {
          try {
            let trimRegex = trimPattern;
            let trimFlags = 'g';
            if (
              trimRegex.startsWith('/') &&
              trimRegex.lastIndexOf('/') > 0
            ) {
              const lastSlash = trimRegex.lastIndexOf('/');
              const potentialFlags = trimRegex.substring(lastSlash + 1);
              if (/^[gimsuy]*$/.test(potentialFlags)) {
                trimFlags = potentialFlags;
                trimRegex = trimRegex.substring(1, lastSlash);
              }
            }
            result = result.replace(new RegExp(trimRegex, trimFlags), '');
          } catch {
            // 忽略无效的 trim 正则
          }
        }
      }

      // v0.3.0 新增：参数替换模式
      // none: 不处理（默认）
      // raw: 将替换字符串中的 $1, $2 等作为原文输出（先转义）
      // escape: 对匹配内容进行 HTML 转义后替换
      if (entry.paramReplace === 'raw') {
        // 转义 $ 符号，使 $1 等变为字面量
        replacement = replacement.replace(/\$/g, '$$$$');
      } else if (entry.paramReplace === 'escape') {
        // 对 result 中的匹配内容先进行 HTML 转义
        result = result.replace(re, (match, ...groups) => {
          const escaped = escapeHtml(match);
          // replacement 中的 $1 等引用转义后的内容
          return replacement.replace(/\$(\d+)/g, (_, n) => {
            const idx = parseInt(n, 10);
            return idx <= groups.length ? escapeHtml(String(groups[idx - 1] ?? '')) : '';
          }).replace(/\{\{match\}\}/g, escaped).replace(/\$0/g, escaped);
        });
        continue; // 已处理，跳过下方的保护逻辑
      }

      // 保护逻辑：只有当正则不包含 < 或 > 且不包含 ``` 时，才启用保护
      // 如果正则本身在匹配代码块或 HTML，则跳过保护直接替换
      if (
        !/[<>]/.test(regexPattern) &&
        !regexPattern.includes('```') &&
        entry.name !== 'Auto Replace {{user}}'
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
            const finalReplacement = replacement.replace(/\{\{match\}\}/g, '$0');
            if (finalReplacement.includes('$0')) {
              return part.replace(re, (match, ...groups) => {
                return finalReplacement
                  .replace(/\$0/g, match)
                  .replace(/\$(\d+)/g, (_, n) => {
                    const idx = parseInt(n, 10);
                    return idx <= groups.length ? String(groups[idx - 1] ?? '') : '';
                  });
              });
            }
            return part.replace(re, finalReplacement);
          })
          .join('');
      } else {
        // 正则明确包含 <, > 或 ```，直接替换
        const finalReplacement = replacement.replace(/\{\{match\}\}/g, '$0');
        if (finalReplacement.includes('$0')) {
          result = result.replace(re, (match, ...groups) => {
            return finalReplacement
              .replace(/\$0/g, match)
              .replace(/\$(\d+)/g, (_, n) => {
                const idx = parseInt(n, 10);
                return idx <= groups.length ? String(groups[idx - 1] ?? '') : '';
              });
          });
        } else {
          result = result.replace(re, finalReplacement);
        }
      }
    } catch (e) {
      console.error(
        `Regex error in entry "${entry.name || 'Unnamed'}":`,
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
  if (entryTiming === 'send_display' && (currentTiming === 'send' || currentTiming === 'display')) return true;
  if (entryTiming === 'receive_edit' && (currentTiming === 'receive' || currentTiming === 'receive_edit')) return true;
  return false;
}

/** HTML 转义 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 将旧的 RegexScript[] 迁移为新的 RegexScriptGroup[]
 * 每个旧脚本 → 一个含单条目的组
 */
export const migrateRegexScripts = (
  oldScripts: RegexScript[],
): RegexScriptGroup[] => {
  return oldScripts.map((script) => {
    // 旧 placement → 新 scope
    // 0 = 全部, 1 = User, 2 = AI, 3 = User+AI
    let scope: RegexScope[] = ['character']; // 默认角色消息
    if (script.placement === 1) scope = ['user'];
    else if (script.placement === 2) scope = ['character'];
    else if (script.placement === 3 || script.placement === 0) scope = ['user', 'character'];

    // 旧 mode → 新 timing
    // 0 = 两者都处理, 1 = 仅显示(markdownOnly), 2 = 仅AI可见(promptOnly)
    let timing: RegexTiming = 'send_display';
    if (script.mode === 1) timing = 'display';
    else if (script.mode === 2) timing = 'send';
    else timing = 'send_display';

    // 旧 depth → 新 depthRange
    const depthRange = script.depth > 0
      ? { min: script.depth, max: Number.MAX_SAFE_INTEGER }
      : undefined;

    const now = Date.now();
    return {
      id: script.id,
      name: script.name || '迁移组',
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
          paramReplace: 'none',
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
export const extractMemory = async (
  params: ExtractMemoryParams,
): Promise<void> => {
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
  const lastUserIndex = messages.map((m) => m.role).lastIndexOf('user');
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
  if (assistantMessage.role !== 'assistant') {
    logger.debug("memory", `extractMemory 跳过: 最后一条消息非 assistant (实际 ${assistantMessage.role})`);
    return;
  }

  // 异步提取记忆（不阻塞主流程）
  try {
    // v0.5.6: 直接使用 message.content，不再调用 parseCot
    // 原因：Fix 1 已确保 assistant 的 content 是纯叙事正文（phase=3 的 content）
    // user 的 content 本身就是用户原始文本，无需剥离 <cot> 标签
    // 之前调用 parseCot 会错误地剥离正文中的 CoT 标签，导致向量记忆切片内容不正确
    const userContent = userMessage.content || '';
    const assistantContent = assistantMessage.content || '';

    if (!userContent.trim() || !assistantContent.trim()) {
      logger.debug("memory", "extractMemory 跳过: 消息内容为空");
      return;
    }

    // 计算当前轮次号（用户消息的序号，从 1 开始）
    const turnNumber = messages
      .slice(0, lastUserIndex + 1)
      .filter((m) => m.role === 'user').length;

    logger.info("memory", `extractMemory 启动: turn=${turnNumber} character=${character.uuid} sessionId=${sessionId ?? "无"}`);

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
    const existingShards = await loadVectorMemoryShards(
      character.uuid,
      sessionId,
    );
    // v0.5.1: 按 turn 去重，处理重试/重新生成导致的同轮多次分片冗余
    const dedupedExisting = existingShards.filter(s => s.turn !== turnNumber);
    const allShards = [...dedupedExisting, ...adjustedShards];

    await saveVectorMemoryShards(character.uuid, allShards, sessionId);
    logger.info("memory", `extractMemory 完成: 新增=${adjustedShards.length}个 总计=${allShards.length}个 turn=${turnNumber}`);
  } catch (e) {
    console.warn('[Memory] 记忆提取失败:', e);
    logger.warn("memory", `extractMemory 异常: ${(e as Error).message}`);
  }
};
