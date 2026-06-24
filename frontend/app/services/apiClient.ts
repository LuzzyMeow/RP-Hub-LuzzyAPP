/**
 * API 客户端服务
 *
 * 提供流式请求（fetch + ReadableStream for 浏览器，XMLHttpRequest for 原生）、
 * SSE 解析、非流式请求、AbortController 支持及错误处理。
 *
 * 从旧 Vue 3 app.js 迁移，改为纯函数风格，状态由 zustand store 管理。
 */

import type { ThinkingDepth } from "~/types/luzzy";
import { isNativePlatform } from "~/services/nativeBridge";

/** 本地代理基础地址（仅原生平台使用） */
const NATIVE_PROXY_BASE = "http://localhost:18527";

// v0.8.3: requestAnimationFrame 对齐浏览器刷新帧，消除 setTimeout 最小 4ms 延迟导致的流式掉帧
// 相比 setTimeout(0) 最小 4ms 延迟，requestAnimationFrame 精确对齐 16.67ms 刷新帧，视觉更流畅
const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

// v0.4.5: 重新导出 isNativePlatform,保持现有 import 路径兼容
// (world-info.tsx 和 luzzy-share-dialog.tsx 仍从 apiClient 导入 isNativePlatform)
export { isNativePlatform };

// ============================================================================
// SSE 解析
// ============================================================================

/** SSE 数据块解析结果 */
export interface SSEChunkData {
  /** 文本内容增量 */
  content: string;
  /** 推理/思考链内容增量 */
  reasoningContent: string;
  /** 结束原因（如 "stop"、"length"） */
  finishReason: string;
  /** Token 使用统计（OpenAI 在最后一个 chunk 携带，Anthropic 在 message_delta 事件携带） */
  usage?: Record<string, unknown>;
  /** v0.4.4: 原生 tool_calls 增量（OpenAI 兼容格式） */
  toolCalls?: Array<{
    index: number;
    id?: string;
    type?: "function";
    function?: { name?: string; arguments?: string };
  }>;
}

/**
 * 规范化推理内容（兼容多种字段格式与嵌套结构）
 * 支持字符串、数组、对象等多种输入
 */
const normalizeReasoningPart = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(normalizeReasoningPart).join("");
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = [
      "text",
      "content",
      "summary",
      "reasoning",
      "reasoning_content",
      "thinking",
      "thought",
      "value",
    ];
    for (const key of keys) {
      const text = normalizeReasoningPart(obj[key]);
      if (text) return text;
    }
    return "";
  }
  return String(value);
};

/**
 * 从 delta/message 对象中提取推理内容
 * 兼容各供应商的字段命名差异（reasoning_content、thinking、thought 等）
 */
const extractReasoning = (source: Record<string, unknown> | null | undefined): string => {
  if (!source || typeof source !== "object") return "";
  const directKeys = [
    "reasoning_content",
    "reasoning",
    "thinking",
    "thinking_content",
    "thought",
    "thoughts",
    "reasoning_text",
  ];
  for (const key of directKeys) {
    const text = normalizeReasoningPart(source[key]);
    if (text) return text;
  }
  if (Array.isArray(source.reasoning_details)) {
    const text = normalizeReasoningPart(source.reasoning_details);
    if (text) return text;
  }
  if (Array.isArray(source.content)) {
    return source.content
      .map((part: unknown) => {
        const item = part as Record<string, unknown> | null;
        const type = String(item?.type ?? "").toLowerCase();
        if (type.includes("reason") || type.includes("thinking") || type.includes("thought")) {
          return normalizeReasoningPart(item);
        }
        return "";
      })
      .join("");
  }
  return "";
};

/**
 * 解析 SSE 数据块
 *
 * 从已解析的 JSON 数据对象中提取文本内容、推理内容和结束原因。
 * 兼容 OpenAI、Anthropic、Gemini 三种响应格式。
 *
 * @param data - 已通过 JSON.parse 解析的数据对象
 * @returns 内容、推理内容、结束原因、usage（归一化为 OpenAI 字段名）
 */
export const parseSSEChunk = (data: Record<string, unknown>): SSEChunkData => {
  const result: SSEChunkData = {
    content: "",
    reasoningContent: "",
    finishReason: "",
  };

  // === Anthropic 事件处理 ===
  // Anthropic SSE 事件通过 type 字段区分：message_start / content_block_delta / message_delta
  const eventType = String(data.type ?? "");
  if (eventType === "message_start") {
    const message = data.message as Record<string, unknown> | undefined;
    const usage = message?.usage as Record<string, unknown> | undefined;
    if (usage) {
      const inputTokens = Number(usage.input_tokens ?? 0);
      const cacheRead = Number(usage.cache_read_input_tokens ?? 0);
      const cacheWrite = Number(usage.cache_write_input_tokens ?? 0);
      result.usage = {
        prompt_tokens: inputTokens + cacheRead + cacheWrite,
        prompt_tokens_details: { cached_tokens: cacheRead },
      };
    }
    return result;
  }
  if (eventType === "content_block_delta") {
    const delta = data.delta as Record<string, unknown> | undefined;
    if (delta) {
      const deltaType = String(delta.type ?? "");
      if (deltaType === "text_delta") {
        result.content = String(delta.text ?? "");
      } else if (deltaType === "thinking_delta") {
        result.reasoningContent = String(delta.thinking ?? "");
      }
    }
    return result;
  }
  if (eventType === "message_delta") {
    const usage = data.usage as Record<string, unknown> | undefined;
    if (usage) {
      result.usage = {
        completion_tokens: Number(usage.output_tokens ?? 0),
      };
    }
    const delta = data.delta as Record<string, unknown> | undefined;
    if (delta?.stop_reason) {
      result.finishReason = String(delta.stop_reason);
    }
    return result;
  }

  // Anthropic 非流式响应（type: "message"）
  if (eventType === "message") {
    const contentBlocks = data.content as Array<Record<string, unknown>> | undefined;
    if (contentBlocks) {
      for (const block of contentBlocks) {
        if (block.type === "text") {
          result.content += String(block.text ?? "");
        } else if (block.type === "thinking") {
          result.reasoningContent += String(block.thinking ?? "");
        }
      }
    }
    const usage = data.usage as Record<string, unknown> | undefined;
    if (usage) {
      const inputTokens = Number(usage.input_tokens ?? 0);
      const cacheRead = Number(usage.cache_read_input_tokens ?? 0);
      const cacheWrite = Number(usage.cache_write_input_tokens ?? 0);
      result.usage = {
        prompt_tokens: inputTokens + cacheRead + cacheWrite,
        completion_tokens: Number(usage.output_tokens ?? 0),
        prompt_tokens_details: { cached_tokens: cacheRead },
      };
    }
    result.finishReason = String(data.stop_reason ?? "");
    return result;
  }

  // === OpenAI 格式处理 ===
  const choices = data.choices as Array<Record<string, unknown>> | undefined;
  const choice = choices?.[0];

  // 提取 usage（OpenAI 在最后一个 chunk 携带，与 choices 同级）
  if (data.usage && typeof data.usage === "object") {
    result.usage = data.usage as Record<string, unknown>;
  }

  // === Gemini 格式处理（OpenAI 兼容模式下 usageMetadata 字段）===
  if (data.usageMetadata && typeof data.usageMetadata === "object") {
    const um = data.usageMetadata as Record<string, unknown>;
    result.usage = {
      prompt_tokens: Number(um.promptTokenCount ?? 0),
      completion_tokens: Number(um.candidatesTokenCount ?? 0),
      prompt_tokens_details: {
        cached_tokens: Number(um.cachedContentTokenCount ?? 0),
      },
    };
  }

  if (!choice) return result;

  result.finishReason = String(choice.finish_reason ?? "");

  const delta = (choice.delta ?? choice.message ?? {}) as Record<string, unknown>;
  result.content = String(delta.content ?? "");
  result.reasoningContent = extractReasoning(delta);

  // v0.4.4: 解析原生 tool_calls（OpenAI 兼容格式）
  const toolCalls = delta.tool_calls as Array<Record<string, unknown>> | undefined;
  if (toolCalls && Array.isArray(toolCalls)) {
    result.toolCalls = toolCalls.map((tc) => {
      const fn = (tc.function ?? {}) as Record<string, unknown>;
      return {
        index: Number(tc.index ?? 0),
        id: String(tc.id ?? ""),
        type: "function" as const,
        function: {
          name: String(fn.name ?? ""),
          arguments: String(fn.arguments ?? ""),
        },
      };
    });
  }

  return result;
};

// ============================================================================
// KV 响应缓存层
// ============================================================================

/** 缓存条目结构 */
interface CacheEntry<T> {
  /** 缓存值 */
  value: T;
  /** 过期时间戳（毫秒） */
  expiresAt: number;
}

/** 默认缓存 TTL：30 分钟（适合 embedding 等确定性请求） */
const DEFAULT_CACHE_TTL = 30 * 60 * 1000;

/** 内存缓存表（按 URL+body 哈希键索引） */
const responseCache = new Map<string, CacheEntry<unknown>>();

/** 最大缓存条目数，防止内存无限增长 */
const MAX_CACHE_ENTRIES = 500;

/**
 * 生成请求的缓存键
 *
 * 基于 URL + 请求体生成确定性哈希键。
 * 忽略 stream 字段（流式/非流式同一请求可共享缓存）。
 *
 * @param url - 请求 URL
 * @param body - 请求体对象
 * @returns 缓存键字符串
 */
export const generateCacheKey = (url: string, body: Record<string, unknown>): string => {
  // 移除 stream 字段，仅基于实质内容生成键
  const { stream: _stream, ...bodyWithoutStream } = body;
  const bodyStr = JSON.stringify(bodyWithoutStream, Object.keys(bodyWithoutStream).sort());
  return `${url}::${bodyStr}`;
};

/**
 * 读取缓存
 *
 * @param key - 缓存键
 * @returns 缓存值（未命中或已过期返回 undefined）
 */
export const getCachedResponse = <T>(key: string): T | undefined => {
  const entry = responseCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    responseCache.delete(key);
    return undefined;
  }
  return entry.value as T;
};

/**
 * 写入缓存
 *
 * @param key - 缓存键
 * @param value - 缓存值
 * @param ttl - TTL（毫秒），默认 30 分钟
 */
export const setCachedResponse = <T>(
  key: string,
  value: T,
  ttl: number = DEFAULT_CACHE_TTL,
): void => {
  // 超出上限时清除最早的条目
  if (responseCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = responseCache.keys().next().value;
    if (firstKey !== undefined) {
      responseCache.delete(firstKey);
    }
  }
  responseCache.set(key, {
    value,
    expiresAt: Date.now() + ttl,
  });
};

/**
 * 清除所有缓存
 */
export const clearResponseCache = (): void => {
  responseCache.clear();
};

/**
 * 带缓存的非流式请求
 *
 * 先检查缓存，命中则直接返回；未命中则发起请求并缓存结果。
 * 适用于 embedding 等确定性 API 调用。
 *
 * @param params - 请求参数（同 sendRequest）
 * @param ttl - 缓存 TTL（毫秒），默认 30 分钟
 * @returns 响应 JSON
 */
export const sendRequestWithCache = async <T = unknown>(
  params: {
    url: string;
    apiKey: string;
    body: Record<string, unknown>;
    signal?: AbortSignal;
  },
  ttl: number = DEFAULT_CACHE_TTL,
): Promise<T> => {
  const cacheKey = generateCacheKey(params.url, params.body);

  // 缓存命中短路
  const cached = getCachedResponse<T>(cacheKey);
  if (cached !== undefined) {
    console.log("[API] 缓存命中:", params.url);
    return cached;
  }

  // 缓存未命中，发起请求
  const response = await sendRequest(params);
  const data = (await response.json()) as T;

  // 写入缓存
  setCachedResponse(cacheKey, data, ttl);
  return data;
};

// ============================================================================
// 请求体构建
// ============================================================================

/** 构建请求体所需的设置项 */
export interface ApiRequestBodySettings {
  /** 是否启用深度思考（旧字段，向后兼容） */
  enableThinking?: boolean;
  /** 思考深度档位（v0.3.0 新增，6 档：minimal/auto/low/medium/high/max） */
  thinkingDepth?: ThinkingDepth;
  /** 自定义请求体 JSON 字符串 */
  customRequestBody?: string;
  /** v0.4.4: 活动工具列表（用于原生 tool_calls 注入） */
  activeTools?: Array<{
    type: string;
    callName: string;
    description: string;
  }>;
  /** v0.8.1: true → tool_choice: 'required'（强制工具调用），false/undefined → 'auto' */
  forceToolCall?: boolean;
}

/**
 * 思考深度到 reasoning_effort 的映射（OpenAI 风格）
 * - minimal: 不注入（关闭思考）
 * - auto: 不注入（由模型自行决定）
 * - low/medium/high/max: 注入对应 reasoning_effort 值
 */
const THINKING_DEPTH_TO_REASONING_EFFORT: Record<
  Exclude<ThinkingDepth, "minimal" | "auto">,
  string
> = {
  low: "low",
  medium: "medium",
  high: "high",
  max: "max",
};

/**
 * 解析用户输入的自定义请求体 JSON
 * @returns 解析后的对象，无效或空则返回 null
 */
export const parseCustomRequestBody = (
  customRequestBody?: string,
): Record<string, unknown> | null => {
  const text = (customRequestBody ?? "").trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch (e) {
    console.error("[API] 自定义请求体 JSON 解析失败:", e);
    return null;
  }
};

/**
 * 校验自定义请求体 JSON 格式（供 UI 实时反馈使用）
 * @returns 校验结果与错误信息
 */
export const validateCustomRequestBody = (
  customRequestBody?: string,
): { valid: boolean; error: string } => {
  const text = (customRequestBody ?? "").trim();
  if (!text) return { valid: true, error: "" };
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { valid: false, error: "必须是 JSON 对象" };
    }
    return { valid: true, error: "" };
  } catch (e) {
    return { valid: false, error: e instanceof Error ? e.message : String(e) };
  }
};

/**
 * v0.4.4: 构建工具的 JSON Schema（用于原生 tool_calls）
 * 根据工具类型返回对应的参数 schema
 */
export const buildToolSchema = (toolType: string): Record<string, unknown> => {
  // v0.4.6: 内置工具的 JSON Schema 映射
  const builtinSchemas: Record<string, Record<string, unknown>> = {
    "memory-recall": {
      type: "object",
      properties: {
        query: { type: "string", description: "空格分隔的多个关键词" },
      },
      required: ["query"],
    },
    "vector-memory": {
      type: "object",
      properties: {
        query: { type: "string", description: "空格分隔的多个关键词" },
      },
      required: ["query"],
    },
    "keyword-search": {
      type: "object",
      properties: {
        query: { type: "string", description: "空格分隔的多个关键词" },
      },
      required: ["query"],
    },
    "world-recall": {
      type: "object",
      properties: {
        query: { type: "string", description: "空格分隔的多个关键词" },
      },
      required: ["query"],
    },
    anysearch: {
      type: "object",
      properties: {
        query: { type: "string", description: "联网搜索的查询内容" },
      },
      required: ["query"],
    },
  };

  // v0.4.6: 优先返回内置工具的 schema
  if (builtinSchemas[toolType]) {
    return builtinSchemas[toolType];
  }

  // 用户工具的默认 schema
  const baseSchema = {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "搜索/召回的查询关键词",
      },
    },
    required: ["query"],
  };

  return baseSchema;
};

/**
 * 构建最终请求体（合并基础字段 + 深度思考 + 自定义 JSON）
 *
 * 合并优先级：基础字段 < 深度思考 < 自定义 JSON
 * 保护核心字段：model 和 messages 不允许被自定义 JSON 覆盖
 *
 * 思考深度处理（v0.3.0）：
 * - thinkingDepth 优先于 enableThinking（旧字段）
 * - minimal: 不注入任何思考字段（关闭）
 * - auto: 不注入任何思考字段（由模型决定）
 * - low/medium/high/max: 注入 reasoning_effort（OpenAI 风格）+ thinking（Anthropic 风格）
 * - 自定义 JSON 可覆盖思考字段（优先级最高）
 *
 * v0.4.4 新增：原生 tool_calls 支持
 * - 当 settings.activeTools 非空时，注入 tools 和 tool_choice 参数
 * - 模型可通过原生 tool_calls 字段调用工具，无需文本标签协议
 * - tools 参数不影响 messages 前缀，KV 缓存友好
 *
 * @param baseBody - 基础请求体（含 model, messages, temperature, stream）
 * @param settings - API 设置（含思考深度与自定义请求体）
 * @returns 合并后的最终请求体
 */
export const buildApiRequestBody = (
  baseBody: Record<string, unknown>,
  settings: ApiRequestBodySettings,
): Record<string, unknown> => {
  const result: Record<string, unknown> = { ...baseBody };

  // 思考深度注入（v0.3.0 优先使用 thinkingDepth，回退到 enableThinking）
  const depth = settings.thinkingDepth;
  if (depth && depth !== "minimal" && depth !== "auto") {
    // low/medium/high/max → 注入 reasoning_effort + thinking
    const effort = THINKING_DEPTH_TO_REASONING_EFFORT[depth];
    if (effort) {
      result.reasoning_effort = effort;
    }
    // Anthropic 风格的 thinking 字段
    result.thinking = { type: "enabled" };
  } else if (depth === "auto") {
    // auto: 不注入任何思考字段，由模型自行决定
  } else if (settings.enableThinking && !depth) {
    // 旧字段兼容：enableThinking=true 且未设置 thinkingDepth
    result.thinking = { type: "enabled" };
  }

  // v0.4.4: 原生 tool_calls 注入（在自定义 JSON 之前，可被自定义 JSON 覆盖）
  if (settings.activeTools && settings.activeTools.length > 0) {
    result.tools = settings.activeTools.map((tool) => ({
      type: "function",
      function: {
        name: tool.callName,
        description: tool.description,
        parameters: buildToolSchema(tool.type),
      },
    }));
    result.tool_choice = settings.forceToolCall ? "required" : "auto";
  }

  // 自定义 JSON 合并（优先级最高，可覆盖思考字段和 tools）
  const customBody = parseCustomRequestBody(settings.customRequestBody);
  if (customBody) {
    for (const key of Object.keys(customBody)) {
      // v0.8.2: 保护 tools 和 tool_choice 不被自定义 JSON 覆盖
      if (key === "model" || key === "messages" || key === "tools" || key === "tool_choice")
        continue;
      result[key] = customBody[key];
    }
  }

  // OpenAI 流式请求自动添加 stream_options 以获取 usage
  if (result.stream === true && !result.stream_options) {
    result.stream_options = { include_usage: true };
  }

  return result;
};

// ============================================================================
// 错误处理
// ============================================================================

/** API 错误（用于区分 API 返回的业务错误与其他运行时错误） */
export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * 格式化 API 错误消息
 * @param status - HTTP 状态码
 * @param detail - 错误详情（字符串或对象）
 * @returns 格式化后的错误消息
 */
export const formatApiErrorMessage = (status: number | string, detail: unknown): string => {
  const lines: string[] = [];
  if (status !== undefined && status !== null && status !== "") {
    lines.push(`API Error: ${status}`);
  }
  let detailText = "";
  if (typeof detail === "string") {
    detailText = detail;
  } else if (detail !== null && detail !== undefined) {
    try {
      detailText = JSON.stringify(detail, null, 2);
    } catch {
      detailText = String(detail);
    }
  }
  lines.push(detailText.trim() || "请求失败");
  return lines.join("\n");
};

/**
 * 从 API 响应负载中提取错误消息
 * @param payload - 响应 JSON 对象
 * @param fallbackStatus - 备用 HTTP 状态码
 * @returns 格式化的错误消息，无错误则返回空字符串
 */
export const extractApiErrorMessage = (
  payload: unknown,
  fallbackStatus: number | string = "",
): string => {
  if (!payload || typeof payload !== "object") return "";
  const obj = payload as Record<string, unknown>;
  const error = obj.error;
  const status = fallbackStatus;
  if (typeof error === "string") return formatApiErrorMessage(status, error);
  if (error && typeof error === "object") {
    const errObj = error as Record<string, unknown>;
    const detail = errObj.message || errObj.detail || obj.message || obj.detail || error;
    return formatApiErrorMessage(status, detail);
  }
  const detail = obj.message || obj.detail;
  if (!detail) return "";
  return formatApiErrorMessage(status, detail);
};

// ============================================================================
// 流式请求
// ============================================================================

/** 流式请求参数 */
export interface StreamRequestParams {
  /** 真实 API URL（含 /v1/chat/completions 等端点） */
  url: string;
  /** API 密钥 */
  apiKey: string;
  /** 请求体对象（已含 stream: true） */
  body: Record<string, unknown>;
  /** 中止信号 */
  signal?: AbortSignal;
  /** SSE 数据块回调，参数为 (原始数据字符串, 解析后的 JSON 对象) */
  onChunk: (dataStr: string, parsed: Record<string, unknown>) => void;
  /** 错误回调 */
  onError?: (status: number, errorText: string) => void;
}

/** 流式请求结果 */
export interface StreamRequestResult {
  status: number;
  ok: boolean;
}

/**
 * 原生平台流式请求（XMLHttpRequest + 本地代理）
 *
 * CapacitorHttp 会 patch 全局 fetch，导致 response.body.getReader() 在 Android 上
 * 一次性返回完整数据，无法实现真流式。XMLHttpRequest 不被 patch，其 onprogress
 * 事件可逐步触发，responseText 也会增量更新，因此可用于真流式输出。
 *
 * 请求路径：XHR → http://localhost:18527/v1/chat/completions?_target=<真实API> → 真实API
 * 本地代理（NanoHTTPD）使用 newChunkedResponse 透传上游响应，支持流式。
 */
const sendStreamRequestViaXHR = (params: StreamRequestParams): Promise<StreamRequestResult> => {
  const { url, apiKey, body, signal, onChunk, onError } = params;

  return new Promise<StreamRequestResult>((resolve, reject) => {
    // 构建本地代理 URL：将真实 API URL 作为 _target 参数传递
    // v0.3.8 修复：把 /v1、/v3 等版本前缀保留在 _target 中，避免代理把 /v1 误删导致 404。
    // 例如 https://api.deepseek.com/v1/chat/completions
    //   → http://localhost:18527/chat/completions?_target=https://api.deepseek.com/v1
    let proxyUrl: string;
    try {
      const targetUrl = new URL(url);
      const pathname = targetUrl.pathname;
      const versionMatch = pathname.match(/^(\/v\d+)(\/.*)$/);
      const endpointPath = versionMatch ? versionMatch[2] : pathname;
      const targetBase = versionMatch ? `${targetUrl.origin}${versionMatch[1]}` : targetUrl.origin;
      proxyUrl = `${NATIVE_PROXY_BASE}${endpointPath}?_target=${encodeURIComponent(targetBase)}`;
      if (targetUrl.search) {
        proxyUrl += "&" + targetUrl.search.replace(/^\?/, "");
      }
      console.log("[XHR Stream] 代理 URL:", proxyUrl, "原始 URL:", url);
    } catch (e) {
      console.warn("[XHR Stream] URL 解析失败，回退直连:", e);
      proxyUrl = url;
    }

    // v0.4.5: 方案 D 移除 CapacitorHttp patch,XHR 可直接使用,无需 CapacitorWebXMLHttpRequest.fullObject hack
    const XhrCtor: typeof XMLHttpRequest = XMLHttpRequest;

    const xhr = new XhrCtor();
    xhr.open("POST", proxyUrl, true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Accept", "text/event-stream");
    if (apiKey) {
      xhr.setRequestHeader("Authorization", `Bearer ${apiKey}`);
    }
    xhr.responseType = "text";
    xhr.timeout = 0; // 流式请求不设超时

    let receivedLength = 0;
    let buffer = "";
    let settled = false;
    let chunkError: Error | null = null;
    let onAbort: (() => void) | null = null;
    // v0.5.4: 异步处理标志，防止 onprogress 重入导致并发处理
    let isProcessing = false;
    // v0.5.4: 待处理的增量数据队列，onprogress 触发时入队，异步处理器消费
    let pendingChunks: string[] = [];
    // v0.5.4: onload 完成标志，用于 processIncrementalAsync 退出时处理残留
    let isLoadComplete = false;

    const safeResolve = (value: StreamRequestResult): void => {
      if (settled) return;
      settled = true;
      if (onAbort && signal) signal.removeEventListener("abort", onAbort);
      resolve(value);
    };
    const safeReject = (reason: unknown): void => {
      if (settled) return;
      settled = true;
      if (onAbort && signal) signal.removeEventListener("abort", onAbort);
      reject(reason);
    };

    // v0.5.4: onload 最终处理函数，提取为独立函数以支持异步路径调用
    const finalizeLoad = (): void => {
      if (chunkError) {
        safeReject(chunkError);
        return;
      }
      const status = xhr.status;
      const ok = status >= 200 && status < 300;
      if (!ok) {
        const errorText = xhr.responseText || "";
        onError?.(status, errorText);
        safeReject(new Error(formatApiErrorMessage(status, errorText)));
        return;
      }
      safeResolve({ status, ok: true });
    };

    // v0.5.4: 处理单行 SSE 数据，返回是否发生错误
    const processLine = (line: string): boolean => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return true;
      if (!trimmedLine.startsWith("data:")) return true;
      const dataStr = trimmedLine.replace(/^data:\s*/, "");
      if (dataStr === "[DONE]") return true;
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(dataStr);
      } catch {
        return true; // 非 JSON，忽略（可能是注释行或心跳）
      }
      try {
        onChunk(dataStr, parsed);
      } catch (e) {
        // onChunk 抛出错误（如 API 错误），中止请求并 reject
        chunkError = e instanceof Error ? e : new Error(String(e));
        try {
          xhr.abort();
        } catch {
          /* 忽略 */
        }
        return false;
      }
      return true;
    };

    // v0.5.4: 异步处理增量数据，每 10 行让出主线程一次，允许浏览器重绘
    // 解决 Android XHR onprogress 批量触发导致"一下子全部蹦出来"的问题
    // v0.5.7: setTimeout(0)→setTimeout(16) 确保每行有完整 60fps 帧时间渲染
    //         每帧最多处理 3 行防止积压导致"突然蹦出"
    const processIncrementalAsync = async (): Promise<void> => {
      if (isProcessing) return;
      isProcessing = true;

      const MAX_LINES_PER_FRAME = 3;
      let linesThisFrame = 0;

      while (pendingChunks.length > 0 && !chunkError && !settled) {
        const newChunk = pendingChunks.shift()!;
        buffer += newChunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (let i = 0; i < lines.length; i++) {
          if (signal?.aborted) {
            isProcessing = false;
            return;
          }
          const ok = processLine(lines[i]);
          if (!ok) {
            isProcessing = false;
            return;
          }
          linesThisFrame++;
          // v0.8.3: 使用 requestAnimationFrame 对齐浏览器刷新帧，替代 setTimeout
          if (linesThisFrame >= MAX_LINES_PER_FRAME) {
            linesThisFrame = 0;
            await nextFrame();
          } else {
            await nextFrame();
          }
        }
      }
      isProcessing = false;

      // v0.5.4: 如果 onload 已完成，处理残留 buffer 并 finalizeLoad
      // 避免 onload 与 processIncrementalAsync 的 buffer 共享竞争
      if (isLoadComplete && !settled && !chunkError) {
        processBufferSync();
        finalizeLoad();
      }
    };

    // v0.5.4: 同步处理残留 buffer（用于 onload 最终处理）
    const processBufferSync = (): void => {
      if (buffer.trim()) {
        const trimmedLine = buffer.trim();
        buffer = "";
        if (trimmedLine.startsWith("data:")) {
          const dataStr = trimmedLine.replace(/^data:\s*/, "");
          if (dataStr !== "[DONE]") {
            try {
              const parsed = JSON.parse(dataStr);
              // v0.5.4: onChunk 抛错时设置 chunkError（修复 C-1：原实现静默吞错）
              try {
                onChunk(dataStr, parsed);
              } catch (e) {
                chunkError = e instanceof Error ? e : new Error(String(e));
              }
            } catch {
              /* 忽略 JSON 解析错误 */
            }
          }
        }
      }
    };

    xhr.onprogress = (): void => {
      if (chunkError) return;
      try {
        const fullText = xhr.responseText || "";
        if (fullText.length <= receivedLength) return;
        const newChunk = fullText.substring(receivedLength);
        receivedLength = fullText.length;
        if (newChunk.length > 0) {
          // v0.5.4: 入队待处理数据，触发异步处理
          pendingChunks.push(newChunk);
          void processIncrementalAsync();
        }
      } catch (e) {
        console.warn("[XHR Stream] onprogress 处理异常:", e);
      }
    };

    xhr.onload = (): void => {
      // v0.5.4: 处理最后可能残留的增量数据
      if (!chunkError) {
        try {
          const fullText = xhr.responseText || "";
          if (fullText.length > receivedLength) {
            const newChunk = fullText.substring(receivedLength);
            receivedLength = fullText.length;
            pendingChunks.push(newChunk);
          }
        } catch (e) {
          console.warn("[XHR Stream] onload 处理异常:", e);
        }
      }

      // v0.5.4: 如果异步处理仍在进行，设置 isLoadComplete 并返回
      // processIncrementalAsync 会在退出时处理残留 buffer 并调用 finalizeLoad
      // 避免 onload 与 processIncrementalAsync 的 buffer 共享竞争（修复 B-2）
      if (isProcessing) {
        isLoadComplete = true;
        return;
      }

      // v0.5.4: 异步处理已完成，同步处理剩余数据
      if (!chunkError) {
        try {
          while (pendingChunks.length > 0) {
            const chunk = pendingChunks.shift()!;
            buffer += chunk;
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              if (!processLine(line)) break;
            }
          }
          processBufferSync();
        } catch (e) {
          console.warn("[XHR Stream] onload 残留处理异常:", e);
        }
      }

      finalizeLoad();
    };

    xhr.onerror = (): void => {
      if (chunkError) {
        safeReject(chunkError);
        return;
      }
      const errorText = xhr.responseText || "网络请求失败";
      onError?.(0, errorText);
      safeReject(new Error(formatApiErrorMessage(0, errorText)));
    };

    xhr.ontimeout = (): void => {
      onError?.(0, "请求超时");
      safeReject(new Error("流式请求超时"));
    };

    xhr.onabort = (): void => {
      if (chunkError) {
        safeReject(chunkError);
        return;
      }
      safeReject(new DOMException("Aborted", "AbortError"));
    };

    // 支持 AbortController
    if (signal) {
      if (signal.aborted) {
        safeReject(new DOMException("Aborted", "AbortError"));
        return;
      }
      onAbort = (): void => {
        try {
          xhr.abort();
        } catch {
          /* 忽略 */
        }
      };
      signal.addEventListener("abort", onAbort, { once: true });
    }

    try {
      xhr.send(JSON.stringify(body));
    } catch (e) {
      safeReject(e);
    }
  });
};

/**
 * 浏览器流式请求（fetch + ReadableStream）
 *
 * 通过 fetch 获取响应后，使用 response.body.getReader() 逐块读取，
 * 按 SSE 行格式解析并回调 onChunk。
 * 同时兼容非流式响应（API 强制返回 SSE 格式或标准 JSON 的情况）。
 */
const sendStreamRequestViaFetch = async (
  params: StreamRequestParams,
): Promise<StreamRequestResult> => {
  const { url, apiKey, body, signal, onChunk, onError } = params;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    let errorDetail = "";
    try {
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText) as unknown;
        const apiError = extractApiErrorMessage(errorJson, response.status);
        if (apiError) throw new ApiError(apiError);
        errorDetail = errorText;
      } catch (e) {
        if (e instanceof ApiError) throw e;
        if (errorText) errorDetail = errorText;
      }
    } catch (e) {
      if (e instanceof ApiError) throw e;
    }
    onError?.(response.status, errorDetail);
    throw new Error(formatApiErrorMessage(response.status, errorDetail));
  }

  const contentType = response.headers.get("content-type") ?? "";
  const isStream = contentType.includes("text/event-stream");
  const reader = isStream ? response.body?.getReader() : undefined;

  if (!isStream || !reader) {
    // 非流式响应：读取文本并尝试解析（兼容 API 强制返回 SSE 格式的情况）
    const rawText = await response.text();
    let parsedAsJson = false;
    try {
      const data = JSON.parse(rawText) as Record<string, unknown>;
      const apiError = extractApiErrorMessage(data, response.status);
      if (apiError) throw new ApiError(apiError);
      onChunk(rawText, data);
      parsedAsJson = true;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      // JSON 解析失败，尝试作为 SSE 文本解析
    }
    if (!parsedAsJson) {
      // v0.5.4: SSE 文本解析改为分批处理，每 10 行让出主线程一次，模拟流式效果
      const lines = rawText.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (signal?.aborted) break;
        const trimmedLine = lines[i].trim();
        if (!trimmedLine.startsWith("data:")) continue;
        const dataStr = trimmedLine.replace(/^data:\s*/, "");
        if (dataStr === "[DONE]") continue;
        try {
          const parsed = JSON.parse(dataStr) as Record<string, unknown>;
          const apiError = extractApiErrorMessage(parsed, response.status);
          if (apiError) throw new ApiError(apiError);
          onChunk(dataStr, parsed);
        } catch (e) {
          if (e instanceof ApiError) throw e;
          if (/error/i.test(dataStr)) {
            onError?.(response.status, dataStr);
            throw new Error(formatApiErrorMessage(response.status, dataStr));
          }
        }
        // v0.8.3: 使用 requestAnimationFrame 对齐浏览器刷新帧，替代 setTimeout
        await nextFrame();
      }
    }
    return { status: response.status, ok: true };
  }

  // 流式响应：逐块读取并解析 SSE
  const decoder = new TextDecoder();
  let buffer = "";
  // v0.5.7: 每帧最多处理 3 行，防止 React 批处理导致"突然蹦出"
  let fetchLinesThisFrame = 0;
  const FETCH_MAX_LINES_PER_FRAME = 3;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        // v0.5.4: fetch 流式路径添加 abort 检查（修复 E-3）
        if (signal?.aborted) break;
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;
        if (!trimmedLine.startsWith("data:")) continue;
        const dataStr = trimmedLine.replace(/^data:\s*/, "");
        if (dataStr === "[DONE]") continue;
        try {
          const parsed = JSON.parse(dataStr) as Record<string, unknown>;
          const apiError = extractApiErrorMessage(parsed, response.status);
          if (apiError) throw new ApiError(apiError);
          onChunk(dataStr, parsed);
        } catch (e) {
          if (e instanceof ApiError) throw e;
          // v0.5.4: 修复 E-1，改用结构化错误检测替代 /error/i 正则误报
          if (e instanceof Error && e.message.includes("API Error")) {
            onError?.(response.status, dataStr);
            throw e;
          }
          console.warn("Error parsing stream chunk:", e);
        }
        // v0.8.3: 使用 requestAnimationFrame 对齐浏览器刷新帧，替代 setTimeout
        fetchLinesThisFrame++;
        if (fetchLinesThisFrame >= FETCH_MAX_LINES_PER_FRAME) {
          fetchLinesThisFrame = 0;
          await nextFrame();
        } else {
          await nextFrame();
        }
      }
    }

    // 处理 buffer 中剩余的最后一行
    if (buffer.trim()) {
      const trimmedLine = buffer.trim();
      if (trimmedLine.startsWith("data:")) {
        const dataStr = trimmedLine.replace(/^data:\s*/, "");
        if (dataStr !== "[DONE]") {
          try {
            const parsed = JSON.parse(dataStr) as Record<string, unknown>;
            onChunk(dataStr, parsed);
          } catch {
            // 忽略无效的最后一行
          }
        }
      }
    }
  } finally {
    reader.cancel();
  }

  return { status: response.status, ok: true };
};

/**
 * 统一流式请求入口
 *
 * v0.5.6: 优先使用 Fetch API（Capacitor 已移除，无 fetch patch），
 * 若 Fetch 失败（CORS/代理问题），原生平台回退到 XHR + 本地代理。
 * 浏览器环境直接使用 fetch + ReadableStream。
 *
 * @param params - 流式请求参数
 * @returns 请求结果（含状态码与是否成功）
 */
export const sendStreamRequest = async (
  params: StreamRequestParams,
): Promise<StreamRequestResult> => {
  try {
    return await sendStreamRequestViaFetch(params);
  } catch (fetchErr) {
    if (isNativePlatform()) {
      console.warn("[Stream] Fetch 流式失败，回退到 XHR + 本地代理:", fetchErr);
      return sendStreamRequestViaXHR(params);
    }
    throw fetchErr;
  }
};

// ============================================================================
// 非流式请求
// ============================================================================

/** 非流式请求参数 */
export interface RequestOptions {
  /** 请求 URL */
  url: string;
  /** API 密钥 */
  apiKey: string;
  /** 请求体对象 */
  body: Record<string, unknown>;
  /** 中止信号 */
  signal?: AbortSignal;
  /** 额外请求头 */
  headers?: Record<string, string>;
}

/**
 * 发送非流式 API 请求（Fetch 实现）
 *
 * v0.5.6: 从 sendRequest 拆分为 sendRequestViaFetch + sendRequestViaXHR + sendRequest 调度器。
 * 原生平台（Android）fetch 可能被 patch 或 CORS 失败，sendRequest 会先尝试 Fetch，
 * 失败后原生平台回退到 XHR + 本地代理。
 *
 * @param params - 请求参数
 * @returns fetch Response 对象（已校验 response.ok）
 * @throws {ApiError} API 返回的业务错误
 * @throws {Error} 网络错误或格式化后的 API 错误
 */
const sendRequestViaFetch = async (params: RequestOptions): Promise<Response> => {
  const { url, apiKey, body, signal, headers } = params;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...headers,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    let errorDetail = "";
    try {
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText) as unknown;
        const apiError = extractApiErrorMessage(errorJson, response.status);
        if (apiError) throw new ApiError(apiError);
        errorDetail = errorText;
      } catch (e) {
        if (e instanceof ApiError) throw e;
        if (errorText) errorDetail = errorText;
      }
    } catch (e) {
      if (e instanceof ApiError) throw e;
    }
    throw new Error(formatApiErrorMessage(response.status, errorDetail));
  }

  return response;
};

/**
 * 原生平台非流式请求（XMLHttpRequest + 本地代理）
 *
 * v0.5.6 新增：与 sendStreamRequestViaXHR 相同的 XHR + 本地代理模式，
 * 但非流式版本——等待 onload 后一次性读取 responseText。
 * 解决翻译等非流式功能在原生平台 fetch 失败（fail to fetch）的问题。
 *
 * 请求路径：XHR → http://localhost:18527/v1/chat/completions?_target=<真实API> → 真实API
 *
 * @param params - 请求参数
 * @returns 模拟的 Response 对象（含 ok、status、text() 方法）
 */
const sendRequestViaXHR = (params: RequestOptions): Promise<Response> => {
  const { url, apiKey, body, signal, headers } = params;

  return new Promise<Response>((resolve, reject) => {
    // 构建本地代理 URL：将真实 API URL 作为 _target 参数传递
    let proxyUrl: string;
    try {
      const targetUrl = new URL(url);
      const pathname = targetUrl.pathname;
      const versionMatch = pathname.match(/^(\/v\d+)(\/.*)$/);
      const endpointPath = versionMatch ? versionMatch[2] : pathname;
      const targetBase = versionMatch ? `${targetUrl.origin}${versionMatch[1]}` : targetUrl.origin;
      proxyUrl = `${NATIVE_PROXY_BASE}${endpointPath}?_target=${encodeURIComponent(targetBase)}`;
      if (targetUrl.search) {
        proxyUrl += "&" + targetUrl.search.replace(/^\?/, "");
      }
    } catch (e) {
      console.warn("[XHR Non-Stream] URL 解析失败，回退直连:", e);
      proxyUrl = url;
    }

    const xhr = new XMLHttpRequest();
    xhr.open("POST", proxyUrl, true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Accept", "application/json");
    if (apiKey) {
      xhr.setRequestHeader("Authorization", `Bearer ${apiKey}`);
    }
    if (headers) {
      for (const [key, value] of Object.entries(headers)) {
        xhr.setRequestHeader(key, value);
      }
    }
    xhr.responseType = "text";
    xhr.timeout = 300000; // 非流式请求 5 分钟超时

    let settled = false;

    const safeResolve = (value: Response): void => {
      if (settled) return;
      settled = true;
      if (signal) signal.removeEventListener("abort", onAbort);
      resolve(value);
    };
    const safeReject = (reason: unknown): void => {
      if (settled) return;
      settled = true;
      if (signal) signal.removeEventListener("abort", onAbort);
      reject(reason);
    };

    const onAbort = (): void => {
      try {
        xhr.abort();
      } catch {
        /* 忽略 */
      }
      safeReject(new DOMException("The user aborted a request.", "AbortError"));
    };
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort);
    }

    xhr.onload = (): void => {
      const status = xhr.status;
      const responseText = xhr.responseText || "";
      const ok = status >= 200 && status < 300;

      // 构造模拟 Response 对象
      const mockResponse: Response = {
        ok,
        status,
        statusText: xhr.statusText,
        headers: new Headers(),
        url,
        type: "basic" as ResponseType,
        redirected: false,
        body: null,
        bodyUsed: false,
        clone: () => mockResponse,
        blob: async () => new Blob([responseText], { type: "application/json" }),
        arrayBuffer: async () => new TextEncoder().encode(responseText).buffer,
        formData: async () => new FormData(),
        text: async () => responseText,
        json: async () => JSON.parse(responseText) as unknown,
      } as Response;

      if (!ok) {
        let errorDetail = "";
        try {
          const errorJson = JSON.parse(responseText) as unknown;
          const apiError = extractApiErrorMessage(errorJson, status);
          if (apiError) {
            safeReject(new ApiError(apiError));
            return;
          }
          errorDetail = responseText;
        } catch (e) {
          if (e instanceof ApiError) {
            safeReject(e);
            return;
          }
          errorDetail = responseText;
        }
        safeReject(new Error(formatApiErrorMessage(status, errorDetail)));
        return;
      }

      safeResolve(mockResponse);
    };

    xhr.onerror = (): void => {
      safeReject(new Error("XHR 请求失败：网络错误或代理不可用"));
    };

    xhr.ontimeout = (): void => {
      safeReject(new Error("XHR 请求超时（5 分钟）"));
    };

    try {
      xhr.send(JSON.stringify(body));
    } catch (e) {
      safeReject(e);
    }
  });
};

/**
 * 发送非流式 API 请求（统一入口）
 *
 * v0.5.6: 优先使用 Fetch API，若 Fetch 失败（CORS/代理问题），
 * 原生平台回退到 XHR + 本地代理。浏览器环境直接使用 fetch。
 *
 * @param params - 请求参数
 * @returns Response 对象（已校验 response.ok）
 * @throws {ApiError} API 返回的业务错误
 * @throws {Error} 网络错误或格式化后的 API 错误
 */
export const sendRequest = async (params: RequestOptions): Promise<Response> => {
  try {
    return await sendRequestViaFetch(params);
  } catch (fetchErr) {
    if (isNativePlatform()) {
      console.warn("[Non-Stream] Fetch 失败，回退到 XHR + 本地代理:", fetchErr);
      return sendRequestViaXHR(params);
    }
    throw fetchErr;
  }
};
