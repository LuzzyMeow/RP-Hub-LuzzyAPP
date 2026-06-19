/**
 * ActiveTool 系统服务
 *
 * 提供工具对象的标准化、调用标签生成、文本扫描、角色卡过滤、
 * UI 状态构建与工具调用执行等能力。
 *
 * 核心能力：
 * - 标准化工具对象（填充默认值、版本迁移）
 * - 生成工具调用标签（add / cover 模式）
 * - 从文本中扫描未完成的工具调用标签
 * - 角色卡按需启用过滤
 * - 创建/构建工具调用 UI 状态
 * - 执行工具调用（vector / keyword / web / world / skill_readfile / mcp_http / skill）
 *
 * 从旧 Vue 3 app.js 迁移，改为纯函数风格，状态由 zustand store 管理。
 */

import type {
  ActiveTool,
  ActiveToolType,
  ActiveToolCall,
  ActiveToolUi,
  ChatMessage,
  McpSubTool,
  ToolExecutionContext,
  WorldInfoEntry,
} from '@/types';
import { callMcpTool } from '@/services/mcpService';

// ============================================================================
// 常量
// ============================================================================

/** 结果数量版本（用于版本迁移判断） */
export const ACTIVE_TOOL_RESULT_COUNT_VERSION = 4;

/** 世界书访问模式版本（用于版本迁移判断） */
export const ACTIVE_TOOL_WORLD_ACCESS_VERSION = 2;

/** 工具结果数量范围 */
const ACTIVE_TOOL_MIN_RESULT_COUNT = 8;
const ACTIVE_TOOL_DEFAULT_RESULT_COUNT = 8;
const ACTIVE_TOOL_MAX_RESULT_COUNT = 12;

/** Tavily 搜索端点 */
const TAVILY_SEARCH_ENDPOINT = 'https://api.tavily.com/search';
const TAVILY_EXTRACT_ENDPOINT = 'https://api.tavily.com/extract';
const TAVILY_SEARCH_DEPTH = 'advanced';

/** 支持文本读取的文件扩展名（用于 skill_readfile） */
const SKILL_FILE_TEXT_EXTENSIONS = [
  '.md', '.txt', '.json', '.yaml', '.yml', '.js', '.ts', '.py',
  '.html', '.css', '.xml', '.csv', '.log', '.ini', '.toml', '.sh', '.bat', '.ps1',
];

// ============================================================================
// 工具类型判断
// ============================================================================

/**
 * 规范化工具调用名称（去除 _add / _cover 后缀，转小写）
 */
const normalizeActiveToolCallName = (value: string): string => {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/_(add|cover)$/, '');
};

/**
 * 判断是否为内置工具（全局启用，不按角色卡过滤）
 *
 * 内置工具：vector / keyword / web / world / skill_readfile
 */
const isBuiltinActiveTool = (tool: ActiveTool): boolean => {
  const t = tool?.type;
  return (
    t === 'vector' ||
    t === 'keyword' ||
    t === 'web' ||
    t === 'world' ||
    t === 'skill_readfile'
  );
};

/**
 * 判断是否为 MCP HTTP 工具
 *
 * 通过 type 或 callName 前缀判断。
 */
export const isMcpHttpActiveTool = (
  tool: ActiveTool | null | undefined,
): boolean => {
  if (!tool) return false;
  if (tool.type === 'mcp_http') return true;
  return normalizeActiveToolCallName(tool.callName || '').startsWith('tool_mcp_');
};

/**
 * 判断是否为 SKILL 工具（非 skill_readfile）
 */
const isSkillActiveTool = (tool: ActiveTool): boolean => {
  if (tool.type === 'skill') return true;
  const base = normalizeActiveToolCallName(tool.callName || '');
  return base.startsWith('tool_skill_') && !base.startsWith('tool_skill_readfile');
};

/**
 * 判断是否为 SKILL 文件阅读工具
 */
const isSkillReadfileActiveTool = (tool: ActiveTool): boolean => {
  if (tool.type === 'skill_readfile') return true;
  return normalizeActiveToolCallName(tool.callName || '') === 'tool_skill_readfile';
};

/**
 * 判断是否为向量记忆工具
 */
const isVectorActiveTool = (tool: ActiveTool): boolean => {
  if (tool.type === 'vector') return true;
  return normalizeActiveToolCallName(tool.callName) === 'tool_memory';
};

/**
 * 判断是否为关键词搜索工具
 */
const isKeywordActiveTool = (tool: ActiveTool): boolean => {
  if (tool.type === 'keyword') return true;
  return normalizeActiveToolCallName(tool.callName) === 'tool_grep';
};

/**
 * 判断是否为 Web 搜索工具
 */
const isWebActiveTool = (tool: ActiveTool): boolean => {
  if (tool.type === 'web') return true;
  const base = normalizeActiveToolCallName(tool.callName || '');
  return (
    base === 'tool_web' ||
    /tavily|联网搜索/i.test(String(tool.name || ''))
  );
};

/**
 * 判断是否为世界书工具
 */
const isWorldInfoActiveTool = (tool: ActiveTool): boolean => {
  if (tool.type === 'world') return true;
  const base = normalizeActiveToolCallName(tool.callName || '');
  return ['tool_world', 'tool_world_list', 'tool_world_read', 'tool_world_edit'].includes(base);
};

// ============================================================================
// 工具标准化
// ============================================================================

/**
 * 获取工具结果数量的最小值
 */
const getActiveToolResultCountMin = (): number => {
  return ACTIVE_TOOL_MIN_RESULT_COUNT;
};

/**
 * 获取工具结果数量的最大值
 */
const getActiveToolResultCountMax = (): number => {
  return ACTIVE_TOOL_MAX_RESULT_COUNT;
};

/**
 * 标准化工具对象
 *
 * 填充默认值，处理版本迁移，规范化类型特定字段。
 * - resultCount：根据版本判断是否需要迁移到默认值
 * - enableMode / allowedCharacterUuids：仅 skill 和 mcp 工具按角色卡过滤
 * - 类型特定字段：web 的 tavilyApiKey、world 的 worldInfoAccessMode、mcp 的服务器信息、skill 的文件信息
 *
 * @param tool - 部分工具对象
 * @returns 标准化后的完整工具对象
 */
export const normalizeActiveTool = (tool: Partial<ActiveTool>): ActiveTool => {
  const input = tool || {};
  const resultCount = Number(input.resultCount);
  const rawCallName = normalizeActiveToolCallName(
    input.callName || 'tool_memory',
  );

  // 兼容旧版世界书工具名
  const legacyWorldToolNames = ['tool_world_list', 'tool_world_read', 'tool_world_edit'];
  const isLegacyWorldTool = legacyWorldToolNames.includes(rawCallName);
  const callName = isLegacyWorldTool ? 'tool_world' : rawCallName;

  const type = (input.type || 'vector') as ActiveToolType;
  const resultCountVersion = Number(input.resultCountVersion) || 1;

  const countMin = getActiveToolResultCountMin();
  const countMax = getActiveToolResultCountMax();
  let normalizedResultCount: number;
  if (Number.isFinite(resultCount)) {
    normalizedResultCount = Math.max(countMin, Math.min(countMax, Math.round(resultCount)));
  } else {
    normalizedResultCount = ACTIVE_TOOL_DEFAULT_RESULT_COUNT;
  }

  // 版本迁移：旧版本且为默认值时，重置为当前默认值
  if (
    resultCountVersion < ACTIVE_TOOL_RESULT_COUNT_VERSION &&
    type !== 'web' &&
    (!Number.isFinite(resultCount) ||
      Math.round(resultCount) <= ACTIVE_TOOL_MIN_RESULT_COUNT ||
      Math.round(resultCount) === 10)
  ) {
    normalizedResultCount = ACTIVE_TOOL_DEFAULT_RESULT_COUNT;
  }

  const normalized: ActiveTool = {
    id: String(input.id || ''),
    name: String(input.name || '未命名工具').trim() || '未命名工具',
    enabled: input.enabled !== false,
    callName,
    type,
    description: String(input.description || '').trim(),
    displayDescription: String(input.displayDescription || '').trim() || undefined,
    resultCount: normalizedResultCount,
    resultCountVersion: ACTIVE_TOOL_RESULT_COUNT_VERSION,
  };

  // Web 工具特有字段
  if (type === 'web') {
    normalized.tavilyApiKey = String(input.tavilyApiKey || '').trim() || undefined;
  }

  // 世界书工具特有字段
  if (type === 'world') {
    normalized.worldInfoAccessMode =
      String(input.worldInfoAccessMode || 'read').trim() || 'read';
    normalized.worldInfoAccessModeVersion = ACTIVE_TOOL_WORLD_ACCESS_VERSION;
  }

  // MCP 工具特有字段
  if (type === 'mcp_http') {
    normalized.mcpServerUrl = String(input.mcpServerUrl || '').trim() || undefined;
    normalized.mcpServerName = String(input.mcpServerName || '').trim() || undefined;
    normalized.mcpTools = Array.isArray(input.mcpTools) ? input.mcpTools : [];
  }

  // SKILL 工具特有字段
  if (type === 'skill') {
    normalized.skillFileContent = String(input.skillFileContent || '');
    normalized.skillFileName = String(input.skillFileName || '').trim() || undefined;
  }

  // 角色卡启用字段（仅 skill 和 mcp 工具）
  if (type === 'skill' || type === 'mcp_http') {
    normalized.enableMode =
      input.enableMode === 'whitelist' ? 'whitelist' : 'all';
    normalized.allowedCharacterUuids = Array.isArray(input.allowedCharacterUuids)
      ? input.allowedCharacterUuids.filter(
          (uuid) => typeof uuid === 'string' && uuid.length > 0,
        )
      : [];
  }

  return normalized;
};

// ============================================================================
// 调用标签生成
// ============================================================================

/**
 * 获取工具调用标签
 *
 * 格式：${baseCallName}_add / ${baseCallName}_cover
 * 其中 baseCallName 为规范化的 callName（如 tool_memory、tool_grep、tool_web、tool_world）
 *
 * @param tool - 工具对象
 * @returns 包含 add 和 cover 模式标签的对象
 */
export const getActiveToolCallLabels = (
  tool: ActiveTool,
): { add: string; cover: string } => {
  const baseCallName = normalizeActiveToolCallName(tool?.callName || 'tool_memory');
  return {
    add: `${baseCallName}_add`,
    cover: `${baseCallName}_cover`,
  };
};

/**
 * 获取 MCP 工具服务器短 ID（取 id 末尾 6 位）
 */
const getMcpToolServerShortId = (tool: ActiveTool): string => {
  const id = String(tool?.id || '');
  return id.length >= 6 ? id.slice(-6) : id;
};

/**
 * 获取 MCP 子工具调用标签
 *
 * 格式：tool_mcp_${sid}_${subToolName}_add / tool_mcp_${sid}_${subToolName}_cover
 * 其中 sid 为工具 id 末尾 6 位，确保多 MCP 服务器标签唯一
 *
 * @param tool - MCP 工具对象
 * @param subToolName - 子工具名称
 * @returns 包含 add 和 cover 模式标签的对象
 */
export const getMcpSubToolCallLabels = (
  tool: ActiveTool,
  subToolName: string,
): { add: string; cover: string } => {
  const sid = getMcpToolServerShortId(tool);
  const base = `tool_mcp_${sid}_${subToolName}`;
  return {
    add: `${base}_add`,
    cover: `${base}_cover`,
  };
};

// ============================================================================
// 文本扫描
// ============================================================================

/**
 * 转义正则表达式特殊字符
 */
const escapeRegexText = (text: string): string => {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * 去除代码块（用于工具调用检测，避免误检测代码块中的标签）
 */
const stripCodeBlocksForToolDetection = (text: string): string => {
  return String(text || '').replace(/```[\s\S]*?```/g, '');
};

/**
 * 清理工具调用理由文本
 */
const cleanActiveToolCallReason = (reason: string | undefined): string => {
  return String(reason || '').trim();
};

/**
 * 从文本中扫描未完成的工具调用标签
 *
 * 扫描格式：`<callLabel:query>`，query 为标签后到行尾的全部内容。
 * 支持 add 和 cover 模式，支持 MCP 子工具标签扫描。
 * 同时尝试从前一行提取 `<reason:...>` 调用理由。
 *
 * @param text - 待扫描的文本
 * @param tools - 已启用的工具列表（应已按角色卡过滤）
 * @returns 第一个匹配的工具调用，无匹配则返回 null
 */
export const findPendingActiveToolCallInText = (
  text: string,
  tools: ActiveTool[],
): ActiveToolCall | null => {
  const originalContent = String(text || '');
  if (!originalContent) return null;

  const mainContent = stripCodeBlocksForToolDetection(originalContent);
  const toolList = Array.isArray(tools) ? tools : [];
  const candidates: Array<ActiveToolCall & { _index: number }> = [];

  for (const tool of toolList) {
    const labelForms: Array<{
      label: string;
      mode: 'add' | 'cover';
      mcpSubToolName: string;
    }> = [];

    if (isMcpHttpActiveTool(tool) && Array.isArray(tool.mcpTools)) {
      for (const sub of tool.mcpTools) {
        const subLabels = getMcpSubToolCallLabels(tool, sub.name);
        labelForms.push({ label: subLabels.add, mode: 'add', mcpSubToolName: sub.name });
        labelForms.push({ label: subLabels.cover, mode: 'cover', mcpSubToolName: sub.name });
      }
    } else {
      const labels = getActiveToolCallLabels(tool);
      labelForms.push({ label: labels.add, mode: 'add', mcpSubToolName: '' });
      labelForms.push({ label: labels.cover, mode: 'cover', mcpSubToolName: '' });
    }

    for (const form of labelForms) {
      const escapedName = escapeRegexText(form.label);
      const regex = new RegExp(`<\\s*${escapedName}\\s*:\\s*([\\s\\S]*)$`, 'i');
      const match = mainContent.match(regex);
      if (!match) continue;

      const raw = match[0];
      const index = mainContent.length - raw.length;

      // 尝试从前一行提取 <reason:...> 调用理由
      let reason = '';
      const beforeContent = mainContent.slice(0, index);
      const reasonMatch = beforeContent.match(/<reason\s*:\s*([^>\n]*)>\s*$/i);
      if (reasonMatch) {
        reason = cleanActiveToolCallReason(reasonMatch[1]);
      }

      candidates.push({
        tool,
        mode: form.mode,
        callLabel: form.label,
        query: String(match[1] || '').trim(),
        raw,
        reason: reason || undefined,
        mcpSubToolName: form.mcpSubToolName || undefined,
        _index: index,
      });
    }
  }

  if (candidates.length === 0) return null;

  // 按出现位置排序，取最早的
  candidates.sort((a, b) => a._index - b._index);
  const first = candidates[0];
  // 移除内部字段
  const { _index, ...result } = first;
  return result;
};

// ============================================================================
// 角色卡过滤
// ============================================================================

/**
 * 角色卡按需启用过滤
 *
 * 仅 skill 和 mcp 工具按角色卡过滤，内置工具（vector/keyword/web/world/skill_readfile）全局启用。
 * skill 和 mcp 工具的 allowedCharacterUuids 为空时表示对所有角色卡启用。
 *
 * @param tools - 全部已启用工具列表
 * @param characterUuid - 当前角色卡 UUID（null 表示无角色卡）
 * @returns 过滤后的工具列表
 */
export const filterToolsForCharacter = (
  tools: ActiveTool[],
  characterUuid: string | null,
): ActiveTool[] => {
  const uuid = characterUuid || '';
  return (Array.isArray(tools) ? tools : []).filter((tool) => {
    // 内置工具全局启用
    if (isBuiltinActiveTool(tool)) return true;

    // skill 和 mcp 工具按角色卡过滤
    if (tool.type === 'skill' || tool.type === 'mcp_http') {
      const allowedUuids = Array.isArray(tool.allowedCharacterUuids)
        ? tool.allowedCharacterUuids
        : [];
      if (allowedUuids.length === 0) return true;
      return uuid.length > 0 && allowedUuids.includes(uuid);
    }

    return true;
  });
};

// ============================================================================
// UI 状态构建
// ============================================================================

/**
 * 从工具调用创建 UI 状态
 *
 * @param toolCall - 工具调用对象
 * @returns 工具调用 UI 状态
 */
export const createActiveToolUi = (toolCall: ActiveToolCall): ActiveToolUi => {
  return {
    tool: toolCall.tool,
    mode: toolCall.mode || 'add',
    callName: toolCall.callLabel || toolCall.tool?.callName || '',
    query: toolCall.query || '',
    raw: toolCall.raw,
    reason: cleanActiveToolCallReason(toolCall.reason),
    mcpSubToolName: toolCall.mcpSubToolName,
  };
};

/**
 * 从 UI 状态构建工具调用
 *
 * 对于 MCP 工具，若 mcpSubToolName 为空，则从 callName 反查子工具名。
 *
 * @param toolUi - 工具调用 UI 状态
 * @returns 工具调用对象
 */
export const buildActiveToolCallFromUi = (
  toolUi: ActiveToolUi,
): ActiveToolCall => {
  const tool = toolUi.tool;
  let mcpSubToolName = toolUi.mcpSubToolName || '';

  // MCP 工具：若 mcpSubToolName 为空，从 callName 反查
  if (!mcpSubToolName && isMcpHttpActiveTool(tool)) {
    const callLabel = toolUi.callName || '';
    const subTools: McpSubTool[] = Array.isArray(tool.mcpTools) ? tool.mcpTools : [];
    const matched = subTools.find((sub) => {
      const labels = getMcpSubToolCallLabels(tool, sub.name);
      return labels.add === callLabel || labels.cover === callLabel;
    });
    if (matched) mcpSubToolName = matched.name;
  }

  return {
    tool,
    mode: toolUi.mode || 'add',
    callLabel: toolUi.callName || getActiveToolCallLabels(tool).add,
    query: String(toolUi.query || '').trim(),
    raw: toolUi.raw || '',
    reason: cleanActiveToolCallReason(toolUi.reason),
    mcpSubToolName: mcpSubToolName || undefined,
  };
};

// ============================================================================
// 工具执行
// ============================================================================

/**
 * 截断文本到指定长度
 */
const trimText = (text: string, maxLen: number): string => {
  const str = String(text || '').trim();
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '...';
};

/**
 * 转义 XML 特殊字符
 */
const escapeXml = (s: unknown): string =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * 从工具查询中提取 URL（用于 Web 工具的 extract 模式）
 */
const extractWebUrlsFromToolQuery = (query: string): string[] => {
  const urls: string[] = [];
  const regex = /https?:\/\/[^\s<>"']+/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(query)) !== null) {
    urls.push(match[0].replace(/[.,;)]+$/, ''));
  }
  return urls;
};

/**
 * 执行向量记忆检索
 *
 * 基于关键词在向量记忆分片中检索匹配内容（无 embedding API 时的降级方案）。
 * 优先按查询词在分片内容中匹配，按匹配度排序。
 */
const executeVectorSearch = (
  query: string,
  shards: ToolExecutionContext['vectorMemoryShards'],
  limit: number,
): string => {
  const cleanQuery = trimText(query, 800);
  if (!cleanQuery || shards.length === 0) {
    return '<active_tool_result status="empty">向量记忆检索未找到匹配结果。</active_tool_result>';
  }

  const terms = cleanQuery
    .split(/[\s,，、;；|｜/\\]+/u)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  const scored = shards
    .map((shard) => {
      const lowerContent = String(shard.content || '').toLowerCase();
      const matchedTerms = terms.filter((term) => lowerContent.includes(term));
      return { shard, score: matchedTerms.length };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(limit, ACTIVE_TOOL_MAX_RESULT_COUNT)));

  if (scored.length === 0) {
    return '<active_tool_result status="empty">向量记忆检索未找到匹配结果。</active_tool_result>';
  }

  const formatted = scored
    .map((item, index) => {
      const turn = item.shard.turn || '?';
      const content = trimText(item.shard.content, 1800);
      return `  <memory index="${index + 1}" turn="${turn}">\n    ${content}\n  </memory>`;
    })
    .join('\n\n');

  return `<active_tool_result status="ok" type="vector_memory">\n${formatted}\n</active_tool_result>`;
};

/**
 * 执行关键词搜索
 *
 * 在聊天消息中按关键词搜索匹配的对话内容。
 */
const executeKeywordSearch = (
  query: string,
  messages: ChatMessage[],
  limit: number,
): string => {
  const cleanQuery = trimText(query, 300);
  if (!cleanQuery) {
    return '<active_tool_result status="empty">关键词搜索未找到匹配结果。</active_tool_result>';
  }

  const terms = Array.from(
    new Set([
      cleanQuery,
      ...cleanQuery
        .split(/[\s,，、;；|｜/\\]+/u)
        .map((t) => t.trim())
        .filter(Boolean),
    ]),
  )
    .filter((t) => t.length > 0)
    .slice(0, 12);
  const lowerTerms = terms.map((t) => t.toLowerCase());

  const scored: Array<{
    role: string;
    speaker: string;
    matchedTerms: string[];
    score: number;
    messageIndex: number;
    text: string;
  }> = [];

  messages.forEach((message, index) => {
    if (!message || message.role === 'system') return;
    const text = String(message.content || '').trim();
    if (!text || text.includes('<active_tool_result')) return;

    const lowerText = text.toLowerCase();
    const matchedTerms = terms.filter((_term, termIndex) =>
      lowerText.includes(lowerTerms[termIndex]),
    );
    if (matchedTerms.length === 0) return;

    const fullQueryMatched = lowerText.includes(lowerTerms[0]);
    const roleLabel = message.role === 'user' ? '用户' : '角色卡';
    scored.push({
      role: message.role,
      speaker: roleLabel,
      matchedTerms,
      score: (fullQueryMatched ? 100 : 0) + matchedTerms.length,
      messageIndex: index,
      text: trimText(text, 1400),
    });
  });

  if (scored.length === 0) {
    return '<active_tool_result status="empty">关键词搜索未找到匹配结果。</active_tool_result>';
  }

  const sorted = scored
    .sort((a, b) => {
      const diff = b.score - a.score;
      if (diff !== 0) return diff;
      return b.messageIndex - a.messageIndex;
    })
    .slice(0, Math.max(1, Math.min(limit, ACTIVE_TOOL_MAX_RESULT_COUNT)))
    .sort((a, b) => a.messageIndex - b.messageIndex);

  const formatted = sorted
    .map((item, index) => {
      return `  <dialogue index="${index + 1}" speaker="${item.speaker}" matched="${item.matchedTerms.join(', ')}">\n    ${item.text}\n  </dialogue>`;
    })
    .join('\n\n');

  return `<active_tool_result status="ok" type="keyword_search">\n${formatted}\n</active_tool_result>`;
};

/**
 * 执行 Tavily Web 搜索
 *
 * 支持两种模式：
 * - search：关键词搜索（默认）
 * - extract：URL 提取（查询中包含 URL 时自动切换）
 */
const executeWebSearch = async (
  query: string,
  apiKey: string,
  limit: number,
  signal?: AbortSignal,
): Promise<string> => {
  const cleanQuery = trimText(query, 800);
  if (!cleanQuery) {
    return '<active_tool_result status="empty">Web 搜索查询为空。</active_tool_result>';
  }

  const key = String(apiKey || '').trim();
  if (!key) {
    throw new Error('请先在工具设置里填写 Tavily API Key。');
  }

  // 检测是否为 URL 提取模式
  const extractUrls = extractWebUrlsFromToolQuery(cleanQuery);
  if (extractUrls.length > 0) {
    const body = {
      urls: extractUrls.length === 1 ? extractUrls[0] : extractUrls,
      extract_depth: TAVILY_SEARCH_DEPTH,
      format: 'markdown',
      include_favicon: true,
      timeout: 30,
    };
    const response = await fetch(TAVILY_EXTRACT_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(`Tavily 网页读取失败：HTTP ${response.status}`);
    }
    const results = (Array.isArray(data.results) ? data.results : []) as Array<Record<string, unknown>>;
    if (results.length === 0) {
      return '<active_tool_result status="empty" web_mode="extract">网页读取没有抽取到可用正文。</active_tool_result>';
    }
    const formatted = results
      .map((item, index) => {
        const url = String(item.url || extractUrls[index] || '').trim();
        const title = String(item.title || url).trim();
        const content = trimText(String(item.raw_content || item.content || ''), 6000);
        return `  <web_page index="${index + 1}" title="${escapeXml(title)}" url="${escapeXml(url)}">\n    <content>\n      ${escapeXml(content)}\n    </content>\n  </web_page>`;
      })
      .join('\n\n');
    return `<active_tool_result status="ok" type="web_search" web_mode="extract">\n${formatted}\n</active_tool_result>`;
  }

  // 搜索模式
  const maxResults = Math.max(
    ACTIVE_TOOL_MIN_RESULT_COUNT,
    Math.min(ACTIVE_TOOL_MAX_RESULT_COUNT, limit || ACTIVE_TOOL_DEFAULT_RESULT_COUNT),
  );
  const body = {
    query: cleanQuery,
    search_depth: TAVILY_SEARCH_DEPTH,
    max_results: maxResults,
    topic: 'general',
    include_favicon: true,
  };
  const response = await fetch(TAVILY_SEARCH_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    if (response.status === 401) throw new Error('Tavily API Key 无效，请检查工具设置里的 API Key。');
    if (response.status === 429) throw new Error('Tavily 请求太频繁或额度不足，请稍后再试。');
    throw new Error(`Tavily 搜索失败：HTTP ${response.status}`);
  }

  const results = (Array.isArray(data.results) ? data.results : []).slice(0, maxResults) as Array<Record<string, unknown>>;
  if (results.length === 0) {
    return '<active_tool_result status="empty" web_mode="search">联网搜索没有找到可用网页结果。</active_tool_result>';
  }

  const formatted = results
    .map((item, index) => {
      const title = String(item.title || '未命名网页').trim();
      const url = String(item.url || '').trim();
      const content = trimText(String(item.content || ''), 1800);
      return `  <web_source index="${index + 1}" title="${escapeXml(title)}" url="${escapeXml(url)}">\n    <content>\n      ${escapeXml(content)}\n    </content>\n  </web_source>`;
    })
    .join('\n\n');

  return `<active_tool_result status="ok" type="web_search" web_mode="search">\n${formatted}\n</active_tool_result>`;
};

/**
 * 执行世界书检索
 *
 * 支持三种操作：
 * - list：列出已启用的世界书条目名称
 * - read <name>：按名称读取世界书条目
 * - 默认：按关键词搜索世界书条目
 */
const executeWorldInfoSearch = (
  query: string,
  entries: WorldInfoEntry[],
): string => {
  const cleanQuery = String(query || '').trim();
  const enabled = (Array.isArray(entries) ? entries : []).filter((e) => e.enabled !== false);

  if (cleanQuery.toLowerCase() === 'list') {
    if (enabled.length === 0) {
      return '<active_tool_result status="empty" world_info_mode="list">没有已启用的世界书条目。</active_tool_result>';
    }
    const names = enabled.map((e, i) => `  <entry index="${i + 1}" name="${e.id}">`).join('\n');
    return `<active_tool_result status="ok" type="world_info" world_info_mode="list">\n${names}\n</active_tool_result>`;
  }

  if (cleanQuery.toLowerCase().startsWith('read ')) {
    const targetName = cleanQuery.slice(5).trim();
    const matched = enabled.filter((e) =>
      String(e.id || '').toLowerCase().includes(targetName.toLowerCase()),
    );
    if (matched.length === 0) {
      return `<active_tool_result status="empty" world_info_mode="read">未找到名称包含 "${targetName}" 的世界书条目。</active_tool_result>`;
    }
    const formatted = matched
      .map((e, i) => `  <entry index="${i + 1}" name="${e.id}">\n    ${trimText(e.content, 6000)}\n  </entry>`)
      .join('\n\n');
    return `<active_tool_result status="ok" type="world_info" world_info_mode="read">\n${formatted}\n</active_tool_result>`;
  }

  // 关键词搜索
  const terms = cleanQuery
    .split(/[\s,，、;；|｜/\\]+/u)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (terms.length === 0) {
    return '<active_tool_result status="empty" world_info_mode="search">世界书搜索关键词为空。</active_tool_result>';
  }

  const matched = enabled
    .map((e) => {
      const lowerContent = String(e.content || '').toLowerCase();
      const lowerKeys = (e.keys || []).map((k) => String(k).toLowerCase());
      const contentMatches = terms.filter((t) => lowerContent.includes(t));
      const keyMatches = terms.filter((t) => lowerKeys.some((k) => k.includes(t)));
      const score = contentMatches.length + keyMatches.length * 2;
      return { entry: e, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (matched.length === 0) {
    return '<active_tool_result status="empty" world_info_mode="search">世界书检索未找到匹配条目。</active_tool_result>';
  }

  const formatted = matched
    .slice(0, ACTIVE_TOOL_MAX_RESULT_COUNT)
    .map((item, i) => {
      const e = item.entry;
      return `  <entry index="${i + 1}" name="${e.id}" order="${e.order}">\n    ${trimText(e.content, 4000)}\n  </entry>`;
    })
    .join('\n\n');

  return `<active_tool_result status="ok" type="world_info" world_info_mode="search">\n${formatted}\n</active_tool_result>`;
};

/**
 * 执行 SKILL 文件阅读
 *
 * 解析 skill_name/file_path 参数，查找对应的 SKILL 工具并读取文件内容。
 * 注意：当前上下文不包含工具列表，无法查找其他 SKILL 工具的文件。
 *
 * @returns 错误信息字符串（需要工具列表支持）
 */
const executeSkillReadfile = (query: string): string => {
  const rawQuery = String(query || '').trim();
  const slashIdx = rawQuery.indexOf('/');
  if (slashIdx <= 0) {
    return '<active_tool_result status="error" type="skill_readfile">参数格式错误，应为 skill_name/file_path</active_tool_result>';
  }
  const skillName = rawQuery.slice(0, slashIdx).trim();
  const filePath = rawQuery.slice(slashIdx + 1).trim();
  if (!skillName || !filePath) {
    return '<active_tool_result status="error" type="skill_readfile">skill_name 或 file_path 为空</active_tool_result>';
  }

  // 检查文件扩展名是否为文本文件
  const lower = filePath.toLowerCase();
  const isText = SKILL_FILE_TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext));
  if (!isText) {
    return `<active_tool_result status="error" type="skill_readfile">文件 "${filePath}" 不是文本文件，无法读取。</active_tool_result>`;
  }

  // 当前上下文不包含工具列表，无法查找 SKILL 工具的文件
  return `<active_tool_result status="error" type="skill_readfile">无法在当前上下文中查找 SKILL "${skillName}" 的文件 "${filePath}"。请通过 store 提供工具列表。</active_tool_result>`;
};

/**
 * 执行 SKILL 工具调用
 *
 * 将 SKILL 文件内容作为上下文注入。
 */
const executeSkill = (tool: ActiveTool): string => {
  const skillMd = String(tool.skillFileContent || '');
  const skillName = String(tool.skillFileName || tool.name || '');
  if (!skillMd) {
    return `<active_tool_result status="empty" type="skill">SKILL "${skillName}" 没有内容。</active_tool_result>`;
  }
  return `<active_tool_result status="ok" type="skill">\n  <skill_content name="${skillName}">\n${skillMd}\n  </skill_content>\n</active_tool_result>`;
};

/**
 * 执行 MCP 工具调用
 *
 * 委托给 mcpService.callMcpTool，将查询解析为 JSON 参数。
 */
const executeMcpHttp = async (
  tool: ActiveTool,
  subToolName: string,
  query: string,
  sessionIds: Map<string, string>,
): Promise<string> => {
  const url = String(tool.mcpServerUrl || '').trim();
  if (!url) {
    throw new Error('MCP server URL 未配置');
  }
  if (!subToolName) {
    throw new Error('MCP 子工具名称为空');
  }

  let mcpArgs: Record<string, unknown> = {};
  try {
    mcpArgs = JSON.parse(query || '{}') as Record<string, unknown>;
  } catch {
    mcpArgs = { _raw: query };
  }

  const sessionId = sessionIds.get(url);
  const result = await callMcpTool(url, subToolName, mcpArgs, sessionId);
  const status = result.isError ? 'error' : 'ok';
  return `<active_tool_result status="${status}" type="mcp_http" sub_tool="${subToolName}">\n  ${trimText(result.text, 6000)}\n</active_tool_result>`;
};

/**
 * 执行工具调用
 *
 * 根据工具类型分发到对应的执行函数，返回格式化的结果上下文字符串。
 *
 * 支持的工具类型：
 * - vector：向量记忆检索（基于关键词的降级方案）
 * - keyword：关键词搜索
 * - web：Tavily Web 搜索
 * - world：世界书检索
 * - skill_readfile：SKILL 文件阅读
 * - mcp_http：MCP 工具调用
 * - skill：SKILL 执行
 *
 * @param toolCall - 工具调用对象
 * @param context - 工具执行上下文
 * @returns 格式化的结果上下文字符串
 * @throws 工具执行失败时抛出错误
 */
export const executeActiveToolCall = async (
  toolCall: ActiveToolCall,
  context: ToolExecutionContext,
): Promise<string> => {
  const tool = toolCall.tool;
  const query = String(toolCall.query || '').trim();
  const limit = Number(tool.resultCount) || ACTIVE_TOOL_DEFAULT_RESULT_COUNT;

  if (!tool) {
    throw new Error('工具对象为空');
  }

  // 向量记忆检索
  if (isVectorActiveTool(tool)) {
    return executeVectorSearch(query, context.vectorMemoryShards, limit);
  }

  // 关键词搜索
  if (isKeywordActiveTool(tool)) {
    return executeKeywordSearch(query, context.messages, limit);
  }

  // Web 搜索
  if (isWebActiveTool(tool)) {
    const apiKey = String(tool.tavilyApiKey || context.tavilyApiKey || '').trim();
    return executeWebSearch(query, apiKey, limit);
  }

  // 世界书检索
  if (isWorldInfoActiveTool(tool)) {
    return executeWorldInfoSearch(query, context.worldInfoEntries);
  }

  // SKILL 文件阅读
  if (isSkillReadfileActiveTool(tool)) {
    return executeSkillReadfile(query);
  }

  // MCP 工具调用
  if (isMcpHttpActiveTool(tool)) {
    return executeMcpHttp(
      tool,
      toolCall.mcpSubToolName || '',
      query,
      context.mcpSessionIds,
    );
  }

  // SKILL 执行
  if (isSkillActiveTool(tool)) {
    return executeSkill(tool);
  }

  throw new Error(`未知的工具类型: ${tool.type}`);
};
