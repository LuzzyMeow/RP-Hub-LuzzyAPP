/**
 * ACE Skillbook 服务 — v0.3.0
 *
 * 管理 ACE (Agentic Context Engineering) 策略手册的 CRUD、排序、迁移与去重。
 *
 * 核心能力：
 * - Skillbook 持久化（IndexedDB 'memory' store，键 'ace_skillbook'）
 * - 策略 CRUD：addSkill / updateSkill / removeSkill(软删除) / hardDeleteSkill
 * - 评分操作：tagSkill(helpful/harmful/neutral)
 * - 排序规则：active 优先 → 分数降序 → 更新时间降序
 * - 数据迁移：旧 GlobalMemory 纯文本 → AceSkill 列表
 * - 去重：基于嵌入向量余弦相似度合并重复策略
 *
 * 约束：
 * - source='manual' 的策略不被自动 REMOVE/UPDATE（由 SkillManager 保护）
 * - 去重需要用户配置嵌入模型，未配置则跳过
 */

import type {
  AceSkill,
  AceSkillbook,
  AceSkillVerdict,
  AceSkillSource,
  GlobalMemory,
} from '~/types/luzzy';
import { getItem, setItem, removeItem } from '~/services/storage';
import { getGlobalMemory } from '~/services/memoryService';
import { cosineSimilarity, getEmbedding } from '~/services/memoryService';
import type {
  MemorySettings,
  ApiSettings,
  ApiProvider,
} from '~/types/luzzy';

// ============================================================================
// 常量
// ============================================================================

/** Skillbook 在 IndexedDB 中的存储键 */
const ACE_SKILLBOOK_STORAGE_KEY = 'ace_skillbook';

/** 旧全局记忆存储键（用于迁移检测） */
const LEGACY_GLOBAL_MEMORY_STORAGE_KEY = 'global_memory';

/** 嵌入向量缓存键 */
const ACE_EMBEDDINGS_STORAGE_KEY = 'ace_skillbook_embeddings';

/** 去重相似度阈值（>= 此值视为重复） */
const DEDUP_SIMILARITY_THRESHOLD = 0.85;

/** 自动停用阈值：harmfulCount - helpfulCount >= 此值时自动停用 */
const AUTO_DEACTIVATE_THRESHOLD = 3;

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 生成策略 ID
 * @param lastId - 当前最后自增 ID
 * @returns 新的策略 ID，格式 mem-XXXXX
 */
const generateSkillId = (lastId: number): string => {
  return `mem-${String(lastId + 1).padStart(5, '0')}`;
};

/**
 * 获取当前 ISO 8601 时间戳
 */
const nowIso = (): string => new Date().toISOString();

/**
 * 创建空 Skillbook
 */
export const createEmptySkillbook = (): AceSkillbook => ({
  skills: [],
  lastId: 0,
  updatedAt: nowIso(),
});

// ============================================================================
// 排序
// ============================================================================

/**
 * 策略排序规则
 *
 * 1. active 优先（启用的在前）
 * 2. 分数降序（helpful - harmful）
 * 3. 更新时间降序
 *
 * @param skills - 待排序的策略列表
 * @returns 排序后的新数组（不修改原数组）
 */
export const sortSkills = (skills: AceSkill[]): AceSkill[] => {
  return [...skills].sort((a, b) => {
    // 1. active 优先
    if (a.active !== b.active) return a.active ? -1 : 1;
    // 2. 分数降序 (helpful - harmful)
    const scoreA = a.helpfulCount - a.harmfulCount;
    const scoreB = b.helpfulCount - b.harmfulCount;
    if (scoreA !== scoreB) return scoreB - scoreA;
    // 3. 更新时间降序
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
};

// ============================================================================
// CRUD
// ============================================================================

/**
 * 从 IndexedDB 加载 Skillbook
 *
 * 若不存在 Skillbook 但存在旧 GlobalMemory，自动触发迁移。
 *
 * @returns Skillbook（至少为空对象，不会是 null）
 */
export const loadSkillbook = async (): Promise<AceSkillbook> => {
  const data = await getItem<AceSkillbook>('memory', ACE_SKILLBOOK_STORAGE_KEY);
  if (data && Array.isArray(data.skills)) {
    return data;
  }

  // 尝试迁移旧全局记忆
  const migrated = await migrateFromLegacyGlobalMemory();
  if (migrated) {
    await saveSkillbook(migrated);
    return migrated;
  }

  return createEmptySkillbook();
};

/**
 * 保存 Skillbook 到 IndexedDB
 *
 * @param book - 待保存的 Skillbook
 */
export const saveSkillbook = async (book: AceSkillbook): Promise<void> => {
  book.updatedAt = nowIso();
  await setItem('memory', ACE_SKILLBOOK_STORAGE_KEY, book);
};

/**
 * 新增策略
 *
 * ID 自动递增，source 默认 'manual'。
 *
 * @param book - Skillbook（会被原地修改）
 * @param content - 策略正文
 * @param category - 分类标签
 * @param source - 来源标记，默认 'manual'
 * @returns 新创建的策略
 */
export const addSkill = (
  book: AceSkillbook,
  content: string,
  category: string,
  source: AceSkillSource = 'manual',
): AceSkill => {
  const id = generateSkillId(book.lastId);
  const ts = nowIso();
  const skill: AceSkill = {
    id,
    category: category.trim() || 'general',
    content: content.trim(),
    helpfulCount: 0,
    harmfulCount: 0,
    neutralCount: 0,
    active: true,
    createdAt: ts,
    updatedAt: ts,
    source,
  };
  book.skills.push(skill);
  book.lastId += 1;
  return skill;
};

/**
 * 更新策略（部分字段）
 *
 * 注意：SkillManager 自动调用时需先检查 source !== 'manual'。
 *
 * @param book - Skillbook
 * @param id - 策略 ID
 * @param partial - 待更新的字段
 * @returns 更新后的策略，未找到则返回 null
 */
export const updateSkill = (
  book: AceSkillbook,
  id: string,
  partial: Partial<Omit<AceSkill, 'id' | 'createdAt'>>,
): AceSkill | null => {
  const skill = book.skills.find((s) => s.id === id);
  if (!skill) return null;
  Object.assign(skill, partial, { updatedAt: nowIso() });
  return skill;
};

/**
 * 软删除策略（active=false）
 *
 * @param book - Skillbook
 * @param id - 策略 ID
 * @returns 是否成功
 */
export const removeSkill = (book: AceSkillbook, id: string): boolean => {
  const skill = book.skills.find((s) => s.id === id);
  if (!skill) return false;
  skill.active = false;
  skill.updatedAt = nowIso();
  return true;
};

/**
 * 硬删除策略（从数组中移除）
 *
 * @param book - Skillbook
 * @param id - 策略 ID
 * @returns 是否成功
 */
export const hardDeleteSkill = (book: AceSkillbook, id: string): boolean => {
  const idx = book.skills.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  book.skills.splice(idx, 1);
  return true;
};

/**
 * 获取所有启用的策略（排序后）
 *
 * @param book - Skillbook
 * @returns 排序后的 active 策略列表
 */
export const getActiveSkills = (book: AceSkillbook): AceSkill[] => {
  return sortSkills(book.skills.filter((s) => s.active));
};

// ============================================================================
// 评分
// ============================================================================

/**
 * 为策略打标签（更新 helpful/harmful/neutral 计数）
 *
 * @param book - Skillbook
 * @param id - 策略 ID
 * @param verdict - 评估标签
 * @returns 更新后的策略，未找到则返回 null
 */
export const tagSkill = (
  book: AceSkillbook,
  id: string,
  verdict: AceSkillVerdict,
): AceSkill | null => {
  const skill = book.skills.find((s) => s.id === id);
  if (!skill) return null;
  if (verdict === 'helpful') skill.helpfulCount += 1;
  else if (verdict === 'harmful') skill.harmfulCount += 1;
  else skill.neutralCount += 1;
  skill.updatedAt = nowIso();

  // 自动停用检查（仅对 auto 策略生效）
  if (
    skill.source === 'auto' &&
    skill.harmfulCount - skill.helpfulCount >= AUTO_DEACTIVATE_THRESHOLD
  ) {
    skill.active = false;
  }
  return skill;
};

// ============================================================================
// 数据迁移
// ============================================================================

/**
 * 从旧 GlobalMemory 迁移到 Skillbook
 *
 * 旧格式：纯文本（按行存储）
 * 新格式：每行 → 一条 AceSkill，category='migrated'，source='manual'，active=true
 *
 * @returns 迁移后的 Skillbook，若无旧数据则返回 null
 */
export const migrateFromLegacyGlobalMemory = async (): Promise<AceSkillbook | null> => {
  const legacy = await getGlobalMemory();
  if (!legacy || !legacy.content.trim()) return null;

  const book = createEmptySkillbook();
  const lines = legacy.content.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    addSkill(book, line, 'migrated', 'manual');
  }

  // 迁移成功后删除旧数据（标记为已迁移）
  try {
    await removeItem('memory', LEGACY_GLOBAL_MEMORY_STORAGE_KEY);
  } catch {
    // 删除失败不阻塞迁移流程
  }

  return book;
};

/**
 * 检查是否需要迁移（用于 UI 提示）
 */
export const hasLegacyGlobalMemory = async (): Promise<boolean> => {
  const legacy = await getItem<GlobalMemory>(
    'memory',
    LEGACY_GLOBAL_MEMORY_STORAGE_KEY,
  );
  return !!(legacy && legacy.content.trim());
};

// ============================================================================
// 去重（基于嵌入向量）
// ============================================================================

/** 嵌入向量缓存：skillId → vector */
type EmbeddingMap = Record<string, number[]>;

/**
 * 从 IndexedDB 加载嵌入向量缓存
 */
const loadEmbeddings = async (): Promise<EmbeddingMap> => {
  const data = await getItem<EmbeddingMap>('memory', ACE_EMBEDDINGS_STORAGE_KEY);
  return data ?? {};
};

/**
 * 保存嵌入向量缓存到 IndexedDB
 */
const saveEmbeddings = async (embeddings: EmbeddingMap): Promise<void> => {
  await setItem('memory', ACE_EMBEDDINGS_STORAGE_KEY, embeddings);
};

/**
 * 为单条策略获取嵌入向量（带缓存）
 *
 * @param skill - 策略
 * @param embeddings - 嵌入缓存（会被原地修改）
 * @param settings - 记忆设置
 * @param apiSettings - API 设置
 * @param providers - 供应商列表
 * @param providerKeys - 供应商 API Key 映射
 * @returns 嵌入向量，获取失败返回 null
 */
const ensureEmbedding = async (
  skill: AceSkill,
  embeddings: EmbeddingMap,
  settings: MemorySettings,
  apiSettings: ApiSettings,
  providers: ApiProvider[],
  providerKeys: Record<string, string>,
): Promise<number[] | null> => {
  // 缓存命中
  if (embeddings[skill.id]) {
    return embeddings[skill.id];
  }

  // 未配置嵌入模型，跳过
  const model = (settings.embeddingModel || '').trim();
  if (!model) return null;

  try {
    const vector = await getEmbedding(
      skill.content,
      settings,
      apiSettings,
      providers,
      providerKeys,
    );
    embeddings[skill.id] = vector;
    return vector;
  } catch {
    return null;
  }
};

/**
 * 去重：合并相似度超过阈值的策略
 *
 * 合并策略：保留分数高的，合并 content，累加计数。
 * 仅对 active 策略生效，source='manual' 的策略不被合并删除（但可作为合并目标）。
 *
 * @param book - Skillbook（会被原地修改）
 * @param settings - 记忆设置
 * @param apiSettings - API 设置
 * @param providers - 供应商列表
 * @param providerKeys - 供应商 API Key 映射
 * @returns 被合并删除的策略 ID 列表（空数组表示无去重或未配置嵌入模型）
 */
export const deduplicateSkills = async (
  book: AceSkillbook,
  settings: MemorySettings,
  apiSettings: ApiSettings,
  providers: ApiProvider[],
  providerKeys: Record<string, string>,
): Promise<string[]> => {
  const model = (settings.embeddingModel || '').trim();
  if (!model) return [];

  const activeSkills = book.skills.filter((s) => s.active);
  if (activeSkills.length < 2) return [];

  const embeddings = await loadEmbeddings();
  const removedIds: string[] = [];
  const merged = new Set<string>();

  // 为所有 active 策略获取嵌入
  for (const skill of activeSkills) {
    await ensureEmbedding(
      skill,
      embeddings,
      settings,
      apiSettings,
      providers,
      providerKeys,
    );
  }
  await saveEmbeddings(embeddings);

  // 两两比较相似度
  for (let i = 0; i < activeSkills.length; i += 1) {
    const a = activeSkills[i];
    if (merged.has(a.id)) continue;
    const vecA = embeddings[a.id];
    if (!vecA) continue;

    for (let j = i + 1; j < activeSkills.length; j += 1) {
      const b = activeSkills[j];
      if (merged.has(b.id)) continue;
      const vecB = embeddings[b.id];
      if (!vecB) continue;

      const sim = cosineSimilarity(vecA, vecB);
      if (sim >= DEDUP_SIMILARITY_THRESHOLD) {
        // 选择保留方：分数高的优先，manual 优先
        const scoreA = a.helpfulCount - a.harmfulCount;
        const scoreB = b.helpfulCount - b.harmfulCount;
        const keepA =
          scoreA > scoreB ||
          (scoreA === scoreB && a.source === 'manual');

        const keeper = keepA ? a : b;
        const victim = keepA ? b : a;

        // 合并 content（保留方追加被合并方的内容）
        keeper.content = `${keeper.content}\n[合并] ${victim.content}`;
        keeper.helpfulCount += victim.helpfulCount;
        keeper.harmfulCount += victim.harmfulCount;
        keeper.neutralCount += victim.neutralCount;
        keeper.updatedAt = nowIso();

        // 被合并方：manual 软删除，auto 硬删除
        if (victim.source === 'manual') {
          victim.active = false;
        } else {
          hardDeleteSkill(book, victim.id);
        }
        merged.add(victim.id);
        removedIds.push(victim.id);
      }
    }
  }

  if (removedIds.length > 0) {
    // 更新嵌入缓存（移除被合并方的向量）
    for (const id of removedIds) {
      delete embeddings[id];
    }
    await saveEmbeddings(embeddings);
  }

  return removedIds;
};

// ============================================================================
// 渲染
// ============================================================================

/**
 * 将 active 策略渲染为 markdown 注入格式
 *
 * 格式固定（保证 KV 缓存命中）：
 * ```
 * - [category] content
 * - [category] content
 * ```
 *
 * @param book - Skillbook
 * @returns markdown 文本，无 active 策略时返回空字符串
 */
export const renderSkillbookForInjection = (book: AceSkillbook): string => {
  const active = getActiveSkills(book);
  if (active.length === 0) return '';
  return active.map((s) => `- [${s.category}] ${s.content}`).join('\n');
};

/**
 * 清除 ACE 相关数据（重置用）
 */
export const clearAceData = async (): Promise<void> => {
  await removeItem('memory', ACE_SKILLBOOK_STORAGE_KEY);
  await removeItem('memory', ACE_EMBEDDINGS_STORAGE_KEY);
};
