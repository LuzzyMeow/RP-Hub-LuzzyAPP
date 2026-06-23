/**
 * 记忆系统服务
 *
 * 提供向量记忆的构建、搜索、压缩，全局记忆管理，以及 IndexedDB 持久化。
 *
 * 核心能力：
 * - 余弦相似度计算
 * - 调用 OpenAI 兼容 embedding API 获取文本向量（端点带 /v3 后缀避免版本冲突）
 * - 按对话轮次构建向量记忆分片
 * - 基于向量相似度搜索记忆
 * - 全局记忆 MEMORY.md 的读写
 * - 向量记忆分片的 IndexedDB 持久化
 * - 记忆压缩：保留最近 N 楼，其余有向量记忆覆盖的楼层从原始上下文移除
 *
 * 从旧 Vue 3 app.js 迁移，改为纯函数风格，状态由 zustand store 管理。
 */

import { logger } from "~/services/logger";

import type {
  ChatMessage,
  Character,
  MemorySettings,
  VectorMemoryShard,
  WorldInfoEntry,
  ApiSettings,
  ApiProvider,
  // v0.5.9-locked: 长期记忆类型锁定
  // MemoryEntry,
  // MemoryScope,
} from '~/types/luzzy';
import { v4 as uuidv4 } from 'uuid';
import {
  parseModelName,
  getActualModelName,
  normalizeApiProviderUrl,
} from '~/services/providerService';
import { extractApiErrorMessage } from '~/services/apiClient';
import { getItem, setItem } from '~/services/storage';

// ============================================================================
// 常量
// ============================================================================

/** 向量记忆批量处理的批次大小（与旧版一致） */
const MEMORY_VECTOR_BATCH_SIZE = 16;

/** 嵌入 API 默认版本路径(仅当 baseUrl 不含版本时回退使用) */
const EMBEDDING_API_DEFAULT_VERSION = 'v1';

// ============================================================================
// Embedding 缓存层
// ============================================================================

/** Embedding 缓存条目 */
interface EmbeddingCacheEntry {
  vector: number[];
  expiresAt: number;
}

/** Embedding 缓存表（按 `text::model` 索引） */
const embeddingCache = new Map<string, EmbeddingCacheEntry>();

/** Embedding 缓存 TTL：60 分钟（embedding 是确定性的，可长期缓存） */
const EMBEDDING_CACHE_TTL = 60 * 60 * 1000;

/** 最大缓存条目数 */
const MAX_EMBEDDING_CACHE_ENTRIES = 1000;

/**
 * 生成 embedding 缓存键
 * @param text - 文本内容
 * @param model - 模型名
 * @returns 缓存键
 */
const embeddingCacheKey = (text: string, model: string): string => {
  return `${model}::${text}`;
};

/**
 * 读取 embedding 缓存
 * @param text - 文本内容
 * @param model - 模型名
 * @returns 缓存的向量（未命中或已过期返回 undefined）
 */
export const getCachedEmbedding = (
  text: string,
  model: string,
): number[] | undefined => {
  const key = embeddingCacheKey(text, model);
  const entry = embeddingCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    embeddingCache.delete(key);
    return undefined;
  }
  return entry.vector;
};

/**
 * 写入 embedding 缓存
 * @param text - 文本内容
 * @param model - 模型名
 * @param vector - 向量
 */
export const setCachedEmbedding = (
  text: string,
  model: string,
  vector: number[],
): void => {
  if (embeddingCache.size >= MAX_EMBEDDING_CACHE_ENTRIES) {
    const firstKey = embeddingCache.keys().next().value;
    if (firstKey !== undefined) {
      embeddingCache.delete(firstKey);
    }
  }
  embeddingCache.set(embeddingCacheKey(text, model), {
    vector,
    expiresAt: Date.now() + EMBEDDING_CACHE_TTL,
  });
};

/**
 * 清除所有 embedding 缓存
 */
export const clearEmbeddingCache = (): void => {
  embeddingCache.clear();
};

/** 向量记忆分片在 IndexedDB 中的存储键前缀 */
const VECTOR_MEMORY_STORAGE_KEY_PREFIX = 'vector_memory_';

// v0.5.9-locked: 长期记忆功能锁定
// /** 长期记忆在 IndexedDB 中的存储键前缀（按角色 ID 分组） */
// const LONG_TERM_MEMORY_STORAGE_KEY_PREFIX = 'long_term_memory_';

/** embeddings 响应行结构 */
interface EmbeddingResponseRow {
  index?: number;
  embedding?: unknown;
}

/** embeddings 响应结构 */
interface EmbeddingResponse {
  data?: EmbeddingResponseRow[];
}

// ============================================================================
// 向量工具
// ============================================================================

/**
 * 规范化嵌入向量为 number[]
 *
 * 兼容以下格式：
 * - number[]（标准数组）
 * - TypedArray（Float32Array 等，ArrayBuffer.isView）
 * - { values: number[] | TypedArray }（部分供应商的封装格式）
 *
 * 非有限数值会被过滤。
 *
 * @param embedding - 原始嵌入数据
 * @returns 规范化后的 number[]，无效输入返回空数组
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

  return arr
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v));
};

/**
 * 计算两个向量的余弦相似度
 *
 * 维度不一致时视为错误，打印警告并返回 -Infinity（避免与合法的 -1 分数混淆）。
 *
 * @param a - 向量 A
 * @param b - 向量 B
 * @returns 余弦相似度 [-1, 1]；无效输入或零向量返回 -1；维度不匹配返回 -Infinity
 */
export const cosineSimilarity = (a: number[], b: number[]): number => {
  if (!a || !b || a.length === 0 || b.length === 0) return -1;
  if (a.length !== b.length) {
    console.warn(
      `[Memory] cosineSimilarity 维度不匹配: a.length=${a.length}, b.length=${b.length}`,
    );
    return -Infinity;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const av = Number(a[i]) || 0;
    const bv = Number(b[i]) || 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return -1;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

// ============================================================================
// Embedding API 调用
// ============================================================================

/**
 * 构建嵌入 API 的完整 URL
 *
 * v0.4.4: 不硬编码版本号,用户填什么就是什么。
 * - 若 baseUrl 已含版本路径(/v1, /v2, /v3 等),直接追加 /embeddings
 * - 若不含版本路径,回退到 OpenAI 标准 /v1/embeddings
 *
 * 示例:
 *   https://ark.cn-beijing.volces.com/api/coding/v3 → /api/coding/v3/embeddings
 *   https://api.deepseek.com/v1 → /v1/embeddings
 *   https://api.deepseek.com → /v1/embeddings (回退)
 *
 * @param baseUrl - 供应商 API 基础地址
 * @returns 完整的 embeddings 端点 URL
 */
const buildEmbeddingUrl = (baseUrl: string): string => {
  const clean = normalizeApiProviderUrl(baseUrl);
  // 检测是否已含版本路径(/v1, /v2, /v3 等)
  const hasVersion = /\/v\d+(?=\/|$)/.test(clean);
  const apiUrl = hasVersion ? clean : `${clean}/${EMBEDDING_API_DEFAULT_VERSION}`;
  return `${apiUrl}/embeddings`;
};

/**
 * 解析嵌入供应商配置，获取 apiUrl 与 apiKey
 *
 * 嵌入模型独立供应商：优先使用 embeddingApiProviderId，空则跟随聊天供应商。
 * URL 与 Key 必须来自同一供应商，避免独立回退导致鉴权失败。
 *
 * 聊天供应商的确定方式：从聊天模型名（apiSettings.modelName）解析供应商前缀。
 * 若均无供应商前缀，则回退到 apiSettings 的默认 apiUrl / apiKey。
 *
 * @param settings - 记忆设置
 * @param apiSettings - API 设置
 * @param providers - 供应商列表
 * @param providerKeys - 供应商 ID 到 API Key 的映射
 * @returns 供应商的 apiUrl 和 apiKey
 * @throws 未配置供应商地址或 Key 时抛出错误
 */
const resolveEmbeddingProvider = (
  settings: MemorySettings,
  apiSettings: ApiSettings,
  providers: ApiProvider[],
  providerKeys: Record<string, string>,
): { apiUrl: string; apiKey: string } => {
  // 优先使用 embeddingApiProviderId，空则跟随聊天供应商
  let embeddingProviderId = (settings.embeddingApiProviderId || '').trim();
  if (!embeddingProviderId) {
    // 从聊天模型名解析供应商前缀
    const chatParse = parseModelName(apiSettings.modelName, providers);
    embeddingProviderId = chatParse.providerId;
  }

  if (embeddingProviderId) {
    const provider = providers.find((p) => p.id === embeddingProviderId);
    if (!provider || !provider.apiUrl) {
      throw new Error('请先配置嵌入供应商的 API 地址');
    }
    const apiKey = providerKeys[embeddingProviderId] || '';
    if (!apiKey) {
      throw new Error('请先配置嵌入供应商的 API Key');
    }
    return { apiUrl: provider.apiUrl, apiKey };
  }

  // 无供应商前缀，使用默认 API 设置
  if (!apiSettings.apiUrl) {
    throw new Error('请先配置嵌入供应商的 API 地址');
  }
  if (!apiSettings.apiKey) {
    throw new Error('请先配置嵌入供应商的 API Key');
  }
  return { apiUrl: apiSettings.apiUrl, apiKey: apiSettings.apiKey };
};

/**
 * 批量请求嵌入向量
 *
 * 向 OpenAI 兼容的 embeddings 端点发送批量请求，返回与输入顺序对应的向量数组。
 * 嵌入模型名格式为 `<providerId>_<model_name>`，使用 providerService 解析出实际模型名。
 *
 * @param inputs - 待嵌入的文本数组
 * @param settings - 记忆设置
 * @param apiSettings - API 设置
 * @param providers - 供应商列表
 * @param providerKeys - 供应商 ID 到 API Key 的映射
 * @param signal - 中止信号（可选）
 * @returns 嵌入向量数组，与输入顺序一致
 * @throws 模型未配置、供应商配置缺失、嵌入内容为空、接口返回不完整时抛出错误
 */
const requestEmbeddings = async (
  inputs: string[],
  settings: MemorySettings,
  apiSettings: ApiSettings,
  providers: ApiProvider[],
  providerKeys: Record<string, string>,
  signal?: AbortSignal,
): Promise<number[][]> => {
  const model = (settings.embeddingModel || '').trim();
  if (!model) throw new Error('请先选择向量嵌入模型');

  const { apiUrl, apiKey } = resolveEmbeddingProvider(
    settings,
    apiSettings,
    providers,
    providerKeys,
  );

  // 解析嵌入模型名，获取实际模型名（去掉供应商前缀）
  const actualModel = getActualModelName(model, providers);

  const normalizedInputs = inputs.map((input) => String(input || '').trim());
  if (normalizedInputs.some((input) => !input)) {
    throw new Error('嵌入内容不能为空');
  }

  const url = buildEmbeddingUrl(apiUrl);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: actualModel,
      input: normalizedInputs.length === 1 ? normalizedInputs[0] : normalizedInputs,
    }),
    signal,
  });

  if (!response.ok) {
    let errorPayload: unknown = null;
    try {
      errorPayload = await response.json();
    } catch {
      /* 忽略 JSON 解析失败 */
    }
    const apiError = extractApiErrorMessage(errorPayload, response.status);
    throw new Error(apiError || `Embedding API Error: ${response.status}`);
  }

  const data = (await response.json()) as EmbeddingResponse;
  const rows = Array.isArray(data.data) ? [...data.data] : [];
  rows.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const vectors = rows.map((row) => normalizeEmbedding(row.embedding));

  if (
    vectors.length !== normalizedInputs.length ||
    vectors.some((v) => v.length === 0)
  ) {
    throw new Error('嵌入接口返回的数据不完整');
  }

  return vectors;
};

/**
 * 获取单段文本的嵌入向量
 *
 * 使用与 chat/completions 相同的 API URL（不单独配置 embedding API URL），
 * OpenAI 兼容 embedding API 请求目标端点带 /v3 后缀以避免版本冲突。
 * 嵌入模型独立供应商：优先使用 embeddingApiProviderId，空则跟随聊天供应商。
 * URL 与 Key 必须来自同一供应商。
 *
 * embedding 模型名格式为 `<providerId>_<model_name>`，使用 providerService 解析。
 *
 * @param text - 待嵌入的文本
 * @param settings - 记忆设置
 * @param apiSettings - API 设置
 * @param providers - 供应商列表
 * @param providerKeys - 供应商 ID 到 API Key 的映射
 * @returns 嵌入向量（number[]）
 */
export const getEmbedding = async (
  text: string,
  settings: MemorySettings,
  apiSettings: ApiSettings,
  providers: ApiProvider[],
  providerKeys: Record<string, string>,
): Promise<number[]> => {
  const model = (settings.embeddingModel || '').trim();
  logger.debug("memory", `getEmbedding: 模型=${settings.embeddingModel} 文本长度=${text.length}`);

  // 缓存命中短路：相同文本+模型直接返回缓存的向量
  if (model) {
    const cached = getCachedEmbedding(text, model);
    if (cached) {
      return cached;
    }
  }

  const [vector] = await requestEmbeddings(
    [text],
    settings,
    apiSettings,
    providers,
    providerKeys,
  );

  // 写入缓存
  if (model) {
    setCachedEmbedding(text, model, vector);
  }

  return vector;
};

// ============================================================================
// 向量记忆构建与搜索
// ============================================================================

/**
 * 将消息按对话轮次分组（1 user + 1 assistant = 1 turn）
 *
 * 轮次编号从 1 开始（用户消息触发新轮次）。
 * 仅包含同时有用户和助手内容的完整轮次；开场白（轮次 0 的 assistant）被跳过。
 * 连续多条 assistant 消息会合并为同一轮次的助手内容。
 *
 * @param messages - 聊天消息列表
 * @returns 轮次数组，每项含轮次号和拼接后的内容
 */
const groupMessagesByTurn = (
  messages: ChatMessage[],
): Array<{ turn: number; content: string }> => {
  const turns: Array<{ turn: number; content: string }> = [];
  let currentTurn = 0;
  let userContent: string | null = null;
  let assistantParts: string[] = [];

  const flush = (): void => {
    // 只有同时有用户和助手内容的轮次才构成完整轮次
    if (currentTurn > 0 && userContent !== null && assistantParts.length > 0) {
      turns.push({
        turn: currentTurn,
        content: `${userContent}\n\n${assistantParts.join('\n\n')}`,
      });
    }
    userContent = null;
    assistantParts = [];
  };

  for (const msg of messages) {
    if (msg.role === 'user') {
      flush();
      currentTurn++;
      userContent = msg.content;
    } else if (msg.role === 'assistant') {
      if (currentTurn === 0) continue; // 开场白，跳过
      assistantParts.push(msg.content);
    }
    // system 消息跳过
  }
  flush();

  return turns;
};

/**
 * 构建向量记忆
 *
 * 将聊天消息按对话轮次分组，为每轮生成嵌入向量并创建记忆分片。
 * 批量处理以提高效率（每批 MEMORY_VECTOR_BATCH_SIZE 条）。
 * 若角色卡有开场白且首条消息匹配，则跳过开场白。
 *
 * @param messages - 聊天消息列表
 * @param character - 当前角色（可选，用于过滤开场白）
 * @param settings - 记忆设置
 * @param apiSettings - API 设置
 * @param providers - 供应商列表
 * @param providerKeys - 供应商 ID 到 API Key 的映射
 * @returns 向量记忆分片数组
 */
export const buildVectorMemory = async (
  messages: ChatMessage[],
  character: Character | null,
  settings: MemorySettings,
  apiSettings: ApiSettings,
  providers: ApiProvider[],
  providerKeys: Record<string, string>,
): Promise<VectorMemoryShard[]> => {
  // 无嵌入模型时跳过向量记忆构建（系统自动判断启用状态）
  if (!settings.embeddingModel) {
    // v0.5.9: 从 debug 升级到 warn，便于诊断向量记忆失效问题
    logger.warn("memory", "buildVectorMemory 跳过: 未配置嵌入模型");
    return [];
  }
  logger.info("memory", `buildVectorMemory 启动: messages=${messages.length} 模型=${settings.embeddingModel}`);

  // 过滤掉开场白（如果角色卡有开场白且首条消息匹配）
  let filteredMessages = messages;
  if (character?.firstMessage && messages.length > 0) {
    const first = messages[0];
    if (first.role === 'assistant' && first.content === character.firstMessage) {
      filteredMessages = messages.slice(1);
    }
  }

  const turns = groupMessagesByTurn(filteredMessages);
  if (turns.length === 0) {
    logger.debug("memory", "buildVectorMemory 跳过: 无完整对话轮次");
    return [];
  }
  logger.info("memory", `buildVectorMemory: turns=${turns.length} 分${Math.ceil(turns.length / MEMORY_VECTOR_BATCH_SIZE)} 批请求嵌入`);

  const shards: VectorMemoryShard[] = [];

  // 分批请求嵌入向量
  for (let i = 0; i < turns.length; i += MEMORY_VECTOR_BATCH_SIZE) {
    const batch = turns.slice(i, i + MEMORY_VECTOR_BATCH_SIZE);
    const vectors = await requestEmbeddings(
      batch.map((t) => t.content),
      settings,
      apiSettings,
      providers,
      providerKeys,
    );
    for (let j = 0; j < batch.length; j++) {
      shards.push({
        id: uuidv4(),
        content: batch[j].content,
        turn: batch[j].turn,
        embedding: vectors[j],
        createdAt: Date.now(),
      });
    }
  }

  logger.info("memory", `buildVectorMemory 完成: 创建 ${shards.length} 个分片`);
  return shards;
};

/**
 * 搜索向量记忆
 *
 * 使用余弦相似度计算查询与各分片的相似度，返回最相关的 Top-K 分片。
 * Top-K 数量由 settings.vectorTopK 决定。
 *
 * @param query - 查询文本
 * @param shards - 向量记忆分片列表
 * @param settings - 记忆设置
 * @param apiSettings - API 设置
 * @param providers - 供应商列表
 * @param providerKeys - 供应商 ID 到 API Key 的映射
 * @returns 按相似度降序排列的 Top-K 分片
 */
export const searchVectorMemory = async (
  query: string,
  shards: VectorMemoryShard[],
  settings: MemorySettings,
  apiSettings: ApiSettings,
  providers: ApiProvider[],
  providerKeys: Record<string, string>,
): Promise<VectorMemoryShard[]> => {
  logger.info("memory", `searchVectorMemory: 查询="${query.slice(0,50)}" 分片数=${shards.length} topK=${settings.vectorTopK}`);
  const scored = await searchVectorMemoryWithScore(
    query,
    shards,
    settings,
    apiSettings,
    providers,
    providerKeys,
  );
  const results = scored.map((item) => item.shard);
  logger.info("memory", `searchVectorMemory 完成: 找到 ${results.length} 条结果`);
  return results;
};

/**
 * 带分数的向量记忆搜索
 *
 * 与 searchVectorMemory 相同，但返回值附带相似度分数，
 * 供 searchAllMemory 等需要分数的场景使用。
 *
 * @param query - 查询文本
 * @param shards - 向量记忆分片列表
 * @param settings - 记忆设置
 * @param apiSettings - API 设置
 * @param providers - 供应商列表
 * @param providerKeys - 供应商 ID 到 API Key 的映射
 * @returns 按相似度降序排列的 Top-K {shard, score} 列表
 */
export const searchVectorMemoryWithScore = async (
  query: string,
  shards: VectorMemoryShard[],
  settings: MemorySettings,
  apiSettings: ApiSettings,
  providers: ApiProvider[],
  providerKeys: Record<string, string>,
): Promise<{ shard: VectorMemoryShard; score: number }[]> => {
  // 无嵌入模型时跳过向量搜索（系统自动判断启用状态）
  if (!settings.embeddingModel) return [];
  if (!query.trim() || shards.length === 0) return [];

  // 获取查询文本的嵌入向量
  const queryVector = await getEmbedding(
    query,
    settings,
    apiSettings,
    providers,
    providerKeys,
  );

  // 计算相似度并过滤无效结果（-Infinity 表示维度不匹配等错误，需过滤）
  const scored = shards
    .map((shard) => ({
      shard,
      score: cosineSimilarity(queryVector, shard.embedding),
    }))
    .filter((item) => Number.isFinite(item.score));

  // 按相似度降序排序
  scored.sort((a, b) => b.score - a.score);

  const topK = Math.max(1, settings.vectorTopK ?? 15);
  return scored.slice(0, topK);
};

// ============================================================================
// 向量记忆分片持久化
// ============================================================================

/**
 * 从 IndexedDB 加载向量记忆分片
 *
 * 按角色 UUID 加载对应的向量记忆分片列表。
 * 若提供 sessionId，则加载该会话专属的分片（键为 `vector_memory_<uuid>_<sessionId>`）；
 * 否则加载角色级别的分片（键为 `vector_memory_<uuid>`，向后兼容）。
 *
 * @param characterUuid - 角色 UUID
 * @param sessionId - 会话 ID（可选，提供时加载会话级分片）
 * @returns 向量记忆分片数组，不存在则返回空数组
 */
export const loadVectorMemoryShards = async (
  characterUuid: string,
  sessionId?: string,
): Promise<VectorMemoryShard[]> => {
  if (!characterUuid) return [];
  const key = sessionId
    ? `${VECTOR_MEMORY_STORAGE_KEY_PREFIX}${characterUuid}_${sessionId}`
    : `${VECTOR_MEMORY_STORAGE_KEY_PREFIX}${characterUuid}`;
  const data = await getItem<VectorMemoryShard[]>('memory', key);
  const count = data?.length ?? 0;
  logger.debug("memory", `loadVectorMemoryShards: key=${key} 分片数=${count}`);

  // v0.6.1-fix: 向后兼容 - 若带 session 的键返回空，尝试不带 session 的键
  // （旧版保存时 currentSessionId 可能为 null，分片存到了角色级键）
  if (sessionId && count === 0) {
    const fallbackKey = `${VECTOR_MEMORY_STORAGE_KEY_PREFIX}${characterUuid}`;
    const fallbackData = await getItem<VectorMemoryShard[]>('memory', fallbackKey);
    const fallbackCount = fallbackData?.length ?? 0;
    if (fallbackCount > 0) {
      logger.info("memory", `loadVectorMemoryShards: 回退到角色级键 key=${fallbackKey} 分片数=${fallbackCount}`);
      return fallbackData!;
    }
  }

  return data ?? [];
};

/**
 * 保存向量记忆分片到 IndexedDB
 *
 * 按角色 UUID 保存对应的向量记忆分片列表。
 * 若提供 sessionId，则保存到该会话专属的键（键为 `vector_memory_<uuid>_<sessionId>`）；
 * 否则保存到角色级别的键（键为 `vector_memory_<uuid>`，向后兼容）。
 *
 * @param characterUuid - 角色 UUID
 * @param shards - 向量记忆分片数组
 * @param sessionId - 会话 ID（可选，提供时保存到会话级键）
 */
export const saveVectorMemoryShards = async (
  characterUuid: string,
  shards: VectorMemoryShard[],
  sessionId?: string,
): Promise<void> => {
  if (!characterUuid) return;
  const key = sessionId
    ? `${VECTOR_MEMORY_STORAGE_KEY_PREFIX}${characterUuid}_${sessionId}`
    : `${VECTOR_MEMORY_STORAGE_KEY_PREFIX}${characterUuid}`;
  logger.info("memory", `saveVectorMemoryShards: key=${key} 分片数=${shards.length}`);
  await setItem('memory', key, shards);
};

/**
 * v0.5.5-fix: 按对话轮次删除向量记忆分片
 *
 * 用于消息重试场景：重试前删除 oldAssistant 对应 turn 的分片，
 * 避免记忆召回预执行搜索到重试前的旧内容。
 */
export const removeVectorMemoryShardsByTurn = async (
  characterUuid: string,
  turnNumber: number,
  sessionId?: string,
): Promise<void> => {
  if (!characterUuid || turnNumber < 1) return;
  const existing = await loadVectorMemoryShards(characterUuid, sessionId);
  const filtered = existing.filter((s) => s.turn !== turnNumber);
  if (filtered.length !== existing.length) {
    await saveVectorMemoryShards(characterUuid, filtered, sessionId);
    logger.info("memory", `removeVectorMemoryShardsByTurn: turn=${turnNumber} 删除=${existing.length - filtered.length}个 剩余=${filtered.length}个`);
  }
};

/**
 * v0.6.0: 按 ID 删除单个会话向量记忆分片
 *
 * 用于记忆页面分片详情 Dialog 的删除操作。
 */
export const removeVectorMemoryShardById = async (
  characterUuid: string,
  shardId: string,
  sessionId?: string,
): Promise<void> => {
  if (!characterUuid || !shardId) return;
  const existing = await loadVectorMemoryShards(characterUuid, sessionId);
  const filtered = existing.filter((s) => s.id !== shardId);
  if (filtered.length !== existing.length) {
    await saveVectorMemoryShards(characterUuid, filtered, sessionId);
    logger.info("memory", `removeVectorMemoryShardById: 删除分片 ${shardId}，剩余 ${filtered.length} 个`);
  }
};

// ============================================================================
// 世界书向量记忆分片（v0.5.9 新增）
// ============================================================================

/** 世界书向量记忆存储键前缀 */
const WORLD_VECTOR_MEMORY_STORAGE_KEY_PREFIX = 'vector_memory_world_';

/**
 * 加载世界书向量记忆分片
 *
 * v0.5.9: 世界书条目预生成的嵌入向量分片，键为 `vector_memory_world_<bookId>`。
 * 用于记忆页面查看世界书向量分片内容。
 *
 * @param bookId - 世界书 ID
 * @returns 向量记忆分片数组，不存在则返回空数组
 */
export const loadWorldVectorMemoryShards = async (
  bookId: string,
): Promise<VectorMemoryShard[]> => {
  if (!bookId) return [];
  const key = `${WORLD_VECTOR_MEMORY_STORAGE_KEY_PREFIX}${bookId}`;
  const data = await getItem<VectorMemoryShard[]>('memory', key);
  const count = data?.length ?? 0;
  logger.debug("memory", `loadWorldVectorMemoryShards: key=${key} 分片数=${count}`);
  return data ?? [];
};

/**
 * 保存世界书向量记忆分片到 IndexedDB
 *
 * @param bookId - 世界书 ID
 * @param shards - 向量记忆分片数组
 */
export const saveWorldVectorMemoryShards = async (
  bookId: string,
  shards: VectorMemoryShard[],
): Promise<void> => {
  if (!bookId) return;
  const key = `${WORLD_VECTOR_MEMORY_STORAGE_KEY_PREFIX}${bookId}`;
  logger.info("memory", `saveWorldVectorMemoryShards: key=${key} 分片数=${shards.length}`);
  await setItem('memory', key, shards);
};

/**
 * v0.6.0: 按 ID 删除单个世界书向量记忆分片
 *
 * 用于记忆页面分片详情 Dialog 的删除操作。
 */
export const removeWorldVectorMemoryShardById = async (
  bookId: string,
  shardId: string,
): Promise<void> => {
  if (!bookId || !shardId) return;
  const existing = await loadWorldVectorMemoryShards(bookId);
  const filtered = existing.filter((s) => s.id !== shardId);
  if (filtered.length !== existing.length) {
    await saveWorldVectorMemoryShards(bookId, filtered);
    logger.info("memory", `removeWorldVectorMemoryShardById: 删除世界书 ${bookId} 分片 ${shardId}，剩余 ${filtered.length} 个`);
  }
};

/**
 * v0.5.9: 为世界书条目预生成嵌入向量
 *
 * 在世界书导入或创建条目时异步调用，为每条条目生成 embedding 向量并：
 * 1. 写回 entry.embedding 字段（持久化到 IndexedDB worldInfo store）
 * 2. 同时保存为向量分片到 `vector_memory_world_<bookId>`（便于记忆页面查看）
 *
 * 批量调用 getEmbedding（复用现有缓存），仅处理无 embedding 或内容变更的条目。
 * 仅当 memorySettings.embeddingModel 已配置时触发。
 *
 * @param entries - 待处理的世界书条目数组
 * @param settings - 记忆设置
 * @param apiSettings - API 设置
 * @param providers - 供应商列表
 * @param providerKeys - 供应商 ID 到 API Key 的映射
 * @returns 更新后的条目数组（含 embedding 字段）
 */
export const generateWorldInfoEmbeddings = async (
  entries: WorldInfoEntry[],
  settings: MemorySettings,
  apiSettings: ApiSettings,
  providers: ApiProvider[],
  providerKeys: Record<string, string>,
): Promise<WorldInfoEntry[]> => {
  const model = (settings.embeddingModel || '').trim();
  if (!model) {
    logger.warn("memory", "generateWorldInfoEmbeddings 跳过: 未配置嵌入模型");
    return entries;
  }
  if (!entries || entries.length === 0) {
    logger.debug("memory", "generateWorldInfoEmbeddings 跳过: 无条目");
    return entries;
  }

  logger.info("memory", `generateWorldInfoEmbeddings 启动: 条目数=${entries.length}`);

  // 筛选需要生成 embedding 的条目（无 embedding 或内容为空跳过）
  const toProcess = entries.filter(
    (e) => e.content && e.content.trim() && (!e.embedding || e.embedding.length === 0),
  );
  if (toProcess.length === 0) {
    logger.debug("memory", "generateWorldInfoEmbeddings: 所有条目已有 embedding，跳过");
    return entries;
  }

  logger.info("memory", `generateWorldInfoEmbeddings: 需处理 ${toProcess.length} 条`);

  // 批量生成 embedding（逐条调用以复用缓存）
  const updated = [...entries];
  let successCount = 0;
  let failCount = 0;
  for (const entry of toProcess) {
    try {
      const vector = await getEmbedding(
        entry.content,
        settings,
        apiSettings,
        providers,
        providerKeys,
      );
      const idx = updated.findIndex((e) => e.id === entry.id);
      if (idx >= 0) {
        updated[idx] = { ...updated[idx], embedding: vector };
        successCount++;
      }
    } catch (e) {
      failCount++;
      logger.warn("memory", `generateWorldInfoEmbeddings: 条目 ${entry.id} 生成失败: ${(e as Error).message}`);
    }
  }

  logger.info("memory", `generateWorldInfoEmbeddings 完成: 成功=${successCount} 失败=${failCount}`);

  // 持久化 embedding 到 IndexedDB worldInfo store
  try {
    const allEntries = await getItem<WorldInfoEntry[]>('worldInfo', 'worldInfo');
    if (allEntries) {
      const merged = allEntries.map((wi) => {
        const match = updated.find((e) => e.id === wi.id);
        return match && match.embedding ? { ...wi, embedding: match.embedding } : wi;
      });
      await setItem('worldInfo', 'worldInfo', merged);
    }
  } catch (e) {
    logger.warn("memory", `generateWorldInfoEmbeddings: 持久化 worldInfo 失败: ${(e as Error).message}`);
  }

  // 按 bookId 分组保存为向量分片
  const bookGroups = new Map<string, WorldInfoEntry[]>();
  for (const entry of updated) {
    const bid = entry.bookId?.trim();
    if (!bid || !entry.embedding || entry.embedding.length === 0) continue;
    const existing = bookGroups.get(bid);
    if (existing) {
      existing.push(entry);
    } else {
      bookGroups.set(bid, [entry]);
    }
  }

  for (const [bookId, groupEntries] of bookGroups) {
    try {
      // v0.6.0-fix: 合并已有分片，按 content 去重（同内容视为同分片，更新 embedding）
      const existing = await loadWorldVectorMemoryShards(bookId);
      const merged = [...existing];
      for (const entry of groupEntries) {
        const idx = merged.findIndex((s) => s.content === entry.content);
        const shard: VectorMemoryShard = {
          id: idx >= 0 ? merged[idx].id : uuidv4(),
          content: entry.content,
          turn: idx >= 0 ? merged[idx].turn : merged.length + 1,
          embedding: entry.embedding!,
          createdAt: idx >= 0 ? merged[idx].createdAt : Date.now(),
        };
        if (idx >= 0) merged[idx] = shard;
        else merged.push(shard);
      }
      await saveWorldVectorMemoryShards(bookId, merged);
      logger.info("memory", `generateWorldInfoEmbeddings: 合并保存世界书 ${bookId} 分片数=${merged.length}（新增/更新 ${groupEntries.length} 条）`);
    } catch (e) {
      logger.warn("memory", `generateWorldInfoEmbeddings: 保存世界书 ${bookId} 分片失败: ${(e as Error).message}`);
    }
  }

  return updated;
};

// ============================================================================
// 记忆压缩
// ============================================================================

/**
 * 记忆压缩：保留最近 N 楼，其余有向量记忆覆盖的楼层从原始上下文移除
 *
 * 逻辑：
 * 1. 计算每条消息所属的对话轮次（1 user + 1 assistant = 1 turn，轮次从 1 开始）
 * 2. 保留最后 keepRecent 条消息不动
 * 3. 对较早的消息（前 messages.length - keepRecent 条），若其轮次有向量记忆覆盖，
 *    则从上下文中移除（因为这些内容已被向量记忆替代）
 *
 * @param messages - 原始聊天消息列表
 * @param shards - 向量记忆分片列表
 * @param keepRecent - 保留最近的消息数量（0 = 关闭压缩）
 * @returns 压缩后的消息列表
 */
export const compressContext = (
  messages: ChatMessage[],
  shards: VectorMemoryShard[],
  keepRecent: number,
): ChatMessage[] => {
  // 不启用压缩或无记忆分片时，返回原始消息
  if (keepRecent <= 0 || shards.length === 0) return messages;
  // 消息数不超过保留数量时，返回原始消息
  if (messages.length <= keepRecent) return messages;

  // 构建有向量记忆覆盖的轮次集合
  const memoryTurnSet = new Set<number>(
    shards.map((s) => s.turn).filter((turn) => turn > 0),
  );
  if (memoryTurnSet.size === 0) return messages;

  // 候选可移除的消息数量（保留最近 keepRecent 条）
  const candidateCount = messages.length - keepRecent;

  // 计算每条消息所属的对话轮次
  // 用户消息触发新轮次（从 1 开始），助手消息跟随前一个用户的轮次
  // 开场白（轮次 0）不会被记忆覆盖
  const messageTurns: number[] = [];
  let turn = 0;
  for (const msg of messages) {
    if (msg.role === 'user') {
      turn++;
    }
    messageTurns.push(turn);
  }

  // 标记可移除的索引：候选范围内且轮次有记忆覆盖
  const removableIndices = new Set<number>();
  for (let i = 0; i < candidateCount; i++) {
    if (memoryTurnSet.has(messageTurns[i])) {
      removableIndices.add(i);
    }
  }

  if (removableIndices.size === 0) return messages;

  // 移除有记忆覆盖的候选消息
  return messages.filter((_, index) => !removableIndices.has(index));
};

// v0.5.9-locked: 长期记忆功能锁定 ===================================================
// ============================================================================
// 长期记忆（跨会话）
// ============================================================================

// /** 统一记忆搜索结果条目 */
// export interface MemorySearchResult {
//   /** 记忆来源作用域 */
//   scope: MemoryScope;
//   /** 记忆内容 */
//   content: string;
//   /** 相似度/匹配分数 */
//   score: number;
//   /** 所属角色 ID */
//   characterId?: string;
//   /** 所属会话 ID（仅 session 作用域） */
//   sessionId?: string;
//   /** 对话轮次 */
//   turn?: number;
// }

// /**
//  * 从 IndexedDB 加载角色的长期记忆条目
//  *
//  * @param characterId - 角色 ID
//  * @returns 长期记忆条目数组，不存在则返回空数组
//  */
// export const loadLongTermMemory = async (
//   characterId: string,
// ): Promise<MemoryEntry[]> => {
//   if (!characterId) return [];
//   const key = `${LONG_TERM_MEMORY_STORAGE_KEY_PREFIX}${characterId}`;
//   const data = await getItem<MemoryEntry[]>('longTermMemory', key);
//   return data ?? [];
// };

// /**
//  * 保存角色的长期记忆条目到 IndexedDB
//  *
//  * @param characterId - 角色 ID
//  * @param entries - 长期记忆条目数组
//  */
// export const saveLongTermMemory = async (
//   characterId: string,
//   entries: MemoryEntry[],
// ): Promise<void> => {
//   if (!characterId) return;
//   const key = `${LONG_TERM_MEMORY_STORAGE_KEY_PREFIX}${characterId}`;
//   await setItem('longTermMemory', key, entries);
// };

// /**
//  * 构建角色的长期记忆（跨会话）
//  *
//  * 与 buildVectorMemory 类似，但生成的记忆条目作用域为 'long-term'，
//  * 存储在独立的 longTermMemory store 中，用于跨会话的记忆召回。
//  *
//  * @param characterId - 角色 ID
//  * @param messages - 聚合后的跨会话消息列表
//  * @param settings - 记忆设置
//  * @param apiSettings - API 设置
//  * @param providers - 供应商列表
//  * @param providerKeys - 供应商 ID 到 API Key 的映射
//  * @returns 长期记忆条目数组
//  */
// export const buildLongTermMemory = async (
//   characterId: string,
//   messages: ChatMessage[],
//   settings: MemorySettings,
//   apiSettings: ApiSettings,
//   providers: ApiProvider[],
//   providerKeys: Record<string, string>,
// ): Promise<MemoryEntry[]> => {
//   if (!characterId || messages.length === 0) return [];
//
//   const turns = groupMessagesByTurn(messages);
//   if (turns.length === 0) return [];
//
//   const entries: MemoryEntry[] = [];
//
//   // 分批请求嵌入向量
//   for (let i = 0; i < turns.length; i += MEMORY_VECTOR_BATCH_SIZE) {
//     const batch = turns.slice(i, i + MEMORY_VECTOR_BATCH_SIZE);
//     const vectors = await requestEmbeddings(
//       batch.map((t) => t.content),
//       settings,
//       apiSettings,
//       providers,
//       providerKeys,
//     );
//     for (let j = 0; j < batch.length; j++) {
//       entries.push({
//         id: uuidv4(),
//         scope: 'long-term',
//         characterId,
//         content: batch[j].content,
//         turn: batch[j].turn,
//         embedding: vectors[j],
//         createdAt: Date.now(),
//       });
//     }
//   }
//
//   return entries;
// };

// /**
//  * 搜索角色的长期记忆
//  *
//  * 使用余弦相似度计算查询与各长期记忆条目的相似度，返回最相关的 Top-K 条目。
//  *
//  * @param characterId - 角色 ID
//  * @param query - 查询文本
//  * @param topK - 返回的最大条目数
//  * @param settings - 记忆设置
//  * @param apiSettings - API 设置
//  * @param providers - 供应商列表
//  * @param providerKeys - 供应商 ID 到 API Key 的映射
//  * @returns 按相似度降序排列的 Top-K 记忆搜索结果
//  */
// export const searchLongTermMemory = async (
//   characterId: string,
//   query: string,
//   topK: number,
//   settings: MemorySettings,
//   apiSettings: ApiSettings,
//   providers: ApiProvider[],
//   providerKeys: Record<string, string>,
// ): Promise<MemorySearchResult[]> => {
//   if (!query.trim() || !characterId) return [];
//
//   const entries = await loadLongTermMemory(characterId);
//   if (entries.length === 0) return [];
//
//   // 过滤有嵌入向量的条目
//   const embedded = entries.filter(
//     (e) => Array.isArray(e.embedding) && e.embedding.length > 0,
//   );
//   if (embedded.length === 0) return [];
//
//   const queryVector = await getEmbedding(
//     query,
//     settings,
//     apiSettings,
//     providers,
//     providerKeys,
//   );
//
//   const scored = embedded
//     .map((entry) => ({
//       entry,
//       score: cosineSimilarity(queryVector, entry.embedding!),
//     }))
//     .filter((item) => Number.isFinite(item.score));
//
//   scored.sort((a, b) => b.score - a.score);
//
//   return scored
//     .slice(0, Math.max(1, topK))
//     .map((item) => ({
//       scope: 'long-term' as MemoryScope,
//       content: item.entry.content,
//       score: item.score,
//       characterId: item.entry.characterId,
//       turn: item.entry.turn,
//     }));
// };

// /**
//  * 搜索所有记忆（会话 + 长期 + 全局）
//  *
//  * 根据搜索类型（关键词或语义）跨作用域检索记忆，返回合并后的结果。
//  *
//  * - keyword：对会话向量记忆分片、长期记忆、全局记忆进行关键词包含匹配
//  * - semantic：对会话向量记忆分片和长期记忆进行嵌入相似度搜索，全局记忆做关键词匹配
//  *
//  * @param query - 查询文本
//  * @param type - 搜索类型（'keyword' 或 'semantic'）
//  * @param characterId - 角色 ID
//  * @param sessionId - 会话 ID（可选，用于会话级记忆搜索）
//  * @param settings - 记忆设置
//  * @param apiSettings - API 设置
//  * @param providers - 供应商列表
//  * @param providerKeys - 供应商 ID 到 API Key 的映射
//  * @returns 合并后的记忆搜索结果列表
//  */
// export const searchAllMemory = async (
//   query: string,
//   type: 'keyword' | 'semantic',
//   characterId: string,
//   sessionId: string | undefined,
//   settings: MemorySettings,
//   apiSettings: ApiSettings,
//   providers: ApiProvider[],
//   providerKeys: Record<string, string>,
// ): Promise<MemorySearchResult[]> => {
//   const q = query.trim();
//   if (!q) return [];
//
//   const results: MemorySearchResult[] = [];
//   const qLower = q.toLowerCase();
//
//   // 加载会话向量记忆分片
//   const sessionShards = await loadVectorMemoryShards(characterId, sessionId);
//   // 加载长期记忆
//   const longTermEntries = await loadLongTermMemory(characterId);
//
//   if (type === 'keyword') {
//     // 关键词匹配：会话记忆
//     for (const shard of sessionShards) {
//       if (shard.content.toLowerCase().includes(qLower)) {
//         results.push({
//           scope: 'session',
//           content: shard.content,
//           score: 1,
//           characterId,
//           sessionId,
//           turn: shard.turn,
//         });
//       }
//     }
//     // 关键词匹配：长期记忆
//     for (const entry of longTermEntries) {
//       if (entry.content.toLowerCase().includes(qLower)) {
//         results.push({
//           scope: 'long-term',
//           content: entry.content,
//           score: 1,
//           characterId: entry.characterId,
//           turn: entry.turn,
//         });
//       }
//     }
//   } else {
//     // 语义搜索：会话向量记忆
//     if (sessionShards.length > 0) {
//       const sessionResults = await searchVectorMemoryWithScore(
//         q,
//         sessionShards,
//         settings,
//         apiSettings,
//         providers,
//         providerKeys,
//       );
//       for (const item of sessionResults) {
//         results.push({
//           scope: 'session',
//           content: item.shard.content,
//           score: item.score,
//           characterId,
//           sessionId,
//           turn: item.shard.turn,
//         });
//       }
//     }
//     // 语义搜索：长期记忆
//     const topK = Math.max(1, settings.vectorTopK ?? 15);
//     const longTermResults = await searchLongTermMemory(
//       characterId,
//       q,
//       topK,
//       settings,
//       apiSettings,
//       providers,
//       providerKeys,
//     );
//     results.push(...longTermResults);
//   }
//
//   return results;
// };
// =================================================================== v0.5.9-locked
