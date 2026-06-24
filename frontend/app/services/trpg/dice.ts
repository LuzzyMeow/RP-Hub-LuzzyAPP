/**
 * D&D 5e 骰子系统
 * v0.8.0: 本地执行掷骰，不信任 LLM
 * 基于 D&D 5e SRD 5.2.1 (CC-BY-4.0)
 */

import type { DiceResult, DamageResult } from "~/types/trpg";

// ============================================================================
// 基础随机
// ============================================================================

/** 随机整数 [min, max] 闭区间 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ============================================================================
// 属性调整值与熟练加值
// ============================================================================

/** 属性调整值 = floor((score - 10) / 2) */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** 熟练加值 = 2 + floor((level - 1) / 4) */
export function proficiencyBonus(level: number): number {
  return 2 + Math.floor((level - 1) / 4);
}

// ============================================================================
// d20 检定
// ============================================================================

/**
 * d20 检定
 * @param bonus 加值（由引擎从角色属性计算，覆盖 LLM 给出的值）
 * @param dc 难度等级
 * @param opt 优劣势选项
 */
export function d20Check(
  bonus: number,
  dc: number,
  opt?: { advantage?: boolean; disadvantage?: boolean },
): DiceResult {
  let raw: number;
  const rolls: number[] = [];

  if (opt?.advantage && !opt?.disadvantage) {
    // 优势：掷 2d20 取较高值
    const r1 = randomInt(1, 20);
    const r2 = randomInt(1, 20);
    rolls.push(r1, r2);
    raw = Math.max(r1, r2);
  } else if (opt?.disadvantage && !opt?.advantage) {
    // 劣势：掷 2d20 取较低值
    const r1 = randomInt(1, 20);
    const r2 = randomInt(1, 20);
    rolls.push(r1, r2);
    raw = Math.min(r1, r2);
  } else {
    // 正常掷 1d20
    raw = randomInt(1, 20);
    rolls.push(raw);
  }

  const total = raw + bonus;
  const success = total >= dc;
  const critical = raw === 20 ? "success" : raw === 1 ? "failure" : "none";

  return { roll: raw, bonus, total, dc, success, critical, rolls };
}

// ============================================================================
// 伤害掷骰
// ============================================================================

/**
 * 解析骰子表达式（如 "2d6+3", "1d8", "1d12+5"）
 * @returns { count, sides, modifier }
 */
function parseDiceExpression(expression: string): {
  count: number;
  sides: number;
  modifier: number;
} {
  const match = expression
    .trim()
    .toLowerCase()
    .match(/(\d+)d(\d+)\s*([+-]\s*\d+)?/);
  if (!match) return { count: 1, sides: 4, modifier: 0 };

  const count = parseInt(match[1], 10);
  const sides = parseInt(match[2], 10);
  const modifier = match[3] ? parseInt(match[3].replace(/\s/g, ""), 10) : 0;

  return { count, sides, modifier };
}

/**
 * 伤害掷骰
 * @param expression 骰子表达式（如 "2d6+3"）
 * @param crit 是否大成功（伤害骰数量翻倍，固定加值不翻倍）
 */
export function rollDamage(expression: string, crit = false): DamageResult {
  const { count, sides, modifier } = parseDiceExpression(expression);
  const actualCount = crit ? count * 2 : count;

  const rolls: number[] = [];
  for (let i = 0; i < actualCount; i++) {
    rolls.push(randomInt(1, sides));
  }

  const diceTotal = rolls.reduce((sum, r) => sum + r, 0);
  const total = diceTotal + modifier;

  return { rolls, modifier, total, crit };
}

// ============================================================================
// 先攻掷骰
// ============================================================================

/** 先攻 = d20 + 敏捷调整值 */
export function rollInitiative(dexModifier: number): number {
  return randomInt(1, 20) + dexModifier;
}

// ============================================================================
// 死亡豁免
// ============================================================================

/** 死亡豁免检定（d20 无加值） */
export function rollDeathSave(): {
  roll: number;
  result: "success" | "failure" | "critical_success" | "critical_failure";
} {
  const roll = randomInt(1, 20);

  if (roll === 20) return { roll, result: "critical_success" };
  if (roll === 1) return { roll, result: "critical_failure" };
  if (roll >= 10) return { roll, result: "success" };
  return { roll, result: "failure" };
}

// ============================================================================
// 被动检定
// ============================================================================

/** 被动察觉 = 10 + 感知调整值 + 熟练加值（如果熟练察觉技能） */
export function passivePerception(
  wisModifier: number,
  profBonus: number,
  proficient: boolean,
): number {
  return 10 + wisModifier + (proficient ? profBonus : 0);
}

/** 被动洞悉 = 10 + 感知调整值 + 熟练加值（如果熟练洞悉技能） */
export function passiveInsight(
  wisModifier: number,
  profBonus: number,
  proficient: boolean,
): number {
  return 10 + wisModifier + (proficient ? profBonus : 0);
}

/** 被动调查 = 10 + 智力调整值 + 熟练加值（如果熟练调查技能） */
export function passiveInvestigation(
  intModifier: number,
  profBonus: number,
  proficient: boolean,
): number {
  return 10 + intModifier + (proficient ? profBonus : 0);
}
