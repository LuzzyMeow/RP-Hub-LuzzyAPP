/**
 * A/B/C 三级记忆压缩系统
 * v0.8.0: 分层记忆压缩，控制上下文窗口增长
 *
 * 三级压缩：
 * - A 级摘要：情节摘要（每轮生成，~150 tokens）
 * - B 级摘要：语义摘要（每10轮，~400 tokens）
 * - C 级摘要：史诗摘要（每50轮，~200 tokens）
 *
 * 压缩策略：
 * - A 级：每轮生成一条，记录场景锚点 + 钩子
 * - B 级：每10轮将10条A摘要压缩为1条B摘要
 * - C 级：每50轮将5条B摘要压缩为1条C摘要
 */

import type { ASummaryEntry, BSummaryEntry, CSummaryEntry, TrpgMessage } from "~/types/trpg";
import { v4 as uuidv4 } from "uuid";

// ============================================================================
// 常量
// ============================================================================

/** 每 N 轮生成一次 B 摘要 */
export const B_SUMMARY_INTERVAL = 10;

/** 每 N 轮生成一次 C 摘要 */
export const C_SUMMARY_INTERVAL = 50;

// ============================================================================
// A 级摘要（情节摘要）
// ============================================================================

/**
 * 生成 A 级摘要
 * 每轮生成一条，记录场景锚点 + 钩子
 * @param round 当前轮次
 * @param messages 本轮消息（user + assistant）
 * @returns A 级摘要条目
 */
export function generateASummary(round: number, messages: TrpgMessage[]): ASummaryEntry {
  // 提取用户消息和助手消息
  const userMsg = messages.find((m) => m.role === "user");
  const assistantMsg = messages.find((m) => m.role === "assistant");

  // 场景锚点：用户行动的简短描述
  const sceneAnchor = userMsg ? userMsg.content.slice(0, 50) : "(无用户输入)";

  // 钩子：助手回复的关键信息
  let hook = "";
  if (assistantMsg) {
    if (assistantMsg.narratorSections) {
      // 优先使用判定汇总
      hook = assistantMsg.narratorSections.checkSummary.slice(0, 100);
    } else {
      // 降级使用原始内容
      hook = assistantMsg.content.slice(0, 100);
    }
  }

  return {
    id: uuidv4(),
    round,
    summary: hook,
    sceneAnchor,
    unresolvedLeads: [],
    hook,
    importance: 1,
    createdAt: Date.now(),
  };
}

// ============================================================================
// B 级摘要（语义摘要）
// ============================================================================

/**
 * 检查是否需要生成 B 级摘要
 * @param round 当前轮次
 * @returns 是否需要生成 B 摘要
 */
export function shouldGenerateBSummary(round: number): boolean {
  return round > 0 && round % B_SUMMARY_INTERVAL === 0;
}

/**
 * 生成 B 级摘要
 * 每10轮将10条A摘要压缩为1条B摘要
 * @param startRound 起始轮次
 * @param endRound 结束轮次
 * @param aSummaries A 级摘要列表
 * @returns B 级摘要条目
 */
export function generateBSummary(
  startRound: number,
  endRound: number,
  aSummaries: ASummaryEntry[],
): BSummaryEntry {
  // 过滤出本范围内的 A 摘要
  const relevantSummaries = aSummaries.filter((a) => a.round >= startRound && a.round <= endRound);

  // 构建摘要文本
  const summaryText = relevantSummaries
    .map((a) => `[${a.round}] ${a.sceneAnchor} → ${a.hook}`)
    .join("；");

  // 提取未决线索（简化处理：取最后一条 A 摘要的钩子）
  const lastSummary = relevantSummaries[relevantSummaries.length - 1];
  const openThreads = lastSummary ? [lastSummary.hook] : [];

  return {
    id: uuidv4(),
    startRound,
    endRound,
    keyEvents: relevantSummaries.map((a) => a.hook),
    characterArcs: [],
    worldChanges: [],
    openThreads,
    continuityHook: openThreads[0] ?? "",
    summaryText: summaryText.slice(0, 400), // 限制 ~400 tokens
    createdAt: Date.now(),
  };
}

// ============================================================================
// C 级摘要（史诗摘要）
// ============================================================================

/**
 * 检查是否需要生成 C 级摘要
 * @param round 当前轮次
 * @returns 是否需要生成 C 摘要
 */
export function shouldGenerateCSummary(round: number): boolean {
  return round > 0 && round % C_SUMMARY_INTERVAL === 0;
}

/**
 * 生成 C 级摘要
 * 每50轮将5条B摘要压缩为1条C摘要
 * @param startRound 起始轮次
 * @param endRound 结束轮次
 * @param bSummaries B 级摘要列表
 * @returns C 级摘要条目
 */
export function generateCSummary(
  startRound: number,
  endRound: number,
  bSummaries: BSummaryEntry[],
): CSummaryEntry {
  // 过滤出本范围内的 B 摘要
  const relevantSummaries = bSummaries.filter(
    (b) => b.startRound >= startRound && b.endRound <= endRound,
  );

  // 构建史诗弧线
  const epicArc = relevantSummaries.map((b) => b.summaryText.slice(0, 40)).join(" → ");

  // 提取主线
  const mainPlot = relevantSummaries.map((b) => b.summaryText.slice(0, 80));

  // 衔接钩子
  const lastB = relevantSummaries[relevantSummaries.length - 1];
  const continuityHook = lastB ? (lastB.openThreads[0] ?? "") : "";

  return {
    id: uuidv4(),
    startRound,
    endRound,
    epicArc: epicArc.slice(0, 200), // 限制 ~200 tokens
    mainPlot,
    themes: [],
    foreshadowing: [],
    characterDevelopment: [],
    continuityHook,
    summaryText: epicArc.slice(0, 200),
    createdAt: Date.now(),
  };
}

// ============================================================================
// 摘要管理工具
// ============================================================================

/**
 * 检查并生成需要的摘要
 * @param round 当前轮次
 * @param messages 本轮消息
 * @param existingA 已有 A 摘要
 * @param existingB 已有 B 摘要
 * @param existingC 已有 C 摘要
 * @returns 新生成的摘要
 */
export function checkAndGenerateSummaries(
  round: number,
  messages: TrpgMessage[],
  existingA: ASummaryEntry[],
  existingB: BSummaryEntry[],
  existingC: CSummaryEntry[],
): {
  newASummary?: ASummaryEntry;
  newBSummary?: BSummaryEntry;
  newCSummary?: CSummaryEntry;
} {
  const result: {
    newASummary?: ASummaryEntry;
    newBSummary?: BSummaryEntry;
    newCSummary?: CSummaryEntry;
  } = {};

  // 1. 每轮生成 A 摘要
  result.newASummary = generateASummary(round, messages);

  // 2. 每10轮生成 B 摘要
  if (shouldGenerateBSummary(round)) {
    const startRound = round - B_SUMMARY_INTERVAL + 1;
    const allA = [...existingA, result.newASummary];
    result.newBSummary = generateBSummary(startRound, round, allA);
  }

  // 3. 每50轮生成 C 摘要
  if (shouldGenerateCSummary(round)) {
    const startRound = round - C_SUMMARY_INTERVAL + 1;
    const allB = [...existingB];
    if (result.newBSummary) allB.push(result.newBSummary);
    result.newCSummary = generateCSummary(startRound, round, allB);
  }

  return result;
}
