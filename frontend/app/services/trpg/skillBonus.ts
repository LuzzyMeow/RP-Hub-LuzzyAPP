/**
 * D&D 5e 技能加值计算
 * v0.8.0: bonus 永远由引擎计算，覆盖 LLM 给出的任何值
 * 基于 D&D 5e SRD 5.2.1 (CC-BY-4.0)
 */

import type { SkillName, AbilityName, TrpgCharacter } from "~/types/trpg";
import {
  abilityModifier,
  proficiencyBonus,
  passivePerception,
  passiveInsight,
  passiveInvestigation,
} from "./dice";

// ============================================================================
// 技能 → 关联属性映射（D&D 5e 18 项技能）
// ============================================================================

export const SKILL_ABILITY_MAP: Record<SkillName, AbilityName> = {
  athletics: "str",
  acrobatics: "dex",
  sleight_of_hand: "dex",
  stealth: "dex",
  arcana: "int",
  history: "int",
  investigation: "int",
  nature: "int",
  religion: "int",
  animal_handling: "wis",
  insight: "wis",
  medicine: "wis",
  perception: "wis",
  survival: "wis",
  deception: "cha",
  intimidation: "cha",
  performance: "cha",
  persuasion: "cha",
};

// ============================================================================
// 技能加值计算（引擎核心）
// ============================================================================

/**
 * 计算技能加值
 *
 * bonus = abilityModifier + proficiencyBonus（若熟练）+ proficiencyBonus（若专精）
 *
 * 关键设计决策：此函数返回值覆盖 LLM 给出的 bonus 值。
 * LLM 负责选择技能和评估 DC，但加值的数学运算永远是引擎的职责。
 */
export function skillBonus(char: TrpgCharacter, skill: SkillName): number {
  const ability = SKILL_ABILITY_MAP[skill];
  let bonus = abilityModifier(char.abilities[ability]);

  if (char.proficientSkills.includes(skill)) {
    bonus += proficiencyBonus(char.level);
  }

  // 专精 = 2x 熟练加值（额外加一次）
  if (char.expertiseSkills.includes(skill)) {
    bonus += proficiencyBonus(char.level);
  }

  return bonus;
}

// ============================================================================
// 被动检定（便捷封装）
// ============================================================================

/** 被动察觉（封装版，直接从角色卡计算） */
export function getPassivePerception(char: TrpgCharacter): number {
  const wisMod = abilityModifier(char.abilities.wis);
  const profBonus = proficiencyBonus(char.level);
  const proficient = char.proficientSkills.includes("perception");
  return passivePerception(wisMod, profBonus, proficient);
}

/** 被动洞悉（封装版） */
export function getPassiveInsight(char: TrpgCharacter): number {
  const wisMod = abilityModifier(char.abilities.wis);
  const profBonus = proficiencyBonus(char.level);
  const proficient = char.proficientSkills.includes("insight");
  return passiveInsight(wisMod, profBonus, proficient);
}

/** 被动调查（封装版） */
export function getPassiveInvestigation(char: TrpgCharacter): number {
  const intMod = abilityModifier(char.abilities.int);
  const profBonus = proficiencyBonus(char.level);
  const proficient = char.proficientSkills.includes("investigation");
  return passiveInvestigation(intMod, profBonus, proficient);
}

// ============================================================================
// DC 等级参考表
// ============================================================================

/** DC 等级参考（平衡修改值，非官方参考值） */
export const DC_REFERENCE: Record<string, number> = {
  非常简单: 3,
  简单: 7,
  中等: 13,
  困难: 17,
  非常困难: 23,
  几乎不可能: 27,
};

/** 根据 DC 数值获取难度描述 */
export function getDcLabel(dc: number): string {
  if (dc <= 3) return "非常简单";
  if (dc <= 7) return "简单";
  if (dc <= 13) return "中等";
  if (dc <= 17) return "困难";
  if (dc <= 23) return "非常困难";
  return "几乎不可能";
}
