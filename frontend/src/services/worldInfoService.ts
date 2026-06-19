/**
 * 世界书服务
 *
 * 提供世界书关键词匹配处理与提示词构建能力。
 *
 * 核心能力：
 * - 关键词匹配（支持普通文本包含匹配与正则表达式匹配）
 * - 常驻条目（constant）自动触发
 * - 概率检查（每个条目每次生成只掷一次概率）
 * - 按 order 排序、按 position/depth 分组
 * - 构建世界书提示词（按位置分组拼接条目内容）
 *
 * 从旧 Vue 3 app.js 迁移，改为纯函数风格，状态由 zustand store 管理。
 */

import type {
  WorldInfoEntry,
  WorldInfoProcessResult,
  WorldInfoInjection,
} from '@/types';

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 将值转换为非负数字，无效时返回 fallback
 */
const toNonNegativeNumber = (value: unknown, fallback = 0): number => {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, num) : fallback;
};

/**
 * 创建世界书关键词正则表达式
 *
 * 支持以下格式：
 * - 普通字符串：直接作为正则源，默认 'i' 标志
 * - /pattern/flags 格式：解析出 pattern 和 flags
 *
 * 强制包含 'i' 标志（不区分大小写），移除 'g' 标志（避免 lastIndex 问题）。
 * 若 pattern 包含 \p{ 或 \P{，自动添加 'u' 标志。
 *
 * @param pattern - 关键词模式（普通字符串或 /pattern/flags 格式）
 * @returns 编译后的正则表达式，无效时抛出错误
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
  // 移除 g 标志（避免 lastIndex 问题），强制包含 i 标志
  flags = flags.replaceAll('g', '');
  if (!flags.includes('i')) flags += 'i';
  // Unicode 属性转义需要 u 标志
  if (/\\[pP]\{/.test(source) && !flags.includes('u')) flags += 'u';
  return new RegExp(source, flags);
};

/**
 * 检查世界书条目的单个关键词是否匹配文本
 *
 * @param entry - 世界书条目（用于判断是否启用正则）
 * @param key - 关键词
 * @param text - 待匹配的文本
 * @returns 是否匹配
 */
const worldInfoKeyMatchesText = (
  entry: WorldInfoEntry,
  key: string,
  text: string,
): boolean => {
  const rawKey = String(key || '').trim();
  const rawText = String(text || '');
  if (!rawKey || !rawText) return false;

  // useRegex 为可选扩展字段（不在 WorldInfoEntry 类型定义中），需先检查字段是否存在
  const useRegex = 'useRegex' in entry &&
    (entry as WorldInfoEntry & { useRegex?: boolean }).useRegex === true;
  if (useRegex) {
    try {
      return createWorldInfoRegex(rawKey).test(rawText);
    } catch {
      console.warn(`Invalid world info regex: ${rawKey}`);
      return false;
    }
  }

  return rawText.toLowerCase().includes(rawKey.toLowerCase());
};

// ============================================================================
// 世界书处理
// ============================================================================

/**
 * 世界书关键词匹配处理
 *
 * 处理流程：
 * 1. 遍历启用的条目
 * 2. 检查 constant（常驻）条目 —— 自动触发，优先级最高
 * 3. 非常驻条目：检查关键词是否匹配扫描文本
 * 4. 概率检查（每个条目每次生成只掷一次概率）
 * 5. 按 order 排序（常驻优先，然后按 order 降序）
 * 6. 按 position/depth 分组生成注入
 *
 * @param text - 待扫描的文本（通常是最近 N 条聊天记录拼接）
 * @param entries - 全部世界书条目
 * @param scanDepth - 扫描深度（保留参数，实际扫描文本由调用方提供）
 * @returns 触发的条目列表与注入列表
 */
export const processWorldInfo = (
  text: string,
  entries: WorldInfoEntry[],
  scanDepth: number,
): WorldInfoProcessResult => {
  const scanText = String(text || '');
  const allEntries = Array.isArray(entries) ? entries : [];
  // 概率缓存：每个条目每次生成只掷一次概率
  const evaluatedProbability = new Map<WorldInfoEntry, boolean>();

  /**
   * 概率检查
   */
  const passesProbability = (entry: WorldInfoEntry): boolean => {
    const probability = Math.min(100, toNonNegativeNumber(entry.probability, 100));
    // useProbability 为可选扩展字段（不在 WorldInfoEntry 类型定义中），需先检查字段是否存在
    const useProbability = 'useProbability' in entry
      ? (entry as WorldInfoEntry & { useProbability?: boolean }).useProbability
      : undefined;
    if (useProbability !== false && probability < 100) {
      if (!evaluatedProbability.has(entry)) {
        evaluatedProbability.set(entry, probability > 0 && Math.random() * 100 < probability);
      }
      return !!evaluatedProbability.get(entry);
    }
    return true;
  };

  /**
   * 检查单个条目是否被触发
   */
  const checkEntryTrigger = (
    entry: WorldInfoEntry,
  ): { triggered: boolean; score: number } => {
    // 概率检查（提前执行，每个条目只掷一次）
    if (!passesProbability(entry)) return { triggered: false, score: 0 };

    const keys = Array.isArray(entry.keys) ? entry.keys : [];
    if (keys.length === 0 || keys.every((k) => !String(k || '').trim())) {
      return { triggered: false, score: 0 };
    }

    let matchCount = 0;
    for (const key of keys) {
      const rawKey = String(key || '').trim();
      if (!rawKey) continue;
      if (worldInfoKeyMatchesText(entry, rawKey, scanText)) {
        matchCount++;
      }
    }

    if (matchCount === 0) return { triggered: false, score: 0 };
    return { triggered: true, score: matchCount };
  };

  // 1. 遍历条目，收集触发的条目
  const triggeredMap = new Map<WorldInfoEntry, { score: number }>();
  const activeEntries = allEntries.filter((e) => e.enabled !== false);

  for (const entry of activeEntries) {
    // 常驻条目自动触发，优先级最高
    if (entry.constant) {
      triggeredMap.set(entry, { score: Infinity });
      continue;
    }

    // 非常驻条目：检查关键词匹配
    const result = checkEntryTrigger(entry);
    if (result.triggered) {
      triggeredMap.set(entry, { score: result.score });
    }
  }

  // 2. 排序：常驻优先，然后按 order 降序（order 越高优先级越高）
  const triggeredEntries = Array.from(triggeredMap.keys()).sort((a, b) => {
    if (a.constant && !b.constant) return -1;
    if (!a.constant && b.constant) return 1;
    return (b.order || 0) - (a.order || 0);
  });

  // 3. 按 position/depth 分组生成注入
  const injections: WorldInfoInjection[] = triggeredEntries.map((entry) => ({
    entry,
    position: toNonNegativeNumber(entry.position, 0),
    depth: toNonNegativeNumber(entry.depth, 0),
  }));

  // scanDepth 参数保留用于未来扩展（当前扫描文本由调用方提供）
  void scanDepth;

  return {
    triggeredEntries,
    injections,
  };
};

// ============================================================================
// 提示词构建
// ============================================================================

/**
 * 构建世界书提示词
 *
 * 将注入列表按 position 分组，每组内按 order 升序排序，
 * 拼接条目内容为提示词文本。
 *
 * 分组顺序（按 position 值）：
 * - position 较小的先注入
 * - 同一 position 内，order 较小的先注入
 *
 * @param injections - 世界书注入列表
 * @returns 拼接后的世界书提示词文本
 */
export const buildWorldInfoPrompt = (
  injections: WorldInfoInjection[],
): string => {
  const list = Array.isArray(injections) ? injections : [];
  if (list.length === 0) return '';

  // 按 position 分组
  const groups = new Map<number, WorldInfoInjection[]>();
  for (const injection of list) {
    const pos = injection.position;
    if (!groups.has(pos)) {
      groups.set(pos, []);
    }
    groups.get(pos)!.push(injection);
  }

  // 每组内按 order 升序排序
  for (const group of groups.values()) {
    group.sort((a, b) => (a.entry.order || 0) - (b.entry.order || 0));
  }

  // 按 position 升序拼接各组
  const sortedPositions = Array.from(groups.keys()).sort((a, b) => a - b);
  const parts: string[] = [];

  for (const pos of sortedPositions) {
    const group = groups.get(pos)!;
    const contents = group.map((injection) => {
      const entry = injection.entry;
      const name = String(entry.id || 'Entry');
      const content = String(entry.content || '').trim();
      return `[${name}]\n${content}`;
    });
    if (contents.length > 0) {
      parts.push(contents.join('\n\n'));
    }
  }

  return parts.join('\n\n');
};
