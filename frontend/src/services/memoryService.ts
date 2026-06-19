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

import type {
  ChatMessage,
  Character,
  MemorySettings,
  GlobalMemory,
  VectorMemoryShard,
  ApiSettings,
  ApiProvider,
} from '@/types';
import { v4 as uuidv4 } from 'uuid';
import {
  parseModelName,
  getActualModelName,
  normalizeApiProviderUrl,
} from '@/services/providerService';
import { extractApiErrorMessage } from '@/services/apiClient';
import { getItem, setItem } from '@/services/storage';

// ============================================================================
// 常量
// ============================================================================

/** 向量记忆批量处理的批次大小（与旧版一致） */
const MEMORY_VECTOR_BATCH_SIZE = 16;

/** 嵌入 API 版本路径（避免与 chat/completions 的 /v1 冲突） */
const EMBEDDING_API_VERSION = 'v3';

/** 全局记忆在 IndexedDB 中的存储键 */
const GLOBAL_MEMORY_STORAGE_KEY = 'global_memory';

/** 向量记忆分片在 IndexedDB 中的存储键前缀 */
const VECTOR_MEMORY_STORAGE_KEY_PREFIX = 'vector_memory_';

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
 * 使用 /v3 版本路径以避免与 chat/completions 的 /v1 版本冲突。
 * 若 baseUrl 已含版本路径（/v1, /v2 等），则替换为 /v3。
 *
 * @param baseUrl - 供应商 API 基础地址
 * @returns 完整的 embeddings 端点 URL，如 `https://api.example.com/v3/embeddings`
 */
const buildEmbeddingUrl = (baseUrl: string): string => {
  const clean = normalizeApiProviderUrl(baseUrl);
  // 移除已有的版本路径（/v1, /v2 等），统一使用 /v3
  const withoutVersion = clean.replace(/\/v\d+(?=\/|$)/, '');
  return `${withoutVersion}/${EMBEDDING_API_VERSION}/embeddings`;
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
  const [vector] = await requestEmbeddings(
    [text],
    settings,
    apiSettings,
    providers,
    providerKeys,
  );
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
  // 过滤掉开场白（如果角色卡有开场白且首条消息匹配）
  let filteredMessages = messages;
  if (character?.firstMessage && messages.length > 0) {
    const first = messages[0];
    if (first.role === 'assistant' && first.content === character.firstMessage) {
      filteredMessages = messages.slice(1);
    }
  }

  const turns = groupMessagesByTurn(filteredMessages);
  if (turns.length === 0) return [];

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
  return scored.slice(0, topK).map((item) => item.shard);
};

// ============================================================================
// 全局记忆管理
// ============================================================================

/**
 * 获取全局记忆 MEMORY.md
 *
 * 从 IndexedDB 读取全局记忆内容。
 *
 * @returns 全局记忆对象，不存在则返回 null
 */
export const getGlobalMemory = async (): Promise<GlobalMemory | null> => {
  const data = await getItem<GlobalMemory>('memory', GLOBAL_MEMORY_STORAGE_KEY);
  return data ?? null;
};

/**
 * 保存全局记忆
 *
 * 将全局记忆内容写入 IndexedDB，自动更新 updatedAt 时间戳。
 *
 * @param content - 全局记忆文本内容
 */
export const setGlobalMemory = async (content: string): Promise<void> => {
  const data: GlobalMemory = {
    content,
    updatedAt: Date.now(),
  };
  await setItem('memory', GLOBAL_MEMORY_STORAGE_KEY, data);
};

// ============================================================================
// 向量记忆分片持久化
// ============================================================================

/**
 * 从 IndexedDB 加载向量记忆分片
 *
 * 按角色 UUID 加载对应的向量记忆分片列表。
 *
 * @param characterUuid - 角色 UUID
 * @returns 向量记忆分片数组，不存在则返回空数组
 */
export const loadVectorMemoryShards = async (
  characterUuid: string,
): Promise<VectorMemoryShard[]> => {
  if (!characterUuid) return [];
  const key = `${VECTOR_MEMORY_STORAGE_KEY_PREFIX}${characterUuid}`;
  const data = await getItem<VectorMemoryShard[]>('memory', key);
  return data ?? [];
};

/**
 * 保存向量记忆分片到 IndexedDB
 *
 * 按角色 UUID 保存对应的向量记忆分片列表。
 *
 * @param characterUuid - 角色 UUID
 * @param shards - 向量记忆分片数组
 */
export const saveVectorMemoryShards = async (
  characterUuid: string,
  shards: VectorMemoryShard[],
): Promise<void> => {
  if (!characterUuid) return;
  const key = `${VECTOR_MEMORY_STORAGE_KEY_PREFIX}${characterUuid}`;
  await setItem('memory', key, shards);
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
