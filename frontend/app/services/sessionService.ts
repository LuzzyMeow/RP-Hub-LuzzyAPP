/**
 * 会话管理服务
 *
 * 提供多会话架构下的会话 CRUD、标题生成、关键词搜索与语义搜索能力。
 *
 * 核心能力：
 * - 从 IndexedDB 加载/保存会话列表
 * - 调用当前模型根据对话内容生成简短标题（3-6 字）
 * - 关键词匹配搜索会话
 * - 基于嵌入向量的语义搜索（无嵌入模型时回退到关键词搜索）
 */

import type { Session, ChatMessage, ApiSettings } from '~/types/luzzy';
import { getItem, setItem } from '~/services/storage';
import {
  sendRequest,
  buildApiRequestBody,
} from '~/services/apiClient';
import {
  getActualModelName,
  getOpenAICompatUrl,
  normalizeApiProviderUrl,
} from '~/services/providerService';
import { cosineSimilarity, getCachedEmbedding, setCachedEmbedding } from '~/services/memoryService';

/** 会话列表在 IndexedDB 中的存储键 */
const SESSIONS_STORAGE_KEY = 'all_sessions';

/** 嵌入 API 版本路径（避免与 chat/completions 的 /v1 冲突） */
const EMBEDDING_API_VERSION = 'v3';

/** 标题生成提示词 */
const TITLE_GENERATION_PROMPT =
  '请用3-6个字概括以下对话的主题，只返回标题，不要加引号或其他标点：\n\n';

/** 非流式 chat completion 响应结构 */
interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string };
  }>;
}

/** embeddings 响应结构 */
interface EmbeddingResponse {
  data?: Array<{ index?: number; embedding?: unknown }>;
}

// ============================================================================
// 持久化
// ============================================================================

/**
 * 从 IndexedDB 加载所有会话
 *
 * @returns 会话列表，不存在则返回空数组
 */
export const loadSessions = async (): Promise<Session[]> => {
  const data = await getItem<Session[]>('sessions', SESSIONS_STORAGE_KEY);
  return data ?? [];
};

/**
 * 保存会话列表到 IndexedDB
 *
 * @param sessions - 会话列表
 */
export const saveSessions = async (sessions: Session[]): Promise<void> => {
  await setItem('sessions', SESSIONS_STORAGE_KEY, sessions);
};

// ============================================================================
// 标题生成
// ============================================================================

/**
 * 调用当前模型根据对话内容生成简短标题
 *
 * 取前几条消息拼接作为输入，要求模型返回 3-6 字的标题。
 * 使用非流式请求，翻译/标题生成共用同一提示词通道模式（独立于聊天系统提示词）。
 *
 * @param messages - 对话消息列表
 * @param apiSettings - API 配置（使用当前模型）
 * @returns 生成的标题文本，失败时返回空字符串
 */
export const generateSessionTitle = async (
  messages: ChatMessage[],
  apiSettings: ApiSettings,
): Promise<string> => {
  if (!messages || messages.length === 0) return '';

  // 取前 4 条非 system 消息拼接作为输入
  const recentMessages = messages
    .filter((m) => m.role !== 'system')
    .slice(0, 4)
    .map((m) => `${m.role === 'user' ? '用户' : '角色'}: ${m.content}`)
    .join('\n');

  if (!recentMessages.trim()) return '';

  const prompt = TITLE_GENERATION_PROMPT + recentMessages;
  const url = getOpenAICompatUrl(apiSettings.apiUrl, 'chat/completions');
  const actualModel = getActualModelName(apiSettings.modelName);
  const body = buildApiRequestBody(
    {
      model: actualModel,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    },
    {
      enableThinking: false, // 标题生成不需要深度思考
      customRequestBody: apiSettings.customRequestBody,
    },
  );

  try {
    const response = await sendRequest({
      url,
      apiKey: apiSettings.apiKey,
      body,
    });
    const data = (await response.json()) as ChatCompletionResponse;
    const title = (data.choices?.[0]?.message?.content ?? '').trim();
    // 清理可能的多余引号和换行
    return title.replace(/^["'""\n]+|["'""\n]+$/g, '').trim();
  } catch {
    return '';
  }
};

// ============================================================================
// 搜索
// ============================================================================

/**
 * 关键词搜索会话
 *
 * 按标题进行不区分大小写的包含匹配。
 *
 * @param sessions - 会话列表
 * @param query - 搜索关键词
 * @returns 匹配的会话列表
 */
export const searchSessionsKeyword = (
  sessions: Session[],
  query: string,
): Session[] => {
  const q = query.trim().toLowerCase();
  if (!q) return sessions;
  return sessions.filter((s) =>
    s.title.toLowerCase().includes(q),
  );
};

/**
 * 构建嵌入 API 的完整 URL
 *
 * 使用 /v3 版本路径以避免与 chat/completions 的 /v1 版本冲突。
 * 若 baseUrl 已含版本路径（/v1, /v2 等），则替换为 /v3。
 *
 * @param baseUrl - 供应商 API 基础地址
 * @returns 完整的 embeddings 端点 URL
 */
const buildEmbeddingUrl = (baseUrl: string): string => {
  const clean = normalizeApiProviderUrl(baseUrl);
  const withoutVersion = clean.replace(/\/v\d+(?=\/|$)/, '');
  return `${withoutVersion}/${EMBEDDING_API_VERSION}/embeddings`;
};

/**
 * 规范化嵌入向量为 number[]
 *
 * 兼容 number[]、TypedArray、{ values: number[] } 等格式。
 *
 * @param embedding - 原始嵌入数据
 * @returns 规范化后的 number[]
 */
const normalizeEmbedding = (embedding: unknown): number[] => {
  let arr: unknown[];
  if (Array.isArray(embedding)) {
    arr = embedding;
  } else if (ArrayBuffer.isView(embedding)) {
    arr = Array.from(embedding as unknown as ArrayLike<unknown>);
  } else if (embedding && typeof embedding === 'object') {
    const obj = embedding as { values?: unknown };
    if (Array.isArray(obj.values)) {
      arr = obj.values;
    } else if (obj.values && ArrayBuffer.isView(obj.values)) {
      arr = Array.from(obj.values as unknown as ArrayLike<unknown>);
    } else {
      return [];
    }
  } else {
    return [];
  }
  return arr.map((v) => Number(v)).filter((v) => Number.isFinite(v));
};

/**
 * 获取单段文本的嵌入向量（简化版，直接使用 apiSettings）
 *
 * @param text - 待嵌入文本
 * @param embeddingModel - 嵌入模型名
 * @param apiSettings - API 配置
 * @returns 嵌入向量
 */
const getEmbeddingSimple = async (
  text: string,
  embeddingModel: string,
  apiSettings: ApiSettings,
): Promise<number[]> => {
  // 缓存命中短路
  const cached = getCachedEmbedding(text, embeddingModel);
  if (cached) {
    return cached;
  }

  const actualModel = getActualModelName(embeddingModel);
  const url = buildEmbeddingUrl(apiSettings.apiUrl);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiSettings.apiKey}`,
    },
    body: JSON.stringify({
      model: actualModel,
      input: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding API Error: ${response.status}`);
  }

  const data = (await response.json()) as EmbeddingResponse;
  const rows = Array.isArray(data.data) ? [...data.data] : [];
  rows.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const vector = normalizeEmbedding(rows[0]?.embedding);

  // 写入缓存
  setCachedEmbedding(text, embeddingModel, vector);
  return vector;
};

/**
 * 语义搜索会话
 *
 * 嵌入查询文本与会话标题，按余弦相似度排序返回。
 * 若未提供嵌入模型或嵌入失败，回退到关键词搜索。
 *
 * @param sessions - 会话列表
 * @param query - 搜索查询
 * @param embeddingModel - 嵌入模型名（空则回退到关键词搜索）
 * @param apiSettings - API 配置
 * @returns 按相似度降序排列的会话列表
 */
export const searchSessionsSemantic = async (
  sessions: Session[],
  query: string,
  embeddingModel: string,
  apiSettings: ApiSettings,
): Promise<Session[]> => {
  const q = query.trim();
  if (!q) return sessions;
  if (sessions.length === 0) return [];

  // 无嵌入模型时回退到关键词搜索
  if (!embeddingModel.trim()) {
    return searchSessionsKeyword(sessions, q);
  }

  try {
    // 嵌入查询文本
    const queryVector = await getEmbeddingSimple(q, embeddingModel, apiSettings);
    if (queryVector.length === 0) {
      return searchSessionsKeyword(sessions, q);
    }

    // 嵌入所有会话标题并计算相似度
    const scored = await Promise.all(
      sessions.map(async (session) => {
        try {
          const titleVector = await getEmbeddingSimple(
            session.title || session.characterName || '未命名会话',
            embeddingModel,
            apiSettings,
          );
          return {
            session,
            score: cosineSimilarity(queryVector, titleVector),
          };
        } catch {
          return { session, score: -1 };
        }
      }),
    );

    // 过滤无效分数并按相似度降序排序
    return scored
      .filter((item) => Number.isFinite(item.score))
      .sort((a, b) => b.score - a.score)
      .map((item) => item.session);
  } catch {
    // 嵌入失败时回退到关键词搜索
    return searchSessionsKeyword(sessions, q);
  }
};
