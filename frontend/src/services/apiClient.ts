/**
 * API 客户端服务
 *
 * 提供流式请求（fetch + ReadableStream for 浏览器，XMLHttpRequest for 原生/Capacitor）、
 * SSE 解析、非流式请求、AbortController 支持及错误处理。
 *
 * 从旧 Vue 3 app.js 迁移，改为纯函数风格，状态由 zustand store 管理。
 */

/** Capacitor 全局对象的最小类型声明 */
declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
    };
  }
}

/** 本地代理基础地址（仅原生平台使用） */
const NATIVE_PROXY_BASE = 'http://localhost:18527';

/**
 * 检测当前是否为 Capacitor 原生平台
 *
 * CapacitorHttp 会 patch 全局 fetch，导致 response.body.getReader() 在 Android 上
 * 一次性返回完整数据，无法实现真流式。原生平台需通过 XMLHttpRequest + 本地代理实现真流式。
 */
export const isNativePlatform = (): boolean => {
  return !!(
    typeof window !== 'undefined' &&
    window.Capacitor &&
    typeof window.Capacitor.isNativePlatform === 'function' &&
    window.Capacitor.isNativePlatform()
  );
};

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
}

/**
 * 规范化推理内容（兼容多种字段格式与嵌套结构）
 * 支持字符串、数组、对象等多种输入
 */
const normalizeReasoningPart = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(normalizeReasoningPart).join('');
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = [
      'text', 'content', 'summary', 'reasoning',
      'reasoning_content', 'thinking', 'thought', 'value',
    ];
    for (const key of keys) {
      const text = normalizeReasoningPart(obj[key]);
      if (text) return text;
    }
    return '';
  }
  return String(value);
};

/**
 * 从 delta/message 对象中提取推理内容
 * 兼容各供应商的字段命名差异（reasoning_content、thinking、thought 等）
 */
const extractReasoning = (source: Record<string, unknown> | null | undefined): string => {
  if (!source || typeof source !== 'object') return '';
  const directKeys = [
    'reasoning_content', 'reasoning', 'thinking',
    'thinking_content', 'thought', 'thoughts', 'reasoning_text',
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
        const type = String(item?.type ?? '').toLowerCase();
        if (
          type.includes('reason') ||
          type.includes('thinking') ||
          type.includes('thought')
        ) {
          return normalizeReasoningPart(item);
        }
        return '';
      })
      .join('');
  }
  return '';
};

/**
 * 解析 SSE 数据块
 *
 * 从已解析的 JSON 数据对象中提取文本内容、推理内容和结束原因。
 * 兼容 delta 和 message 两种响应格式。
 *
 * @param data - 已通过 JSON.parse 解析的数据对象
 * @returns 内容、推理内容、结束原因
 */
export const parseSSEChunk = (data: Record<string, unknown>): SSEChunkData => {
  const result: SSEChunkData = {
    content: '',
    reasoningContent: '',
    finishReason: '',
  };
  const choices = data.choices as Array<Record<string, unknown>> | undefined;
  const choice = choices?.[0];
  if (!choice) return result;

  result.finishReason = String(choice.finish_reason ?? '');

  const delta = (choice.delta ?? choice.message ?? {}) as Record<string, unknown>;
  result.content = String(delta.content ?? '');
  result.reasoningContent = extractReasoning(delta);

  return result;
};

// ============================================================================
// 请求体构建
// ============================================================================

/** 构建请求体所需的设置项 */
export interface ApiRequestBodySettings {
  /** 是否启用深度思考 */
  enableThinking?: boolean;
  /** 自定义请求体 JSON 字符串 */
  customRequestBody?: string;
}

/**
 * 解析用户输入的自定义请求体 JSON
 * @returns 解析后的对象，无效或空则返回 null
 */
export const parseCustomRequestBody = (
  customRequestBody?: string,
): Record<string, unknown> | null => {
  const text = (customRequestBody ?? '').trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch (e) {
    console.error('[API] 自定义请求体 JSON 解析失败:', e);
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
  const text = (customRequestBody ?? '').trim();
  if (!text) return { valid: true, error: '' };
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { valid: false, error: '必须是 JSON 对象' };
    }
    return { valid: true, error: '' };
  } catch (e) {
    return { valid: false, error: e instanceof Error ? e.message : String(e) };
  }
};

/**
 * 构建最终请求体（合并基础字段 + 深度思考开关 + 自定义 JSON）
 *
 * 合并优先级：基础字段 < 深度思考开关 < 自定义 JSON
 * 保护核心字段：model 和 messages 不允许被自定义 JSON 覆盖
 *
 * @param baseBody - 基础请求体（含 model, messages, temperature, stream）
 * @param settings - API 设置（含深度思考开关与自定义请求体）
 * @returns 合并后的最终请求体
 */
export const buildApiRequestBody = (
  baseBody: Record<string, unknown>,
  settings: ApiRequestBodySettings,
): Record<string, unknown> => {
  const result: Record<string, unknown> = { ...baseBody };
  if (settings.enableThinking) {
    result.thinking = { type: 'enabled' };
  }
  const customBody = parseCustomRequestBody(settings.customRequestBody);
  if (customBody) {
    for (const key of Object.keys(customBody)) {
      if (key === 'model' || key === 'messages') continue;
      result[key] = customBody[key];
    }
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
    this.name = 'ApiError';
  }
}

/**
 * 格式化 API 错误消息
 * @param status - HTTP 状态码
 * @param detail - 错误详情（字符串或对象）
 * @returns 格式化后的错误消息
 */
export const formatApiErrorMessage = (
  status: number | string,
  detail: unknown,
): string => {
  const lines: string[] = [];
  if (status !== undefined && status !== null && status !== '') {
    lines.push(`API Error: ${status}`);
  }
  let detailText = '';
  if (typeof detail === 'string') {
    detailText = detail;
  } else if (detail !== null && detail !== undefined) {
    try {
      detailText = JSON.stringify(detail, null, 2);
    } catch {
      detailText = String(detail);
    }
  }
  lines.push(detailText.trim() || '请求失败');
  return lines.join('\n');
};

/**
 * 从 API 响应负载中提取错误消息
 * @param payload - 响应 JSON 对象
 * @param fallbackStatus - 备用 HTTP 状态码
 * @returns 格式化的错误消息，无错误则返回空字符串
 */
export const extractApiErrorMessage = (
  payload: unknown,
  fallbackStatus: number | string = '',
): string => {
  if (!payload || typeof payload !== 'object') return '';
  const obj = payload as Record<string, unknown>;
  const error = obj.error;
  const status = fallbackStatus;
  if (typeof error === 'string') return formatApiErrorMessage(status, error);
  if (error && typeof error === 'object') {
    const errObj = error as Record<string, unknown>;
    const detail =
      errObj.message || errObj.detail || obj.message || obj.detail || error;
    return formatApiErrorMessage(status, detail);
  }
  const detail = obj.message || obj.detail;
  if (!detail) return '';
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
const sendStreamRequestViaXHR = (
  params: StreamRequestParams,
): Promise<StreamRequestResult> => {
  const { url, apiKey, body, signal, onChunk, onError } = params;

  return new Promise<StreamRequestResult>((resolve, reject) => {
    // 构建本地代理 URL：将真实 API URL 作为 _target 参数传递
    let proxyUrl: string;
    try {
      const targetUrl = new URL(url);
      const endpointPath = targetUrl.pathname;
      proxyUrl = `${NATIVE_PROXY_BASE}${endpointPath}?_target=${encodeURIComponent(targetUrl.origin)}`;
      if (targetUrl.search) {
        proxyUrl += '&' + targetUrl.search.replace(/^\?/, '');
      }
    } catch (e) {
      console.warn('[XHR Stream] URL 解析失败，回退直连:', e);
      proxyUrl = url;
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', proxyUrl, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'text/event-stream');
    if (apiKey) {
      xhr.setRequestHeader('Authorization', `Bearer ${apiKey}`);
    }
    xhr.responseType = 'text';
    xhr.timeout = 0; // 流式请求不设超时

    let receivedLength = 0;
    let buffer = '';
    let settled = false;
    let chunkError: Error | null = null;
    let onAbort: (() => void) | null = null;

    const safeResolve = (value: StreamRequestResult): void => {
      if (settled) return;
      settled = true;
      if (onAbort && signal) signal.removeEventListener('abort', onAbort);
      resolve(value);
    };
    const safeReject = (reason: unknown): void => {
      if (settled) return;
      settled = true;
      if (onAbort && signal) signal.removeEventListener('abort', onAbort);
      reject(reason);
    };

    // 处理增量数据：从 responseText 提取新增部分，按 SSE 行解析
    const processIncremental = (): void => {
      let fullText: string;
      try {
        fullText = xhr.responseText || '';
      } catch {
        return;
      }
      if (fullText.length <= receivedLength) return;
      const newChunk = fullText.substring(receivedLength);
      receivedLength = fullText.length;

      buffer += newChunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;
        if (!trimmedLine.startsWith('data:')) continue;
        const dataStr = trimmedLine.replace(/^data:\s*/, '');
        if (dataStr === '[DONE]') continue;
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(dataStr);
        } catch {
          continue; // 非 JSON，忽略（可能是注释行或心跳）
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
          return;
        }
      }
    };

    xhr.onprogress = (): void => {
      if (chunkError) return;
      try {
        processIncremental();
      } catch (e) {
        console.warn('[XHR Stream] onprogress 处理异常:', e);
      }
    };

    xhr.onload = (): void => {
      // 处理最后可能残留的 buffer（仅当无 chunkError 时）
      if (!chunkError) {
        try {
          processIncremental();
          // 处理 buffer 中剩余的最后一行
          if (buffer.trim()) {
            const trimmedLine = buffer.trim();
            if (trimmedLine.startsWith('data:')) {
              const dataStr = trimmedLine.replace(/^data:\s*/, '');
              if (dataStr !== '[DONE]') {
                try {
                  const parsed = JSON.parse(dataStr);
                  onChunk(dataStr, parsed);
                } catch (e) {
                  if (e instanceof Error && !(e instanceof SyntaxError)) {
                    chunkError = e;
                  }
                }
              }
            }
          }
        } catch (e) {
          console.warn('[XHR Stream] onload 处理异常:', e);
        }
      }

      // 优先处理 onChunk 抛出的错误
      if (chunkError) {
        safeReject(chunkError);
        return;
      }

      const status = xhr.status;
      const ok = status >= 200 && status < 300;
      if (!ok) {
        const errorText = xhr.responseText || '';
        onError?.(status, errorText);
        safeReject(new Error(formatApiErrorMessage(status, errorText)));
        return;
      }
      safeResolve({ status, ok: true });
    };

    xhr.onerror = (): void => {
      if (chunkError) {
        safeReject(chunkError);
        return;
      }
      const errorText = xhr.responseText || '网络请求失败';
      onError?.(0, errorText);
      safeReject(new Error(formatApiErrorMessage(0, errorText)));
    };

    xhr.ontimeout = (): void => {
      onError?.(0, '请求超时');
      safeReject(new Error('流式请求超时'));
    };

    xhr.onabort = (): void => {
      if (chunkError) {
        safeReject(chunkError);
        return;
      }
      safeReject(new DOMException('Aborted', 'AbortError'));
    };

    // 支持 AbortController
    if (signal) {
      if (signal.aborted) {
        safeReject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      onAbort = (): void => {
        try {
          xhr.abort();
        } catch {
          /* 忽略 */
        }
      };
      signal.addEventListener('abort', onAbort, { once: true });
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
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    let errorDetail = '';
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

  const contentType = response.headers.get('content-type') ?? '';
  const isStream = contentType.includes('text/event-stream');
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
      const lines = rawText.split('\n');
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine.startsWith('data:')) continue;
        const dataStr = trimmedLine.replace(/^data:\s*/, '');
        if (dataStr === '[DONE]') continue;
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
      }
    }
    return { status: response.status, ok: true };
  }

  // 流式响应：逐块读取并解析 SSE
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;
        if (!trimmedLine.startsWith('data:')) continue;
        const dataStr = trimmedLine.replace(/^data:\s*/, '');
        if (dataStr === '[DONE]') continue;
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
          console.warn('Error parsing stream chunk:', e);
        }
      }
    }

    // 处理 buffer 中剩余的最后一行
    if (buffer.trim()) {
      const trimmedLine = buffer.trim();
      if (trimmedLine.startsWith('data:')) {
        const dataStr = trimmedLine.replace(/^data:\s*/, '');
        if (dataStr !== '[DONE]') {
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
 * 原生平台使用 XMLHttpRequest + 本地代理（绕过 CapacitorHttp 的 fetch patch），
 * 浏览器使用 fetch + ReadableStream。
 *
 * @param params - 流式请求参数
 * @returns 请求结果（含状态码与是否成功）
 */
export const sendStreamRequest = (
  params: StreamRequestParams,
): Promise<StreamRequestResult> => {
  if (isNativePlatform()) {
    return sendStreamRequestViaXHR(params);
  }
  return sendStreamRequestViaFetch(params);
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
 * 发送非流式 API 请求
 *
 * @param params - 请求参数
 * @returns fetch Response 对象（已校验 response.ok）
 * @throws {ApiError} API 返回的业务错误
 * @throws {Error} 网络错误或格式化后的 API 错误
 */
export const sendRequest = async (
  params: RequestOptions,
): Promise<Response> => {
  const { url, apiKey, body, signal, headers } = params;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...headers,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    let errorDetail = '';
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
