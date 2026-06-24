/**
 * TRPG 上下文构建器
 * v0.8.0: 构建三层 Prompt 架构，最大化 KV 缓存命中率
 *
 * 三层结构：
 * - 第一层（共享前缀层）：TRPG_GM_PRESET + 世界卡全量 + D&D 规则速查
 * - 第二层（半稳定层）：角色卡 JSON + 世界状态 JSON（稳定序列化）
 * - 第三层（动态层）：A/B/C 摘要 + 向量记忆 + 近 8 轮上下文 + 工具描述
 */

import type {
  TrpgCharacter,
  TrpgGameState,
  WorldCard,
  SaveSlot,
  ASummaryEntry,
  BSummaryEntry,
  CSummaryEntry,
  TrpgMessage,
} from "~/types/trpg";
import { TRPG_GM_PRESET_CONTENT } from "./trpgPresetContent";
import { buildTrpgToolDescriptions } from "./trpgTools";

// ============================================================================
// 稳定 JSON 序列化
// ============================================================================

/**
 * 稳定 JSON 序列化（key 排序 + 固定精度 + 无 Unicode 转义）
 * 确保大多数轮次中字节序列与前一轮完全一致，命中 DeepSeek 公共前缀缓存
 */
export function stableJson(obj: unknown): string {
  return JSON.stringify(sortKeys(obj));
}

/** 递归排序对象 key */
function sortKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
    sorted[key] = sortKeys((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}

// ============================================================================
// 半稳定层延迟更新判断
// ============================================================================

/**
 * 判断半稳定层是否需要更新
 * 覆盖所有可能被工具修改的角色卡/游戏状态字段：
 * - 角色卡：HP、条件、装备、法术槽、等级、经验、属性、AC、熟练技能、专精技能
 * - 游戏状态：当前位置、阶段、时间、NPC 列表、地点列表、阵营关系
 * 不变则缓存命中，最大化 KV 缓存命中率
 */
export function shouldUpdateSemiStable(
  prevChar: TrpgCharacter,
  currChar: TrpgCharacter,
  prevGs: TrpgGameState,
  currGs: TrpgGameState,
): boolean {
  // 角色卡关键字段
  if (
    prevChar.hp.current !== currChar.hp.current ||
    prevChar.hp.max !== currChar.hp.max ||
    prevChar.conditions.join(",") !== currChar.conditions.join(",") ||
    prevChar.equipment !== currChar.equipment ||
    prevChar.spellSlots !== currChar.spellSlots ||
    prevChar.level !== currChar.level ||
    prevChar.xp !== currChar.xp ||
    prevChar.ac !== currChar.ac ||
    prevChar.abilities.str !== currChar.abilities.str ||
    prevChar.abilities.dex !== currChar.abilities.dex ||
    prevChar.abilities.con !== currChar.abilities.con ||
    prevChar.abilities.int !== currChar.abilities.int ||
    prevChar.abilities.wis !== currChar.abilities.wis ||
    prevChar.abilities.cha !== currChar.abilities.cha ||
    prevChar.proficientSkills.join(",") !== currChar.proficientSkills.join(",") ||
    prevChar.expertiseSkills.join(",") !== currChar.expertiseSkills.join(",")
  ) {
    return true;
  }

  // 游戏状态关键字段
  if (
    prevGs.currentLocation !== currGs.currentLocation ||
    prevGs.phase !== currGs.phase ||
    prevGs.time.day !== currGs.time.day ||
    prevGs.time.hour !== currGs.time.hour ||
    prevGs.npcs.length !== currGs.npcs.length ||
    prevGs.locations.length !== currGs.locations.length ||
    prevGs.factionRelations !== currGs.factionRelations
  ) {
    return true;
  }

  // NPC 在场状态/态度变化（深度比较）
  if (prevGs.npcs.length === currGs.npcs.length) {
    for (let i = 0; i < prevGs.npcs.length; i++) {
      const pn = prevGs.npcs[i];
      const cn = currGs.npcs[i];
      if (
        pn.npcId !== cn.npcId ||
        pn.presence !== cn.presence ||
        pn.attitude !== cn.attitude ||
        pn.hp.current !== cn.hp.current ||
        pn.hp.max !== cn.hp.max
      ) {
        return true;
      }
    }
  }

  return false;
}

// ============================================================================
// A 级摘要引用化
// ============================================================================

/**
 * A 级摘要引用化压缩
 * 原始每条约 150 tokens → 引用化后每条约 40 tokens
 * 50 条从约 7500 tokens 压缩至约 2000 tokens
 */
export function compressASummaryRef(summary: ASummaryEntry): string {
  return `[A${String(summary.round).padStart(5, "0")}] ${summary.sceneAnchor} → ${summary.hook}`;
}

// ============================================================================
// 世界卡文本构建
// ============================================================================

/**
 * 构建世界卡全量文本（注入共享前缀层）
 * 世界卡不变则缓存稳定命中
 */
export function buildWorldCardText(worldCard: WorldCard | null): string {
  if (!worldCard) {
    return "[世界卡] 无世界卡，仅使用 D&D 5e 基础规则。";
  }

  const snap = worldCard.snapshot;
  const parts: string[] = [];

  // 元数据
  parts.push(`# 世界卡：${worldCard.name}`);
  if (worldCard.description) {
    parts.push(`概述：${worldCard.description}`);
  }
  parts.push(`来源：${worldCard.manifest.source}`);

  // 地理实体
  const settings = Object.values(snap.world_setting.settings);
  if (settings.length > 0) {
    parts.push("\n## 地理设定");
    for (const entity of settings) {
      parts.push(`### ${entity.display_name}`);
      if (entity.atmosphere) parts.push(`氛围：${entity.atmosphere}`);
      const ch = entity.chapters;
      if (ch.here_now.length > 0) parts.push(`当前状态：${ch.here_now.join("；")}`);
      if (ch.social_fabric.length > 0) parts.push(`社会结构：${ch.social_fabric.join("；")}`);
      if (ch.order.length > 0) parts.push(`秩序与法律：${ch.order.join("；")}`);
      if (ch.world_law.length > 0) parts.push(`自然法则：${ch.world_law.join("；")}`);
      if (ch.rhythm.length > 0) parts.push(`生活节奏：${ch.rhythm.join("；")}`);
      if (ch.narrative_core.length > 0) parts.push(`叙事核心：${ch.narrative_core.join("；")}`);
      if (entity.sites.length > 0) {
        const siteTexts = entity.sites.map((s) => {
          const spots = s.spots.map((sp) => sp.spot).join("、");
          return `${s.site}（${spots}）`;
        });
        parts.push(`子地点：${siteTexts.join("；")}`);
      }
    }
    if (snap.world_setting._summary) {
      parts.push(`地理总结：${snap.world_setting._summary}`);
    }
  }

  // 角色数据库
  const charEntries = Object.entries(snap.character_database).filter(([k]) => k !== "_summary");
  if (charEntries.length > 0) {
    parts.push("\n## 角色数据库");
    for (const [, npc] of charEntries) {
      parts.push(`- ${npc.name}（${npc.species}，${npc.role}）`);
      if (npc.dialogue_tone) parts.push(`  对话风格：${npc.dialogue_tone}`);
      if (npc.affiliation) parts.push(`  阵营：${npc.affiliation}`);
      if (npc.combat_style) parts.push(`  战斗风格：${npc.combat_style}`);
      if (npc.hidden_motive) parts.push(`  隐藏动机：${npc.hidden_motive}`);
      if (npc.current_goal) parts.push(`  当前目标：${npc.current_goal}`);
    }
  }

  // 世界时间线
  if (snap.world_timeline.events.length > 0) {
    parts.push("\n## 世界时间线");
    for (const event of snap.world_timeline.events) {
      const locStr = event.location ? `${event.location.country}/${event.location.site}` : "";
      parts.push(`- [${event.time}] ${event.content}${locStr ? ` @${locStr}` : ""}`);
    }
    if (snap.world_timeline._summary) {
      parts.push(`时间线总结：${snap.world_timeline._summary}`);
    }
  }

  // Prompt 模块
  const modules = Object.entries(snap.prompt_modules.modules);
  if (modules.length > 0) {
    parts.push("\n## Prompt 模块");
    for (const [name, mod] of modules) {
      parts.push(`### ${name}`);
      parts.push(mod.content);
    }
    if (snap.prompt_modules._summary) {
      parts.push(`模块总结：${snap.prompt_modules._summary}`);
    }
  }

  // 世界法则
  const laws = Object.values(snap.laws);
  if (laws.length > 0) {
    parts.push("\n## 世界法则");
    for (const law of laws) {
      parts.push(`- ${law.name}（${law.scope}）：${law.body}`);
    }
  }

  // 自定义机制
  const mods = Object.values(snap.mods);
  if (mods.length > 0) {
    parts.push("\n## 自定义机制");
    for (const mod of mods) {
      parts.push(`- ${mod.name}（${mod.ref}）：${mod.prose}`);
    }
  }

  // 关键道具
  const artifacts = Object.values(snap.artifacts);
  if (artifacts.length > 0) {
    parts.push("\n## 关键道具");
    for (const art of artifacts) {
      parts.push(`- ${art.name}：${art.desc}`);
      if (art.owner) parts.push(`  持有者：${art.owner}`);
      if (art.location) parts.push(`  位置：${art.location}`);
    }
  }

  // 开场白
  if (snap.opening_greeting) {
    parts.push("\n## 开场白");
    parts.push(snap.opening_greeting);
  }

  return parts.join("\n");
}

// ============================================================================
// 角色卡 JSON 构建
// ============================================================================

/** 构建角色卡 JSON（稳定序列化，注入半稳定层） */
export function buildCharacterJson(char: TrpgCharacter): string {
  return stableJson({
    charId: char.charId,
    name: char.name,
    race: char.race,
    class: char.class,
    level: char.level,
    abilities: char.abilities,
    hp: char.hp,
    ac: char.ac,
    proficientSkills: [...char.proficientSkills].sort(),
    expertiseSkills: [...char.expertiseSkills].sort(),
    conditions: [...char.conditions].sort(),
    equipment: char.equipment,
    spellSlots: char.spellSlots,
    classFeatures: char.classFeatures,
    xp: char.xp,
    background: char.background,
    alignment: char.alignment,
  });
}

// ============================================================================
// 游戏状态 JSON 构建
// ============================================================================

/** 构建游戏状态 JSON（稳定序列化，注入半稳定层） */
export function buildGameStateJson(gs: TrpgGameState): string {
  return stableJson({
    saveId: gs.saveId,
    roundNumber: gs.roundNumber,
    activeCharacterId: gs.activeCharacterId,
    currentLocation: gs.currentLocation,
    phase: gs.phase,
    time: gs.time,
    factionRelations: gs.factionRelations,
    npcs: gs.npcs.map((n) => ({
      npcId: n.npcId,
      name: n.name,
      presence: n.presence,
      attitude: n.attitude,
      hp: n.hp,
      revealedFields: [...n.revealedFields].sort(),
    })),
    locations: gs.locations.map((l) => ({
      locationId: l.locationId,
      name: l.name,
      status: l.status,
      archived: l.archived ?? false,
    })),
  });
}

// ============================================================================
// 记忆摘要注入
// ============================================================================

/** 构建 A/B/C 摘要注入文本（引用化压缩） */
export function buildMemorySummariesText(
  aSummaries: ASummaryEntry[],
  bSummaries: BSummaryEntry[],
  cSummaries: CSummaryEntry[],
): string {
  const parts: string[] = [];

  // C 级摘要（全量注入，约 200 tokens）
  if (cSummaries.length > 0) {
    parts.push("## C 级摘要（史诗）");
    for (const c of cSummaries) {
      parts.push(`[${c.startRound}-${c.endRound}轮] ${c.epicArc}`);
      parts.push(`主线：${c.mainPlot.join("；")}`);
      parts.push(`衔接：${c.continuityHook}`);
    }
  }

  // B 级摘要（全量注入，约 400 tokens）
  if (bSummaries.length > 0) {
    parts.push("\n## B 级摘要（语义）");
    for (const b of bSummaries) {
      parts.push(`[${b.startRound}-${b.endRound}轮] ${b.summaryText}`);
      if (b.openThreads.length > 0) {
        parts.push(`未决线索：${b.openThreads.join("；")}`);
      }
    }
  }

  // A 级摘要（引用化压缩，约 2000 tokens）
  if (aSummaries.length > 0) {
    parts.push("\n## A 级摘要（情节）");
    for (const a of aSummaries) {
      parts.push(compressASummaryRef(a));
    }
  }

  return parts.join("\n");
}

// ============================================================================
// 近 N 轮对话上下文
// ============================================================================

/** 构建近 N 轮对话上下文（仅剧情正文 + 判定汇总） */
export function buildRecentContextText(messages: TrpgMessage[], windowSize = 8): string {
  // 按 role 过滤，避免 tool 消息干扰和严格交替假设
  const userMsgs = messages.filter((m) => m.role === "user");
  const assistantMsgs = messages.filter((m) => m.role === "assistant");
  // 取最近 windowSize 轮（user + assistant 各 windowSize 条）
  const recentUser = userMsgs.slice(-windowSize);
  const recentAssistant = assistantMsgs.slice(-windowSize);
  const parts: string[] = [];

  for (let i = 0; i < recentUser.length; i++) {
    parts.push(`玩家：${recentUser[i].content}`);
    if (recentAssistant[i]) {
      const ns = recentAssistant[i].narratorSections;
      if (ns) {
        parts.push(`GM 判定：${ns.checkSummary}`);
        parts.push(`GM 叙事：${ns.narrative}`);
      } else {
        // 降级：使用原始 content 的前 200 字符（避免静默丢失）
        const fallback = recentAssistant[i].content.slice(0, 200);
        if (fallback) parts.push(`GM 叙事：${fallback}`);
      }
    }
  }

  return parts.join("\n");
}

// ============================================================================
// 向量记忆注入
// ============================================================================

/** 构建向量记忆召回文本（Top-8） */
export function buildVectorMemoryText(memories: Array<{ content: string; score: number }>): string {
  if (memories.length === 0) return "";
  const parts: string[] = ["## 向量记忆召回（Top-8）"];
  for (const m of memories) {
    parts.push(`- [相似度 ${m.score.toFixed(2)}] ${m.content}`);
  }
  return parts.join("\n");
}

// ============================================================================
// 完整上下文构建
// ============================================================================

/** 半稳定层缓存（跨轮次复用 layer2 字符串，最大化 KV 缓存命中） */
export interface SemiStableCache {
  character: TrpgCharacter;
  gameState: TrpgGameState;
  layer2: string;
}

/** buildTrpgContext 参数 */
export interface BuildTrpgContextParams {
  character: TrpgCharacter;
  gameState: TrpgGameState;
  worldCard: WorldCard | null;
  save: SaveSlot;
  vectorMemories: Array<{ content: string; score: number }>;
  playerInput: string;
  /** 上一轮的半稳定层缓存（首次传 null） */
  prevSemiStable?: SemiStableCache | null;
}

/** buildTrpgContext 返回值 */
export interface BuildTrpgContextResult {
  /** 系统提示词（第一层 + 第二层） */
  systemPrompt: string;
  /** 消息列表（第三层动态内容 + 玩家输入） */
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  /** 工具描述列表 */
  tools: Array<{
    type: "function";
    function: { name: string; description: string; parameters: Record<string, unknown> };
  }>;
  /** 当前轮的半稳定层缓存（传给下一轮） */
  semiStable: SemiStableCache;
}

/**
 * 构建 TRPG 专用上下文
 *
 * 三层 Prompt 架构：
 * 1. 共享前缀层（系统提示词）：TRPG_GM_PRESET + 世界卡 + D&D 规则
 * 2. 半稳定层（系统提示词续）：角色卡 JSON + 游戏状态 JSON（仅在 HP/条件/位置变化时重算）
 * 3. 动态层（消息列表）：A/B/C 摘要 + 向量记忆 + 近 8 轮 + 玩家输入
 */
export function buildTrpgContext(params: BuildTrpgContextParams): BuildTrpgContextResult {
  const { character, gameState, worldCard, save, vectorMemories, playerInput, prevSemiStable } =
    params;

  // === 第一层：共享前缀层（始终稳定） ===
  const layer1 = [TRPG_GM_PRESET_CONTENT, "\n---\n", buildWorldCardText(worldCard)].join("\n");

  // === 第二层：半稳定层（仅在 HP/条件/位置变化时重算，否则复用缓存） ===
  const shouldUpdate =
    !prevSemiStable ||
    shouldUpdateSemiStable(
      prevSemiStable.character,
      character,
      prevSemiStable.gameState,
      gameState,
    );

  // v0.8.0: KV 缓存命中率监控
  if (prevSemiStable) {
    if (shouldUpdate) {
      console.log("[TRPG Cache] 半稳定层未命中（HP/条件/位置变化），重新计算 layer2");
    } else {
      console.log("[TRPG Cache] 半稳定层命中，复用上一轮 layer2（字节级一致）");
    }
  } else {
    console.log("[TRPG Cache] 首轮请求，无缓存可用");
  }

  let layer2: string;
  if (shouldUpdate) {
    layer2 = [
      "\n---\n## 当前角色卡",
      "```json",
      buildCharacterJson(character),
      "```",
      "\n## 当前游戏状态",
      "```json",
      buildGameStateJson(gameState),
      "```",
    ].join("\n");
  } else {
    // 复用上一轮的 layer2（字节级一致，命中 KV 缓存）
    layer2 = prevSemiStable!.layer2;
  }

  // 系统提示词 = 第一层 + 第二层
  const systemPrompt = layer1 + layer2;

  // === 第三层：动态层 ===
  const dynamicParts: string[] = [];

  // A/B/C 摘要
  const summariesText = buildMemorySummariesText(save.aSummaries, save.bSummaries, save.cSummaries);
  if (summariesText) dynamicParts.push(summariesText);

  // 向量记忆 Top-8
  const vectorText = buildVectorMemoryText(vectorMemories);
  if (vectorText) dynamicParts.push(vectorText);

  // 近 8 轮对话上下文
  const recentText = buildRecentContextText(save.messages, 8);
  if (recentText) dynamicParts.push(recentText);

  // 构建消息列表
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];

  // 动态层作为系统消息注入（追加在 prompt 末尾的动态层区域）
  if (dynamicParts.length > 0) {
    messages.push({
      role: "system",
      content: dynamicParts.join("\n\n---\n\n"),
    });
  }

  // 玩家输入
  messages.push({
    role: "user",
    content: playerInput,
  });

  // 工具描述
  const tools = buildTrpgToolDescriptions();

  // 返回当前轮的半稳定层缓存（传给下一轮）
  const semiStable: SemiStableCache = shouldUpdate
    ? { character, gameState, layer2 }
    : prevSemiStable!;

  return { systemPrompt, messages, tools, semiStable };
}
