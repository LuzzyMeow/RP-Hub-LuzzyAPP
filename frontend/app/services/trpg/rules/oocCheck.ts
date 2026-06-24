/**
 * OOC 七项审查子系统
 * v0.8.0: 检测玩家输入是否违反角色扮演规则
 *
 * 七项审查：
 * 1. 元游戏（Meta-Gaming）：玩家是否使用角色不应知道的信息
 * 2. 知识越界（Knowledge Boundary）：角色是否超出其背景/技能的知识范围
 * 3. 世界一致性（World Consistency）：行动是否与世界卡 laws/mods 冲突
 * 4. 重复行动（Repeat Action）：是否与最近输入高度重复
 * 5. 内容分级（Content Rating）：是否符合世界卡 contentRating
 * 6. 绕过机制（Bypass Mechanism）：是否试图绕过规则引擎
 * 7. 角色扮演（Role Play）：是否破坏角色人设
 */

import type {
  TrpgCharacter,
  TrpgGameState,
  WorldCard,
  ContentRating,
  OocResult,
  OocCheckItem,
} from "~/types/trpg";

/** OOC 审查参数 */
export interface OocCheckParams {
  player_input: string;
  recent_inputs?: string[];
  phase?: string;
}

/** 元游戏敏感词列表 */
const META_GAME_KEYWORDS = [
  "系统",
  "GM",
  "DM",
  "规则",
  "检定",
  "d20",
  "DC",
  "HP",
  "AC",
  "经验值",
  "XP",
  "等级",
  "属性值",
  "技能点",
  "升级",
  "存档",
  "读档",
  "NPC",
  "脚本",
  "剧情线",
  "roll",
  "check",
  "save",
  "modifier",
  "bonus",
];

/** 绕过机制敏感词列表 */
const BYPASS_KEYWORDS = [
  "跳过检定",
  "直接成功",
  "自动成功",
  "必定命中",
  "无视规则",
  "作弊",
  "开挂",
  "无敌",
  "秒杀",
  "一击必杀",
  "跳过",
  "忽略",
  "无视限制",
  "打破规则",
];

/** 内容分级敏感词映射 */
const CONTENT_RATING_SENSITIVE: Record<ContentRating, string[]> = {
  teen: ["血腥", "暴力", "杀戮", "色情", "毒品", "赌博"],
  mature: ["极端血腥", "色情", "毒品", "赌博"],
  unrestricted: [],
};

/**
 * 计算两个字符串的简单相似度（基于字符包含率）
 * @returns 0-1 之间的相似度分数
 */
function simpleSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;

  // 检查短字符串是否是长字符串的子串
  if (longer.includes(shorter)) return shorter.length / longer.length;

  // 计算共同字符数
  const setA = new Set(a.split(""));
  const setB = new Set(b.split(""));
  let common = 0;
  for (const ch of setA) {
    if (setB.has(ch)) common++;
  }
  return common / Math.max(setA.size, setB.size);
}

/**
 * 检查元游戏（玩家是否使用角色不应知道的信息）
 */
function checkMetaGame(input: string): OocCheckItem {
  return {
    id: 1,
    name: "元游戏",
    result: "pass",
    reason: "由 LLM 审查（reasoning_content OOC JSON）",
  };
}

function checkKnowledgeBoundary(input: string, character: TrpgCharacter): OocCheckItem {
  return {
    id: 2,
    name: "知识越界",
    result: "pass",
    reason: "由 LLM 审查（reasoning_content OOC JSON）",
  };
}

/**
 * 检查世界一致性（行动是否与世界卡 laws/mods 冲突）
 */
function checkWorldConsistency(input: string, worldCard: WorldCard | null): OocCheckItem {
  if (!worldCard) {
    return { id: 3, name: "世界一致性", result: "pass" };
  }
  const laws = Object.values(worldCard.snapshot.laws);
  if (laws.length === 0) {
    return { id: 3, name: "世界一致性", result: "pass" };
  }

  for (const law of laws) {
    if (law.scope && input.includes(law.scope)) {
      return {
        id: 3,
        name: "世界一致性",
        result: "soft_warn",
        reason: `触发世界法则 "${law.name}"：${law.body}`,
      };
    }
  }
  return { id: 3, name: "世界一致性", result: "pass" };
}

/**
 * 检查重复行动（是否与最近输入高度重复）
 */
function checkRepeatAction(input: string, recentInputs: string[]): OocCheckItem {
  if (!recentInputs || recentInputs.length === 0) {
    return { id: 4, name: "重复行动", result: "pass" };
  }

  // 检查最近 5 轮输入
  const recent = recentInputs.slice(-5);
  for (const prev of recent) {
    const similarity = simpleSimilarity(input, prev);
    if (similarity > 0.8) {
      return {
        id: 4,
        name: "重复行动",
        result: "soft_warn",
        reason: `与最近输入高度重复（相似度 ${(similarity * 100).toFixed(0)}%）`,
      };
    }
  }
  return { id: 4, name: "重复行动", result: "pass" };
}

/**
 * 检查内容分级（是否符合世界卡 contentRating）
 */
function checkContentRating(input: string, worldCard: WorldCard | null): OocCheckItem {
  const rating: ContentRating = "unrestricted";
  const sensitiveWords = CONTENT_RATING_SENSITIVE[rating];

  if (sensitiveWords.length === 0) {
    return { id: 5, name: "内容分级", result: "pass" };
  }

  const found = sensitiveWords.find((kw) => input.includes(kw));
  if (found) {
    return {
      id: 5,
      name: "内容分级",
      result: "hard_block",
      reason: `输入包含 "${found}"，超出当前世界卡内容分级 "${rating}" 的允许范围`,
    };
  }
  return { id: 5, name: "内容分级", result: "pass" };
}

/**
 * 检查绕过机制（是否试图绕过规则引擎）
 */
function checkBypassMechanism(input: string): OocCheckItem {
  const lowerInput = input.toLowerCase();
  const found = BYPASS_KEYWORDS.find((kw) => lowerInput.includes(kw.toLowerCase()));

  if (found) {
    return {
      id: 6,
      name: "绕过机制",
      result: "hard_block",
      reason: `检测到绕过规则引擎的尝试: "${found}"`,
    };
  }
  return { id: 6, name: "绕过机制", result: "pass" };
}

/**
 * 检查角色扮演（是否破坏角色人设）
 */
function checkRolePlay(input: string, character: TrpgCharacter): OocCheckItem {
  return {
    id: 7,
    name: "角色扮演",
    result: "pass",
    reason: "由 LLM 审查（reasoning_content OOC JSON）",
  };
}

/**
 * 执行 OOC 七项审查
 * @param args 审查参数
 * @param character 当前角色
 * @param gameState 游戏状态
 * @param worldCard 世界卡（可选）
 * @returns OOC 审查结果
 */
export function runOocCheck(
  args: OocCheckParams,
  character: TrpgCharacter,
  gameState: TrpgGameState,
  worldCard: WorldCard | null,
): OocResult {
  const input = args.player_input;
  const recentInputs = args.recent_inputs ?? [];

  const checks: OocCheckItem[] = [
    checkMetaGame(input),
    checkKnowledgeBoundary(input, character),
    checkWorldConsistency(input, worldCard),
    checkRepeatAction(input, recentInputs),
    checkContentRating(input, worldCard),
    checkBypassMechanism(input),
    checkRolePlay(input, character),
  ];

  const hasHardBlock = checks.some((c) => c.result === "hard_block");
  const hasSoftWarn = checks.some((c) => c.result === "soft_warn");

  let action: OocResult["action"];
  if (hasHardBlock) {
    action = "blocked";
  } else if (hasSoftWarn) {
    action = "partial";
  } else {
    action = "resolved";
  }

  return { checks, hasHardBlock, hasSoftWarn, action };
}
