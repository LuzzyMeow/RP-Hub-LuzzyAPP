/**
 * MCP HTTP 协议客户端
 *
 * 实现 MCP Streamable HTTP transport（2025-03-26 规范）客户端，
 * 支持 initialize / tools/list / tools/call 等 JSON-RPC 方法。
 *
 * 核心能力：
 * - 初始化 MCP 服务器连接（含 Mcp-Session-Id 缓存与 notifications/initialized 通知）
 * - 获取工具列表
 * - 调用 MCP 工具（支持 application/json 与 text/event-stream 响应）
 * - 从 JSON 自动提取工具名称和 URL（支持扁平格式与 mcpServers 嵌套格式）
 * - 从 mcp-remote 桥接的 stdio args 中提取 HTTP URL 和 headers
 *
 * 从旧 Vue 3 app.js 迁移，改为纯函数风格，状态由 zustand store 管理。
 */

import type { McpSubTool } from '~/types/luzzy';

// ============================================================================
// 常量
// ============================================================================

/** MCP 协议版本（Streamable HTTP transport, 2025-03-26 规范） */
export const MCP_PROTOCOL_VERSION = '2025-03-26';

/** MCP 客户端信息（品牌重塑后 name 为 LUZZY） */
export const MCP_CLIENT_INFO = { name: 'LUZZY', version: '1.0.0' } as const;

/** MCP 请求超时时间（毫秒） */
export const MCP_REQUEST_TIMEOUT_MS = 60000;

/** JSON-RPC 请求体结构 */
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params: Record<string, unknown>;
}

/** JSON-RPC 响应结构 */
interface JsonRpcResponse {
  jsonrpc?: string;
  id?: number;
  method?: string;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown } | null;
}

/** mcpRpcCall 返回的响应与会话 ID */
interface RpcCallOutput {
  response: JsonRpcResponse;
  sessionId?: string;
}

/** MCP initialize 返回的服务器信息 */
export interface McpServerInfo {
  sessionId?: string;
  serverInfo?: unknown;
  protocolVersion?: string;
}

/** MCP 工具调用结果 */
export interface McpToolCallResult {
  text: string;
  isError: boolean;
  raw: unknown;
}

/** RPC 自增 ID 计数器 */
let mcpRpcIdCounter = 0;

// ============================================================================
// 核心 RPC 调用
// ============================================================================

/**
 * 发送 JSON-RPC 请求并解析响应
 *
 * 支持 application/json 和 text/event-stream（Streamable HTTP）两种响应格式。
 * SSE 响应取第一条匹配 id 的 data 事件作为响应。
 * 同时捕获响应头中的 Mcp-Session-Id（如服务端返回）。
 *
 * @param url - MCP 服务器 HTTP 端点 URL
 * @param method - JSON-RPC 方法名（如 initialize、tools/list、tools/call）
 * @param params - 方法参数
 * @param sessionId - MCP 会话 ID（可选，从 initialize 响应获取）
 * @param headers - 自定义请求头（可选）
 * @param signal - 中止信号（可选）
 * @returns 包含 JSON-RPC 响应与会话 ID 的对象
 * @throws URL 未配置、HTTP 错误、SSE 未收到 data 帧时抛出错误
 */
const mcpRpcCall = async (
  url: string,
  method: string,
  params: Record<string, unknown>,
  sessionId?: string,
  headers?: Record<string, string>,
  signal?: AbortSignal,
): Promise<RpcCallOutput> => {
  const endpoint = String(url || '').trim();
  if (!endpoint) throw new Error('MCP server URL 未配置');

  const id = ++mcpRpcIdCounter;
  const reqBody: JsonRpcRequest = {
    jsonrpc: '2.0',
    id,
    method,
    params: params || {},
  };

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    ...headers,
  };
  if (sessionId) {
    requestHeaders['Mcp-Session-Id'] = sessionId;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: requestHeaders,
    body: JSON.stringify(reqBody),
    signal,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`MCP HTTP ${response.status}: ${errText.slice(0, 200)}`);
  }

  // 如服务端在 initialize 时返回 Mcp-Session-Id，需缓存
  const respSessionId = response.headers.get('mcp-session-id') || undefined;

  // 服务器可能返回 application/json 或 text/event-stream（Streamable HTTP）
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('text/event-stream')) {
    // SSE：取第一条匹配 id 的 data 事件作为响应（Streamable HTTP 单次调用语义）
    const reader = response.body?.getReader();
    if (!reader) throw new Error('MCP SSE 响应无可读流');
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) throw new Error('MCP SSE 响应未收到 data 帧');
        buffer += decoder.decode(value, { stream: true });
        // 按空行分割事件块，每个块内拼接多行 data
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() || '';
        for (const block of blocks) {
          const dataLines: string[] = [];
          for (const line of block.split('\n')) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data:')) {
              dataLines.push(trimmed.slice(5).trim());
            }
          }
          if (dataLines.length === 0) continue;
          const jsonStr = dataLines.join('\n');
          if (!jsonStr) continue;
          try {
            const parsed = JSON.parse(jsonStr) as JsonRpcResponse;
            if (parsed && parsed.id === id) {
              return { response: parsed, sessionId: respSessionId };
            }
          } catch {
            /* skip non-JSON data frames */
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // application/json 响应
  let parsed: JsonRpcResponse;
  try {
    parsed = (await response.json()) as JsonRpcResponse;
  } catch (e) {
    throw new Error(
      `MCP 响应 JSON 解析失败: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  return { response: parsed, sessionId: respSessionId };
};

// ============================================================================
// MCP 协议方法
// ============================================================================

/**
 * 初始化 MCP 服务器连接
 *
 * 流程：
 * 1. 发送 initialize 请求（含协议版本、客户端能力、客户端信息）
 * 2. 缓存 Mcp-Session-Id（如服务端在响应头中返回）
 * 3. 发送 notifications/initialized 通知（无 id 的通知，非致命）
 *
 * @param url - MCP 服务器 HTTP 端点 URL
 * @param headers - 自定义请求头（可选）
 * @returns 包含 sessionId 和 serverInfo 的初始化结果
 * @throws initialize 失败时抛出错误
 */
export const initializeMcpServer = async (
  url: string,
  headers?: Record<string, string>,
): Promise<McpServerInfo> => {
  const endpoint = String(url || '').trim();
  if (!endpoint) throw new Error('MCP server URL 未配置');

  const { response, sessionId } = await mcpRpcCall(
    endpoint,
    'initialize',
    {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: {} },
      clientInfo: MCP_CLIENT_INFO,
    },
    undefined,
    headers,
  );

  if (response?.error) {
    throw new Error(
      `MCP initialize 失败: ${response.error.message || JSON.stringify(response.error)}`,
    );
  }

  // 发送 notifications/initialized 通知（无 id 的通知）
  try {
    const notifyHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...headers,
    };
    if (sessionId) notifyHeaders['Mcp-Session-Id'] = sessionId;
    await fetch(endpoint, {
      method: 'POST',
      headers: notifyHeaders,
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }),
    });
  } catch (e) {
    console.warn('[MCP] notifications/initialized 失败（非致命）:', e);
  }

  const resultData = (response.result || {}) as {
    serverInfo?: unknown;
    protocolVersion?: string;
  };
  return {
    sessionId,
    serverInfo: resultData.serverInfo,
    protocolVersion: resultData.protocolVersion,
  };
};

/**
 * 获取 MCP 工具列表
 *
 * @param url - MCP 服务器 HTTP 端点 URL
 * @param sessionId - MCP 会话 ID（可选）
 * @param headers - 自定义请求头（可选）
 * @returns MCP 子工具数组
 * @throws tools/list 失败时抛出错误
 */
export const listMcpTools = async (
  url: string,
  sessionId?: string,
  headers?: Record<string, string>,
): Promise<McpSubTool[]> => {
  const { response } = await mcpRpcCall(
    url,
    'tools/list',
    {},
    sessionId,
    headers,
  );

  if (response?.error) {
    throw new Error(
      `MCP tools/list 失败: ${response.error.message || JSON.stringify(response.error)}`,
    );
  }

  const resultData = (response.result || {}) as { tools?: unknown[] };
  const tools = Array.isArray(resultData.tools) ? resultData.tools : [];
  return tools.map((t) => {
    const tool = t as Record<string, unknown>;
    return {
      name: String(tool.name || ''),
      description: String(tool.description || ''),
      inputSchema: (tool.inputSchema || { type: 'object' }) as Record<string, unknown>,
    };
  });
};

/**
 * 调用 MCP 工具
 *
 * @param url - MCP 服务器 HTTP 端点 URL
 * @param toolName - 工具名称
 * @param args - 工具参数
 * @param sessionId - MCP 会话 ID（可选）
 * @param headers - 自定义请求头（可选）
 * @returns 工具调用结果（含文本内容、是否错误、原始响应）
 * @throws tools/call 失败时抛出错误
 */
export const callMcpTool = async (
  url: string,
  toolName: string,
  args: Record<string, unknown>,
  sessionId?: string,
  headers?: Record<string, string>,
): Promise<McpToolCallResult> => {
  const { response } = await mcpRpcCall(
    url,
    'tools/call',
    {
      name: toolName,
      arguments: args || {},
    },
    sessionId,
    headers,
  );

  if (response?.error) {
    throw new Error(
      `MCP tools/call(${toolName}) 失败: ${response.error.message || JSON.stringify(response.error)}`,
    );
  }

  // result.result.content: [{ type:'text', text:'...' }] 或 [{ type:'image', data:'...', mimeType }] 等
  const resultData = (response.result || {}) as {
    content?: Array<Record<string, unknown>>;
    isError?: boolean;
  };
  const content = Array.isArray(resultData.content) ? resultData.content : [];
  const textParts = content.map((part) => {
    const type = String(part?.type || '');
    if (type === 'text') return String(part.text || '');
    if (type === 'image') return `[image:${part.mimeType || 'unknown'}]`;
    if (type === 'resource') {
      const resource = part.resource as { uri?: string } | undefined;
      return `[resource:${resource?.uri || ''}]`;
    }
    return `[${type || 'unknown'}]`;
  });
  return {
    text: textParts.join('\n').trim(),
    isError: !!resultData.isError,
    raw: response.result,
  };
};

// ============================================================================
// MCP 导入配置解析
// ============================================================================

/**
 * 从 JSON 自动提取工具名称
 *
 * 支持两种格式：
 * - mcpServers 嵌套格式：取第一个 key 作为名称
 * - 扁平格式：从 url 提取 hostname 第一部分作为名称
 *
 * @param jsonText - JSON 文本
 * @returns 提取的名称，无法提取则返回空字符串
 */
const autoExtractMcpNameFromJson = (jsonText: string): string => {
  try {
    const parsed = JSON.parse(jsonText) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return '';
    }
    const obj = parsed as Record<string, unknown>;

    // mcpServers 嵌套格式：取第一个 key
    if (obj.mcpServers && typeof obj.mcpServers === 'object') {
      const keys = Object.keys(obj.mcpServers as object);
      if (keys.length > 0) return keys[0];
    }

    // 扁平格式：尝试从 url 提取 hostname 第一部分
    if (typeof obj.url === 'string') {
      try {
        const url = new URL(obj.url);
        const parts = url.hostname.split('.');
        if (parts.length > 0) return parts[0];
      } catch {
        return '';
      }
    }
    return '';
  } catch {
    return '';
  }
};

/** parseMcpImportJson 返回的配置结构 */
export interface McpImportConfig {
  name: string;
  url: string;
  headers?: Record<string, string>;
  protocolVersion?: string;
}

/**
 * 从 JSON 文本解析 MCP 导入配置
 *
 * 支持两种输入格式：
 * 1. 扁平格式：{ url, headers, protocolVersion }
 * 2. mcpServers 嵌套格式（Claude Desktop / Cursor 通用）：{ mcpServers: { <name>: { ... } } }
 *    - HTTP transport：直接有 url 字段
 *    - stdio transport + mcp-remote 桥接：通过 extractMcpFromRemoteArgs 提取
 *
 * @param jsonText - JSON 文本
 * @returns 包含 name、url、headers 的配置对象
 * @throws JSON 无效、格式不支持时抛出错误
 */
export const parseMcpImportJson = (jsonText: string): McpImportConfig => {
  const text = String(jsonText || '').trim();
  if (!text) throw new Error('JSON 不能为空');

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`JSON 无效: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('必须是 JSON 对象');
  }

  const obj = parsed as Record<string, unknown>;

  // 支持两种输入格式：
  // 1. 扁平格式：{ url, headers, protocolVersion }
  // 2. mcpServers 嵌套格式
  let config: {
    url?: unknown;
    headers?: unknown;
    protocolVersion?: unknown;
  } = obj;

  let name = autoExtractMcpNameFromJson(text);

  if (
    obj.mcpServers &&
    typeof obj.mcpServers === 'object' &&
    !Array.isArray(obj.mcpServers)
  ) {
    const servers = obj.mcpServers as Record<string, unknown>;
    const serverNames = Object.keys(servers);
    if (serverNames.length === 0) {
      throw new Error('mcpServers 为空');
    }
    // 取第一个服务器（名称已由 autoExtractMcpNameFromJson 提取）
    const serverName = name && servers[name] ? name : serverNames[0];
    const server = servers[serverName] as Record<string, unknown> | undefined;
    if (!server || typeof server !== 'object') {
      throw new Error(`mcpServers.${serverName} 不是有效对象`);
    }

    // 情况 A：HTTP transport（直接有 url 字段）
    if (typeof server.url === 'string') {
      config = {
        url: server.url,
        headers: server.headers,
        protocolVersion: server.protocolVersion,
      };
      if (!name) name = serverName;
    }
    // 情况 B：stdio transport + mcp-remote 桥接
    else if (server.command && Array.isArray(server.args)) {
      const extracted = extractMcpFromRemoteArgs(
        (server.args as unknown[]).map((a) => String(a ?? '')),
      );
      if (!extracted) {
        throw new Error(
          'stdio transport 仅支持 mcp-remote 桥接的 HTTP server；纯本地命令（无 mcp-remote）不支持。请直接提供 url 字段，或使用 mcp-remote 桥接远程 HTTP server。',
        );
      }
      config = { url: extracted.url, headers: extracted.headers };
      if (!name) name = serverName;
    } else {
      throw new Error(`mcpServers.${serverName} 缺少 url 字段或 command+args`);
    }
  }

  const url = String(config.url || '').trim();
  if (!url) throw new Error('缺少 url 字段');

  const headers =
    config.headers && typeof config.headers === 'object' && !Array.isArray(config.headers)
      ? (config.headers as Record<string, string>)
      : {};

  return {
    name,
    url,
    headers,
    protocolVersion:
      typeof config.protocolVersion === 'string'
        ? config.protocolVersion
        : undefined,
  };
};

/**
 * 从 mcp-remote 桥接的 stdio args 中提取 HTTP URL 和 headers
 *
 * mcp-remote 用法：npx -y mcp-remote <url> [--header "Key: Value"]...
 *
 * @param args - 命令行参数数组
 * @returns 包含 url 和 headers 的对象，无法提取则返回 null
 */
export const extractMcpFromRemoteArgs = (
  args: string[],
): { url: string; headers: Record<string, string> } | null => {
  const list = Array.isArray(args) ? args : [];
  const hasMcpRemote = list.some(
    (a) => typeof a === 'string' && a.includes('mcp-remote'),
  );
  if (!hasMcpRemote) return null;

  let url = '';
  const headers: Record<string, string> = {};

  for (let i = 0; i < list.length; i++) {
    const arg = String(list[i] || '').trim();
    // 跳过选项标志
    if (arg === '-y' || arg === 'mcp-remote' || arg === '--') continue;
    if (arg.startsWith('-') && arg !== '--header' && arg !== '-H') continue;

    // --header / -H 后面跟 "Key: Value"
    if (arg === '--header' || arg === '-H') {
      const next = String(list[i + 1] || '').trim();
      const colonIdx = next.indexOf(':');
      if (colonIdx > 0) {
        const key = next.slice(0, colonIdx).trim();
        let value = next.slice(colonIdx + 1).trim();
        // 处理 ${VAR} 环境变量语法：浏览器无环境变量，当字面值处理
        value = value.replace(/\$\{([^}]+)\}/g, (_, inner: string) => inner.trim());
        headers[key] = value;
        i++;
      }
      continue;
    }

    // 第一个 http(s):// 开头的参数是 URL（可能被反引号/引号包裹）
    if (!url) {
      const cleaned = arg.replace(/^[`'"]|[`'"]$/g, '').trim();
      if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
        url = cleaned;
      }
    }
  }

  if (!url) return null;
  return { url, headers };
};
