/**
 * 知识库服务
 *
 * 提供知识库的 CRUD、文件导入、内容检索能力。
 *
 * 核心能力：
 * - 从 IndexedDB 加载/保存知识库列表
 * - 导入文件（图片转 base64，md/txt 读取文本）
 * - 基于关键词匹配或嵌入向量相似度检索知识库内容
 */

import type {
  KnowledgeBase,
  KnowledgeBaseFile,
  ApiSettings,
} from '~/types/luzzy';
import { v4 as uuidv4 } from 'uuid';
import { getItem, setItem } from '~/services/storage';
import {
  getActualModelName,
  normalizeApiProviderUrl,
} from '~/services/providerService';
import { cosineSimilarity, getCachedEmbedding, setCachedEmbedding } from '~/services/memoryService';

/** 知识库列表在 IndexedDB 中的存储键 */
const KB_STORAGE_KEY = 'all_knowledge_bases';

/** 嵌入 API 版本路径（避免与 chat/completions 的 /v1 冲突） */
const EMBEDDING_API_VERSION = 'v3';

/** embeddings 响应结构 */
interface EmbeddingResponse {
  data?: Array<{ index?: number; embedding?: unknown }>;
}

/** 知识库检索结果条目 */
export interface KnowledgeBaseSearchResult {
  /** 来源文件 */
  file: KnowledgeBaseFile;
  /** 匹配的内容片段 */
  snippet: string;
  /** 相似度/匹配分数 */
  score: number;
}

// ============================================================================
// 持久化
// ============================================================================

/**
 * 从 IndexedDB 加载所有知识库
 *
 * @returns 知识库列表，不存在则返回空数组
 */
export const loadKnowledgeBases = async (): Promise<KnowledgeBase[]> => {
  const data = await getItem<KnowledgeBase[]>('knowledgeBases', KB_STORAGE_KEY);
  return data ?? [];
};

/**
 * 保存知识库列表到 IndexedDB
 *
 * @param kbs - 知识库列表
 */
export const saveKnowledgeBases = async (
  kbs: KnowledgeBase[],
): Promise<void> => {
  await setItem('knowledgeBases', KB_STORAGE_KEY, kbs);
};

// ============================================================================
// 文件导入
// ============================================================================

/**
 * 判断文件类型
 *
 * @param file - File 对象
 * @returns 文件类型：'image' | 'md' | 'txt'
 */
const detectFileType = (file: File): KnowledgeBaseFile['type'] => {
  const name = file.name.toLowerCase();
  const mime = (file.type || '').toLowerCase();
  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name)) {
    return 'image';
  }
  if (name.endsWith('.md') || name.endsWith('.markdown')) {
    return 'md';
  }
  return 'txt';
};

/**
 * 将文件读取为 base64 字符串（含 data URL 前缀）
 *
 * @param file - File 对象
 * @returns base64 data URL
 */
const readFileAsDataURL = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (): void => resolve(reader.result as string);
    reader.onerror = (): void => reject(reader.error ?? new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
};

/**
 * 将文件读取为文本
 *
 * @param file - File 对象
 * @returns 文本内容
 */
const readFileAsText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (): void => resolve(reader.result as string);
    reader.onerror = (): void => reject(reader.error ?? new Error('文件读取失败'));
    reader.readAsText(file);
  });
};

/**
 * 导入知识库文件
 *
 * 根据文件类型解析内容：
 * - 图片：转换为 base64 data URL
 * - md/txt：读取为文本
 *
 * @param file - File 对象
 * @returns 知识库文件对象
 */
export const importKnowledgeBaseFile = async (
  file: File,
): Promise<KnowledgeBaseFile> => {
  const type = detectFileType(file);
  let content: string;

  if (type === 'image') {
    content = await readFileAsDataURL(file);
  } else {
    content = await readFileAsText(file);
  }

  return {
    id: uuidv4(),
    name: file.name,
    type,
    content,
    size: file.size,
    uploadedAt: Date.now(),
  };
};

// ============================================================================
// 内容检索
// ============================================================================

/**
 * 构建嵌入 API 的完整 URL
 *
 * 使用 /v3 版本路径以避免与 chat/completions 的 /v1 版本冲突。
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
 * 将文本按段落分块
 *
 * @param text - 原始文本
 * @param maxChunkSize - 每块最大字符数
 * @returns 文本块数组
 */
const chunkText = (text: string, maxChunkSize = 500): string[] => {
  const paragraphs = text.split(/\n\s*\n/);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    if ((current + '\n\n' + trimmed).length > maxChunkSize && current) {
      chunks.push(current);
      current = trimmed;
    } else {
      current = current ? `${current}\n\n${trimmed}` : trimmed;
    }
  }
  if (current) chunks.push(current);
  return chunks;
};

/**
 * 检索知识库中与查询相关的内容
 *
 * 检索流程：
 * 1. 遍历知识库中的文本文件（md/txt），按段落分块
 * 2. 若提供了嵌入模型，计算查询与各文本块的向量相似度
 * 3. 若无嵌入模型或嵌入失败，回退到关键词匹配
 * 4. 返回按相关度排序的结果
 *
 * @param kb - 知识库
 * @param query - 查询文本
 * @param embeddingModel - 嵌入模型名（空则使用关键词匹配）
 * @param apiSettings - API 配置
 * @param topK - 返回的最大结果数
 * @returns 检索结果列表
 */
export const processKnowledgeBase = async (
  kb: KnowledgeBase,
  query: string,
  embeddingModel: string,
  apiSettings: ApiSettings,
  topK = 5,
): Promise<KnowledgeBaseSearchResult[]> => {
  const q = query.trim();
  if (!q || !kb.files || kb.files.length === 0) return [];

  // 收集所有文本文件的分块
  const chunks: Array<{ file: KnowledgeBaseFile; snippet: string }> = [];
  for (const file of kb.files) {
    if (file.type === 'image') continue;
    const textChunks = chunkText(file.content);
    for (const snippet of textChunks) {
      chunks.push({ file, snippet });
    }
  }

  if (chunks.length === 0) return [];

  // 无嵌入模型时使用关键词匹配
  if (!embeddingModel.trim()) {
    const qLower = q.toLowerCase();
    return chunks
      .map(({ file, snippet }) => {
        const snippetLower = snippet.toLowerCase();
        let score = 0;
        let idx = snippetLower.indexOf(qLower);
        while (idx !== -1) {
          score++;
          idx = snippetLower.indexOf(qLower, idx + 1);
        }
        return { file, snippet, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  // 嵌入向量语义搜索
  try {
    const queryVector = await getEmbeddingSimple(q, embeddingModel, apiSettings);
    if (queryVector.length === 0) {
      // 回退到关键词匹配
      const qLower = q.toLowerCase();
      return chunks
        .map(({ file, snippet }) => {
          const score = snippet.toLowerCase().includes(qLower) ? 1 : 0;
          return { file, snippet, score };
        })
        .filter((item) => item.score > 0)
        .slice(0, topK);
    }

    const scored = await Promise.all(
      chunks.map(async ({ file, snippet }) => {
        try {
          const chunkVector = await getEmbeddingSimple(
            snippet,
            embeddingModel,
            apiSettings,
          );
          return { file, snippet, score: cosineSimilarity(queryVector, chunkVector) };
        } catch {
          return { file, snippet, score: -1 };
        }
      }),
    );

    return scored
      .filter((item) => Number.isFinite(item.score) && item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  } catch {
    // 嵌入失败时回退到关键词匹配
    const qLower = q.toLowerCase();
    return chunks
      .map(({ file, snippet }) => {
        const score = snippet.toLowerCase().includes(qLower) ? 1 : 0;
        return { file, snippet, score };
      })
      .filter((item) => item.score > 0)
      .slice(0, topK);
  }
};
